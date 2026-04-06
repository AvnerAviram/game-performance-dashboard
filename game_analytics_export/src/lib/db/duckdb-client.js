/**
 * DuckDB Client for Game Analytics Dashboard
 *
 * 100% DuckDB-ONLY data access
 * Single Source of Truth: game_data_master.json → DuckDB table
 */

import { log } from '../env.js';
import { parseFeatures } from '../parse-features.js';
import { normalizeProvider } from '../shared-config.js';

const duckdb = await import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm');

let db = null;
let connection = null;
let initialized = false;
let initializationPromise = null;

/** Raw theme_primary → consolidated theme (from theme_consolidation_map.json). Set when games load. */
let themeConsolidationMap = {};

/**
 * SQL WHERE clause fragment: games that have reliable data.
 * A game qualifies if it has at least one verified/extracted confidence field
 * OR has been extracted (features present = Claude extracted features/themes/symbols).
 */
const RELIABLE_GAME = `(
  rtp_confidence IN ('verified','extracted') OR
  volatility_confidence IN ('verified','extracted') OR
  reels_confidence IN ('verified','extracted') OR
  paylines_confidence IN ('verified','extracted') OR
  max_win_confidence IN ('verified','extracted') OR
  min_bet_confidence IN ('verified','extracted') OR
  max_bet_confidence IN ('verified','extracted') OR
  (features IS NOT NULL AND features != '[]')
)`;

// Provider normalization via normalizeProvider() from shared-config.js

/**
 * Initialize DuckDB WASM database and load games data
 * Safe to call multiple times - handles race conditions
 */
export async function initializeDatabase() {
    if (initialized && db && connection) {
        log('DuckDB already initialized');
        return { db, connection };
    }

    if (initializationPromise) {
        log('DuckDB initialization in progress, waiting...');
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {
            log('Initializing DuckDB WASM...');

            const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
            const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

            const worker_url = URL.createObjectURL(
                new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
            );
            const worker = new Worker(worker_url);
            const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);

            db = new duckdb.AsyncDuckDB(logger, worker);
            await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

            connection = await db.connect();

            log('DuckDB initialized');

            await loadGamesData();

            initialized = true;
            initializationPromise = null;
            return { db, connection };
        } catch (error) {
            console.error('Failed to initialize DuckDB:', error);
            initializationPromise = null;
            throw error;
        }
    })();

    return initializationPromise;
}

/**
 * Load game_data_master.json into DuckDB table
 */
async function loadGamesData() {
    try {
        log('Loading games data into DuckDB...');

        const [response, themeMapResponse, franchiseResponse, confidenceResponse] = await Promise.all([
            fetch('/api/data/games', { credentials: 'same-origin' }).catch(() => fetch('data/game_data_master.json')),
            fetch('/api/data/theme-map', { credentials: 'same-origin' }).catch(() =>
                fetch('data/theme_consolidation_map.json')
            ),
            fetch('data/franchise_mapping.json').catch(() => null),
            fetch('/api/data/confidence-map', { credentials: 'same-origin' }).catch(() =>
                fetch('data/confidence_map.json').catch(() => null)
            ),
        ]);

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}: ${response.statusText} - Failed to load data/game_data_master.json`
            );
        }

        const games = await response.json();
        const themeMap = themeMapResponse.ok ? await themeMapResponse.json() : {};
        themeConsolidationMap = themeMap && typeof themeMap === 'object' ? themeMap : {};
        let franchiseMap = {};
        try {
            if (franchiseResponse && franchiseResponse.ok) franchiseMap = await franchiseResponse.json();
        } catch (e) {
            console.warn('Failed to parse franchise_mapping.json, continuing without franchise data:', e.message);
        }
        let confidenceMap = {};
        try {
            if (confidenceResponse && confidenceResponse.ok) confidenceMap = await confidenceResponse.json();
        } catch (e) {
            console.warn('Failed to parse confidence_map.json, continuing without confidence data:', e.message);
        }
        log(`Fetched ${games.length} games from game_data_master.json`);

        await connection.query(`
      CREATE TABLE IF NOT EXISTS games (
        id VARCHAR,
        name VARCHAR,
        name_normalized VARCHAR,
        theme_primary VARCHAR,
        theme_secondary VARCHAR,
        theme_consolidated VARCHAR,
        provider_studio VARCHAR,
        provider_parent VARCHAR,
        specs_reels INTEGER,
        specs_rows INTEGER,
        specs_paylines VARCHAR,
        specs_rtp DOUBLE,
        specs_volatility VARCHAR,
        performance_theo_win DOUBLE,
        performance_rank INTEGER,
        performance_anomaly VARCHAR,
        performance_market_share_percent DOUBLE,
        performance_percentile VARCHAR,
        release_year INTEGER,
        release_month INTEGER,
        features VARCHAR,
        themes_all VARCHAR,
        themes_raw VARCHAR,
        symbols VARCHAR,
        description VARCHAR,
        demo_url VARCHAR,
        data_quality VARCHAR,
        sites INTEGER,
        avg_bet DOUBLE,
        median_bet DOUBLE,
        games_played_index DOUBLE,
        coin_in_index DOUBLE,
        max_win DOUBLE,
        min_bet DOUBLE,
        max_bet DOUBLE,
        franchise VARCHAR,
        franchise_type VARCHAR,
        game_category VARCHAR,
        game_sub_category VARCHAR,
        rtp_confidence VARCHAR,
        volatility_confidence VARCHAR,
        reels_confidence VARCHAR,
        paylines_confidence VARCHAR,
        max_win_confidence VARCHAR,
        min_bet_confidence VARCHAR,
        max_bet_confidence VARCHAR
      )
    `);

        // Filter out bogus summary rows (e.g. game_category "Total")
        const validGames = games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');

        // Sort by theo_win DESC to compute rank
        const sorted = [...validGames].sort((a, b) => (b.theo_win || 0) - (a.theo_win || 0));

        // Pre-compute which games are reliable so rank is contiguous within the dashboard view
        const isReliable = game => {
            const c = confidenceMap[game.name] || {};
            const specReliable = ['rtp', 'volatility', 'reels', 'paylines', 'max_win', 'min_bet', 'max_bet'].some(
                f => c[`${f}_confidence`] === 'verified' || c[`${f}_confidence`] === 'extracted'
            );
            const hasFeatures = Array.isArray(game.features) && game.features.length > 0;
            return specReliable || hasFeatures;
        };

        let reliableRank = 0;
        for (let i = 0; i < sorted.length; i++) {
            const game = sorted[i];
            const rank = isReliable(game) ? ++reliableRank : null;

            const safeStr = val => {
                if (val === null || val === undefined || val === '') return 'NULL';
                return `'${String(val).replace(/'/g, "''")}'`;
            };

            const safeNum = val => {
                if (val === null || val === undefined) return 'NULL';
                const num = Number(val);
                return isNaN(num) ? 'NULL' : num;
            };

            const name = String(game.name || '').replace(/'/g, "''");
            const nameNorm = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const themePrimary = String(game.theme_primary || 'Unknown').replace(/'/g, "''");
            const themeSecondary = String(game.theme_secondary || '').replace(/'/g, "''");
            const themeConsolidated = (themeMap[game.theme_primary] || game.theme_primary || 'Unknown').replace(
                /'/g,
                "''"
            );

            const paylines = game.paylines_count
                ? `${game.paylines_count}${game.paylines_kind ? ' ' + game.paylines_kind : ''}`
                : '';

            const rawStudio = game.studio || game.provider || '';
            const studioOrParent =
                !rawStudio || /^unknown$/i.test(rawStudio) ? game.parent_company || rawStudio : rawStudio;
            const normalizedStudio = normalizeProvider(studioOrParent);

            const featuresJson =
                Array.isArray(game.features) && game.features.length > 0
                    ? JSON.stringify(game.features).replace(/'/g, "''")
                    : null;
            const themesAllJson =
                Array.isArray(game.themes_all) && game.themes_all.length > 0
                    ? JSON.stringify(game.themes_all).replace(/'/g, "''")
                    : null;
            const themesRawJson =
                Array.isArray(game.themes_raw) && game.themes_raw.length > 0
                    ? JSON.stringify(game.themes_raw).replace(/'/g, "''")
                    : null;
            const symbolsJson =
                Array.isArray(game.symbols) && game.symbols.length > 0
                    ? JSON.stringify(game.symbols).replace(/'/g, "''")
                    : null;

            await connection.query(`
        INSERT INTO games VALUES (
          '${(game.id || '').replace(/'/g, "''")}',
          '${name}',
          '${nameNorm}',
          '${themePrimary}',
          '${themeSecondary}',
          '${themeConsolidated}',
          ${safeStr(normalizedStudio)},
          ${safeStr(game.parent_company)},
          ${safeNum(game.reels)},
          ${safeNum(game.rows)},
          ${paylines ? `'${paylines.replace(/'/g, "''")}'` : 'NULL'},
          ${safeNum(game.rtp)},
          ${safeStr(game.volatility)},
          ${safeNum(game.theo_win) || 0},
          ${rank === null ? 'NULL' : rank},
          ${safeStr(game.anomaly)},
          ${safeNum(game.market_share_pct) || 0},
          ${safeStr(game.percentile)},
          ${safeNum(game.release_year)},
          ${safeNum(game.release_month)},
          ${featuresJson ? `'${featuresJson}'` : 'NULL'},
          ${themesAllJson ? `'${themesAllJson}'` : 'NULL'},
          ${themesRawJson ? `'${themesRawJson}'` : 'NULL'},
          ${symbolsJson ? `'${symbolsJson}'` : 'NULL'},
          ${safeStr(game.description)},
          ${safeStr(game.demo_url)},
          ${safeStr(game.data_quality)},
          ${safeNum(game.sites)},
          ${safeNum(game.avg_bet)},
          ${safeNum(game.median_bet)},
          ${safeNum(game.games_played_index)},
          ${safeNum(game.coin_in_index)},
          ${safeNum(game.max_win)},
          ${safeNum(game.min_bet)},
          ${safeNum(game.max_bet)},
          ${safeStr(franchiseMap[game.id]?.franchise)},
          ${safeStr(franchiseMap[game.id]?.franchise_type)},
          ${safeStr(game.game_category)},
          ${safeStr(game.game_sub_category)},
          ${safeStr(confidenceMap[game.name]?.rtp_confidence)},
          ${safeStr(confidenceMap[game.name]?.volatility_confidence)},
          ${safeStr(confidenceMap[game.name]?.reels_confidence)},
          ${safeStr(confidenceMap[game.name]?.paylines_confidence)},
          ${safeStr(confidenceMap[game.name]?.max_win_confidence)},
          ${safeStr(confidenceMap[game.name]?.min_bet_confidence)},
          ${safeStr(confidenceMap[game.name]?.max_bet_confidence)}
        )
      `);
        }

        const countResult = await connection.query('SELECT COUNT(*) as count FROM games');
        const count = Number(countResult.toArray()[0].count);

        const featCount = await connection.query('SELECT COUNT(*) as c FROM games WHERE features IS NOT NULL');
        const fc = Number(featCount.toArray()[0].c);

        log(`Loaded ${count} games into DuckDB (${fc} with features)`);

        return count;
    } catch (error) {
        console.error('Failed to load games data:', error);
        throw error;
    }
}

/**
 * Execute raw SQL query
 */
export async function query(sql) {
    if (!connection) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }

    try {
        const result = await connection.query(sql);
        const rows = result.toArray();

        return rows.map(row => {
            const obj = typeof row.toJSON === 'function' ? row.toJSON() : row;
            const converted = {};
            for (const [key, value] of Object.entries(obj)) {
                converted[key] = typeof value === 'bigint' ? Number(value) : value;
            }
            return converted;
        });
    } catch (error) {
        console.error('SQL Query failed:', sql, error);
        throw error;
    }
}

// =========================================
// DASHBOARD QUERIES - ALL DATA ACCESS POINTS
// =========================================

/**
 * Get overview stats for header
 */
export async function getOverviewStats() {
    const [basic] = await query(`
    SELECT 
      COUNT(*) as total_games,
      COUNT(DISTINCT theme_consolidated) as theme_count,
      AVG(performance_theo_win) as avg_theo_win,
      SUM(performance_market_share_percent) as total_market_share
    FROM games
    WHERE ${RELIABLE_GAME}
  `);

    const featureRows = await query(
        `SELECT DISTINCT features FROM games WHERE features IS NOT NULL AND features != '[]' AND ${RELIABLE_GAME}`
    );
    const featureSet = new Set();
    for (const r of featureRows) {
        parseFeatures(r.features).forEach(f => featureSet.add(f));
    }
    basic.mechanic_count = featureSet.size;

    return [basic];
}

/**
 * Get theme distribution with aggregated stats
 */
export async function getThemeDistribution() {
    return query(`
    SELECT 
      theme_consolidated as theme,
      COUNT(*) as game_count,
      AVG(performance_theo_win) as avg_theo_win,
      SUM(performance_market_share_percent) as total_market_share,
      AVG(specs_rtp) as avg_rtp,
      MIN(performance_rank) as best_rank,
      MAX(performance_theo_win) as max_theo_win
    FROM games
    WHERE ${RELIABLE_GAME}
    GROUP BY theme_consolidated
    ORDER BY avg_theo_win DESC
  `);
}

/**
 * Get mechanic (feature) distribution with aggregated stats.
 * Parses the features JSON in JS since DuckDB WASM lacks from_json.
 */
export async function getMechanicDistribution() {
    const rows = await query(`
    SELECT features, performance_theo_win, performance_market_share_percent,
           specs_rtp, performance_rank
    FROM games
    WHERE features IS NOT NULL AND features != '[]'
      AND ${RELIABLE_GAME}
  `);

    const buckets = {};
    for (const row of rows) {
        const feats = parseFeatures(row.features);
        if (!feats.length) continue;
        for (const f of feats) {
            if (!buckets[f]) buckets[f] = { theo: [], mkt: 0, rtp: [], rank: Infinity };
            buckets[f].theo.push(row.performance_theo_win || 0);
            buckets[f].mkt += row.performance_market_share_percent || 0;
            buckets[f].rtp.push(row.specs_rtp);
            if (row.performance_rank < buckets[f].rank) buckets[f].rank = row.performance_rank;
        }
    }

    return Object.entries(buckets)
        .map(([mechanic, b]) => ({
            mechanic,
            game_count: b.theo.length,
            avg_theo_win: b.theo.reduce((s, v) => s + v, 0) / b.theo.length,
            total_market_share: b.mkt,
            avg_rtp:
                b.rtp.filter(v => v != null).reduce((s, v) => s + v, 0) / (b.rtp.filter(v => v != null).length || 1),
            best_rank: b.rank,
        }))
        .sort((a, b) => b.avg_theo_win - a.avg_theo_win);
}

/**
 * Get provider distribution with aggregated stats
 */
export async function getProviderDistribution() {
    if (!initialized) {
        log('Database not initialized, initializing now...');
        await initializeDatabase();
    }

    return query(`
    SELECT 
      provider_studio as studio,
      MODE(provider_parent) as parent,
      COUNT(*) as game_count,
      AVG(COALESCE(performance_theo_win, 0)) as avg_theo_win,
      SUM(COALESCE(performance_market_share_percent, 0)) as total_market_share,
      AVG(specs_rtp) as avg_rtp,
      MODE(specs_volatility) as dominant_volatility
    FROM games
    WHERE ${RELIABLE_GAME}
    GROUP BY provider_studio
    ORDER BY game_count DESC
  `);
}

/**
 * Get anomalies (high and low performers)
 */
export async function getAnomalies() {
    let high = await query(`
    SELECT * FROM games 
    WHERE performance_anomaly = 'high' AND ${RELIABLE_GAME}
    ORDER BY performance_theo_win DESC
    LIMIT 30
  `);

    if (high.length < 30) {
        high = await query(`
      SELECT * FROM games 
      WHERE performance_theo_win IS NOT NULL AND ${RELIABLE_GAME}
      ORDER BY performance_theo_win DESC
      LIMIT 30
    `);
    }

    let low = await query(`
    SELECT * FROM games 
    WHERE performance_anomaly = 'low' AND ${RELIABLE_GAME}
    ORDER BY performance_theo_win ASC
    LIMIT 30
  `);

    if (low.length === 0) {
        low = await query(`
      SELECT * FROM games 
      WHERE performance_theo_win IS NOT NULL AND ${RELIABLE_GAME}
      ORDER BY performance_theo_win ASC
      LIMIT 30
    `);
    }

    return { high, low };
}

/**
 * Get all games with optional filters (including feature filter)
 */
export async function getAllGames(filters = {}) {
    let sql = `SELECT * FROM games WHERE ${RELIABLE_GAME}`;

    if (filters.provider) {
        sql += ` AND provider_studio = '${filters.provider.replace(/'/g, "''")}'`;
    }

    if (filters.mechanic) {
        sql += ` AND features LIKE '%"${filters.mechanic.replace(/'/g, "''")}"%'`;
    }

    if (filters.theme) {
        sql += ` AND theme_consolidated = '${filters.theme.replace(/'/g, "''")}'`;
    }

    if (filters.feature) {
        sql += ` AND features LIKE '%"${filters.feature.replace(/'/g, "''")}"%'`;
    }

    if (filters.search) {
        sql += ` AND name ILIKE '%${filters.search.replace(/'/g, "''")}%'`;
    }

    if (filters.gameCategory) {
        sql += ` AND game_category = '${filters.gameCategory.replace(/'/g, "''")}'`;
    }

    sql += ' ORDER BY performance_rank ASC';

    return query(sql);
}

/**
 * Get games by mechanic
 */
export async function getGamesByMechanic(mechanic) {
    const safe = mechanic.replace(/'/g, "''");
    return query(`
    SELECT * FROM games 
    WHERE features IS NOT NULL AND features LIKE '%"${safe}"%'
      AND ${RELIABLE_GAME}
    ORDER BY performance_rank ASC
  `);
}

/**
 * Get games by theme
 */
export async function getGamesByTheme(theme) {
    return query(`
    SELECT * FROM games 
    WHERE theme_consolidated = '${theme.replace(/'/g, "''")}'
      AND ${RELIABLE_GAME}
    ORDER BY performance_rank ASC
  `);
}

/**
 * Get games by provider
 */
export async function getGamesByProvider(provider) {
    return query(`
    SELECT * FROM games 
    WHERE provider_studio = '${provider.replace(/'/g, "''")}'
      AND ${RELIABLE_GAME}
    ORDER BY performance_rank ASC
  `);
}

/**
 * Search games by name
 */
export async function searchGames(searchTerm) {
    return query(`
    SELECT * FROM games 
    WHERE name ILIKE '%${searchTerm.replace(/'/g, "''")}%'
      AND ${RELIABLE_GAME}
    ORDER BY performance_rank ASC
  `);
}

/**
 * Get volatility distribution
 */
export async function getVolatilityDistribution() {
    return query(`
    SELECT 
      specs_volatility as volatility,
      COUNT(*) as game_count,
      AVG(performance_theo_win) as avg_theo_win,
      AVG(specs_rtp) as avg_rtp
    FROM games
    WHERE specs_volatility IS NOT NULL
      AND ${RELIABLE_GAME}
    GROUP BY specs_volatility
    ORDER BY 
      CASE specs_volatility
        WHEN 'low' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'high' THEN 3
        WHEN 'very high' THEN 4
        ELSE 5
      END
  `);
}

/**
 * Get release year distribution
 */
export async function getReleaseYearDistribution() {
    return query(`
    SELECT 
      release_year as year,
      COUNT(*) as game_count,
      AVG(performance_theo_win) as avg_theo_win
    FROM games
    WHERE release_year IS NOT NULL
      AND ${RELIABLE_GAME}
    GROUP BY release_year
    ORDER BY release_year ASC
  `);
}

/**
 * Get top N games
 */
export async function getTopGames(limit = 10) {
    return query(`
    SELECT * FROM games
    WHERE ${RELIABLE_GAME}
    ORDER BY performance_rank ASC
    LIMIT ${limit}
  `);
}

/**
 * Get unique values for filters
 */
export async function getUniqueProviders() {
    return query(`
    SELECT DISTINCT provider_studio as provider 
    FROM games 
    ORDER BY provider_studio
  `);
}

export async function getUniqueMechanics() {
    const rows = await query(`SELECT DISTINCT features FROM games WHERE features IS NOT NULL AND features != '[]'`);
    const set = new Set();
    for (const r of rows) {
        parseFeatures(r.features).forEach(f => set.add(f));
    }
    return [...set].sort().map(mechanic => ({ mechanic }));
}

export async function getUniqueThemes() {
    return query(`
    SELECT DISTINCT theme_consolidated as theme 
    FROM games 
    ORDER BY theme_consolidated
  `);
}

export async function getGameCategories() {
    return query(`
    SELECT game_category as category, COUNT(*) as game_count
    FROM games
    WHERE game_category IS NOT NULL
    GROUP BY game_category
    ORDER BY game_count DESC
  `);
}

/**
 * Get unique features from the features JSON arrays
 */
export async function getUniqueFeatures() {
    const rows = await query(`
    SELECT features FROM games WHERE features IS NOT NULL
  `);

    const featureSet = new Set();
    for (const row of rows) {
        parseFeatures(row.features).forEach(f => featureSet.add(f));
    }

    return [...featureSet].sort().map(f => ({ feature: f }));
}

/**
 * Get feature distribution (count per feature)
 */
export async function getFeatureDistribution() {
    const rows = await query(`
    SELECT features, performance_theo_win, performance_market_share_percent 
    FROM games WHERE features IS NOT NULL
      AND ${RELIABLE_GAME}
  `);

    const stats = {};
    for (const row of rows) {
        const arr = parseFeatures(row.features);
        if (!arr.length) continue;
        for (const f of arr) {
            if (!stats[f]) stats[f] = { feature: f, game_count: 0, total_theo: 0, total_market_share: 0 };
            stats[f].game_count++;
            stats[f].total_theo += row.performance_theo_win || 0;
            stats[f].total_market_share += row.performance_market_share_percent || 0;
        }
    }

    return Object.values(stats)
        .map(s => ({
            ...s,
            avg_theo_win: s.total_theo / s.game_count,
        }))
        .sort((a, b) => b.game_count - a.game_count);
}

/**
 * Close database connection
 */
export async function closeDatabase() {
    if (connection) {
        await connection.close();
        connection = null;
    }
    if (db) {
        await db.terminate();
        db = null;
    }
    initialized = false;
    log('DuckDB closed');
}

/** @returns {Record<string, string>} theme_primary → consolidated (empty if DB not loaded yet) */
export function getThemeConsolidationMap() {
    return themeConsolidationMap;
}

export { db, connection, initialized };
