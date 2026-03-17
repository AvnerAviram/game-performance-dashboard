/**
 * Game Analytics Data Module - DuckDB Version with Fallback
 * 
 * Primary: DuckDB queries (100% goal)
 * Fallback: If DuckDB fails, use simple JSON loading
 */

import { createTooltipsObject } from '../config/mechanics.js';
import { log, warn } from './env.js';

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
    _dataSource: 'unknown' // Track where data came from
};

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
            getAllGames
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
            .filter(t => t.theme && !/^unknown$/i.test(t.theme) && !t.theme.toUpperCase().includes('FLAGGED FOR RESEARCH'))
            .map(t => ({
                Theme: t.theme,
                'Game Count': t.game_count,
                'Avg Theo Win Index': t.avg_theo_win,
                'Market Share %': t.total_market_share,
                theme: t.theme,
                game_count: t.game_count,
                avg_theo_win: t.avg_theo_win,
                total_market_share: t.total_market_share
            }));
        
        // Query mechanics
        const mechanicsRaw = await getMechanicDistribution();
        gameData.mechanics = mechanicsRaw.map(m => ({
            Mechanic: m.mechanic,
            'Game Count': m.game_count,
            'Avg Theo Win Index': m.avg_theo_win,
            'Market Share %': m.total_market_share || 0,  // ADD THIS!
            mechanic: m.mechanic,
            game_count: m.game_count,
            avg_theo_win: m.avg_theo_win,
            total_market_share: m.total_market_share || 0
        }));
        
        // Query anomalies (convert to old format for ui.js compatibility)
        const anomalies = await getAnomalies();
        gameData.top_anomalies = (anomalies.high || []).map(g => ({
            game: g.name,
            themes: [g.theme_consolidated || 'Unknown'],
            mechanics: [g.mechanic_primary || 'Unknown'],
            'Theo Win': g.performance_theo_win || 0,
            'Market Share %': g.performance_market_share_percent || 0,
            rank: g.performance_rank || 999,
            theo_win_index: g.performance_theo_win || 0,
            z_score: ((g.performance_theo_win || 0) - 10) / 5,
            ...g
        }));
        gameData.bottom_anomalies = (anomalies.low || []).map(g => ({
            game: g.name,
            themes: [g.theme_consolidated || 'Unknown'],
            mechanics: [g.mechanic_primary || 'Unknown'],
            'Theo Win': g.performance_theo_win || 0,
            'Market Share %': g.performance_market_share_percent || 0,
            rank: g.performance_rank || 999,
            theo_win_index: g.performance_theo_win || 0,
            z_score: ((g.performance_theo_win || 0) - 10) / 5,
            ...g
        }));
        
        // Query all games
        gameData.allGames = await getAllGames();
        
        // Calculate Smart Index
        calculateSmartIndex();
        
        log(`✅ DuckDB: ${gameData.total_games} games, ${gameData.themes.length} themes, ${gameData.mechanics.length} mechanics`);
        
        return true;
    } catch (error) {
        console.error('❌ DuckDB loading failed:', error);
        return false;
    }
}

/**
 * Fallback: Load data via direct JSON access
 */
async function loadViaJSON() {
    throw new Error('❌ JSON fallback disabled. DuckDB-only mode. Check browser console for DuckDB errors.');
}

/**
 * Aggregate themes from games
 */
function aggregateThemes() {
    throw new Error('❌ aggregateThemes() deprecated. Use DuckDB getThemeDistribution()');
}


/**
 * Aggregate mechanics from games
 */
function aggregateMechanics() {
    throw new Error('❌ aggregateMechanics() deprecated. Use DuckDB getMechanicDistribution()');
}


/**
 * Calculate Smart Index for themes and mechanics
 */
function calculateSmartIndex() {
    // Add Smart Index to themes
    const avgTheoWin = gameData.themes.reduce((sum, t) => sum + (t.avg_theo_win || t['Avg Theo Win Index']), 0) / gameData.themes.length;
    
    gameData.themes = gameData.themes.map(theme => {
        const weight = Math.sqrt(theme.game_count || theme['Game Count']);
        const theo = theme.avg_theo_win || theme['Avg Theo Win Index'];
        const smartIndex = (theo * weight) / avgTheoWin;
        
        return {
            ...theme,
            'Smart Index': smartIndex
        };
    });
    
    gameData.themes.sort((a, b) => b['Smart Index'] - a['Smart Index']);
    
    // Add Smart Index to mechanics
    const avgMechanicTheo = gameData.mechanics.reduce((sum, m) => sum + (m.avg_theo_win || m['Avg Theo Win Index']), 0) / gameData.mechanics.length;
    
    gameData.mechanics = gameData.mechanics.map(mechanic => {
        const weight = Math.sqrt(mechanic.game_count || mechanic['Game Count']);
        const theo = mechanic.avg_theo_win || mechanic['Avg Theo Win Index'];
        const smartIndex = (theo * weight) / avgMechanicTheo;
        
        return {
            ...mechanic,
            'Smart Index': smartIndex
        };
    });
    
    gameData.mechanics.sort((a, b) => b['Smart Index'] - a['Smart Index']);
}
