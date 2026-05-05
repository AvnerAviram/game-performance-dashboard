const express = require('express');
const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAdmin, loadUsers } = require('../helpers.cjs');

const router = Router();
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
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
router.post('/api/generate-names', requireAuth, aiRateLimiter, async (req, res) => {
    const { theme, keywords, code } = req.body;
    let { features, style, sampleNames, topThemeWords, totalGames, avgWordCount, useAI } = req.body;

    // --- Gate 5: Input sanitization ---
    if (!theme || typeof theme !== 'string') return res.status(400).json({ error: 'Theme is required' });
    if (theme.length > 200) return res.status(400).json({ error: 'Theme too long' });
    if (keywords && typeof keywords === 'string' && keywords.length > 500)
        return res.status(400).json({ error: 'Keywords too long' });

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
        const stage1Text = await callClaude([{ role: 'user', content: stage1Prompt }], 150);
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

        const stage2Text = await callClaude([{ role: 'user', content: stage2Prompt }], 150);
        const refinedNames = validateNameResponse(stage2Text);

        const finalNames = refinedNames.length >= 5 ? refinedNames : candidateNames;

        res.json({ names: finalNames, source: 'claude' });
    } catch (e) {
        console.error('Claude API request failed:', e.message);
        res.status(502).json({ error: 'AI service unavailable' });
    }
});

// =====================================================================
// POST /api/generate-names-vision — Vision-based name generation
// =====================================================================
const jsonLimit2mb = express.json({ limit: '2mb' });

router.post('/api/generate-names-vision', jsonLimit2mb, requireAuth, aiRateLimiter, async (req, res) => {
    const { imageB64, mediaType, keywords, code } = req.body;
    let { features, style, totalGames, avgWordCount } = req.body;

    if (!imageB64 || typeof imageB64 !== 'string') {
        return res.status(400).json({ error: 'Image is required' });
    }
    const VALID_MEDIA = ['image/jpeg', 'image/png', 'image/webp'];
    if (!VALID_MEDIA.includes(mediaType)) {
        return res.status(400).json({ error: 'Invalid image format. Use JPEG, PNG, or WebP.' });
    }
    const estimatedBytes = imageB64.length * 0.75;
    if (estimatedBytes > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image too large. Max 2MB.' });
    }

    if (!CLAUDE_API_KEY) return res.status(501).json({ error: 'Claude API key not configured.' });
    if (!AI_NAME_CODE) return res.status(501).json({ error: 'AI name generation not enabled.' });
    if (!checkCodeAttempts(req.session)) return res.status(429).json({ error: 'Too many invalid code attempts.' });
    if (!validateCode(code, req.session)) return res.status(403).json({ error: 'Invalid access code.' });
    if (!checkAndIncrementDailyCap()) return res.status(429).json({ error: 'Daily AI limit reached.' });

    style = ['modern', 'classic', 'playful', 'premium'].includes(style) ? style : 'modern';
    features = Array.isArray(features) ? features.map(String).slice(0, 20) : [];
    totalGames = typeof totalGames === 'number' && totalGames > 0 ? Math.min(totalGames, 10000) : 600;
    avgWordCount = typeof avgWordCount === 'number' && avgWordCount > 0 ? Math.min(avgWordCount, 10) : 3;

    const user = req.session.user?.username || 'unknown';
    console.log(`[AI-AUDIT] vision-name-gen | user=${user} | style=${style} | daily=${dailyAICalls}/${AI_DAILY_CAP}`);

    const prompt = `You are a creative slot game naming expert. Analyze this game screenshot or concept art image carefully.

Based on what you see — the theme, visual style, colors, characters, mood, and art elements — generate 10 unique, compelling slot game names.

Context: This is for a ${style}-style slot game. Average slot game name is ${avgWordCount} words.
${features.length ? `Game mechanics: ${features.join(', ')}` : ''}
${keywords ? `Additional keywords to consider: ${keywords}` : ''}

Rules:
1. Names should be 2-4 words long
2. Names must capture the visual mood and theme you see in the image
3. Match the "${style}" naming style
4. Names should be original and marketable
5. Include at least 2 names that reference specific visual elements you notice

Return ONLY a JSON array of 10 name strings. Example: ["Name One", "Name Two"]`;

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: HAIKU_MODEL,
                max_tokens: 250,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: { type: 'base64', media_type: mediaType, data: imageB64 },
                            },
                            { type: 'text', text: prompt },
                        ],
                    },
                ],
            }),
        });

        if (!resp.ok) {
            const err = await resp.text();
            console.error('Claude Vision API error:', resp.status, err);
            throw new Error('AI service error');
        }

        const data = await resp.json();
        const text = data.content?.[0]?.text || '';
        const names = validateNameResponse(text);

        if (names.length === 0) {
            return res
                .status(502)
                .json({ error: 'AI could not generate names from this image. Try a different image.' });
        }

        res.json({ names, source: 'claude-vision' });
    } catch (e) {
        console.error('Claude Vision request failed:', e.message);
        res.status(502).json({ error: 'AI vision service unavailable' });
    }
});

// =====================================================================
// GET /api/trademark-check — USPTO trademark lookup via tmsearchapi.com
// =====================================================================
const TM_DAILY_CAP = 45;
let dailyTMChecks = 0;
let dailyTMResetDate = new Date().toDateString();

const GAMING_CLASSES = new Set(['009', '028', '041']);
const LIVE_CODES = new Set(['600', '601', '607', '608', '620', '622', '648', '700', '800']);

function classifyTMStatus(code) {
    if (LIVE_CODES.has(code)) return 'Live';
    const n = parseInt(code, 10);
    if ((n >= 630 && n <= 662) || code === '900') return 'Pending';
    return 'Dead';
}

const tmRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many trademark checks. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

async function fetchTMSearch(query, signal) {
    const resp = await fetch(`https://tmsearchapi.com/search/mark?q=${encodeURIComponent(query)}&limit=10`, { signal });
    if (!resp.ok) throw new Error('upstream ' + resp.status);
    return resp.json();
}

function classifyResult(r, matchedQuery) {
    return {
        mark: r.mark || '',
        owner: r.owner_name || '',
        country: r.owner_country || '',
        status: r.status_code || '',
        statusLabel: classifyTMStatus(r.status_code || ''),
        classes: r.classes || '',
        descriptions: r.descriptions || '',
        isGamingClass: (r.classes || '').split(',').some(c => GAMING_CLASSES.has(c.trim())),
        registrationNumber: r.registration_number || '',
        matchedQuery: matchedQuery || '',
    };
}

router.get('/api/trademark-check', requireAuth, tmRateLimiter, async (req, res) => {
    const name = req.query.name;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name query parameter is required' });
    }
    if (name.length > 100) {
        return res.status(400).json({ error: 'Name too long (max 100 characters)' });
    }

    const today = new Date().toDateString();
    if (today !== dailyTMResetDate) {
        dailyTMChecks = 0;
        dailyTMResetDate = today;
    }

    const trimmed = name.trim();
    const words = trimmed.split(/\s+/).filter(w => w.length > 0);

    const queries = [trimmed];
    if (words.length >= 3) {
        for (let i = 0; i <= words.length - 2; i++) {
            const bigram = words[i] + ' ' + words[i + 1];
            if (bigram.toLowerCase() !== trimmed.toLowerCase()) {
                queries.push(bigram);
            }
        }
    }

    const apiCallsNeeded = queries.length;
    if (dailyTMChecks + apiCallsNeeded > TM_DAILY_CAP) {
        return res.status(429).json({
            error: `Daily trademark check limit reached (need ${apiCallsNeeded} calls, ${TM_DAILY_CAP - dailyTMChecks} remaining). Try again tomorrow.`,
        });
    }
    dailyTMChecks += apiCallsNeeded;

    const user = req.session.user?.username || 'unknown';

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const fetchResults = await Promise.all(
            queries.map(q =>
                fetchTMSearch(q, controller.signal)
                    .then(data => ({ query: q, results: data.results || [], totalCount: data.total_count || 0 }))
                    .catch(() => ({ query: q, results: [], totalCount: 0 }))
            )
        );
        clearTimeout(timeout);

        const seen = new Set();
        const allResults = [];
        let totalCount = 0;
        for (const batch of fetchResults) {
            totalCount += batch.totalCount;
            for (const r of batch.results) {
                const key = r.serial_number || r.mark + r.owner_name;
                if (!seen.has(key)) {
                    seen.add(key);
                    allResults.push(classifyResult(r, batch.query));
                }
            }
        }

        const liveCount = allResults.filter(r => r.statusLabel === 'Live').length;
        console.log(
            `[TM-AUDIT] check | user=${user} | name="${trimmed}" | queries=${queries.length} | hits=${allResults.length} | live=${liveCount} | daily=${dailyTMChecks}/${TM_DAILY_CAP}`
        );

        res.json({
            name: trimmed,
            queries,
            results: allResults,
            totalCount,
            dailyRemaining: TM_DAILY_CAP - dailyTMChecks,
        });
    } catch (e) {
        if (e.name === 'AbortError') {
            console.error('[TM-AUDIT] timeout | name="' + trimmed + '"');
            return res.status(504).json({ error: 'Trademark search timed out. Try again.' });
        }
        console.error('[TM-AUDIT] error:', e.message);
        res.status(502).json({ error: 'Trademark search service unavailable' });
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

// =====================================================================
// POST /api/concept-analyze — Concept Analyzer (Claude-powered)
// =====================================================================
router.post('/api/concept-analyze', requireAuth, aiRateLimiter, async (req, res) => {
    const { concept, context, code } = req.body;
    if (!concept || typeof concept !== 'string' || concept.length > 3000) {
        return res.status(400).json({ error: 'Invalid concept' });
    }
    if (!checkCodeAttempts(req.session)) {
        return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }
    if (!validateCode(code, req.session)) {
        return res.status(403).json({ error: 'Invalid AI code' });
    }
    if (!CLAUDE_API_KEY) {
        return res.status(503).json({ error: 'AI service not configured' });
    }
    if (!checkAndIncrementDailyCap()) {
        return res.status(429).json({ error: 'Daily AI budget exhausted' });
    }

    const prompt = `You are a slot game market analyst. Analyze this game concept against real market data and provide actionable insights.

MARKET DATA:
${context || 'No data available.'}

GAME CONCEPT:
"${concept}"

Provide a structured analysis with:
1. **Market Fit Score** (1-10) — how well this concept fits current market trends
2. **Theme Analysis** — how the theme compares to top performers
3. **Mechanics Evaluation** — strengths/weaknesses of chosen mechanics
4. **Competition** — similar existing games and how to differentiate
5. **Recommendations** — 3-5 specific suggestions to improve the concept
6. **Risk Factors** — potential market risks

Keep it concise and data-driven. Use bullet points. Under 400 words.`;

    try {
        const answer = await callClaude([{ role: 'user', content: prompt }], 1000);
        res.json({ answer, source: 'claude' });
    } catch (e) {
        console.error('Concept Analyze Claude error:', e.message);
        res.status(502).json({ error: 'AI service unavailable' });
    }
});

// =====================================================================
// POST /api/ai-chat — AI Game Consultant (Claude-powered chat)
// =====================================================================
router.post('/api/ai-chat', requireAuth, aiRateLimiter, async (req, res) => {
    const { message, context, code } = req.body;
    if (!message || typeof message !== 'string' || message.length > 2000) {
        return res.status(400).json({ error: 'Invalid message' });
    }
    if (!checkCodeAttempts(req.session)) {
        return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }
    if (!validateCode(code, req.session)) {
        return res.status(403).json({ error: 'Invalid AI code' });
    }
    if (!CLAUDE_API_KEY) {
        return res.status(503).json({ error: 'AI service not configured' });
    }
    if (!checkAndIncrementDailyCap()) {
        return res.status(429).json({ error: 'Daily AI budget exhausted' });
    }

    const systemPrompt = `You are a game analytics AI consultant for slot/casino games. You have access to real market data provided in the context below. Answer questions concisely and data-driven. Use numbers, percentages, and rankings when available. Keep responses under 300 words. Format with bullet points when listing data.

DATA CONTEXT:
${context || 'No specific data context provided.'}`;

    try {
        const answer = await callClaude(
            [{ role: 'user', content: `${systemPrompt}\n\nUSER QUESTION: ${message}` }],
            800
        );
        res.json({ answer, source: 'claude' });
    } catch (e) {
        console.error('AI Chat Claude error:', e.message);
        res.status(502).json({ error: 'AI service unavailable' });
    }
});

module.exports = router;
