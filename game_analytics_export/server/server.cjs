/**
 * Game Analytics Dashboard - Auth Server
 *
 * Lightweight Express server that adds session-based authentication
 * in front of the static dashboard. Designed to run behind IIS
 * via HttpPlatformHandler on Windows Server.
 *
 * Users are stored in server/users.json (bcrypt hashed).
 * Manage users with: node server/manage-users.js add <username>
 */

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const DIST_DIR = path.join(__dirname, '..', 'dist');
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return [];
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

app.use(helmet({
    contentSecurityPolicy: false, // CSP managed by web.config / inline scripts
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'change-me-in-production-' + require('crypto').randomBytes(16).toString('hex'),
    resave: false,
    saveUninitialized: false,
    name: 'gd.sid',
    cookie: {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
}));

// --- Auth API ---

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const users = loadUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.user = { username: user.username, role: user.role || 'user' };
    if (req.body.remember) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }
    res.json({ success: true, user: { username: user.username, role: user.role || 'user' } });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('gd.sid');
        res.json({ success: true });
    });
});

app.get('/api/session', (req, res) => {
    if (req.session.user) {
        return res.json({ user: req.session.user });
    }
    res.status(401).json({ error: 'Not authenticated' });
});

// --- Static files ---

const PUBLIC_PATHS = [
    '/login.html',
    '/assets/',
    '/src/output.css',
    '/src/pages/login-page.js',
    '/src/assets/',
    '/robots.txt',
    '/health.json',
];

function isPublicPath(url) {
    const pathname = url.split('?')[0];
    return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
}

function requireAuth(req, res, next) {
    if (req.path.startsWith('/api/')) return next();
    if (isPublicPath(req.path)) return next();

    if (!req.session.user) {
        return res.redirect('/login.html');
    }
    next();
}

app.use(requireAuth);
app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
    next();
});
app.use(express.static(DIST_DIR, { etag: false, lastModified: false }));

// --- Tickets API ---
const TICKETS_FILE = path.join(__dirname, 'tickets.json');

function loadTickets() {
    try {
        if (!fs.existsSync(TICKETS_FILE)) return [];
        return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf-8'));
    } catch { return []; }
}

function saveTickets(tickets) {
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2));
}

app.get('/api/tickets', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    res.json(loadTickets());
});

app.post('/api/tickets', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    const { gameName, issueType, description } = req.body;
    if (!gameName || !description) {
        return res.status(400).json({ error: 'gameName and description required' });
    }
    const tickets = loadTickets();
    const ticket = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        gameName,
        issueType: issueType || 'data-issue',
        description,
        status: 'open',
        submittedBy: req.session.user.username,
        createdAt: new Date().toISOString(),
    };
    tickets.push(ticket);
    saveTickets(tickets);
    res.status(201).json(ticket);
});

app.patch('/api/tickets/:id', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const tickets = loadTickets();
    const ticket = tickets.find(t => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.body.status) ticket.status = req.body.status;
    if (req.body.resolution) ticket.resolution = req.body.resolution;
    ticket.updatedAt = new Date().toISOString();
    ticket.updatedBy = req.session.user.username;
    saveTickets(tickets);
    res.json(ticket);
});

// --- Admin User Management API ---

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function requireAdmin(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
}

app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = loadUsers();
    res.json(users.map(u => ({ username: u.username, role: u.role || 'user' })));
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    if (!username?.trim() || !password?.trim()) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const users = loadUsers();
    if (users.find(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
        return res.status(409).json({ error: 'Username already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    users.push({ username: username.trim(), passwordHash, role: role || 'user' });
    saveUsers(users);
    console.log(`[ADMIN] User created: ${username.trim()} (by ${req.session.user.username})`);
    res.status(201).json({ success: true, username: username.trim(), role: role || 'user' });
});

app.put('/api/admin/users/:username/password', requireAdmin, async (req, res) => {
    const { password } = req.body;
    const targetUsername = req.params.username;
    if (!password?.trim()) {
        return res.status(400).json({ error: 'Password is required' });
    }
    if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const users = loadUsers();
    const user = users.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.passwordHash = await bcrypt.hash(password, 12);
    saveUsers(users);
    console.log(`[ADMIN] Password changed for: ${user.username} (by ${req.session.user.username})`);
    res.json({ success: true });
});

app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
    const targetUsername = req.params.username;
    if (targetUsername.toLowerCase() === req.session.user.username.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    let users = loadUsers();
    const before = users.length;
    users = users.filter(u => u.username.toLowerCase() !== targetUsername.toLowerCase());
    if (users.length === before) return res.status(404).json({ error: 'User not found' });
    saveUsers(users);
    console.log(`[ADMIN] User deleted: ${targetUsername} (by ${req.session.user.username})`);
    res.json({ success: true });
});

// --- AI Name Generator API (Claude proxy) ---
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';

app.post('/api/generate-names', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    
    if (!CLAUDE_API_KEY) {
        return res.status(501).json({ error: 'Claude API key not configured. Set CLAUDE_API_KEY env variable.' });
    }
    
    const { theme, features, style, keywords, sampleNames, topThemeWords, totalGames, avgWordCount } = req.body;
    if (!theme) return res.status(400).json({ error: 'Theme is required' });
    
    const prompt = `You are a creative slot game naming expert. Generate 10 unique, compelling slot game names for a ${style || 'modern'} style ${theme}-themed slot game.

Context from ${totalGames || 600}+ real slot games:
- Average name length: ${avgWordCount || 3} words
- Real ${theme} game names: ${sampleNames || 'N/A'}
- Common words in this theme: ${(topThemeWords || []).join(', ')}
- Game features: ${(features || []).join(', ') || 'standard'}
${keywords ? `- User keywords to incorporate: ${keywords}` : ''}

Rules:
1. Names should be 2-4 words long
2. Names must be original (not matching any existing game)
3. Match the "${style}" style: ${style === 'classic' ? 'traditional, timeless feel' : style === 'playful' ? 'fun, energetic, exciting' : style === 'premium' ? 'luxurious, exclusive, high-end' : 'sleek, contemporary, dynamic'}
4. Incorporate the theme naturally
5. If features are specified, subtly reference them

Return ONLY a JSON array of 10 name strings, nothing else. Example: ["Name One", "Name Two"]`;

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        
        if (!resp.ok) {
            const err = await resp.text();
            console.error('Claude API error:', resp.status, err);
            return res.status(502).json({ error: 'AI service error' });
        }
        
        const data = await resp.json();
        const text = data.content?.[0]?.text || '[]';
        
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const names = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        
        res.json({ names, source: 'claude' });
    } catch (e) {
        console.error('Claude API request failed:', e.message);
        res.status(502).json({ error: 'AI service unavailable' });
    }
});

// SPA fallback -- serve dashboard.html for unmatched routes (not API, not files)
app.get('/{*splat}', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(DIST_DIR, 'dashboard.html'));
});

app.listen(PORT, () => {
    const users = loadUsers();
    console.log(`Game Analytics Dashboard server running on port ${PORT}`);
    console.log(`  Users loaded: ${users.length}`);
    console.log(`  Serving: ${DIST_DIR}`);
    if (users.length === 0) {
        console.log('  WARNING: No users configured! Run: node server/manage-users.cjs add <username>');
    }
});
