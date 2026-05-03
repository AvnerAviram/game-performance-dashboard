/**
 * Game Analytics Data Module - DuckDB Version with Fallback
 *
 * Primary: DuckDB queries (100% goal)
 * Fallback: If DuckDB fails, use simple JSON loading
 */

import { createTooltipsObject } from '../config/mechanics.js';
import { log, warn } from './env.js';
import { parseFeatures } from './parse-features.js';

// Global data store
export let gameData = {
    total_games: 0,
    theme_count: 0,
    mechanic_count: 0,
    themes: [],
    mechanics: [],
    providers: [], // Populated when Providers page loads (DuckDB)
    top_anomalies: [],
    bottom_anomalies: [],
    allGames: [],
    /** Filtered view of allGames; set by per-page category filter */
    viewGames: null,
    /** Filtered view of themes; recomputed when category filter changes */
    viewThemes: null,
    /** Filtered view of mechanics; recomputed when category filter changes */
    viewMechanics: null,
    /** Currently active category filter label (null = "All Types") */
    activeCategory: null,
    /** theme_primary → consolidated; filled after DuckDB load */
    themeConsolidationMap: {},
    _dataSource: 'unknown', // Track where data came from
};

// ── Centralized getters ──────────────────────────────────────────────────
// UI code should use these instead of accessing gameData.allGames / .themes / .mechanics directly.

/** Returns the category-filtered game array, or all games when no filter is active. */
export function getActiveGames() {
    return gameData.viewGames ?? gameData.allGames ?? [];
}

/** Returns themes recomputed for the active category filter, or all themes. */
export function getActiveThemes() {
    return gameData.viewThemes ?? gameData.themes ?? [];
}

/** Returns mechanics recomputed for the active category filter, or all mechanics. */
export function getActiveMechanics() {
    return gameData.viewMechanics ?? gameData.mechanics ?? [];
}

// Make gameData globally available
if (typeof window !== 'undefined') {
    window.gameData = gameData;
}

export const TOOLTIPS = createTooltipsObject();

/**
 * Try to load via DuckDB first, fallback to direct JSON if it fails
 */
export async function loadGameData() {
    log('🦆 Attempting DuckDB loading...');

    try {
        // Try DuckDB approach
        const duckdbSuccess = await loadViaDuckDB();
        if (duckdbSuccess) {
            gameData._dataSource = 'duckdb';
            log('✅ Data loaded via DuckDB!');
            return gameData;
        }
    } catch (error) {
        warn('⚠️ DuckDB loading failed, falling back to direct JSON:', error.message);
    }

    // Fallback to direct JSON
    log('📊 Loading via direct JSON (fallback)...');
    const jsonSuccess = await loadViaJSON();
    if (!jsonSuccess) {
        throw new Error('Both DuckDB and JSON fallback failed. Dashboard cannot load data.');
    }
    gameData._dataSource = 'json_fallback';
    log('✅ Data loaded via JSON fallback');
    return gameData;
}

/**
 * Load data via DuckDB queries
 */
async function loadViaDuckDB() {
    try {
        // Dynamic import to avoid blocking if DuckDB not available
        const { initializeDatabase, getOverviewStats, getAnomalies, getAllGames } =
            await import('./db/duckdb-client.js');

        log('🦆 DuckDB module loaded, initializing...');

        // Initialize DuckDB (may take 2-5 seconds first time)
        await initializeDatabase();

        // Query stats
        const [stats] = await getOverviewStats();
        gameData.total_games = stats.total_games;
        gameData.theme_count = stats.theme_count;
        gameData.mechanic_count = stats.mechanic_count;

        // Query anomalies (convert to old format for ui.js compatibility)
        const anomalies = await getAnomalies();
        gameData.top_anomalies = (anomalies.high || []).map(g => ({
            game: g.name,
            themes: [g.theme_consolidated || g.art_theme || g.theme_primary || 'Unknown'],
            mechanics: parseFeatures(g.features),
            'Theo Win': g.performance_theo_win || 0,
            'Market Share %': g.performance_market_share_percent || 0,
            rank: g.performance_rank || 999,
            theo_win_index: g.performance_theo_win || 0,
            z_score: ((g.performance_theo_win || 0) - 10) / 5,
            ...g,
        }));
        gameData.bottom_anomalies = (anomalies.low || []).map(g => ({
            game: g.name,
            themes: [g.theme_consolidated || g.art_theme || g.theme_primary || 'Unknown'],
            mechanics: parseFeatures(g.features),
            'Theo Win': g.performance_theo_win || 0,
            'Market Share %': g.performance_market_share_percent || 0,
            rank: g.performance_rank || 999,
            theo_win_index: g.performance_theo_win || 0,
            z_score: ((g.performance_theo_win || 0) - 10) / 5,
            ...g,
        }));

        // Query all games
        gameData.allGames = await getAllGames();
        // Build consolidation map
        gameData.themeConsolidationMap = {};
        for (const g of gameData.allGames) {
            const unified = g.theme_consolidated || g.art_theme;
            if (g.theme_primary && unified) {
                gameData.themeConsolidationMap[g.theme_primary] = unified;
            }
        }

        // Load themes & mechanics from SQL (single source of truth)
        const { getThemeMetrics, getFeatureMetrics } = await import('./metrics.js');
        const { mapSqlThemes, mapSqlMechanics } = await import('../ui/chart-config.js');
        const [sqlThemes, sqlMechanics] = await Promise.all([getThemeMetrics(), getFeatureMetrics()]);
        gameData.themes = mapSqlThemes(sqlThemes);
        gameData.mechanics = mapSqlMechanics(sqlMechanics);
        gameData.theme_count = gameData.themes.length;
        gameData.mechanic_count = gameData.mechanics.length;

        log(
            `✅ DuckDB: ${gameData.total_games} games, ${gameData.themes.length} themes, ${gameData.mechanics.length} mechanics`
        );

        return true;
    } catch (error) {
        console.error('❌ DuckDB loading failed:', error);
        return false;
    }
}

async function loadViaJSON() {
    try {
        const response = await fetch('/data/games_processed.json').catch(() => fetch('data/games_processed.json'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const games = await response.json();
        log(`📊 JSON fallback: loaded ${games.length} games`);

        // Build theme consolidation map from loaded data
        for (const g of games) {
            const unified = g.theme_consolidated || g.art_theme;
            if (g.theme_primary && unified) {
                gameData.themeConsolidationMap[g.theme_primary] = unified;
            }
        }

        // Filter reliable games (same logic as DuckDB RELIABLE_GAME clause)
        const reliableGames = games.filter(g => {
            const confFields = [
                g.rtp_confidence,
                g.volatility_confidence,
                g.reels_confidence,
                g.paylines_confidence,
                g.max_win_confidence,
                g.min_bet_confidence,
                g.max_bet_confidence,
            ];
            const specReliable = confFields.some(c => c === 'verified' || c === 'extracted');
            const hasFeatures = Array.isArray(g.features) ? g.features.length > 0 : g.features && g.features !== '[]';
            return specReliable || hasFeatures;
        });

        gameData.allGames = reliableGames;

        // Compute stats
        gameData.total_games = reliableGames.length;
        const themeSet = new Set(
            reliableGames.map(g => g.theme_consolidated || g.art_theme || g.theme_primary).filter(Boolean)
        );
        gameData.theme_count = themeSet.size;
        const mechSet = new Set();
        for (const g of reliableGames) {
            parseFeatures(g.features).forEach(f => mechSet.add(f));
        }
        gameData.mechanic_count = mechSet.size;

        // Build theme distribution
        const themeAgg = {};
        for (const g of reliableGames) {
            const t = g.theme_consolidated || g.art_theme || g.theme_primary || 'Unknown';
            if (!themeAgg[t]) themeAgg[t] = { count: 0, theoSum: 0, mktSum: 0 };
            themeAgg[t].count++;
            themeAgg[t].theoSum += g.performance_theo_win || 0;
            themeAgg[t].mktSum += g.performance_market_share_percent || 0;
        }
        gameData.themes = Object.entries(themeAgg)
            .filter(([t]) => !/^unknown$/i.test(t) && !t.toUpperCase().includes('FLAGGED FOR RESEARCH'))
            .map(([theme, s]) => ({
                Theme: theme,
                'Game Count': s.count,
                'Avg Theo Win Index': s.theoSum / s.count,
                'Market Share %': s.mktSum,
                theme,
                game_count: s.count,
                avg_theo_win: s.theoSum / s.count,
                total_market_share: s.mktSum,
            }));

        // Build mechanic distribution
        const mechAgg = {};
        for (const g of reliableGames) {
            const feats = parseFeatures(g.features);
            for (const f of feats) {
                if (!mechAgg[f]) mechAgg[f] = { count: 0, theoSum: 0, mktSum: 0 };
                mechAgg[f].count++;
                mechAgg[f].theoSum += g.performance_theo_win || 0;
                mechAgg[f].mktSum += g.performance_market_share_percent || 0;
            }
        }
        gameData.mechanics = Object.entries(mechAgg).map(([mechanic, s]) => ({
            Mechanic: mechanic,
            'Game Count': s.count,
            'Avg Theo Win Index': s.theoSum / s.count,
            'Market Share %': s.mktSum,
            mechanic,
            game_count: s.count,
            avg_theo_win: s.theoSum / s.count,
            total_market_share: s.mktSum,
        }));

        // Anomalies
        const byTheo = [...reliableGames].sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
        gameData.top_anomalies = byTheo.slice(0, 30).map(g => ({
            game: g.name,
            themes: [g.theme_consolidated || g.art_theme || g.theme_primary || 'Unknown'],
            mechanics: parseFeatures(g.features),
            'Theo Win': g.performance_theo_win || 0,
            'Market Share %': g.performance_market_share_percent || 0,
            rank: g.performance_rank || 999,
            theo_win_index: g.performance_theo_win || 0,
            z_score: ((g.performance_theo_win || 0) - 10) / 5,
            ...g,
        }));
        gameData.bottom_anomalies = byTheo
            .slice(-30)
            .reverse()
            .map(g => ({
                game: g.name,
                themes: [g.theme_consolidated || g.art_theme || g.theme_primary || 'Unknown'],
                mechanics: parseFeatures(g.features),
                'Theo Win': g.performance_theo_win || 0,
                'Market Share %': g.performance_market_share_percent || 0,
                rank: g.performance_rank || 999,
                theo_win_index: g.performance_theo_win || 0,
                z_score: ((g.performance_theo_win || 0) - 10) / 5,
                ...g,
            }));

        applySmartIndexToGameData();
        return true;
    } catch (error) {
        console.error('❌ JSON fallback failed:', error);
        return false;
    }
}

/**
 * Compute Smart Index for theme/mechanic rows (JSON fallback only).
 * The DuckDB path uses SQL-computed Smart Index via mapSqlThemes/mapSqlMechanics.
 */
function applySmartIndexToGameData() {
    const MIN_QUALIFIED = 20;
    const computePI = (avgTheo, globalAvg) => {
        if (!globalAvg) return 0;
        return avgTheo / globalAvg;
    };
    const applyToRows = (
        rows,
        theoKey = 'avg_theo_win',
        altKey = 'Avg Theo Win Index',
        countKey = 'game_count',
        altCountKey = 'Game Count'
    ) => {
        const globalAvg = rows.reduce((s, r) => s + (r[theoKey] || r[altKey] || 0), 0) / (rows.length || 1);
        return rows
            .map(r => {
                const theo = r[theoKey] || r[altKey] || 0;
                const count = r[countKey] || r[altCountKey] || 0;
                const pi = computePI(theo, globalAvg);
                const qualified = count >= MIN_QUALIFIED;
                return {
                    ...r,
                    'Performance Index': pi,
                    performanceIndex: pi,
                    'Smart Index': pi,
                    smartIndex: pi,
                    qualified,
                };
            })
            .sort((a, b) => {
                const aMkt = a['Market Share %'] ?? a.total_market_share ?? 0;
                const bMkt = b['Market Share %'] ?? b.total_market_share ?? 0;
                return bMkt - aMkt;
            });
    };
    gameData.themes = applyToRows(gameData.themes);
    gameData.mechanics = applyToRows(gameData.mechanics);
}
