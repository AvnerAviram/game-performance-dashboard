/**
 * Metrics Layer — single source of truth for all game-data aggregations.
 *
 * Every chart, card, panel, and insight MUST call these functions instead
 * of writing inline forEach/reduce loops over game arrays.
 *
 * SQL-first: functions query DuckDB via `query()` and return plain objects.
 * JS-only helpers (addPerformanceIndex, calculatePerformanceIndex,
 * getDominantVolatility, getDominantLayout) remain sync and accept game arrays.
 * Legacy aliases addSmartIndex/calculateSmartIndex are kept for backward compat.
 */

import { query, RELIABLE_GAME } from './db/duckdb-client.js';
import { VOLATILITY_ORDER, MIN_PROVIDER_GAMES, MIN_QUALIFIED_GAMES, ELEMENT_CONSOLIDATION } from './shared-config.js';
import { F } from './game-fields.js';

function catFilter(category) {
    return category ? `AND game_category = '${category.replace(/'/g, "''")}'` : '';
}

function consolidateElements(rows) {
    const merged = {};
    for (const r of rows) {
        const canonical = ELEMENT_CONSOLIDATION[r.element] || r.element;
        if (!merged[canonical]) {
            merged[canonical] = { element: canonical, count: 0, totalTheo: 0, _sumForAvg: 0 };
        }
        const m = merged[canonical];
        m.count += r.count;
        m.totalTheo += r.totalTheo;
        m._sumForAvg += r.avgTheo * r.count;
    }
    return Object.values(merged)
        .map(m => ({ element: m.element, count: m.count, totalTheo: m.totalTheo, avgTheo: m._sumForAvg / m.count }))
        .sort((a, b) => b.count - a.count);
}

// ── Provider Metrics ───────────────────────────────────────────────────

/**
 * Aggregate games by provider.
 * @param {string} [category]
 * @param {Object} [opts]
 * @param {number} [opts.minGames] — minimum game count to include (default MIN_PROVIDER_GAMES)
 * @returns {Promise<{ name, count, totalTheo, avgTheo, ggrShare, smartIndex }[]>}
 */
export async function getProviderMetrics(category = null, opts = {}) {
    const minGames = opts.minGames ?? MIN_PROVIDER_GAMES;
    const rows = await query(`
        SELECT provider_studio AS name, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo,
               SUM(performance_market_share_percent) AS totalMkt
        FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
          AND provider_studio IS NOT NULL AND provider_studio != 'Unknown'
        GROUP BY provider_studio
        HAVING COUNT(*) >= ${minGames}
    `);
    const mapped = rows.map(r => ({ ...r, ggrShare: r.totalMkt }));
    return addSmartIndex(mapped);
}

// ── Theme Metrics ──────────────────────────────────────────────────────

/**
 * Aggregate games by consolidated theme.
 * @param {string} [category]
 * @returns {Promise<{ theme, count, totalTheo, avgTheo, totalMkt, smartIndex }[]>}
 */
export async function getThemeMetrics(category = null) {
    const rows = await query(`
        SELECT theme_consolidated AS theme, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo,
               SUM(performance_market_share_percent) AS totalMkt
        FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
        GROUP BY theme_consolidated
    `);
    return addSmartIndex(rows);
}

// ── Feature Metrics ────────────────────────────────────────────────────

/**
 * Aggregate games by feature (uses UNNEST on native array).
 * @param {string} [category]
 * @returns {Promise<{ feature, count, totalTheo, avgTheo, smartIndex }[]>}
 */
export async function getFeatureMetrics(category = null) {
    const rows = await query(`
        SELECT f AS feature, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo,
               SUM(performance_market_share_percent) AS totalMkt
        FROM (
          SELECT UNNEST(features) AS f, performance_theo_win, performance_market_share_percent
          FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
            AND features IS NOT NULL AND len(features) > 0
        )
        GROUP BY f
    `);
    return addSmartIndex(rows);
}

// ── Volatility Metrics ─────────────────────────────────────────────────

/**
 * Aggregate games by volatility level.
 * @param {string} [category]
 * @returns {Promise<{ volatility, count, totalTheo, avgTheo }[]>} sorted by VOLATILITY_ORDER
 */
export async function getVolatilityMetrics(category = null) {
    const rows = await query(`
        SELECT specs_volatility AS volatility, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo
        FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
          AND specs_volatility IS NOT NULL
        GROUP BY specs_volatility
    `);
    return VOLATILITY_ORDER.filter(v => rows.find(r => r.volatility === v)).map(v =>
        rows.find(r => r.volatility === v)
    );
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
        if (!vol || vol === 'Unknown') continue;
        counts[vol] = (counts[vol] || 0) + 1;
    }
    const entries = Object.entries(counts);
    if (!entries.length) return '';
    return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// ── RTP Band Metrics ───────────────────────────────────────────────────

/** Standard RTP band definitions. */
export const RTP_BANDS = [
    { label: '> 97%', min: 97, max: 200 },
    { label: '96%-97%', min: 96, max: 97 },
    { label: '95%-96%', min: 95, max: 96 },
    { label: '94%-95%', min: 94, max: 95 },
    { label: '93%-94%', min: 93, max: 94 },
    { label: '< 93%', min: 0, max: 93 },
];

/**
 * Aggregate games into RTP bands.
 * @param {string} [category]
 * @returns {Promise<{ label, min, max, count, avgTheo }[]>}
 */
export async function getRtpBandMetrics(category = null) {
    const rows = await query(`
        SELECT
          CASE
            WHEN specs_rtp >= 97 THEN '> 97%'
            WHEN specs_rtp >= 96 THEN '96%-97%'
            WHEN specs_rtp >= 95 THEN '95%-96%'
            WHEN specs_rtp >= 94 THEN '94%-95%'
            WHEN specs_rtp >= 93 THEN '93%-94%'
            ELSE '< 93%'
          END AS label,
          COUNT(*) AS count,
          AVG(performance_theo_win) AS avgTheo
        FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
          AND specs_rtp > 0
        GROUP BY label
    `);
    return RTP_BANDS.filter(b => rows.find(r => r.label === b.label)).map(b => {
        const row = rows.find(r => r.label === b.label);
        return { label: b.label, min: b.min, max: b.max, count: row.count, avgTheo: row.avgTheo };
    });
}

// ── Performance Index (Eilers-style) ──────────────────────────────────

/**
 * Performance Index — pure performance relative to the group average.
 * Eilers-style: no sample-size weighting. PI > 1 means above average.
 * @param {number} avgTheo — average theo win for this group
 * @param {number} globalAvgTheo — average theo across all groups
 * @returns {number}
 */
export function calculatePerformanceIndex(avgTheo, globalAvgTheo) {
    if (!globalAvgTheo || globalAvgTheo === 0) return 0;
    return avgTheo / globalAvgTheo;
}

/** @deprecated Use calculatePerformanceIndex instead */
export function calculateSmartIndex(avgTheo, _gameCount, globalAvgTheo) {
    return calculatePerformanceIndex(avgTheo, globalAvgTheo);
}

/**
 * Add Performance Index to dimension rows. Default sort: Market Share descending
 * (Eilers "Top Grossing" style). PI sort is used by performance-specific filter views.
 */
export function addPerformanceIndex(rows) {
    if (!rows.length) return rows;
    const globalAvg = rows.reduce((s, r) => s + (r.avg_theo_win ?? r.avgTheo ?? 0), 0) / rows.length;
    return rows
        .map(r => {
            const theo = r.avg_theo_win ?? r.avgTheo ?? 0;
            const count = r.game_count ?? r.count ?? 0;
            const pi = calculatePerformanceIndex(theo, globalAvg);
            return {
                ...r,
                performanceIndex: pi,
                smartIndex: pi,
                qualified: count >= MIN_QUALIFIED_GAMES,
            };
        })
        .sort((a, b) => {
            const aMkt = a.totalMkt ?? a.total_market_share ?? 0;
            const bMkt = b.totalMkt ?? b.total_market_share ?? 0;
            return bMkt - aMkt;
        });
}

/** @deprecated Use addPerformanceIndex instead */
export const addSmartIndex = addPerformanceIndex;

// ── Convenience: Global Averages ───────────────────────────────────────

/**
 * Compute global average theo win across reliable games.
 * @param {string} [category]
 * @returns {Promise<number>}
 */
export async function getGlobalAvgTheo(category = null) {
    const rows = await query(
        `SELECT AVG(performance_theo_win) AS avg FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}`
    );
    return rows[0]?.avg ?? 0;
}

/**
 * Get the average RTP from reliable games (ignoring 0/missing).
 * @param {string} [category]
 * @returns {Promise<number>}
 */
export async function getAvgRtp(category = null) {
    const rows = await query(
        `SELECT AVG(specs_rtp) AS avg FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)} AND specs_rtp > 0`
    );
    return rows[0]?.avg ?? 0;
}

// ── Art Design Metrics ─────────────────────────────────────────────────

/**
 * Aggregate games by art theme.
 * @param {string} [category]
 * @returns {Promise<{ theme, count, totalTheo, avgTheo, totalMkt }[]>}
 */
export async function getArtThemeMetrics(category = null) {
    return query(`
        SELECT art_theme AS theme, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo,
               SUM(performance_market_share_percent) AS totalMkt
        FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
          AND art_theme IS NOT NULL
        GROUP BY art_theme
        ORDER BY count DESC
    `);
}

/**
 * Aggregate games by art narrative.
 * @param {string} [category]
 * @returns {Promise<{ narrative, count, totalTheo, avgTheo }[]>}
 */
export async function getArtNarrativeMetrics(category = null) {
    return query(`
        SELECT art_narrative AS narrative, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo
        FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
          AND art_narrative IS NOT NULL
        GROUP BY art_narrative
        ORDER BY avgTheo DESC
    `);
}

/**
 * Aggregate games by individual art character type (UNNEST on native array).
 * @param {string} [category]
 * @returns {Promise<{ character, count, totalTheo, avgTheo }[]>}
 */
export async function getArtCharacterMetrics(category = null) {
    return query(`
        SELECT c AS character, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo
        FROM (
          SELECT UNNEST(art_characters) AS c, performance_theo_win
          FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
            AND art_characters IS NOT NULL AND len(art_characters) > 0
        )
        WHERE c != 'No Characters (symbol-only game)'
        GROUP BY c
        ORDER BY count DESC
    `);
}

/**
 * Aggregate games by individual art element (UNNEST on native array).
 * @param {string} [category]
 * @returns {Promise<{ element, count, totalTheo, avgTheo }[]>}
 */
export async function getArtElementMetrics(category = null) {
    const rows = await query(`
        SELECT e AS element, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo
        FROM (
          SELECT UNNEST(art_elements) AS e, performance_theo_win
          FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
            AND art_elements IS NOT NULL AND len(art_elements) > 0
        )
        GROUP BY e
        ORDER BY count DESC
    `);
    return consolidateElements(rows);
}

/**
 * Aggregate games by art color tone (UNNEST on native array).
 * @param {string} [category]
 * @returns {Promise<{ colorTone, count, totalTheo, avgTheo }[]>}
 */
export async function getArtColorToneMetrics(category = null) {
    const rows = await query(`
        SELECT ct AS colorTone, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo
        FROM (
          SELECT UNNEST(art_color_tone) AS ct, performance_theo_win
          FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
            AND art_color_tone IS NOT NULL AND len(art_color_tone) > 0
        )
        GROUP BY ct
        ORDER BY count DESC
    `);
    return rows.map(r => ({ ...r, colorTone: r.colorTone || r.colortone }));
}

/**
 * Flexible cross-dimensional art combo analysis.
 * Default: theme × elements. Use opts.dimA / opts.dimB to pick any two.
 *
 * @param {string} [category]
 * @param {Object} [opts]
 * @param {number} [opts.minGames] — minimum games per combo (default 2)
 * @param {'theme'|'characters'|'elements'|'colors'|'narrative'} [opts.dimA] — row axis (default 'theme')
 * @param {'theme'|'characters'|'elements'|'colors'|'narrative'} [opts.dimB] — col axis (default 'elements')
 * @returns {Promise<{ dimA: string, dimB: string, count: number, avgTheo: number, totalTheo: number, mktShare: number }[]>}
 */
export async function getArtComboMetrics(category = null, opts = {}) {
    const minGames = opts.minGames ?? 2;
    const dimAKey = opts.dimA ?? 'theme';
    const dimBKey = opts.dimB ?? 'elements';

    const DIM_CONFIG = {
        theme: { col: 'art_theme', isArray: false },
        characters: { col: 'art_characters', isArray: true },
        elements: { col: 'art_elements', isArray: true },
        colors: { col: 'art_color_tone', isArray: true },
        narrative: { col: 'art_narrative', isArray: false },
    };

    const cfgA = DIM_CONFIG[dimAKey] || DIM_CONFIG.theme;
    const cfgB = DIM_CONFIG[dimBKey] || DIM_CONFIG.elements;

    let selectA, selectB, fromClause, whereExtra;

    if (!cfgA.isArray && !cfgB.isArray) {
        selectA = `${cfgA.col} AS dimA`;
        selectB = `${cfgB.col} AS dimB`;
        fromClause = 'FROM games';
        whereExtra = `AND ${cfgA.col} IS NOT NULL AND ${cfgB.col} IS NOT NULL`;
    } else if (!cfgA.isArray && cfgB.isArray) {
        selectA = `${cfgA.col} AS dimA`;
        selectB = 'b AS dimB';
        fromClause = `FROM games, UNNEST(games.${cfgB.col}) AS t(b)`;
        whereExtra = `AND ${cfgA.col} IS NOT NULL AND ${cfgB.col} IS NOT NULL AND len(${cfgB.col}) > 0`;
    } else if (cfgA.isArray && !cfgB.isArray) {
        selectA = 'a AS dimA';
        selectB = `${cfgB.col} AS dimB`;
        fromClause = `FROM games, UNNEST(games.${cfgA.col}) AS t(a)`;
        whereExtra = `AND ${cfgA.col} IS NOT NULL AND len(${cfgA.col}) > 0 AND ${cfgB.col} IS NOT NULL`;
    } else {
        selectA = 'a AS dimA';
        selectB = 'b AS dimB';
        fromClause = `FROM games, UNNEST(games.${cfgA.col}) AS t1(a), UNNEST(games.${cfgB.col}) AS t2(b)`;
        whereExtra = `AND ${cfgA.col} IS NOT NULL AND len(${cfgA.col}) > 0 AND ${cfgB.col} IS NOT NULL AND len(${cfgB.col}) > 0`;
    }

    let charFilter = '';
    if (dimAKey === 'characters') charFilter += " AND dimA != 'No Characters (symbol-only game)'";
    if (dimBKey === 'characters') charFilter += " AND dimB != 'No Characters (symbol-only game)'";

    const rows = await query(`
        SELECT ${selectA}, ${selectB}, COUNT(*) AS count,
               SUM(performance_theo_win) AS totalTheo,
               AVG(performance_theo_win) AS avgTheo,
               SUM(performance_market_share_percent) AS mktShare
        ${fromClause}
        WHERE ${RELIABLE_GAME} ${catFilter(category)}
          ${whereExtra}
        GROUP BY dimA, dimB
        HAVING COUNT(*) >= ${minGames}
        ORDER BY avgTheo DESC
    `);
    let result = charFilter
        ? rows.filter(
              r => r.dimA !== 'No Characters (symbol-only game)' && r.dimB !== 'No Characters (symbol-only game)'
          )
        : rows;

    if (dimAKey === 'elements' || dimBKey === 'elements') {
        const merged = {};
        for (const r of result) {
            const a = dimAKey === 'elements' ? ELEMENT_CONSOLIDATION[r.dimA] || r.dimA : r.dimA;
            const b = dimBKey === 'elements' ? ELEMENT_CONSOLIDATION[r.dimB] || r.dimB : r.dimB;
            const key = `${a}|||${b}`;
            if (!merged[key]) merged[key] = { dimA: a, dimB: b, count: 0, totalTheo: 0, mktShare: 0, _sum: 0 };
            const m = merged[key];
            m.count += r.count;
            m.totalTheo += r.totalTheo;
            m.mktShare += r.mktShare;
            m._sum += r.avgTheo * r.count;
        }
        result = Object.values(merged)
            .map(m => ({
                dimA: m.dimA,
                dimB: m.dimB,
                count: m.count,
                totalTheo: m.totalTheo,
                avgTheo: m._sum / m.count,
                mktShare: m.mktShare,
            }))
            .sort((a, b) => b.avgTheo - a.avgTheo);
    }
    return result;
}

/**
 * Enriched art recipes: theme-based combos with top characters, elements, colors, and dominant narrative.
 * Hybrid: SQL fetches per-theme rows, JS builds frequency maps.
 *
 * @param {string} [category]
 * @param {Object} [opts]
 * @param {number} [opts.minGames] — minimum games per combo (default 3)
 * @param {number} [opts.topN] — max items per sub-dimension (default 5)
 * @returns {Promise<{ theme, count, avgTheo, totalTheo, mktShare, topCharacters: string[], topElements: string[], topColors: string[], narrative: string }[]>}
 */
export async function getArtRecipeMetrics(category = null, opts = {}) {
    const minGames = opts.minGames ?? 3;
    const topN = opts.topN ?? 5;

    const rows = await query(`
        SELECT art_theme AS theme, performance_theo_win AS theo,
               performance_market_share_percent AS mkt,
               art_characters, art_elements, art_color_tone, art_narrative
        FROM games WHERE ${RELIABLE_GAME} ${catFilter(category)}
          AND art_theme IS NOT NULL
    `);

    const map = {};
    for (const r of rows) {
        const theme = r.theme;
        if (!map[theme]) {
            map[theme] = {
                theme,
                count: 0,
                totalTheo: 0,
                mktShare: 0,
                charFreq: {},
                elemFreq: {},
                colorFreq: {},
                narrFreq: {},
            };
        }
        const entry = map[theme];
        entry.count++;
        entry.totalTheo += r.theo || 0;
        entry.mktShare += r.mkt || 0;
        const chars = Array.isArray(r.art_characters) ? r.art_characters : [];
        for (const ch of chars) {
            if (ch) entry.charFreq[ch] = (entry.charFreq[ch] || 0) + 1;
        }
        const elems = Array.isArray(r.art_elements) ? r.art_elements : [];
        for (const rawEl of elems) {
            const el = ELEMENT_CONSOLIDATION[rawEl] || rawEl;
            if (el) entry.elemFreq[el] = (entry.elemFreq[el] || 0) + 1;
        }
        const colors = Array.isArray(r.art_color_tone) ? r.art_color_tone : [];
        for (const ct of colors) {
            if (ct) entry.colorFreq[ct] = (entry.colorFreq[ct] || 0) + 1;
        }
        if (r.art_narrative) entry.narrFreq[r.art_narrative] = (entry.narrFreq[r.art_narrative] || 0) + 1;
    }

    const topByFreq = (freq, n) =>
        Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([k]) => k);
    const dominantKey = freq => {
        let best = null;
        let bestN = 0;
        for (const [k, v] of Object.entries(freq)) {
            if (v > bestN) {
                best = k;
                bestN = v;
            }
        }
        return best || '';
    };

    return Object.values(map)
        .filter(c => c.count >= minGames)
        .map(c => ({
            theme: c.theme,
            count: c.count,
            avgTheo: c.totalTheo / c.count,
            totalTheo: c.totalTheo,
            mktShare: c.mktShare,
            topCharacters: topByFreq(c.charFreq, topN),
            topElements: topByFreq(c.elemFreq, topN),
            topColors: topByFreq(c.colorFreq, topN),
            narrative: dominantKey(c.narrFreq),
        }))
        .sort((a, b) => b.avgTheo - a.avgTheo);
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
