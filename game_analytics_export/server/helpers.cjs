const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'users.json');
const TICKETS_FILE = path.join(__dirname, 'tickets.json');

function loadUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return [];
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('Failed to save users:', err.message);
        throw new Error('Failed to persist user data', { cause: err });
    }
}

function loadTickets() {
    try {
        if (!fs.existsSync(TICKETS_FILE)) return [];
        return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf-8'));
    } catch { return []; }
}

function saveTickets(tickets) {
    try {
        fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2));
    } catch (err) {
        console.error('Failed to save tickets:', err.message);
        throw new Error('Failed to persist ticket data', { cause: err });
    }
}

function requireAuth(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
}

module.exports = { loadUsers, saveUsers, loadTickets, saveTickets, requireAuth, requireAdmin };
