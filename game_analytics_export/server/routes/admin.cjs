const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { loadUsers, saveUsers, requireAdmin } = require('../helpers.cjs');

const router = Router();
const VALID_ROLES = ['admin', 'user'];

router.get('/api/admin/users', requireAdmin, (req, res) => {
    try {
        const users = loadUsers();
        res.json(users.map(u => ({ username: u.username, role: u.role || 'user' })));
    } catch (err) {
        console.error('[ERROR] List users failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username?.trim() || !password?.trim()) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        if (username.trim().length > 50) {
            return res.status(400).json({ error: 'Username must be under 50 characters' });
        }
        const users = loadUsers();
        if (users.find(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
            return res.status(409).json({ error: 'Username already exists' });
        }
        const safeRole = VALID_ROLES.includes(role) ? role : 'user';
        const passwordHash = await bcrypt.hash(password, 12);
        users.push({ username: username.trim(), passwordHash, role: safeRole });
        saveUsers(users);
        console.log(`[ADMIN] User created: ${username.trim()} (by ${req.session.user.username})`);
        res.status(201).json({ success: true, username: username.trim(), role: safeRole });
    } catch (err) {
        console.error('[ERROR] Create user failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/api/admin/users/:username/password', requireAdmin, async (req, res) => {
    try {
        const { password } = req.body;
        const targetUsername = req.params.username;
        if (!password?.trim()) {
            return res.status(400).json({ error: 'Password is required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        const users = loadUsers();
        const user = users.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.passwordHash = await bcrypt.hash(password, 12);
        saveUsers(users);
        console.log(`[ADMIN] Password changed for: ${user.username} (by ${req.session.user.username})`);
        res.json({ success: true });
    } catch (err) {
        console.error('[ERROR] Change password failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
    try {
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
    } catch (err) {
        console.error('[ERROR] Delete user failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
