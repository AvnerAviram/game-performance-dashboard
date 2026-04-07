/**
 * Game Analytics Data Module - DuckDB Version with Fallback
 *
 * Primary: DuckDB queries (100% goal)
 * Fallback: If DuckDB fails, use simple JSON loading
 */

import { createTooltipsObject } from '../config/mechanics.js';
import { log, warn } from './env.js';
import { calculateSmartIndex as computeSI } from './metrics.js';
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
    await loadViaJSON();
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
        const {
            initializeDatabase,
            getOverviewStats,
            getThemeDistribution,
            getMechanicDistribution,
            getAnomalies,
            getAllGames,
            getThemeConsolidationMap,
        } = await import('./db/duckdb-client.js');

        log('🦆 DuckDB module loaded, initializing...');

        // Initialize DuckDB (may take 2-5 seconds first time)
        await initializeDatabase();

        // Query stats
        const [stats] = await getOverviewStats();
        gameData.total_games = stats.total_games;
        gameData.theme_count = stats.theme_count;
        gameData.mechanic_count = stats.mechanic_count;

        // Query themes — exclude Unknown/placeholder themes
        const themesRaw = await getThemeDistribution();
        gameData.themes = themesRaw
            .filter(
                t => t.theme && !/^unknown$/i.test(t.theme) && !t.theme.toUpperCase().includes('FLAGGED FOR RESEARCH')
            )
            .map(t => ({
                Theme: t.theme,
                'Game Count': t.game_count,
                'Avg Theo Win Index': t.avg_theo_win,
                'Market Share %': t.total_market_share,
                theme: t.theme,
                game_count: t.game_count,
                avg_theo_win: t.avg_theo_win,
                total_market_share: t.total_market_share,
            }));

        // Query mechanics
        const mechanicsRaw = await getMechanicDistribution();
        gameData.mechanics = mechanicsRaw.map(m => ({
            Mechanic: m.mechanic,
            'Game Count': m.game_count,
            'Avg Theo Win Index': m.avg_theo_win,
            'Market Share %': m.total_market_share || 0, // ADD THIS!
            mechanic: m.mechanic,
            game_count: m.game_count,
            avg_theo_win: m.avg_theo_win,
            total_market_share: m.total_market_share || 0,
        }));

        // Query anomalies (convert to old format for ui.js compatibility)
        const anomalies = await getAnomalies();
        gameData.top_anomalies = (anomalies.high || []).map(g => ({
            game: g.name,
            themes: [g.theme_consolidated || 'Unknown'],
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
            themes: [g.theme_consolidated || 'Unknown'],
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
        gameData.themeConsolidationMap = getThemeConsolidationMap();

        // Calculate Smart Index
        calculateSmartIndex();

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
    console.error('DuckDB loading failed and JSON fallback is not implemented. Ensure your browser supports WASM.');
    return false;
}

function applySmartIndex(
    rows,
    theoKey = 'avg_theo_win',
    altKey = 'Avg Theo Win Index',
    countKey = 'game_count',
    altCountKey = 'Game Count'
) {
    const globalAvg = rows.reduce((s, r) => s + (r[theoKey] || r[altKey] || 0), 0) / (rows.length || 1);
    return rows
        .map(r => {
            const theo = r[theoKey] || r[altKey] || 0;
            const count = r[countKey] || r[altCountKey] || 0;
            return { ...r, 'Smart Index': computeSI(theo, count, globalAvg) };
        })
        .sort((a, b) => b['Smart Index'] - a['Smart Index']);
}

function calculateSmartIndex() {
    gameData.themes = applySmartIndex(gameData.themes);
    gameData.mechanics = applySmartIndex(gameData.mechanics);
}
