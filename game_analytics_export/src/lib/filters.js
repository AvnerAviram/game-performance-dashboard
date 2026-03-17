// Smart Filter Logic for Themes and Mechanics
// Addresses sample size issues: filters out too small/too large datasets

import { log } from './env.js';

/**
 * Get filtered themes based on view
 * @param {string} view - Filter type: 'all', 'leaders', 'opportunities', 'premium'
 * @returns {Array} Filtered theme array
 */
export function getFilteredThemes(view) {
    const themes = window.gameData?.themes || [];
    
    if (themes.length === 0) return [];
    
    switch(view) {
        case 'leaders': {
            const sortedByCount = [...themes].sort((a, b) => b['Game Count'] - a['Game Count']);
            const leaderThreshold = sortedByCount[Math.floor(sortedByCount.length * 0.20)]?.['Game Count'] || 30;
            const leaders = themes.filter(t => t['Game Count'] >= leaderThreshold);
            return leaders.sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
        }
        case 'opportunities': {
            const avgPerformance = themes.reduce((sum, t) => sum + (t['Avg Theo Win Index'] || 0), 0) / themes.length;
            const opportunities = themes.filter(t =>
                t['Game Count'] >= 5 &&
                t['Avg Theo Win Index'] >= avgPerformance &&
                t['Market Share %'] < 5
            );
            return opportunities.sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
        }
        case 'premium': {
            const sortedByPerf = [...themes].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
            const premiumThreshold = sortedByPerf[Math.floor(sortedByPerf.length * 0.25)]?.['Smart Index'] || 2.5;
            const premium = themes.filter(t => (t['Smart Index'] || 0) >= premiumThreshold);
            return premium.sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
        }
        case 'all':
        default:
            return [...themes].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
    }
}

/**
 * Get filtered mechanics based on view
 * @param {string} view - Filter type: 'all', 'popular', 'highPerforming'
 * @returns {Array} Filtered mechanics array
 */
export function getFilteredMechanics(view) {
    const mechanics = window.gameData?.mechanics || [];
    
    if (mechanics.length === 0) return [];
    
    switch(view) {
        case 'popular': {
            const sortedByCount = [...mechanics].sort((a, b) => b['Game Count'] - a['Game Count']);
            const popularThreshold = sortedByCount[Math.floor(sortedByCount.length * 0.20)]?.['Game Count'] || 20;
            const popular = mechanics.filter(m => m['Game Count'] >= popularThreshold);
            return popular.sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
        }
        case 'highPerforming': {
            const sortedByPerf = [...mechanics].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
            const perfThreshold = sortedByPerf[Math.floor(sortedByPerf.length * 0.30)]?.['Smart Index'] || 1.5;
            const highPerforming = mechanics.filter(m => (m['Smart Index'] || 0) >= perfThreshold);
            return highPerforming.sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
        }
        case 'all':
        default:
            return [...mechanics].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
    }
}

// Track current view state
let currentThemeView = 'all';
let currentMechanicView = 'all';

/**
 * Switch theme filter view
 * @param {string} view - View to switch to
 */
window.switchThemeView = function(view) {
    currentThemeView = view;
    log(`🔄 Switching themes to ${view} view`);
    
    // Update active tab - find buttons by data-filter attribute
    const pageContainer = document.getElementById('page-container');
    if (pageContainer) {
        const themesTabs = pageContainer.querySelectorAll('button[data-filter]');
        themesTabs.forEach(tab => {
            const tabFilter = tab.getAttribute('data-filter');
            if (tabFilter === view) {
                // Active state
                tab.className = 'px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 bg-indigo-600 border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]';
            } else {
                // Inactive state
                tab.className = 'px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:-translate-y-px';
            }
        });
    }
    
    // Get filtered data
    const filtered = getFilteredThemes(view);
    log(`  📊 Filtered to ${filtered.length} themes`);
    
    // Reset to page 1 when switching filters (avoids empty list from stale pagination)
    if (window.themesCurrentPage !== undefined) {
        window.themesCurrentPage = 1;
    }
    
    // Re-render with filtered data
    if (window.renderThemes) {
        window.renderThemes(filtered);
    } else {
        console.error('❌ window.renderThemes not available');
    }
    
    // Update count
    const countSpan = document.getElementById('themes-count');
    if (countSpan) {
        countSpan.textContent = filtered.length;
    }
};

/**
 * Switch mechanic filter view
 * @param {string} view - View to switch to
 */
window.switchMechanicView = function(view) {
    currentMechanicView = view;
    log(`🔄 Switching mechanics to ${view} view`);
    
    // Update active tab - find buttons by data-filter attribute in page container
    const pageContainer = document.getElementById('page-container');
    if (pageContainer) {
        const mechanicsTabs = pageContainer.querySelectorAll('button[data-filter]');
        mechanicsTabs.forEach(tab => {
            const tabFilter = tab.getAttribute('data-filter');
            if (tabFilter === view) {
                // Active state
                tab.className = 'px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 bg-indigo-600 border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]';
            } else {
                // Inactive state
                tab.className = 'px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:-translate-y-px';
            }
        });
    }
    
    // Get filtered data
    const filtered = getFilteredMechanics(view);
    log(`  📊 Filtered to ${filtered.length} mechanics`);
    
    // Reset to page 1 when switching filters (avoids empty list from stale pagination)
    if (window.mechanicsCurrentPage !== undefined) {
        window.mechanicsCurrentPage = 1;
    }
    
    // Re-render with filtered data
    if (window.renderMechanics) {
        window.renderMechanics(filtered);
    } else {
        console.error('❌ window.renderMechanics not available');
    }
    
    // Update count
    const countSpan = document.getElementById('mechanics-count');
    if (countSpan) {
        countSpan.textContent = filtered.length;
    }
};

// ==========================================
// GAMES FILTERS
// ==========================================

let currentGameView = 'all';

/**
 * Filter games based on view
 */
function getFilteredGames(view) {
    const games = window.gameData?.games || [];
    
    if (games.length === 0) return [];
    
    switch(view) {
        case 'topPerformers': {
            const sorted = [...games].sort((a, b) => b['Theo Win'] - a['Theo Win']);
            const topCount = Math.ceil(games.length * 0.2);
            return sorted.slice(0, topCount);
        }
        case 'highVolatility':
            return games.filter(g => g.Volatility && g.Volatility.toLowerCase() === 'high');
        case 'all':
        default:
            return games;
    }
}

/**
 * Switch games view
 */
window.switchGameView = function(view) {
    currentGameView = view;
    log(`🔄 Switching games to ${view} view`);
    
    // Update active tab - find buttons by data-filter in games page
    const gamesPage = document.getElementById('page-container');
    if (gamesPage) {
        const gamesTabs = gamesPage.querySelectorAll('button[data-filter]');
        gamesTabs.forEach(tab => {
            const tabFilter = tab.getAttribute('data-filter');
            if (tabFilter === view) {
                // Active state
                tab.className = 'game-tab px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 bg-indigo-600 border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]';
            } else {
                // Inactive state
                tab.className = 'game-tab px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:-translate-y-px';
            }
        });
    }
    
    // Delegate to renderGames in ui-providers-games.js which reads currentGameViewFilter
    if (window._setGameViewFilter) {
        window._setGameViewFilter(view);
    } else {
        console.error('❌ window._setGameViewFilter not available');
    }
};

export { currentThemeView, currentMechanicView, currentGameView };

// ==========================================
// PROVIDERS FILTERS
// ==========================================

let currentProviderView = 'all';

function getFilteredProviders(view) {
    const providers = window.gameData?.providers || [];
    
    if (providers.length === 0) return [];
    
    switch(view) {
        case 'topStudios': {
            const sortedByCount = [...providers].sort((a, b) => (b.game_count || 0) - (a.game_count || 0));
            const threshold = sortedByCount[Math.floor(sortedByCount.length * 0.20)]?.game_count || 10;
            return providers.filter(p => (p.game_count || 0) >= threshold);
        }
        case 'highQuality': {
            const sortedByPerf = [...providers].sort((a, b) => (b.avg_theo_win || 0) - (a.avg_theo_win || 0));
            const perfThreshold = sortedByPerf[Math.floor(sortedByPerf.length * 0.30)]?.avg_theo_win || 1.5;
            return providers.filter(p => (p.avg_theo_win || 0) >= perfThreshold);
        }
        case 'all':
        default:
            return providers;
    }
}

window.switchProviderView = function(view) {
    currentProviderView = view;
    log(`🔄 Switching providers to ${view} view`);
    
    // Update active tab
    const pageContainer = document.getElementById('page-container');
    if (pageContainer) {
        const providerTabs = pageContainer.querySelectorAll('button[data-filter]');
        providerTabs.forEach(tab => {
            const tabFilter = tab.getAttribute('data-filter');
            if (tabFilter === view) {
                // Active state
                tab.className = 'provider-tab px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 bg-indigo-600 border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]';
            } else {
                // Inactive state
                tab.className = 'provider-tab px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:-translate-y-px';
            }
        });
    }
    
    // Get filtered data
    const filtered = getFilteredProviders(view);
    log(`  📊 Filtered to ${filtered.length} providers`);
    
    // Reset to page 1 when switching filters (avoids empty list from stale pagination)
    if (window.providersCurrentPage !== undefined) {
        window.providersCurrentPage = 1;
    }
    
    // Re-render with filtered data
    if (window.renderProviders) {
        window.renderProviders(filtered);
    } else {
        console.error('❌ window.renderProviders not available');
    }
    
    // Update count
    const countSpan = document.getElementById('providers-count');
    if (countSpan) {
        countSpan.textContent = filtered.length;
    }
};

export { currentProviderView };
