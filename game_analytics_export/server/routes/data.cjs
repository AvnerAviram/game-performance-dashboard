const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth, loadTickets } = require('../helpers.cjs');
const {
    diagnoseField,
    detectInconsistencies,
    buildProviderStats,
    extractRulesEvidence,
    getExtractionMethod,
    getContextWindow,
    computeCoverageStats,
    computeRulesMatchPct,
    resolveSourceLabel,
} = require('../helpers/provenance-diagnosis.cjs');
const { matchGameToDimension, defaultMatchRtpBand } = require('../helpers/dimension-filter.cjs');

const router = Router();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONFIG_DIR = path.join(__dirname, '..', '..', 'src', 'config');

let _franchiseMap = null;
function getFranchiseMap() {
    if (!_franchiseMap) {
        try {
            _franchiseMap = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'franchise_mapping.json'), 'utf-8'));
        } catch {
            _franchiseMap = {};
        }
    }
    return _franchiseMap;
}

const PROVIDER_NORM = {
    Igt: 'IGT',
    'International Gaming Technology': 'IGT',
    Inspired: 'Inspired Gaming',
    'Inspired Ga': 'Inspired Gaming',
    'Inspired Entertainment': 'Inspired Gaming',
    'Play N Go': "Play'n GO",
    'Light And Wonder': 'Light & Wonder',
    Blueprint: 'Blueprint Gaming',
    'White Hat Studios': 'Blueprint Gaming',
    Lucksome: 'Blueprint Gaming',
    'Atomic Slot Lab': 'Blueprint Gaming',
    'Red Tiger': 'Red Tiger Gaming',
    Bragg: 'Bragg Gaming Group',
    Bally: 'Light & Wonder',
    WMS: 'Light & Wonder',
    Nyx: 'Light & Wonder',
    'NextGen Gaming': 'Light & Wonder',
    'Slingshot Studios': 'Light & Wonder',
};

function normalizeProvider(raw) {
    return PROVIDER_NORM[raw] || raw;
}

function matchRtpBand(rtp, band) {
    const b = band.trim();
    if (b.startsWith('>')) return rtp > parseFloat(b.replace(/[>%\s]/g, ''));
    if (b.startsWith('<')) return rtp < parseFloat(b.replace(/[<%\s]/g, ''));
    const range = b
        .replace(/%/g, '')
        .split('-')
        .map(s => parseFloat(s.trim()));
    if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
        return rtp >= range[0] && rtp <= range[1];
    }
    return Math.abs(rtp - parseFloat(b)) < 0.01;
}

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

// ── Provenance helpers ──────────────────────────────────────────────

let _providerStats = null;
let _coverageStats = null;
let _rulesMatchPct = null;
let _agsGt;
let _thinGt;
let _themeConsolidationMap;

function loadAgsGt() {
    if (_agsGt === undefined) _agsGt = loadJsonSafe(path.join(DATA_DIR, 'ground_truth_ags.json'));
    return _agsGt;
}

function loadThinGt() {
    if (_thinGt === undefined) _thinGt = loadJsonSafe(path.join(DATA_DIR, 'thin_gt_extractions.json'));
    return _thinGt;
}

function loadThemeConsolidationMap() {
    if (_themeConsolidationMap === undefined)
        _themeConsolidationMap = loadJsonSafe(path.join(DATA_DIR, 'theme_consolidation_map.json'));
    return _themeConsolidationMap;
}

function buildGtEvidence(field, gameName, game) {
    const agsGt = loadAgsGt();
    const agsEntry = agsGt?.[gameName];
    if (agsEntry && agsEntry[field] != null) {
        return { source: 'AGS ground truth', value: agsEntry[field] };
    }
    const thinGt = loadThinGt();
    const thinEntry = thinGt?.[gameName];
    if (thinEntry?.result?.specs?.[field] != null) {
        return { source: 'AI extraction (verified)', value: thinEntry.result.specs[field] };
    }
    if (field === 'theme_primary' && thinEntry?.result?.theme_primary) {
        return { source: 'AI extraction (verified)', value: thinEntry.result.theme_primary };
    }
    return null;
}

function buildThemeConsolidation(themeValue) {
    if (!themeValue) return null;
    const map = loadThemeConsolidationMap();
    if (!map) return null;
    const consolidated = map[themeValue];
    if (consolidated && consolidated !== themeValue) {
        return { raw: themeValue, consolidated };
    }
    return null;
}

function getFullGames() {
    const filePath = path.join(DATA_DIR, 'game_data_master.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadJsonSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function readRulesText(slug, maxChars) {
    const filePath = path.join(DATA_DIR, 'rules_text', `${slug}.txt`);
    if (!fs.existsSync(filePath)) return null;
    const buf = Buffer.alloc(maxChars || 3000);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return buf.toString('utf8', 0, bytesRead);
}

function findRulesMatch(gameName, rulesMatches) {
    if (!rulesMatches || !gameName) return null;
    if (Array.isArray(rulesMatches)) {
        return rulesMatches.find(m => m.game_name === gameName) || null;
    }
    return rulesMatches[gameName] || null;
}

const PROVENANCE_FIELDS = [
    'name',
    'rtp',
    'volatility',
    'theme_primary',
    'reels',
    'rows',
    'paylines',
    'original_release_year',
    'description',
    'min_bet',
    'max_bet',
    'max_win',
    'theo_win',
    'market_share_pct',
    'avg_bet',
    'release_year',
    'provider',
];

const ART_FIELDS = ['art_style', 'art_color_tone', 'art_theme', 'art_characters', 'art_mood'];

const FIELD_ALIASES = {
    market_share: 'market_share_pct',
    market_share_percent: 'market_share_pct',
    name: 'name',
};

const PLATFORM_FIELDS = new Set([
    'name',
    'theo_win',
    'market_share_pct',
    'avg_bet',
    'release_year',
    'provider',
    'sites',
    'games_played_index',
    'coin_in_index',
]);

const EXTRACTED_FIELDS = new Set(['rtp', 'volatility', 'reels', 'rows', 'paylines', 'max_win', 'min_bet', 'max_bet']);
const CLASSIFIED_FIELDS = new Set(['theme_primary', 'theme_consolidated', 'symbols', 'features']);
const INFERRED_FIELDS = new Set(['description']);

function inferConfidence(field, game, bestOf) {
    if (game.data_confidence === 'gt_verified') return 'gt_verified';
    if (field === 'original_release_year') {
        const src = (bestOf || {}).original_release_date_source;
        if (src === 'verified_reference') return 'verified';
        if (src && /official/.test(src)) return 'verified';
        if (src && /slotcatalog|slotreport|html/i.test(src)) return 'extracted';
        if (src && /claude_lookup_high/.test(src)) return 'extracted';
        if (src && /claude_lookup/.test(src)) return 'text_inferred';
        return 'extracted';
    }
    if (EXTRACTED_FIELDS.has(field)) return 'extracted';
    if (CLASSIFIED_FIELDS.has(field)) return 'extracted';
    if (INFERRED_FIELDS.has(field)) return 'text_inferred';
    return null;
}

let _metricsModule = null;
async function loadMetrics() {
    if (!_metricsModule) {
        _metricsModule = await import('../../src/lib/metrics.js');
    }
    return _metricsModule;
}

function buildRanking(rows, dimension, value) {
    const nameKey = {
        provider: 'name',
        theme: 'theme',
        feature: 'feature',
        rtp: 'label',
        volatility: 'volatility',
        volatility: 'volatility',
        rtp: 'label',
        franchise: 'name',
        art_theme: 'theme',
        art_mood: 'mood',
        art_characters: 'character',
        art_elements: 'element',
        art_narrative: 'narrative',
    }[dimension];
    if (!nameKey) return null;
    const filtered = rows.filter(r => {
        const n = (r[nameKey] || '').trim();
        return n && n !== 'Unknown' && n !== 'unknown' && n !== 'N/A';
    });
    const idx = filtered.findIndex(r => (r[nameKey] || '').toLowerCase() === value.toLowerCase());
    if (idx === -1) return null;
    const row = filtered[idx];
    const top5 = filtered.slice(0, 5).map((r, i) => ({
        rank: i + 1,
        name: r[nameKey],
        game_count: r.count,
        avg_theo_win: +(r.avgTheo || 0).toFixed(2),
        smart_index: +(r.smartIndex || 0).toFixed(2),
    }));
    return {
        rank: idx + 1,
        game_count: row.count,
        avg_theo_win: +(row.avgTheo || 0).toFixed(2),
        smartIndex: +(row.smartIndex || 0).toFixed(2),
        total_dimension_entries: filtered.length,
        top5,
    };
}

// top-game must be before :gameName to avoid being caught by the wildcard
router.get('/api/data/provenance/top-game', requireAuth, async (req, res) => {
    try {
        const { dimension, value, year } = req.query;
        if (!dimension || !value) return res.status(400).json({ error: 'dimension and value required' });

        let allGames = JSON.parse(getSlimGames().json);

        // Optional year filter: restrict to games from a specific year
        if (year) {
            const yr = String(year);
            allGames = allGames.filter(g => String(g.original_release_year) === yr || String(g.release_year) === yr);
        }

        const valLower = value.toLowerCase();

        const filterOpts = {
            normalizeProvider,
            getFranchiseMap,
            matchRtpBand: (rtp, band) => matchRtpBand(rtp, band),
        };
        const matches = allGames.filter(g => matchGameToDimension(g, dimension, valLower, filterOpts));

        if (!matches.length) return res.status(404).json({ error: 'No games found for this dimension' });

        matches.sort(
            (a, b) => (b.theo_win || b.performance_theo_win || 0) - (a.theo_win || a.performance_theo_win || 0)
        );

        let ranking = null;
        try {
            const m = await loadMetrics();
            const metricsFn = {
                provider: m.getProviderMetrics,
                theme: m.getThemeMetrics,
                feature: m.getFeatureMetrics,
                volatility: m.getVolatilityMetrics,
                rtp: m.getRtpBandMetrics,
                art_theme: m.getArtThemeMetrics,
                art_mood: m.getArtMoodMetrics,
                art_characters: m.getArtCharacterMetrics,
                art_elements: m.getArtElementMetrics,
                art_narrative: m.getArtNarrativeMetrics,
            }[dimension];
            if (metricsFn) {
                const rows = metricsFn(allGames);
                ranking = buildRanking(rows, dimension, value);
            }
        } catch (metricsErr) {
            console.warn('[WARN] metrics ranking failed (non-fatal):', metricsErr.message);
        }

        const result = { gameName: matches[0].name, totalGames: matches.length, dimension, value };
        if (ranking) result.ranking = ranking;
        res.json(result);
    } catch (err) {
        console.error('[ERROR] top-game lookup failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/api/data/provenance/:gameName', requireAuth, (req, res) => {
    try {
        const gameName = decodeURIComponent(req.params.gameName);
        const rawFocusField = req.query.field || null;
        const focusField = rawFocusField ? FIELD_ALIASES[rawFocusField] || rawFocusField : null;

        const games = getFullGames();
        const game = games.find(g => g.name === gameName);
        if (!game) return res.status(404).json({ error: 'Game not found' });

        if (!_providerStats) _providerStats = buildProviderStats(games);

        const confMap = loadJsonSafe(path.join(DATA_DIR, 'confidence_map.json'));
        const artMap = loadJsonSafe(path.join(DATA_DIR, 'staged_art_characterization.json'));
        const rulesMatches = loadJsonSafe(path.join(DATA_DIR, 'rules_game_matches.json'));
        const bestOfSources = loadJsonSafe(path.join(DATA_DIR, 'staged_best_of_sources.json'));

        if (!_coverageStats) {
            _coverageStats = computeCoverageStats(games);
            _rulesMatchPct = computeRulesMatchPct(rulesMatches, games.length);
        }

        const conf = confMap ? confMap[gameName] || {} : {};
        const art = artMap ? artMap[gameName] || {} : {};
        const bestOf = bestOfSources ? bestOfSources[gameName] || {} : {};
        const rulesMatch = findRulesMatch(gameName, rulesMatches);
        const slug = rulesMatch?.slug || rulesMatch?.rules_slug || null;
        const rulesText = slug ? readRulesText(slug, 12000) : null;

        const inconsistencies = detectInconsistencies(game, conf, rulesText);

        const fields = {};
        for (const f of PROVENANCE_FIELDS) {
            const val = game[f] ?? null;
            const rawConf = conf[`${f}_confidence`] || conf[f] || null;
            const isPlatform = PLATFORM_FIELDS.has(f);
            let fieldConf = rawConf;
            if (!fieldConf && isPlatform && val != null) fieldConf = 'platform';
            if (!fieldConf && val != null) fieldConf = inferConfidence(f, game, bestOf);
            const evidence = extractRulesEvidence(rulesText, f);
            const diag = diagnoseField(
                f,
                val,
                rawConf,
                rulesText,
                game,
                _providerStats,
                _coverageStats,
                _rulesMatchPct
            );
            const dataSource =
                f === 'original_release_year'
                    ? bestOf.original_release_date_source || null
                    : bestOf[`${f}_source`] || null;
            const method = getExtractionMethod(f, rawConf, val, game, dataSource);
            const context = getContextWindow(rulesText, f, val);
            let sourceType = 'not_extracted';
            if (rawConf) sourceType = 'extraction';
            else if (isPlatform) sourceType = 'platform';
            else if (val != null) sourceType = 'master';
            const gtEvidence = buildGtEvidence(f, gameName, game);
            const themeConsolidation = f === 'theme_primary' ? buildThemeConsolidation(val) : null;
            fields[f] = {
                value: val,
                confidence: fieldConf,
                source_type: sourceType,
                data_source: dataSource,
                data_source_label: dataSource ? resolveSourceLabel(dataSource) : null,
                rules_evidence: evidence,
                extraction_method: method,
                context_window: context,
                diagnosis: diag,
                gt_evidence: gtEvidence,
                theme_consolidation: themeConsolidation,
            };
        }

        for (const f of ART_FIELDS) {
            const val = art[f] || game[f] || null;
            const artConf = art.art_confidence || null;
            const artMethod = val
                ? {
                      method: 'Art characterization pipeline',
                      detail: `Derived from game visual analysis and rules text.`,
                  }
                : null;
            fields[f] = {
                value: val,
                confidence: artConf,
                source_type: val ? 'art_characterization' : 'not_extracted',
                data_source: null,
                data_source_label: null,
                rules_evidence: null,
                extraction_method: artMethod,
                context_window: rulesText ? getContextWindow(rulesText, f, val) : null,
                diagnosis: diagnoseField(f, val, artConf, rulesText, game, null, _coverageStats, _rulesMatchPct),
                gt_evidence: null,
                theme_consolidation: null,
            };
        }

        const detailArr = Array.isArray(game.feature_details) ? game.feature_details : [];
        const features = (Array.isArray(game.features) ? game.features : []).map(fName => {
            const detail = detailArr.find(d => d.name === fName) || {};
            return {
                name: fName,
                confidence: detail.confidence ?? null,
                context: detail.context ?? null,
                operator_name: detail.operator_name ?? null,
                characteristics: detail.characteristics ?? null,
                rules_evidence: detail.rules_text ?? detail.description ?? null,
            };
        });

        const tickets = loadTickets();
        const openTickets = tickets.filter(
            t => t.gameName === gameName && t.issueType === 'data-correction' && t.status === 'open'
        ).length;

        const rulesUrl = rulesMatch?.url || rulesMatch?.rules_url || null;

        const response = {
            game: gameName,
            id: game.id || null,
            provider: game.provider || null,
            game_category: game.game_category || 'Slot',
            release_year: game.release_year || null,
            original_release_year: game.original_release_year || null,
            overall_confidence: game.data_confidence || null,
            extraction_date: game.extraction_date || null,
            extraction_notes: game.extraction_notes || null,
            source: {
                rules_url: rulesUrl,
                rules_slug: slug,
                rules_available: !!slug,
                rules_text_excerpt: rulesText ? rulesText.slice(0, 500) : null,
            },
            inconsistencies,
            fields,
            features,
            open_tickets: openTickets,
        };

        if (focusField && fields[focusField]) {
            response.focus = { field: focusField, ...fields[focusField] };
        }

        res.json(response);
    } catch (err) {
        console.error('[ERROR] Provenance failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/api/data/provenance/:gameName/rules-text', requireAuth, (req, res) => {
    try {
        const gameName = decodeURIComponent(req.params.gameName);
        const rulesMatches = loadJsonSafe(path.join(DATA_DIR, 'rules_game_matches.json'));
        const rulesMatch = findRulesMatch(gameName, rulesMatches);
        const slug = rulesMatch?.slug || rulesMatch?.rules_slug || null;
        if (!slug) return res.status(404).json({ error: 'No rules text found for this game' });

        const filePath = path.join(DATA_DIR, 'rules_text', `${slug}.txt`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Rules text file not found' });

        const text = fs.readFileSync(filePath, 'utf8');
        res.json({ slug, text, char_count: text.length });
    } catch (err) {
        console.error('[ERROR] Rules text failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/api/data/provenance/:gameName/rules-html', requireAuth, (req, res) => {
    try {
        const gameName = decodeURIComponent(req.params.gameName);
        const rulesMatches = loadJsonSafe(path.join(DATA_DIR, 'rules_game_matches.json'));
        const rulesMatch = findRulesMatch(gameName, rulesMatches);
        const slug = rulesMatch?.slug || rulesMatch?.rules_slug || null;
        if (!slug) return res.status(404).json({ error: 'No rules HTML found for this game' });

        const filePath = path.join(DATA_DIR, 'rules_html', `${slug}.html`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Rules HTML file not found' });

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;");
        res.set('X-Frame-Options', 'SAMEORIGIN');
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        console.error('[ERROR] Rules HTML failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
module.exports.inferConfidence = inferConfidence;
