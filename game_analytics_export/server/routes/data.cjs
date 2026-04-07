const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../helpers.cjs');

const router = Router();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONFIG_DIR = path.join(__dirname, '..', '..', 'src', 'config');

const STRIP_FIELDS = new Set([
    'feature_details',
    'extraction_date',
    'verification_notes',
    'extraction_model',
    'extraction_source',
    'original_release_date_source',
]);

let _gamesCache = null;
let _gamesCacheMtime = 0;

function getSlimGames() {
    const filePath = path.join(DATA_DIR, 'game_data_master.json');
    const stat = fs.statSync(filePath);
    if (_gamesCache && stat.mtimeMs === _gamesCacheMtime) return _gamesCache;

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const slim = raw.map(g => {
        const out = {};
        for (const [k, v] of Object.entries(g)) {
            if (!STRIP_FIELDS.has(k)) out[k] = v;
        }
        return out;
    });
    const json = JSON.stringify(slim);
    _gamesCache = { json, etag: `"slim-${stat.size}-${stat.mtimeMs.toFixed(0)}"` };
    _gamesCacheMtime = stat.mtimeMs;
    return _gamesCache;
}

function serveDataFile(filePath, res) {
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Data file not found' });
    const stat = fs.statSync(filePath);
    const etag = `"${stat.size}-${stat.mtimeMs.toFixed(0)}"`;
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    res.set('ETag', etag);
    res.set('Content-Type', 'application/json');
    if (res.req.headers['if-none-match'] === etag) {
        return res.status(304).end();
    }
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => {
        console.error('[ERROR] Stream failed:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    });
    stream.pipe(res);
}

router.get('/api/data/games', requireAuth, (req, res) => {
    try {
        const { json, etag } = getSlimGames();
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        res.set('ETag', etag);
        res.set('Content-Type', 'application/json');
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.send(json);
    } catch (err) {
        console.error('[ERROR] Slim games failed:', err.message);
        serveDataFile(path.join(DATA_DIR, 'game_data_master.json'), res);
    }
});

router.get('/api/data/theme-map', requireAuth, (req, res) => {
    serveDataFile(path.join(DATA_DIR, 'theme_consolidation_map.json'), res);
});

router.get('/api/data/confidence-map', requireAuth, (req, res) => {
    serveDataFile(path.join(DATA_DIR, 'confidence_map.json'), res);
});

router.get('/api/data/art', requireAuth, (req, res) => {
    serveDataFile(path.join(DATA_DIR, 'staged_art_characterization.json'), res);
});

router.get('/api/data/theme-breakdowns', requireAuth, (req, res) => {
    serveDataFile(path.join(CONFIG_DIR, 'theme-breakdowns.json'), res);
});

router.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

module.exports = router;
