const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../helpers.cjs');

const router = Router();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONFIG_DIR = path.join(__dirname, '..', '..', 'src', 'config');

function serveDataFile(filePath, res) {
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Data file not found' });
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/json');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => {
        console.error('[ERROR] Stream failed:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    });
    stream.pipe(res);
}

router.get('/api/data/games', requireAuth, (req, res) => {
    serveDataFile(path.join(DATA_DIR, 'games_dashboard.json'), res);
});

router.get('/api/data/theme-map', requireAuth, (req, res) => {
    serveDataFile(path.join(DATA_DIR, 'theme_consolidation_map.json'), res);
});

router.get('/api/data/theme-breakdowns', requireAuth, (req, res) => {
    serveDataFile(path.join(CONFIG_DIR, 'theme-breakdowns.json'), res);
});

router.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

module.exports = router;
