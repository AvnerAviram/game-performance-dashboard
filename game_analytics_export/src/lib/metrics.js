/**
 * Metrics Layer — single source of truth for all game-data aggregations.
 *
 * Every chart, card, panel, and insight MUST call these functions instead
 * of writing inline forEach/reduce loops over game arrays.
 *
 * Pure functions: no DOM, no DuckDB, no side effects.
 * Input: array of game objects (flat DuckDB rows).
 * Output: plain objects/arrays.
 */

import { F } from './game-fields.js';
import { parseFeatures } from './parse-features.js';
import { VOLATILITY_ORDER, MIN_PROVIDER_GAMES } from './shared-config.js';

// ── Provider Metrics ───────────────────────────────────────────────────

/**
 * Aggregate games by provider.
 * @param {Object[]} games
 * @param {Object} [opts]
 * @param {number} [opts.minGames] — minimum game count to include (default MIN_PROVIDER_GAMES)
 * @returns {{ name, count, totalTheo, avgTheo, totalMkt, ggrShare }[]}
 */
export function getProviderMetrics(games, opts = {}) {
    const minGames = opts.minGames ?? MIN_PROVIDER_GAMES;
    const map = {};
    for (const g of games) {
        const prov = F.provider(g);
        if (!prov || prov === 'Unknown') continue;
        if (!map[prov]) map[prov] = { name: prov, count: 0, totalTheo: 0, totalMkt: 0 };
        map[prov].count++;
        map[prov].totalTheo += F.theoWin(g);
        map[prov].totalMkt += F.marketShare(g);
    }
    return Object.values(map)
        .map(p => ({ ...p, avgTheo: p.count > 0 ? p.totalTheo / p.count : 0, ggrShare: p.totalMkt }))
        .filter(p => p.count >= minGames)
        .sort((a, b) => b.ggrShare - a.ggrShare);
}

/**
 * Count unique providers per theme.
 * @param {Object[]} games
 * @returns {Map<string, Set<string>>} theme → Set of provider names
 */
export function getProvidersPerTheme(games) {
    const map = new Map();
    for (const g of games) {
        const theme = F.themeConsolidated(g);
        const prov = F.provider(g);
        if (!map.has(theme)) map.set(theme, new Set());
        map.get(theme).add(prov);
    }
    return map;
}

// ── Theme Metrics ──────────────────────────────────────────────────────

/**
 * Aggregate games by consolidated theme.
 * @param {Object[]} games
 * @returns {{ theme, count, totalTheo, avgTheo, totalMkt }[]}
 */
export function getThemeMetrics(games) {
    const map = {};
    for (const g of games) {
        const theme = F.themeConsolidated(g);
        if (!map[theme]) map[theme] = { theme, count: 0, totalTheo: 0, totalMkt: 0 };
        map[theme].count++;
        map[theme].totalTheo += F.theoWin(g);
        map[theme].totalMkt += F.marketShare(g);
    }
    return Object.values(map)
        .map(t => ({ ...t, avgTheo: t.count > 0 ? t.totalTheo / t.count : 0 }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Get games grouped by consolidated theme.
 * @param {Object[]} games
 * @returns {Map<string, Object[]>}
 */
export function getGamesByTheme(games) {
    const map = new Map();
    for (const g of games) {
        const theme = F.themeConsolidated(g);
        if (!map.has(theme)) map.set(theme, []);
        map.get(theme).push(g);
    }
    return map;
}

// ── Feature Metrics ────────────────────────────────────────────────────

/**
 * Aggregate games by feature (canonical parsed features).
 * @param {Object[]} games
 * @returns {{ feature, count, totalTheo, avgTheo }[]}
 */
export function getFeatureMetrics(games) {
    const map = {};
    for (const g of games) {
        const feats = parseFeatures(F.features(g));
        const theo = F.theoWin(g);
        for (const feat of feats) {
            if (!feat || feat === 'Unknown') continue;
            if (!map[feat]) map[feat] = { feature: feat, count: 0, totalTheo: 0 };
            map[feat].count++;
            map[feat].totalTheo += theo;
        }
    }
    return Object.values(map)
        .map(f => ({ ...f, avgTheo: f.count > 0 ? f.totalTheo / f.count : 0 }))
        .sort((a, b) => b.avgTheo - a.avgTheo);
}

/**
 * Per-feature lift: avgTheo with feature vs avgTheo without.
 * @param {Object[]} games
 * @returns {{ feature, avgWith, avgWithout, lift, count }[]}
 */
export function getFeatureLift(games) {
    const globalAvg = games.length > 0 ? games.reduce((s, g) => s + F.theoWin(g), 0) / games.length : 0;

    const map = {};
    for (const g of games) {
        const feats = parseFeatures(F.features(g));
        const theo = F.theoWin(g);
        for (const feat of feats) {
            if (!feat || feat === 'Unknown') continue;
            if (!map[feat]) map[feat] = { feature: feat, totalWith: 0, countWith: 0 };
            map[feat].totalWith += theo;
            map[feat].countWith++;
        }
    }

    const totalGames = games.length;
    return Object.values(map)
        .map(f => {
            const avgWith = f.countWith > 0 ? f.totalWith / f.countWith : 0;
            const countWithout = totalGames - f.countWith;
            const totalWithout = games.reduce((s, g) => s + F.theoWin(g), 0) - f.totalWith;
            const avgWithout = countWithout > 0 ? totalWithout / countWithout : 0;
            return {
                feature: f.feature,
                avgWith,
                avgWithout,
                lift: avgWithout > 0 ? ((avgWith - avgWithout) / avgWithout) * 100 : 0,
                count: f.countWith,
            };
        })
        .sort((a, b) => b.lift - a.lift);
}

// ── Volatility Metrics ─────────────────────────────────────────────────

/**
 * Aggregate games by volatility level.
 * @param {Object[]} games
 * @returns {{ volatility, count, totalTheo, avgTheo }[]} sorted by VOLATILITY_ORDER
 */
export function getVolatilityMetrics(games) {
    const map = {};
    for (const g of games) {
        const vol = F.volatility(g);
        if (!vol) continue;
        if (!map[vol]) map[vol] = { volatility: vol, count: 0, totalTheo: 0 };
        map[vol].count++;
        map[vol].totalTheo += F.theoWin(g);
    }
    const all = Object.values(map).map(v => ({
        ...v,
        avgTheo: v.count > 0 ? v.totalTheo / v.count : 0,
    }));
    return VOLATILITY_ORDER.filter(v => all.find(a => a.volatility === v)).map(v => all.find(a => a.volatility === v));
}

/**
 * Get the dominant (most common) volatility from a game set.
 * @param {Object[]} games
 * @returns {string}
 */
export function getDominantVolatility(games) {
    const counts = {};
    for (const g of games) {
        const vol = F.volatility(g);
        if (!vol) continue;
        counts[vol] = (counts[vol] || 0) + 1;
    }
    const entries = Object.entries(counts);
    if (!entries.length) return '';
    return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// ── Recipe / Combo Metrics ─────────────────────────────────────────────

/**
 * Multi-feature recipe aggregation (sorted feature key combos).
 * @param {Object[]} games
 * @param {Object} [opts]
 * @param {number} [opts.minFeatures] — min features per game (default 2)
 * @param {number} [opts.minGames] — min games per recipe (default 2)
 * @returns {{ key, features, count, totalTheo, avgTheo, lift, games }[]}
 */
export function getFeatureRecipes(games, opts = {}) {
    const minFeatures = opts.minFeatures ?? 2;
    const minGames = opts.minGames ?? 2;
    const globalAvg = games.length > 0 ? games.reduce((s, g) => s + F.theoWin(g), 0) / games.length : 0;

    const map = {};
    for (const g of games) {
        const feats = parseFeatures(F.features(g)).sort();
        if (feats.length < minFeatures) continue;
        const key = feats.join(' + ');
        if (!map[key]) map[key] = { key, features: feats, count: 0, totalTheo: 0, games: [] };
        map[key].count++;
        map[key].totalTheo += F.theoWin(g);
        map[key].games.push(g);
    }

    return Object.values(map)
        .filter(r => r.count >= minGames)
        .map(r => ({
            ...r,
            avgTheo: r.totalTheo / r.count,
            lift: globalAvg > 0 ? ((r.totalTheo / r.count - globalAvg) / globalAvg) * 100 : 0,
        }))
        .sort((a, b) => b.avgTheo - a.avgTheo);
}

/**
 * Feature-pair and triple combos within a theme.
 * @param {Object[]} games — games already filtered to a theme
 * @param {Object} [opts]
 * @param {number} [opts.comboSize] — 2 for pairs, 3 for triples (default 2)
 * @param {number} [opts.minGames] — min games per combo (default 2)
 * @returns {{ key, features, count, totalTheo, avgTheo, lift }[]}
 */
export function getFeatureCombos(games, opts = {}) {
    const comboSize = opts.comboSize ?? 2;
    const minGames = opts.minGames ?? 2;
    const themeAvg = games.length > 0 ? games.reduce((s, g) => s + F.theoWin(g), 0) / games.length : 0;

    const map = {};
    for (const g of games) {
        const feats = parseFeatures(F.features(g)).sort();
        const combos = getCombinations(feats, comboSize);
        const theo = F.theoWin(g);
        for (const combo of combos) {
            const key = combo.join(' + ');
            if (!map[key]) map[key] = { key, features: combo, count: 0, totalTheo: 0 };
            map[key].count++;
            map[key].totalTheo += theo;
        }
    }

    return Object.values(map)
        .filter(c => c.count >= minGames)
        .map(c => ({
            ...c,
            avgTheo: c.totalTheo / c.count,
            lift: themeAvg > 0 ? ((c.totalTheo / c.count - themeAvg) / themeAvg) * 100 : 0,
        }))
        .sort((a, b) => b.avgTheo - a.avgTheo);
}

function getCombinations(arr, size) {
    if (size === 1) return arr.map(x => [x]);
    const result = [];
    for (let i = 0; i <= arr.length - size; i++) {
        const rest = getCombinations(arr.slice(i + 1), size - 1);
        for (const combo of rest) {
            result.push([arr[i], ...combo]);
        }
    }
    return result;
}

// ── RTP Band Metrics ───────────────────────────────────────────────────

/** Standard RTP band definitions. */
export const RTP_BANDS = [
    { label: '> 97%', min: 97, max: 200 },
    { label: '96-97%', min: 96, max: 97 },
    { label: '95-96%', min: 95, max: 96 },
    { label: '94-95%', min: 94, max: 95 },
    { label: '93-94%', min: 93, max: 94 },
    { label: '< 93%', min: 0, max: 93 },
];

/**
 * Aggregate games into RTP bands.
 * @param {Object[]} games
 * @returns {{ label, min, max, count, avgTheo }[]}
 */
export function getRtpBandMetrics(games) {
    return RTP_BANDS.map(b => {
        const matching = games.filter(g => {
            const rtp = F.rtp(g);
            return rtp > 0 && rtp >= b.min && rtp < b.max;
        });
        const totalTheo = matching.reduce((s, g) => s + F.theoWin(g), 0);
        return {
            ...b,
            count: matching.length,
            avgTheo: matching.length > 0 ? totalTheo / matching.length : 0,
        };
    }).filter(b => b.count > 0);
}

// ── Smart Index ────────────────────────────────────────────────────────

/**
 * Canonical Smart Index formula.
 * SI = (avgTheo * sqrt(gameCount)) / globalAvgTheo
 *
 * @param {number} avgTheo — average theo win for this group
 * @param {number} gameCount — number of games in this group
 * @param {number} globalAvgTheo — average theo across all groups
 * @returns {number}
 */
export function calculateSmartIndex(avgTheo, gameCount, globalAvgTheo) {
    if (!globalAvgTheo || globalAvgTheo === 0) return 0;
    return (avgTheo * Math.sqrt(gameCount)) / globalAvgTheo;
}

/**
 * Add Smart Index to an array of dimension rows (themes or mechanics).
 * Each row must have `avg_theo_win` (or `avgTheo`) and `game_count` (or `count`).
 * Returns a new array with `smartIndex` added, sorted descending.
 *
 * @param {{ avg_theo_win?: number, avgTheo?: number, game_count?: number, count?: number }[]} rows
 * @returns {Object[]} same rows with `smartIndex` added
 */
export function addSmartIndex(rows) {
    if (!rows.length) return rows;
    const globalAvg = rows.reduce((s, r) => s + (r.avg_theo_win ?? r.avgTheo ?? 0), 0) / rows.length;
    return rows
        .map(r => {
            const theo = r.avg_theo_win ?? r.avgTheo ?? 0;
            const count = r.game_count ?? r.count ?? 0;
            return { ...r, smartIndex: calculateSmartIndex(theo, count, globalAvg) };
        })
        .sort((a, b) => b.smartIndex - a.smartIndex);
}

// ── Convenience: Global Averages ───────────────────────────────────────

/**
 * Compute global average theo win across all games.
 * @param {Object[]} games
 * @returns {number}
 */
export function getGlobalAvgTheo(games) {
    if (!games.length) return 0;
    return games.reduce((s, g) => s + F.theoWin(g), 0) / games.length;
}

/**
 * Get the dominant (most common) layout from a game set.
 * @param {Object[]} games
 * @returns {string} e.g. "5×3"
 */
export function getDominantLayout(games) {
    const counts = {};
    for (const g of games) {
        const reels = F.reels(g);
        const rows = F.rows(g);
        if (!reels || !rows) continue;
        const key = `${reels}×${rows}`;
        counts[key] = (counts[key] || 0) + 1;
    }
    const entries = Object.entries(counts);
    if (!entries.length) return '';
    return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Get the dominant (most common) provider from a game set.
 * @param {Object[]} games
 * @returns {string}
 */
export function getDominantProvider(games) {
    const counts = {};
    for (const g of games) {
        const prov = F.provider(g);
        if (!prov || prov === 'Unknown') continue;
        counts[prov] = (counts[prov] || 0) + 1;
    }
    const entries = Object.entries(counts);
    if (!entries.length) return '';
    return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Get the average RTP from a game set (ignoring 0/missing).
 * @param {Object[]} games
 * @returns {number}
 */
export function getAvgRtp(games) {
    let sum = 0,
        count = 0;
    for (const g of games) {
        const rtp = F.rtp(g);
        if (rtp > 0) {
            sum += rtp;
            count++;
        }
    }
    return count > 0 ? sum / count : 0;
}
