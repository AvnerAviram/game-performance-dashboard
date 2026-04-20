const { Router } = require('express');
const path = require('path');
const { loadTickets, saveTickets, requireAuth, requireAdmin } = require('../helpers.cjs');

const router = Router();

const APP_VERSION = (() => {
    try {
        return require(path.join(__dirname, '..', '..', 'package.json')).version;
    } catch {
        return 'unknown';
    }
})();

const MAX_FIELD_LEN = 500;
const VALID_ISSUE_TYPES = ['data-issue', 'data-correction', 'ui-bug', 'feature-request', 'other'];

const CORRECTION_FIELDS = [
    'gameId',
    'fieldPath',
    'currentValue',
    'proposedValue',
    'sourceEvidence',
    'sourceUrl',
    'diagnosis',
];

function sanitizeStr(val, max) {
    if (val == null) return undefined;
    if (typeof val !== 'string') return String(val).slice(0, max);
    return val.trim().slice(0, max);
}

router.get('/api/tickets', requireAuth, (req, res) => {
    try {
        res.json(loadTickets());
    } catch (err) {
        console.error('[ERROR] Load tickets failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/api/tickets', requireAuth, (req, res) => {
    try {
        const { gameName, issueType, description } = req.body;
        if (!gameName || !description) {
            return res.status(400).json({ error: 'gameName and description required' });
        }
        if (typeof gameName !== 'string' || typeof description !== 'string') {
            return res.status(400).json({ error: 'Invalid field types' });
        }
        if (gameName.length > MAX_FIELD_LEN || description.length > MAX_FIELD_LEN) {
            return res.status(400).json({ error: `Fields must be under ${MAX_FIELD_LEN} characters` });
        }
        const safeIssueType = VALID_ISSUE_TYPES.includes(issueType) ? issueType : 'data-issue';
        const tickets = loadTickets();

        // Dedup: if a data-correction ticket already exists for the same game+field, update it
        if (safeIssueType === 'data-correction' && req.body.fieldPath) {
            const existing = tickets.find(
                t =>
                    t.issueType === 'data-correction' &&
                    t.status === 'open' &&
                    t.gameName === gameName.trim() &&
                    t.fieldPath === req.body.fieldPath
            );
            if (existing) {
                existing.description = description.trim();
                existing.proposedValue = sanitizeStr(req.body.proposedValue, MAX_FIELD_LEN);
                existing.sourceEvidence = sanitizeStr(req.body.sourceEvidence, MAX_FIELD_LEN);
                existing.updatedAt = new Date().toISOString();
                existing.updatedBy = req.session.user.username;
                saveTickets(tickets);
                return res.status(200).json(existing);
            }
        }

        const ticket = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            gameName: gameName.trim(),
            issueType: safeIssueType,
            description: description.trim(),
            status: 'open',
            submittedBy: req.session.user.username,
            createdAt: new Date().toISOString(),
            appVersion: APP_VERSION,
        };

        if (safeIssueType === 'data-correction') {
            for (const f of CORRECTION_FIELDS) {
                const val = sanitizeStr(req.body[f], MAX_FIELD_LEN);
                if (val !== undefined) ticket[f] = val;
            }
        }

        tickets.push(ticket);
        saveTickets(tickets);
        res.status(201).json(ticket);
    } catch (err) {
        console.error('[ERROR] Create ticket failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const VALID_STATUSES = ['open', 'in-progress', 'resolved', 'closed', 'archived', 'approved'];

router.patch('/api/tickets/bulk', requireAdmin, (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
        if (ids.length > 1000) return res.status(400).json({ error: 'Max 1000 tickets per bulk operation' });
        if (!status || !VALID_STATUSES.includes(status))
            return res.status(400).json({ error: 'Valid status required' });

        const tickets = loadTickets();
        let updated = 0;
        for (const ticket of tickets) {
            if (ids.includes(ticket.id)) {
                ticket.status = status;
                ticket.updatedAt = new Date().toISOString();
                ticket.updatedBy = req.session.user.username;
                updated++;
            }
        }
        if (updated === 0) return res.status(404).json({ error: 'No matching tickets found' });
        saveTickets(tickets);
        console.log(`[ADMIN] Bulk update: ${updated} tickets → ${status} (by ${req.session.user.username})`);
        res.json({ updated });
    } catch (err) {
        console.error('[ERROR] Bulk update failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/api/tickets/:id', requireAdmin, (req, res) => {
    try {
        const tickets = loadTickets();
        const ticket = tickets.find(t => t.id === req.params.id);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        const { status, resolution, gameName, description, issueType } = req.body;
        if (status) {
            if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
            ticket.status = status;
        }
        if (resolution) {
            if (typeof resolution !== 'string' || resolution.length > MAX_FIELD_LEN)
                return res.status(400).json({ error: `Resolution must be under ${MAX_FIELD_LEN} characters` });
            ticket.resolution = resolution.trim();
        }
        if (gameName) {
            if (typeof gameName !== 'string' || gameName.length > MAX_FIELD_LEN)
                return res.status(400).json({ error: `gameName must be under ${MAX_FIELD_LEN} characters` });
            ticket.gameName = gameName.trim();
        }
        if (description) {
            if (typeof description !== 'string' || description.length > MAX_FIELD_LEN)
                return res.status(400).json({ error: `description must be under ${MAX_FIELD_LEN} characters` });
            ticket.description = description.trim();
        }
        if (issueType) {
            if (!VALID_ISSUE_TYPES.includes(issueType)) return res.status(400).json({ error: 'Invalid issue type' });
            ticket.issueType = issueType;
        }

        ticket.updatedAt = new Date().toISOString();
        ticket.updatedBy = req.session.user.username;
        saveTickets(tickets);
        res.json(ticket);
    } catch (err) {
        console.error('[ERROR] Update ticket failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/api/tickets/bulk', requireAdmin, (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
        if (ids.length > 1000) return res.status(400).json({ error: 'Max 1000 tickets per bulk operation' });

        let tickets = loadTickets();
        const before = tickets.length;
        const idSet = new Set(ids);
        tickets = tickets.filter(t => !idSet.has(t.id));
        const deleted = before - tickets.length;
        if (deleted === 0) return res.status(404).json({ error: 'No matching tickets found' });
        saveTickets(tickets);
        console.log(`[ADMIN] Bulk delete: ${deleted} tickets (by ${req.session.user.username})`);
        res.json({ deleted });
    } catch (err) {
        console.error('[ERROR] Bulk delete failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/api/tickets/:id', requireAdmin, (req, res) => {
    try {
        let tickets = loadTickets();
        const before = tickets.length;
        tickets = tickets.filter(t => t.id !== req.params.id);
        if (tickets.length === before) return res.status(404).json({ error: 'Ticket not found' });
        saveTickets(tickets);
        console.log(`[ADMIN] Ticket deleted: ${req.params.id} (by ${req.session.user.username})`);
        res.json({ success: true });
    } catch (err) {
        console.error('[ERROR] Delete ticket failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
