const { Router } = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { loadUsers } = require('../helpers.cjs');

const router = Router();

const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts. Try again in 5 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/api/login', loginLimiter, async (req, res) => {
    try {
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

        const userData = { username: user.username, role: user.role || 'user' };
        const remember = req.body.remember;

        req.session.regenerate(err => {
            if (err) {
                console.error('[ERROR] Session regeneration failed:', err.message);
                return res.status(500).json({ error: 'Internal server error' });
            }
            req.session.user = userData;
            if (remember) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
            }
            res.json({ success: true, user: userData });
        });
    } catch (err) {
        console.error('[ERROR] Login failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('gd.sid');
        res.json({ success: true });
    });
});

router.get('/api/session', (req, res) => {
    if (req.session.user) {
        return res.json({ user: req.session.user });
    }
    res.status(401).json({ error: 'Not authenticated' });
});

module.exports = router;
