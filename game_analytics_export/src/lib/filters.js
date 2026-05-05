// Smart Filter Logic for Themes and Mechanics
// Addresses sample size issues: filters out too small/too large datasets

import { log } from './env.js';
import { MARKET_LEADER_THRESHOLD } from './shared-config.js';
import { F } from './game-fields.js';

// Eilers-style sort comparators — field-agnostic to work with theme, mechanic, AND provider data shapes
export function theoIndexSort(a, b) {
    if ((a.qualified !== false) !== (b.qualified !== false)) return a.qualified !== false ? -1 : 1;
    const aVal = a['Avg Theo Win Index'] ?? a.avg_theo_win ?? a.avgTheo ?? 0;
    const bVal = b['Avg Theo Win Index'] ?? b.avg_theo_win ?? b.avgTheo ?? 0;
    return bVal - aVal;
}

export function marketShareSort(a, b) {
    const aVal = a['Market Share %'] ?? a.total_market_share ?? a.totalMkt ?? a.ggrShare ?? 0;
    const bVal = b['Market Share %'] ?? b.total_market_share ?? b.totalMkt ?? b.ggrShare ?? 0;
    return bVal - aVal;
}

export function getDefaultSort() {
    return rankingMode === 'grossing' ? marketShareSort : theoIndexSort;
}

/**
 * Get filtered themes based on view
 * @param {string} view - Filter type: 'all', 'leaders', 'opportunities', 'premium'
 * @returns {Array} Filtered theme array
 */
export function getFilteredThemes(view) {
    const themes = window.gameData?.viewThemes ?? window.gameData?.themes ?? [];

    if (themes.length === 0) return [];

    const defaultSort = rankingMode === 'grossing' ? marketShareSort : theoIndexSort;

    switch (view) {
        case 'leaders': {
            const sortedByCount = [...themes].sort((a, b) => b['Game Count'] - a['Game Count']);
            const leaderThreshold = sortedByCount[Math.floor(sortedByCount.length * 0.2)]?.['Game Count'] || 30;
            const leaders = themes.filter(t => t['Game Count'] >= leaderThreshold);
            return leaders.sort(marketShareSort);
        }
        case 'opportunities': {
            const avgPerformance = themes.reduce((sum, t) => sum + (t['Avg Theo Win Index'] || 0), 0) / themes.length;
            const opportunities = themes.filter(
                t => t['Game Count'] >= 5 && t['Avg Theo Win Index'] >= avgPerformance && t['Market Share %'] < 5
            );
            return opportunities.sort(theoIndexSort);
        }
        case 'premium': {
            const sortedByPerf = [...themes].sort(theoIndexSort);
            const premiumThreshold =
                sortedByPerf[Math.floor(sortedByPerf.length * 0.25)]?.['Avg Theo Win Index'] || 1.2;
            const premium = themes.filter(t => (t['Avg Theo Win Index'] || 0) >= premiumThreshold);
            return premium.sort(theoIndexSort);
        }
        case 'all':
        default:
            return [...themes].sort(defaultSort);
    }
}

/**
 * Get filtered mechanics based on view
 * @param {string} view - Filter type: 'all', 'popular', 'highPerforming'
 * @returns {Array} Filtered mechanics array
 */
export function getFilteredMechanics(view) {
    const mechanics = window.gameData?.viewMechanics ?? window.gameData?.mechanics ?? [];

    if (mechanics.length === 0) return [];

    switch (view) {
        case 'popular': {
            const sortedByCount = [...mechanics].sort((a, b) => b['Game Count'] - a['Game Count']);
            const popularThreshold = sortedByCount[Math.floor(sortedByCount.length * 0.2)]?.['Game Count'] || 20;
            const popular = mechanics.filter(m => m['Game Count'] >= popularThreshold);
            return popular.sort(marketShareSort);
        }
        case 'highPerforming': {
            const sortedByPerf = [...mechanics].sort(theoIndexSort);
            const perfThreshold = sortedByPerf[Math.floor(sortedByPerf.length * 0.3)]?.['Avg Theo Win Index'] || 1.2;
            const highPerforming = mechanics.filter(
                m => (m['Avg Theo Win Index'] || m.avg_theo_win || 0) >= perfThreshold
            );
            return highPerforming.sort(theoIndexSort);
        }
        case 'all':
        default: {
            const defaultSort = rankingMode === 'grossing' ? marketShareSort : theoIndexSort;
            return [...mechanics].sort(defaultSort);
        }
    }
}

// Track current view state
let currentThemeView = 'all';
let currentMechanicView = 'all';

// Eilers ranking mode: 'indexing' (Avg Theo Win) or 'grossing' (Market Share)
let rankingMode = 'grossing';

/**
 * Get the current ranking mode.
 * @returns {'indexing' | 'grossing'}
 */
export function getRankingMode() {
    return rankingMode;
}

/**
 * Switch ranking mode and re-render current view.
 * @param {'indexing' | 'grossing'} mode
 */
window.switchRankingMode = function (mode) {
    rankingMode = mode;
    log(`🔄 Ranking mode → ${mode === 'indexing' ? 'Top Indexing' : 'Top Grossing'}`);

    document.querySelectorAll('[data-ranking-mode]').forEach(btn => {
        const isActive = btn.dataset.rankingMode === mode;
        btn.classList.toggle('bg-indigo-600', isActive);
        btn.classList.toggle('dark:bg-indigo-500', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-indigo-600', isActive);
        btn.classList.toggle('dark:border-indigo-500', isActive);
        btn.classList.toggle('shadow-sm', isActive);
        btn.classList.toggle('bg-white', !isActive);
        btn.classList.toggle('dark:bg-gray-800', !isActive);
        btn.classList.toggle('text-gray-600', !isActive);
        btn.classList.toggle('dark:text-gray-400', !isActive);
        btn.classList.toggle('border-gray-200', !isActive);
        btn.classList.toggle('dark:border-gray-600', !isActive);
    });

    // Re-trigger the current filter view for whichever page is visible
    if (document.querySelector('#themes-table tbody')?.children.length) {
        window.switchThemeView?.(currentThemeView);
    }
    if (document.querySelector('#mechanics-table tbody')?.children.length) {
        window.switchMechanicView?.(currentMechanicView);
    }
    if (document.querySelector('#providers-content table') && window.renderProviders) {
        window.renderProviders();
    }

    // Refresh overview charts if visible
    if (typeof window.refreshCharts === 'function') {
        window.refreshCharts().catch(() => {});
    }
};

/**
 * Switch theme filter view
 * @param {string} view - View to switch to
 */
window.switchThemeView = function (view) {
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
                tab.className =
                    'px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 bg-indigo-600 border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]';
            } else {
                // Inactive state
                tab.className =
                    'px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:-translate-y-px';
            }
        });
    }

    // Reset to page 1 when switching filters (avoids empty list from stale pagination)
    if (window.themesCurrentPage !== undefined) {
        window.themesCurrentPage = 1;
    }

    // Check if dropdown filters are active — if so, delegate to filterThemes
    // which already handles game-level filtering and composes with the view
    const providerDropdown = document.getElementById('themes-filter-provider');
    const mechanicDropdown = document.getElementById('themes-filter-mechanic');
    const categoryDropdown = document.getElementById('themes-category-filter');
    const hasDropdownFilter =
        providerDropdown?.value || '' || mechanicDropdown?.value || '' || categoryDropdown?.value || '';

    if (hasDropdownFilter && window.filterThemes) {
        window.filterThemes(view);
        return;
    }

    // No dropdown filters — use precomputed viewThemes with tab filter
    const filtered = getFilteredThemes(view);
    log(`  📊 Filtered to ${filtered.length} themes`);

    if (window.renderThemes) {
        window.renderThemes(filtered);
    } else {
        console.error('❌ window.renderThemes not available');
    }

    const countSpan = document.getElementById('themes-count');
    if (countSpan) {
        countSpan.textContent = filtered.length;
    }
};

/**
 * Switch mechanic filter view
 * @param {string} view - View to switch to
 */
window.switchMechanicView = function (view) {
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
                tab.className =
                    'px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 bg-indigo-600 border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]';
            } else {
                // Inactive state
                tab.className =
                    'px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:-translate-y-px';
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
function _getFilteredGames(view) {
    const games = window.gameData?.games || [];

    if (games.length === 0) return [];

    switch (view) {
        case 'marketLeaders': {
            return games
                .filter(g => (F.marketShare(g) || 0) >= MARKET_LEADER_THRESHOLD)
                .sort((a, b) => (F.marketShare(b) || 0) - (F.marketShare(a) || 0));
        }
        case 'newReleases': {
            const cutoffYear = new Date().getFullYear() - 1;
            return games
                .filter(g => (g['Release Year'] || 0) >= cutoffYear)
                .sort((a, b) => (b['Release Year'] || 0) - (a['Release Year'] || 0));
        }
        case 'hiddenGems': {
            const avg = games.reduce((s, g) => s + (F.theoWin(g) || 0), 0) / games.length;
            return games
                .filter(g => (F.theoWin(g) || 0) >= avg && (F.marketShare(g) || 0) < 1)
                .sort((a, b) => (F.theoWin(b) || 0) - (F.theoWin(a) || 0));
        }
        case 'all':
        default:
            return games;
    }
}

/**
 * Switch games view
 */
window.switchGameView = function (view) {
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
                tab.className =
                    'game-tab px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 bg-indigo-600 border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]';
            } else {
                // Inactive state
                tab.className =
                    'game-tab px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:-translate-y-px';
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

export function resetFilterState(page) {
    if (page === 'games') currentGameView = 'all';
    if (page === 'themes') currentThemeView = 'all';
    if (page === 'mechanics') currentMechanicView = 'all';
    if (page === 'providers') currentProviderView = 'all';
}

export { currentThemeView, currentMechanicView, currentGameView };

// ==========================================
// PROVIDERS FILTERS
// ==========================================

let currentProviderView = 'all';

function getFilteredProviders(view) {
    const providers = window.gameData?.providers || [];

    if (providers.length === 0) return [];

    switch (view) {
        case 'topStudios': {
            const sortedByCount = [...providers].sort((a, b) => (b.game_count || 0) - (a.game_count || 0));
            const threshold = sortedByCount[Math.floor(sortedByCount.length * 0.2)]?.game_count || 10;
            return providers.filter(p => (p.game_count || 0) >= threshold);
        }
        case 'highQuality': {
            const sortedByPerf = [...providers].sort((a, b) => (b.avg_theo_win || 0) - (a.avg_theo_win || 0));
            const perfThreshold = sortedByPerf[Math.floor(sortedByPerf.length * 0.3)]?.avg_theo_win || 1.5;
            return providers.filter(p => (p.avg_theo_win || 0) >= perfThreshold);
        }
        case 'all':
        default:
            return providers;
    }
}

window.switchProviderView = function (view) {
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
                tab.className =
                    'provider-tab px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 bg-indigo-600 border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.3)]';
            } else {
                // Inactive state
                tab.className =
                    'provider-tab px-5 py-2.5 rounded-lg text-[0.9375rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:-translate-y-px';
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
