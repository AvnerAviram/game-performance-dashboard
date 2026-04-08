const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { loadUsers } = require('../helpers.cjs');

const router = Router();

router.post('/api/login', async (req, res) => {
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

        req.session.user = { username: user.username, role: user.role || 'user' };
        if (req.body.remember) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        }
        res.json({ success: true, user: { username: user.username, role: user.role || 'user' } });
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
