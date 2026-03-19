const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAdmin, loadUsers } = require('../helpers.cjs');

const router = Router();
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';
const AI_NAME_CODE = process.env.AI_NAME_CODE || '';
const AI_DAILY_CAP = parseInt(process.env.AI_DAILY_CAP, 10) || 50;
const HAIKU_MODEL = 'claude-haiku-4-5-20241022';

// --- Gate 2: AI-specific rate limiter ---
const aiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many AI requests. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- Gate 4: Daily cost cap tracking ---
let dailyAICalls = 0;
let dailyResetDate = new Date().toDateString();

function checkAndIncrementDailyCap() {
    const today = new Date().toDateString();
    if (today !== dailyResetDate) {
        dailyAICalls = 0;
        dailyResetDate = today;
    }
    if (dailyAICalls >= AI_DAILY_CAP) return false;
    dailyAICalls++;
    return true;
}

// --- Gate 3: Brute-force code protection ---
function checkCodeAttempts(session) {
    if (!session._aiCodeFails) session._aiCodeFails = 0;
    if (session._aiCodeFails >= 5) return false;
    return true;
}

function validateCode(code, session) {
    if (!AI_NAME_CODE) return false;
    if (!code || typeof code !== 'string') {
        session._aiCodeFails = (session._aiCodeFails || 0) + 1;
        return false;
    }
    const expected = Buffer.from(AI_NAME_CODE);
    const provided = Buffer.from(code);
    if (expected.length !== provided.length) {
        session._aiCodeFails = (session._aiCodeFails || 0) + 1;
        return false;
    }
    const valid = crypto.timingSafeEqual(expected, provided);
    if (!valid) session._aiCodeFails = (session._aiCodeFails || 0) + 1;
    else session._aiCodeFails = 0;
    return valid;
}

// --- Gate 7: Response validation ---
function validateNameResponse(text) {
    try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];
        const arr = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(arr)) return [];
        return arr
            .filter(n => typeof n === 'string')
            .map(n => n.slice(0, 100).trim())
            .filter(n => n.length > 0)
            .slice(0, 10);
    } catch {
        return [];
    }
}

async function callClaude(messages, maxTokens = 300) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: HAIKU_MODEL,
            max_tokens: maxTokens,
            messages,
        }),
    });
    if (!resp.ok) {
        const err = await resp.text();
        console.error('Claude API error:', resp.status, err);
        throw new Error('AI service error');
    }
    const data = await resp.json();
    return data.content?.[0]?.text || '';
}

// =====================================================================
// POST /api/generate-names — Name generation (pattern-based is free, AI requires code)
// =====================================================================
router.post('/api/generate-names', requireAuth, async (req, res) => {
    const { theme, keywords, code } = req.body;
    let { features, style, sampleNames, topThemeWords, totalGames, avgWordCount, useAI } = req.body;

    // --- Gate 5: Input sanitization ---
    if (!theme || typeof theme !== 'string') return res.status(400).json({ error: 'Theme is required' });
    if (theme.length > 200) return res.status(400).json({ error: 'Theme too long' });
    if (keywords && typeof keywords === 'string' && keywords.length > 500) return res.status(400).json({ error: 'Keywords too long' });

    const VALID_STYLES = ['modern', 'classic', 'playful', 'premium'];
    style = VALID_STYLES.includes(style) ? style : 'modern';
    features = Array.isArray(features) ? features.map(String).slice(0, 20) : [];
    topThemeWords = Array.isArray(topThemeWords) ? topThemeWords.map(String).slice(0, 20) : [];
    sampleNames = typeof sampleNames === 'string' ? sampleNames.slice(0, 500) : 'N/A';
    totalGames = typeof totalGames === 'number' && totalGames > 0 ? Math.min(totalGames, 10000) : 600;
    avgWordCount = typeof avgWordCount === 'number' && avgWordCount > 0 ? Math.min(avgWordCount, 10) : 3;

    if (!useAI) {
        return res.json({ names: [], source: 'pattern' });
    }

    // AI path — apply all security gates
    if (!CLAUDE_API_KEY) {
        return res.status(501).json({ error: 'Claude API key not configured.' });
    }
    if (!AI_NAME_CODE) {
        return res.status(501).json({ error: 'AI name generation not enabled.' });
    }

    // Gate 3: Brute-force check
    if (!checkCodeAttempts(req.session)) {
        return res.status(429).json({ error: 'Too many invalid code attempts. Please try again later.' });
    }

    // Gate 3: Code validation
    if (!validateCode(code, req.session)) {
        return res.status(403).json({ error: 'Invalid access code.' });
    }

    // Gate 4: Daily cap
    if (!checkAndIncrementDailyCap()) {
        return res.status(429).json({ error: 'Daily AI generation limit reached. Try again tomorrow.' });
    }

    // --- Gate 8: Audit log ---
    const user = req.session.user?.username || 'unknown';
    console.log(`[AI-AUDIT] name-gen | user=${user} | theme=${theme} | daily=${dailyAICalls}/${AI_DAILY_CAP}`);

    // --- Stage 1: Generate candidate names ---
    const stage1Prompt = `You are a creative slot game naming expert. Generate 10 unique, compelling slot game names for a ${style} style ${theme}-themed slot game.

Context from ${totalGames}+ real slot games:
- Average name length: ${avgWordCount} words
- Real ${theme} game names: ${sampleNames}
- Common words in this theme: ${topThemeWords.join(', ')}
- Game features: ${features.join(', ') || 'standard'}
${keywords ? `- User keywords to incorporate: ${keywords}` : ''}

Rules:
1. Names should be 2-4 words long
2. Names must be original (not matching any existing game)
3. Match the "${style}" style
4. Incorporate the theme naturally
5. If features are specified, subtly reference them

Return ONLY a JSON array of 10 name strings. Example: ["Name One", "Name Two"]`;

    try {
        const stage1Text = await callClaude([{ role: 'user', content: stage1Prompt }], 300);
        const candidateNames = validateNameResponse(stage1Text);

        if (candidateNames.length === 0) {
            return res.status(502).json({ error: 'AI generated invalid response. Try again.' });
        }

        // --- Stage 2: Refine and rank ---
        const stage2Prompt = `You are a slot game naming critic. Review these candidate names for a ${theme}-themed ${style} slot game:
${JSON.stringify(candidateNames)}

Improve them:
1. Remove any that sound generic or too similar to existing games
2. Ensure each name is memorable and marketable
3. Keep the best ones and replace weak ones with better alternatives
4. Final list should have exactly 10 names, 2-4 words each

Return ONLY a JSON array of 10 refined name strings.`;

        const stage2Text = await callClaude([{ role: 'user', content: stage2Prompt }], 300);
        const refinedNames = validateNameResponse(stage2Text);

        const finalNames = refinedNames.length >= 5 ? refinedNames : candidateNames;

        res.json({ names: finalNames, source: 'claude' });
    } catch (e) {
        console.error('Claude API request failed:', e.message);
        res.status(502).json({ error: 'AI service unavailable' });
    }
});

// Apply AI rate limiter to the AI name endpoint
router.use('/api/generate-names', aiRateLimiter);

// =====================================================================
// POST /api/ai-chat — AI Game Consultant chat
// =====================================================================
router.post('/api/ai-chat', requireAuth, aiRateLimiter, async (req, res) => {
    const { question, context, history } = req.body;

    if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'Question is required' });
    }
    if (question.length > 2000) {
        return res.status(400).json({ error: 'Question too long' });
    }

    if (!CLAUDE_API_KEY) {
        return res.status(501).json({ error: 'Claude API key not configured.' });
    }

    if (!checkAndIncrementDailyCap()) {
        return res.status(429).json({ error: 'Daily AI limit reached. Try again tomorrow.' });
    }

    const user = req.session.user?.username || 'unknown';
    console.log(`[AI-AUDIT] chat | user=${user} | daily=${dailyAICalls}/${AI_DAILY_CAP}`);

    const systemPrompt = `You are an expert Game Analytics AI Consultant for slot/casino games. You help game designers understand market trends, compare themes and mechanics, and make data-driven decisions.

${typeof context === 'string' ? context.slice(0, 3000) : ''}

Guidelines:
- Be concise and actionable
- Use data from the context when available
- Format responses with HTML: use <p>, <strong>, <ul>/<li> tags
- When comparing, use clear numerical evidence
- Suggest specific, data-backed recommendations
- Keep responses under 300 words`;

    const messages = [];
    if (Array.isArray(history)) {
        history.slice(-6).forEach(m => {
            if (m.role === 'user' && typeof m.content === 'string') {
                messages.push({ role: 'user', content: m.content.slice(0, 1000) });
            } else if (m.role === 'assistant' && typeof m.content === 'string') {
                messages.push({ role: 'assistant', content: m.content.slice(0, 1000) });
            }
        });
    }
    messages.push({ role: 'user', content: question.slice(0, 2000) });

    try {
        const response = await callClaude([
            { role: 'user', content: systemPrompt },
            { role: 'assistant', content: 'Understood. I\'m ready to help with game analytics questions.' },
            ...messages,
        ], 800);

        res.json({ response });
    } catch (e) {
        console.error('AI chat failed:', e.message);
        res.status(502).json({ error: 'AI service unavailable' });
    }
});

// --- Admin: reveal AI name code (requires password re-verification) ---
router.post('/api/admin/ai-code', requireAdmin, async (req, res) => {
    const { password } = req.body;
    if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Password required' });
    }
    if (!AI_NAME_CODE) {
        return res.status(404).json({ error: 'AI_NAME_CODE is not configured on the server' });
    }
    const users = loadUsers();
    const user = users.find(u => u.username.toLowerCase() === req.session.user.username.toLowerCase());
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
        return res.status(401).json({ error: 'Incorrect password' });
    }
    console.log(`[AUDIT] AI code revealed to admin: ${req.session.user.username}`);
    res.json({ code: AI_NAME_CODE });
});

module.exports = router;
