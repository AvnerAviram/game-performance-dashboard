// Game Analytics UI Module
import { gameData, TOOLTIPS } from '../lib/data.js';
import { VALID_MECHANICS, getMechanicDefinition } from '../config/mechanics.js';
import { initializeCharts, refreshCharts } from './charts-modern.js';
import { analyzeGameSuccessFactors, generateRecommendations, predictFromSimilarGames, getDatasetStats } from '../lib/game-analytics-engine.js';
import { getTheme, getProvider, getPerformance, getSpecs } from '../features/compat.js';
import { 
    getTopPerformers,
    renderComparisonCards
} from '../features/overview-insights.js';
import { 
    PanelSection, 
    MetricGrid, 
    Metric,
    GameListItem,
    GRADIENTS,
    ACCENTS,
    EmptyState
} from '../components/dashboard-components.js';
import { populateThemesFilters, populateMechanicsFilters, populateProvidersFilters, populateGamesFilters } from './filter-dropdowns.js';
import { setupExportButtons as setupExportButtonsBase } from './ui-export.js';
import { getSuggestedIdeas, getTopCombos, getAvoidCombos, getWatchListCombos, getHeatmapData } from '../features/idea-generator.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../lib/sanitize.js';
import { log, warn } from '../lib/env.js';
import { SYMBOL_CATEGORIES, SYMBOL_CAT_COLORS, categorizeSymbol, parseSymbols, aggregateSymbolStats, normalizeSymbolName } from '../lib/symbol-utils.js';

// Store filtered themes and mechanics for search
let filteredThemes = null;
let filteredMechanics = null;
let searchDebounceTimer = null;
let mechanicSearchDebounceTimer = null;

// Load theme breakdowns
let themeBreakdowns = null;
(async function loadThemeBreakdowns() {
    try {
        const response = await fetch('./src/config/theme-breakdowns.json');
        const data = await response.json();
        themeBreakdowns = data.themes;
        log('✅ Theme breakdowns loaded:', Object.keys(themeBreakdowns).length, 'themes');
    } catch (error) {
        console.error('Failed to load theme breakdowns:', error);
    }
})();

/**
 * Wraps a list of HTML items with a "Show more" / "Show less" toggle.
 * Uses a global handler to avoid inline script issues.
 */
function collapsibleList(listHtml, totalCount, initialShow, containerId) {
    if (totalCount <= initialShow) return listHtml;
    const uid = containerId || ('cl-' + Math.random().toString(36).slice(2, 8));
    return `
        <div id="${uid}-wrap">
            <div id="${uid}-items">${listHtml}</div>
            <button id="${uid}-btn" onclick="window._toggleCL('${uid}',${initialShow},${totalCount})" data-expanded="0"
            class="mt-2 w-full text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 cursor-pointer py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                Show all ${totalCount} items
            </button>
        </div>
    `;
}

window._toggleCL = function(uid, initialShow, totalCount) {
    var itemsEl = document.getElementById(uid + '-items');
    var btn = document.getElementById(uid + '-btn');
    if (!itemsEl || !btn) return;
    var items = itemsEl.querySelectorAll('[data-cl-item]');
    var isExpanded = btn.dataset.expanded === '1';
    for (var i = 0; i < items.length; i++) {
        if (i >= initialShow) items[i].style.display = isExpanded ? 'none' : '';
    }
    btn.dataset.expanded = isExpanded ? '0' : '1';
    btn.textContent = isExpanded ? 'Show all ' + totalCount + ' items' : 'Show less';
};

// Mechanic details panel functions
window.showMechanicDetails = function(mechanicName) {
    const mechDef = getMechanicDefinition(mechanicName);
    const mechData = gameData.mechanics.find(m => m.Mechanic === mechanicName);
    
    if (!mechData) {
        console.error('Mechanic data not found:', mechanicName);
        return;
    }
    
    // Populate panel title
    document.getElementById('mechanic-panel-title').textContent = mechanicName;
    
    // Statistics - using MetricGrid component
    const statsMetrics = [
        { label: 'Games', value: mechData['Game Count'] },
        { label: 'Market Share', value: `${mechData['Market Share %'].toFixed(1)}%` },
        { label: 'Avg Theo Win', value: mechData['Avg Theo Win Index'].toFixed(3) },
        { label: 'Total Theo Win', value: `<span class="text-green-600 dark:text-green-400">${mechData['Smart Index'].toFixed(2)}</span>` }
    ];
    
    const description = mechDef?.description || `${mechanicName} is a game feature found in ${mechData['Game Count']} games.`;
    const howItWorks = mechDef?.whatItDoes || '';
    const freqText = mechDef?.frequency || 'Common in modern slot games';
    const usageInfo = mechData['Market Share %'] > 50
        ? ' • Industry standard feature'
        : mechData['Market Share %'] > 10
            ? ' • Popular feature'
            : ' • Specialty feature';
    const frequency = freqText + usageInfo;
    
    // Examples list HTML - use onclick for game details
    let examplesHtml;
    if (mechDef?.examples && mechDef.examples.length > 0) {
        examplesHtml = mechDef.examples.slice(0, 10).map(ex => {
            const gameName = ex.replace(/\s*\([^)]*\)$/, '').trim();
            return `<li class="py-1.5 leading-relaxed cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showGameDetails', gameName)}">${escapeHtml(ex)}</li>`;
        }).join('');
    } else {
        examplesHtml = '<li class="py-1.5 mechanic-panel-body">No examples available</li>';
    }
    
    // Get ALL games that have this mechanic
    const allMechGames = gameData.allGames.filter(g => {
        let feats = g.features;
        if (typeof feats === 'string') { try { feats = JSON.parse(feats); } catch(e) { feats = []; } }
        if (!Array.isArray(feats)) feats = [];
        return feats.includes(mechanicName);
    }).sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
    
    const INITIAL_SHOW = 5;
    const topGamesItems = allMechGames.map((game, i) => {
        const hidden = i >= INITIAL_SHOW ? ' style="display:none"' : '';
        return `<div data-cl-item${hidden}>${GameListItem(game)}</div>`;
    }).join('');
    
    let topGamesHtml;
    if (allMechGames.length > 0) {
        topGamesHtml = collapsibleList(topGamesItems, allMechGames.length, INITIAL_SHOW, 'mech-games');
    } else {
        topGamesHtml = EmptyState('No games found for this mechanic');
    }
    
    // Build panel using PanelSection
    const mechPanelContent = document.getElementById('mechanic-panel-content');
    let mechHtml = '';
    mechHtml += PanelSection({ title: 'Statistics', icon: '📊', gradient: GRADIENTS.performance, accent: ACCENTS.performance, content: MetricGrid(statsMetrics) });
    const descContent = `
        <div class="space-y-3">
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${description}</p>
            ${howItWorks ? `
                <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1">How It Works</div>
                    <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${howItWorks}</p>
                </div>
            ` : ''}
            <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                <span>${frequency}</span>
            </div>
        </div>
    `;
    mechHtml += PanelSection({ title: 'About', icon: '📝', gradient: GRADIENTS.specs, accent: ACCENTS.specs, content: descContent });
    mechHtml += PanelSection({ title: `Top Games (${allMechGames.length})`, icon: '🏆', gradient: GRADIENTS.similar, accent: ACCENTS.similar, content: `<div class="space-y-0">${topGamesHtml}</div>` });
    mechPanelContent.innerHTML = mechHtml;
    
    // Close any other open panel first, then show this one
    window.closeAllPanels();
    const panel = document.getElementById('mechanic-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    panel.scrollTop = 0;
    
    panel.style.right = '0px';
    backdrop.classList.remove('hidden');
    backdrop.classList.add('block');
    document.body.style.overflow = 'hidden';
};

window.closeMechanicPanel = function() {
    // TAILWIND: Hide panel (slide out)
    const panel = document.getElementById('mechanic-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    
    panel.style.right = '-650px'; // Slide out
    backdrop.classList.add('hidden');
    backdrop.classList.remove('block');
    document.body.style.overflow = ''; // Restore scrolling
};

// Close ALL open panels (used before opening a new one)
window.closeAllPanels = function() {
    const panels = ['mechanic-panel', 'theme-panel', 'game-panel', 'provider-panel'];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.right = '-650px';
    });
    const backdrop = document.getElementById('mechanic-backdrop');
    if (backdrop) {
        backdrop.classList.add('hidden');
        backdrop.classList.remove('block');
    }
    document.body.style.overflow = '';
};

// Close any open panel (for backdrop click)
window.closeAnyPanel = function() {
    window.closeAllPanels();
};

// Theme details panel functions
window.showThemeDetails = function(themeName) {
    log('🎨 Opening theme panel for:', themeName);
    log('📊 Available themes:', gameData.themes?.length || 0);
    log('📚 Theme breakdowns loaded:', themeBreakdowns ? Object.keys(themeBreakdowns).length : 0);
    
    let dashboardTheme = gameData.themes.find(t => t.Theme === themeName);
    let themeData = themeBreakdowns?.[themeName];
    
    log('🔍 Dashboard theme found:', !!dashboardTheme);
    log('🔍 Theme data found:', !!themeData);
    
    // Try alternate theme name formats if not found
    if (!themeData && themeBreakdowns) {
        // Try with space instead of slash
        const altName1 = themeName.replace(/\//g, ' ');
        // Try with slash instead of space
        const altName2 = themeName.replace(/ /g, '/');
        // Try "Fire/Volcano" → "Fire/Volcanic" (common variation)
        const altName3 = themeName.replace('Volcano', 'Volcanic');
        const altName4 = themeName.replace('Volcanic', 'Volcano');
        
        themeData = themeBreakdowns[themeName] || 
                   themeBreakdowns[altName1] || 
                   themeBreakdowns[altName2] ||
                   themeBreakdowns[altName3] ||
                   themeBreakdowns[altName4];
        
        log(`📝 Theme "${themeName}" - trying alternates:`, 
                   altName1, altName2, altName3, altName4, 
                   themeData ? 'FOUND ✅' : 'NOT FOUND ❌');
    }
    
    // Check if this is a consolidated theme
    if (dashboardTheme && dashboardTheme._isUnified && dashboardTheme._subthemes) {
        const subThemeEntries = Object.entries(dashboardTheme._subthemes)
            .map(([name, data]) => ({
                theme: name,
                count: data?.['Game Count'] || data?.game_count || 0
            }))
            .filter(st => st.count > 0)
            .sort((a, b) => b.count - a.count);
        themeData = {
            description: `Consolidated category encompassing ${Object.keys(dashboardTheme._subthemes).join(', ')}`,
            top_sub_themes: subThemeEntries,
            games: dashboardTheme._games || []
        };
    }
    
    // If not found in main themes, look for it in sub-themes of unified themes
    if (!dashboardTheme) {
        for (const theme of gameData.themes) {
            if (theme._isUnified && theme._subthemes && theme._subthemes[themeName]) {
                dashboardTheme = theme._subthemes[themeName];
                // Try to find breakdown data again
                if (!themeData && themeBreakdowns) {
                    const altName1 = themeName.replace(/\//g, ' ');
                    const altName2 = themeName.replace(/ /g, '/');
                    themeData = themeBreakdowns[themeName] || themeBreakdowns[altName1] || themeBreakdowns[altName2];
                }
                break;
            }
        }
    }
    
    if (!dashboardTheme) {
        console.error('Theme not found in dashboard data:', themeName);
        return;
    }
    
    // If still no breakdown data, create minimal fallback
    if (!themeData) {
        warn('Theme breakdown not found, using fallback for:', themeName);
        themeData = {
            name: themeName,
            description: `${themeName} themed slot games`,
            game_count: dashboardTheme['Game Count'] || 0,
            avg_theo_win: dashboardTheme['Avg Theo Win Index'] || 0,
            smart_index: dashboardTheme['Smart Index'] || 0,
            market_share: dashboardTheme['Market Share %'] || 0,
            top_games: dashboardTheme._games || []
        };
    }
    
    // Populate panel
    document.getElementById('theme-panel-title').textContent = themeName;
    
    // Statistics - using MetricGrid component
    const themeStatsMetrics = [
        { label: 'Games', value: dashboardTheme['Game Count'] },
        { label: 'Market Share', value: `${dashboardTheme['Market Share %'].toFixed(1)}%` },
        { label: 'Avg Theo Win', value: dashboardTheme['Avg Theo Win Index'].toFixed(3) },
        { label: 'Total Theo Win', value: dashboardTheme['Smart Index'].toFixed(2) }
    ];
    
    // Compute sub-themes from game data if not available
    if (!themeData.top_sub_themes || themeData.top_sub_themes.length === 0) {
        const themeGamesForSub = gameData.allGames.filter(g => {
            const consolidated = g.theme_consolidated || g.theme?.consolidated || g.theme?.primary;
            return consolidated === themeName;
        });
        const primaryCounts = {};
        themeGamesForSub.forEach(g => {
            const primary = g.theme_primary || g.theme?.primary || themeName;
            if (primary && primary !== themeName) {
                primaryCounts[primary] = (primaryCounts[primary] || 0) + 1;
            }
        });
        const computed = Object.entries(primaryCounts)
            .map(([theme, count]) => ({ theme, count }))
            .sort((a, b) => b.count - a.count);
        if (computed.length > 0) {
            themeData.top_sub_themes = computed;
        }
    }
    
    // Build panel content using PanelSection
    const panelContent = document.getElementById('theme-panel-content');
    let html = '';
    
    html += PanelSection({ title: 'Statistics', icon: '📊', gradient: GRADIENTS.performance, accent: ACCENTS.performance, content: MetricGrid(themeStatsMetrics) });
    
    if (themeData.top_sub_themes && themeData.top_sub_themes.length > 0) {
        const maxSubCount = Math.max(...themeData.top_sub_themes.map(st => st.count));
        const subHtml = `<div class="space-y-0.5">${themeData.top_sub_themes.map(st => {
            const barW = ((st.count / maxSubCount) * 100).toFixed(0);
            return `<div class="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <span class="text-[13px] font-medium text-gray-800 dark:text-gray-200 w-28 truncate flex-shrink-0">${escapeHtml(st.theme)}</span>
                <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-teal-400 dark:bg-teal-500 rounded-full" style="width:${barW}%"></div></div>
                <span class="text-[11px] text-gray-400 dark:text-gray-500 w-10 text-right flex-shrink-0">${st.count}</span>
            </div>`;
        }).join('')}</div>`;
        html += PanelSection({ title: 'Sub-Theme Breakdown', icon: '🎨', gradient: GRADIENTS.specs, accent: ACCENTS.specs, content: subHtml });
    }
    
    html += PanelSection({ title: 'Popular Symbols', icon: '🎰', gradient: GRADIENTS.stats, accent: ACCENTS.stats, content: '<div id="theme-symbols-breakdown"></div>' });
    html += PanelSection({ title: 'Top Providers', icon: '🏢', gradient: GRADIENTS.category, accent: ACCENTS.category, content: '<div id="theme-top-providers"></div>' });
    html += PanelSection({ title: 'Top Games', icon: '🎮', gradient: GRADIENTS.provider, accent: ACCENTS.provider, content: '<div id="theme-top-games"></div>' });
    
    panelContent.innerHTML = html;
    
    // Top Providers - Calculate from actual games
    const providersDiv = document.getElementById('theme-top-providers');
    const themeGames = gameData.allGames.filter(g => {
        // Support both flat (DuckDB) and nested (JSON) structures
        const primary = g.theme_consolidated || g.theme?.consolidated || g.theme?.primary;
        return primary === themeName;
    });
    
    // Invalid provider names to filter out (data quality issues)
    const invalidProviders = ['Multiple', 'Pattern', 'Unknown', ''];
    
    // Count games by provider
    const providerCounts = {};
    themeGames.forEach(game => {
        const provider = game.provider_studio || game.provider?.studio || 'Unknown';
        // Skip invalid providers
        if (provider && !invalidProviders.includes(provider)) {
            providerCounts[provider] = (providerCounts[provider] || 0) + 1;
        }
    });
    
    const allProviders = Object.entries(providerCounts)
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count);
    
    const PROV_INITIAL = 5;
    if (allProviders.length > 0) {
        const maxProvCount = allProviders[0].count;
        const provItems = allProviders.map((p, i) => {
            const hidden = i >= PROV_INITIAL ? ' style="display:none"' : '';
            const barW = ((p.count / maxProvCount) * 100).toFixed(0);
            return `<div data-cl-item class="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 transition-colors"
                        onclick="${safeOnclick('window.showProviderDetails', p.provider || '')}"${hidden}>
                        <span class="text-[13px] font-medium text-gray-800 dark:text-gray-200 w-28 truncate flex-shrink-0">${escapeHtml(p.provider)}</span>
                        <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-cyan-400 dark:bg-cyan-500 rounded-full" style="width:${barW}%"></div></div>
                        <span class="text-[11px] text-gray-400 dark:text-gray-500 w-10 text-right flex-shrink-0">${p.count}</span>
                    </div>`;
        }).join('');
        providersDiv.innerHTML = collapsibleList(`<div class="space-y-0.5">${provItems}</div>`, allProviders.length, PROV_INITIAL, 'theme-provs');
    } else {
        providersDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-500">No provider data</p>';
    }
    
    // Popular Symbols - aggregate symbols from games in this theme
    const symbolsDiv = document.getElementById('theme-symbols-breakdown');
    if (symbolsDiv) {
        const gamesWithSym = themeGames.filter(g => parseSymbols(g.symbols).length > 0);
        if (gamesWithSym.length > 0) {
            const { catStats, topSymbols } = aggregateSymbolStats(gamesWithSym);
            const activeCats = SYMBOL_CATEGORIES.filter(c => catStats[c].count > 0);
            const maxCatGames = Math.max(...activeCats.map(c => catStats[c].gameCount), 1);
            const catRows = activeCats.map(cat => {
                const st = catStats[cat];
                const col = SYMBOL_CAT_COLORS[cat];
                const pct = (st.gameCount / gamesWithSym.length * 100).toFixed(0);
                const barW = (st.gameCount / maxCatGames * 100).toFixed(0);
                return `<div class="flex items-center gap-2 py-0.5">
                    <span class="w-20 flex-shrink-0"><span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ${col.cls}">${cat}</span></span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full ${col.bar} rounded-full" style="width:${barW}%"></div></div>
                    <span class="text-[10px] text-gray-400 w-8 text-right flex-shrink-0">${pct}%</span>
                </div>`;
            }).join('');
            const topSymChips = topSymbols.slice(0, 10).map(s => {
                const col = SYMBOL_CAT_COLORS[s.cat];
                return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${col.cls} ${col.ring}">${escapeHtml(s.name)} <span class="text-[8px] opacity-60">${s.count}</span></span>`;
            }).join('');
            symbolsDiv.innerHTML = `
                <div class="space-y-2">
                    <div class="space-y-0">${catRows}</div>
                    <div class="pt-1">
                        <div class="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Most Common</div>
                        <div class="flex flex-wrap gap-1">${topSymChips}</div>
                    </div>
                    <div class="text-[9px] text-gray-400">${gamesWithSym.length} of ${themeGames.length} games have symbol data</div>
                </div>`;
        } else {
            symbolsDiv.innerHTML = '<p class="text-[11px] text-gray-400">No symbol data available for this theme</p>';
        }
    }

    // Top Games - All games sorted by performance, with show more
    const topGamesList = document.getElementById('theme-top-games');
    topGamesList.innerHTML = '';
    
    const allTopGames = themeGames
        .sort((a, b) => {
            const aTheo = a.performance_theo_win || a.performance?.theo_win || 0;
            const bTheo = b.performance_theo_win || b.performance?.theo_win || 0;
            return bTheo - aTheo;
        });
    
    const GAMES_INITIAL = 5;
    if (allTopGames.length > 0) {
        const gameItems = allTopGames.map((game, i) => {
            const hidden = i >= GAMES_INITIAL ? ' style="display:none"' : '';
            return `<div data-cl-item${hidden}>${GameListItem(game)}</div>`;
        }).join('');
        topGamesList.innerHTML = collapsibleList(gameItems, allTopGames.length, GAMES_INITIAL, 'theme-games');
    } else {
        topGamesList.innerHTML = '<div class="text-gray-500 dark:text-gray-500">No games available</div>';
    }
    
    // Close any other open panel first, then show this one
    window.closeAllPanels();
    const panel = document.getElementById('theme-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    panel.scrollTop = 0;
    
    panel.style.right = '0px';
    backdrop.classList.remove('hidden');
    backdrop.classList.add('block');
    document.body.style.overflow = 'hidden';
};

window.closeThemePanel = function() {
    // TAILWIND: Hide panel (slide out)
    const panel = document.getElementById('theme-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    
    panel.style.right = '-650px'; // Slide out
    backdrop.classList.add('hidden');
    backdrop.classList.remove('block');
    document.body.style.overflow = ''; // Restore scrolling
};

// Update header stats with actual data
export function updateHeaderStats() {
    const statTotalGames = document.getElementById('stat-total-games');
    const statTotalThemes = document.getElementById('stat-total-themes');
    const statTotalMechanics = document.getElementById('stat-total-mechanics');
    const statClassified = document.getElementById('stat-classified');
    const headerSummary = document.getElementById('header-summary');
    
    if (statTotalGames) {
        statTotalGames.textContent = gameData.total_games.toLocaleString();
    }
    if (statTotalThemes) {
        statTotalThemes.textContent = gameData.theme_count.toLocaleString();
    }
    if (statTotalMechanics) {
        statTotalMechanics.textContent = gameData.mechanic_count;
    }
    if (statClassified) {
        // Calculate classification percentage from actual data
        const classifiedPercentage = ((gameData.total_games / gameData.total_games) * 100).toFixed(2);
        statClassified.textContent = `${classifiedPercentage}%`;
    }
    if (headerSummary) {
        headerSummary.textContent = `Comprehensive analysis of ${gameData.total_games.toLocaleString()} slot games across ${gameData.theme_count.toLocaleString()} themes and ${gameData.mechanic_count} mechanics`;
    }
}

// Render overview page
export function renderOverview() {
    log('📊 renderOverview() called');
    log('  - gameData exists:', !!gameData);
    log('  - gameData.allGames length:', gameData?.allGames?.length || 0);
    
    // Check if elements exist before accessing
    const gamesEl = document.getElementById('overview-total-games');
    const themesEl = document.getElementById('overview-total-themes');
    const mechanicsEl = document.getElementById('overview-total-mechanics');
    
    log('  - overview-total-games element:', !!gamesEl);
    log('  - overview-total-themes element:', !!themesEl);
    log('  - overview-total-mechanics element:', !!mechanicsEl);
    
    if (!gamesEl) {
        console.error('❌ MISSING ELEMENT: overview-total-games');
        console.error('  - All elements with id in page:', Array.from(document.querySelectorAll('[id]')).map(el => el.id).slice(0, 20).join(', '));
        throw new Error('Missing element: overview-total-games - HTML and JavaScript are out of sync!');
    }
    
    // Populate stat cards
    gamesEl.textContent = gameData.allGames.length;
    themesEl.textContent = gameData.themes.length;
    mechanicsEl.textContent = gameData.mechanics.length;
    
    // Count unique providers
    const providersEl = document.getElementById('overview-total-providers');
    if (providersEl) {
        const uniqueProviders = new Set(gameData.allGames.map(g => g.provider_studio).filter(Boolean));
        providersEl.textContent = uniqueProviders.size;
    }
    
    log('  ✅ Stats updated:', {
        games: gameData.allGames.length,
        themes: gameData.themes.length,
        mechanics: gameData.mechanics.length
    });
    
    // Calculate and render comparison cards
    const performers = getTopPerformers(gameData.allGames, gameData.themes, gameData.mechanics);
    const comparisonEl = document.getElementById('comparison-cards');
    if (comparisonEl) {
        comparisonEl.innerHTML = renderComparisonCards(performers);
    }
    
    log('  ✅ Comparison cards rendered:', {
        bestTheme: performers.bestTheme?.name || 'None',
        bestMechanic: performers.bestMechanic?.name || 'None',
        bestProvider: performers.bestProvider?.name || 'None'
    });
    
    // Render Top Themes as cards (matching Top Performers style)
    renderTopThemesCards();
    
    // Render Theme × Feature Heatmap
    try {
        renderThemeFeatureHeatmap();
    } catch (e) {
        console.error('Heatmap rendering failed:', e);
        const heatEl = document.getElementById('theme-feature-heatmap');
        if (heatEl) heatEl.innerHTML = `<p class="text-red-500">Heatmap error: ${e.message}</p>`;
    }
    
    // Render Game Franchises
    try {
        renderGameFranchises();
    } catch (e) {
        console.error('Franchises rendering failed:', e);
    }
}

function renderTopThemesCards() {
    const container = document.getElementById('overview-themes-cards');
    if (!container) return;
    
    const themes = [...(gameData.themes || [])];
    if (!themes.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No theme data</p>';
        return;
    }
    
    const allGames = gameData.allGames || [];
    const currentYear = new Date().getFullYear();
    
    // Enrich themes with year distribution data
    const yearData = {};
    allGames.forEach(g => {
        const t = g.theme_consolidated || '';
        if (!t) return;
        if (!yearData[t]) yearData[t] = { recent: 0, old: 0, total: 0 };
        yearData[t].total++;
        if (g.release_year >= currentYear - 2) yearData[t].recent++;
        if (g.release_year && g.release_year <= currentYear - 5) yearData[t].old++;
    });
    
    themes.forEach(t => {
        const name = t.Theme || t.theme;
        const yd = yearData[name] || { recent: 0, old: 0, total: 0 };
        t._recentPct = yd.total > 0 ? yd.recent / yd.total : 0;
        t._oldPct = yd.total > 0 ? yd.old / yd.total : 0;
        t._avgTheo = t.avg_theo_win || t['Avg Theo Win Index'] || 0;
        t._si = t['Smart Index'] || 0;
        t._gc = t['Game Count'] || t.game_count || 0;
        t._opportunity = t._gc > 0 ? t._avgTheo / Math.sqrt(t._gc + 1) : 0;
    });
    
    const bySmartIndex = [...themes].sort((a, b) => b._si - a._si);
    const best = bySmartIndex[0];
    const worst = bySmartIndex[bySmartIndex.length - 1];
    
    const opportunity = [...themes].filter(t => t._gc <= 20 && t._avgTheo > 1.5 && t !== best)
        .sort((a, b) => b._opportunity - a._opportunity)[0] || bySmartIndex[1];
    
    const rising = [...themes].filter(t => t._gc >= 3 && t !== best && t !== opportunity)
        .sort((a, b) => b._recentPct - a._recentPct)[0] || bySmartIndex[2];
    
    const saturated = [...themes].filter(t => t !== best && t !== worst)
        .sort((a, b) => b._gc - a._gc)[0] || bySmartIndex[3];
    
    const declining = [...themes].filter(t => t._gc >= 3 && t !== worst && t !== saturated)
        .sort((a, b) => b._oldPct - a._oldPct)[0] || bySmartIndex[bySmartIndex.length - 2];
    
    const cards = [
        { theme: best, emoji: '👑', label: 'Best Theme', sub: 'Highest Performance Index',
          bg: 'from-amber-50 to-yellow-50', dbg: 'dark:from-amber-900/20 dark:to-yellow-900/20',
          border: 'border-amber-200 dark:border-amber-800', labelColor: 'text-amber-700 dark:text-amber-400',
          gradient: 'from-amber-600 to-yellow-600', value: best._si.toFixed(2) },
        { theme: opportunity, emoji: '💎', label: 'Best Opportunity', sub: 'High theo, low competition',
          bg: 'from-emerald-50 to-teal-50', dbg: 'dark:from-emerald-900/20 dark:to-teal-900/20',
          border: 'border-emerald-200 dark:border-emerald-800', labelColor: 'text-emerald-700 dark:text-emerald-400',
          gradient: 'from-emerald-600 to-teal-600', value: opportunity._avgTheo.toFixed(2) },
        { theme: rising, emoji: '📈', label: 'Rising Theme', sub: `${Math.round(rising._recentPct * 100)}% games from last 2 yrs`,
          bg: 'from-sky-50 to-blue-50', dbg: 'dark:from-sky-900/20 dark:to-blue-900/20',
          border: 'border-sky-200 dark:border-sky-800', labelColor: 'text-sky-700 dark:text-sky-400',
          gradient: 'from-sky-600 to-blue-600', value: rising._si.toFixed(2) },
        { theme: saturated, emoji: '📦', label: 'Most Saturated', sub: 'Highest number of games',
          bg: 'from-orange-50 to-amber-50', dbg: 'dark:from-orange-900/20 dark:to-amber-900/20',
          border: 'border-orange-200 dark:border-orange-800', labelColor: 'text-orange-700 dark:text-orange-400',
          gradient: 'from-orange-600 to-amber-600', value: saturated._gc.toString() },
        { theme: worst, emoji: '🔻', label: 'Worst Theme', sub: 'Lowest Performance Index',
          bg: 'from-red-50 to-rose-50', dbg: 'dark:from-red-900/20 dark:to-rose-900/20',
          border: 'border-red-200 dark:border-red-800', labelColor: 'text-red-700 dark:text-red-400',
          gradient: 'from-red-600 to-rose-600', value: worst._si.toFixed(2) },
        { theme: declining, emoji: '📉', label: 'Declining Theme', sub: `${Math.round(declining._oldPct * 100)}% games 5+ yrs old`,
          bg: 'from-slate-50 to-gray-50', dbg: 'dark:from-slate-900/20 dark:to-gray-900/20',
          border: 'border-slate-300 dark:border-slate-700', labelColor: 'text-slate-600 dark:text-slate-400',
          gradient: 'from-slate-500 to-gray-500', value: declining._si.toFixed(2) },
    ];
    
    let html = '<div class="grid grid-cols-2 xl:grid-cols-3 gap-3">';
    cards.forEach(c => {
        const name = c.theme.Theme || c.theme.theme;
        html += `
        <div class="bg-gradient-to-br ${c.bg} ${c.dbg} rounded-lg shadow-sm border ${c.border} p-3 hover:shadow-md transition-all cursor-pointer"
             onclick="${safeOnclick('window.showThemeDetails', name)}">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-lg">${c.emoji}</span>
                <div class="text-[10px] font-bold uppercase tracking-wide ${c.labelColor}">${c.label}</div>
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">${escapeHtml(name)}</div>
            <div class="text-xl font-black bg-gradient-to-r ${c.gradient} bg-clip-text text-transparent mb-1">${c.value}</div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400">${c.theme._gc} games · Avg ${c.theme._avgTheo.toFixed(2)}</div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function parseFeatsLocal(val) {
    if (Array.isArray(val)) return val;
    if (!val) return [];
    const s = String(val).trim();
    if (!s || s === 'null') return [];
    try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; }
    catch { return []; }
}

function renderThemeFeatureHeatmap() {
    const container = document.getElementById('theme-feature-heatmap');
    if (!container) return;
    
    const allGames = gameData.allGames || [];
    if (!allGames.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No game data</p>';
        return;
    }
    
    // Group games by theme
    const themeGames = {};
    allGames.forEach(g => {
        const theme = g.theme_consolidated || '';
        if (!theme || /^unknown$/i.test(theme)) return;
        if (!themeGames[theme]) themeGames[theme] = [];
        const feats = parseFeatsLocal(g.features).sort();
        themeGames[theme].push({ name: g.name || 'Unknown', theo: g.performance_theo_win || 0, feats });
    });
    
    // Find best 2-feature and 3-feature combos per theme
    const recipes = [];
    for (const [theme, tg] of Object.entries(themeGames)) {
        if (tg.length < 5) continue;
        const combos = {};
        tg.forEach(g => {
            const f = g.feats;
            for (let i = 0; i < f.length; i++) {
                for (let j = i + 1; j < f.length; j++) {
                    const key2 = [f[i], f[j]].join('|');
                    if (!combos[key2]) combos[key2] = { feats: [f[i], f[j]], count: 0, total: 0 };
                    combos[key2].count++; combos[key2].total += g.theo;
                    for (let k = j + 1; k < f.length; k++) {
                        const key3 = [f[i], f[j], f[k]].join('|');
                        if (!combos[key3]) combos[key3] = { feats: [f[i], f[j], f[k]], count: 0, total: 0 };
                        combos[key3].count++; combos[key3].total += g.theo;
                    }
                }
            }
        });
        
        const ranked = Object.values(combos)
            .filter(c => c.count >= 3)
            .map(c => ({ ...c, avg: c.total / c.count }))
            .sort((a, b) => b.avg - a.avg);
        
        // Find worst combo (lowest avg, 3+ games)
        const worstRanked = [...ranked].sort((a, b) => a.avg - b.avg);
        const worst = worstRanked.find(c => c.count >= 3 && c.avg < ranked[0].avg * 0.6) || worstRanked[0] || null;
        
        if (ranked.length > 0) {
            recipes.push({
                theme, gameCount: tg.length,
                best: ranked[0],
                runner: ranked.find(r => r !== ranked[0] && !ranked[0].feats.every(f => r.feats.includes(f))) || ranked[1] || null,
                worst: worst !== ranked[0] ? worst : null,
            });
        }
    }
    
    // Store all data for explorer
    window._recipeThemeGames = themeGames;
    
    recipes.sort((a, b) => b.best.avg - a.best.avg);
    const top = recipes.slice(0, 10);
    
    if (!top.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">Insufficient data for recipes</p>';
        return;
    }
    
    const maxAvg = Math.max(...top.map(r => r.best.avg));
    
    const featureColors = {
        'Cash On Reels': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        'Expanding Reels': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
        'Free Spins': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        'Hold and Spin': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
        'Nudges': 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
        'Persistence': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
        'Pick Bonus': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
        'Respin': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
        'Static Jackpot': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
        'Wheel': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
        'Wild Reels': 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    };
    const defaultPill = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    
    const shortLabel = {
        'Cash On Reels': 'Cash Reels', 'Expanding Reels': 'Expanding', 'Free Spins': 'Free Spins',
        'Hold and Spin': 'Hold & Spin', 'Static Jackpot': 'Jackpot', 'Wild Reels': 'Wilds',
        'Pick Bonus': 'Pick Bonus', 'Nudges': 'Nudges', 'Persistence': 'Persistence',
        'Respin': 'Respin', 'Wheel': 'Wheel',
    };
    
    function featurePill(feat, size = 'normal') {
        const cls = featureColors[feat] || defaultPill;
        const label = shortLabel[feat] || feat;
        const px = size === 'small' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';
        return `<span class="${px} font-semibold rounded-full ${cls} whitespace-nowrap">${escapeHtml(label)}</span>`;
    }
    
    // Build all themes list for the explorer dropdown
    const allThemeNames = Object.keys(themeGames).sort();
    const CANONICAL = ['Cash On Reels','Expanding Reels','Free Spins','Hold and Spin','Nudges','Persistence','Pick Bonus','Respin','Static Jackpot','Wheel','Wild Reels'];
    
    let html = '';
    
    const topCards = top.slice(0, 8);
    html += '<div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2">';
    
    // Explorer card: spans 2 cols + 2 rows on desktop
    html += `
    <div class="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/30 dark:to-violet-900/30 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 p-4 xl:col-span-2 xl:row-span-2 flex flex-col">
        <div class="flex items-center gap-2 mb-3">
            <span class="text-lg">🧪</span>
            <span class="text-sm font-bold text-indigo-700 dark:text-indigo-300">Recipe Explorer</span>
            <button type="button" onclick="window.clearRecipeFeatures()" class="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors font-medium">Clear</button>
        </div>
        <div class="flex-1 flex flex-col">
            <label class="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-1 block">Theme</label>
            <select id="recipe-explorer-theme" onchange="window.updateRecipeExplorer()" class="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 outline-none mb-3">
                ${allThemeNames.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
            </select>
            <label class="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-1.5 block">Features</label>
            <div class="flex flex-wrap gap-1.5 min-h-[60px]" id="recipe-explorer-features">
                ${CANONICAL.map(f => `<button type="button" data-feat="${escapeHtml(f)}" onclick="window.toggleRecipeFeature(this)" class="recipe-feat-btn shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-indigo-300"><span class="feat-arrow"></span>${escapeHtml(shortLabel[f] || f)}</button>`).join('')}
            </div>
            <div class="mt-2 text-[10px] text-indigo-400 dark:text-indigo-500 flex items-center gap-3">
                <span class="inline-flex items-center gap-0.5"><span class="text-emerald-500">▲</span> improves</span>
                <span class="inline-flex items-center gap-0.5"><span class="text-red-400">▼</span> worsens</span>
            </div>
            <div id="recipe-explorer-result" class="bg-white/70 dark:bg-gray-800/70 rounded-xl p-3 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center mt-3 flex-1 min-h-[100px]">
                <span class="text-xs text-indigo-400 dark:text-indigo-500">Click features to explore</span>
            </div>
        </div>
    </div>`;
    topCards.forEach((r, i) => {
        const barWidth = Math.round((r.best.avg / maxAvg) * 100);
        const isTop3 = i < 3;
        const medals = ['🥇', '🥈', '🥉'];
        const medal = isTop3 ? medals[i] : '';
        const lift = r.worst ? ((r.best.avg - r.worst.avg) / r.worst.avg * 100).toFixed(0) : null;
        
        html += `
        <div class="bg-white dark:bg-gray-800 rounded-xl border ${isTop3 ? 'border-indigo-200/80 dark:border-indigo-700/60 shadow-sm' : 'border-slate-200 dark:border-slate-600'} p-3 hover:shadow-lg transition-all relative overflow-hidden group">
            <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${isTop3 ? 'from-indigo-500 to-violet-500' : 'from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500'}" style="opacity:${0.4 + (barWidth / 100) * 0.6}"></div>
            
            <div class="flex items-center gap-1.5 mb-2">
                ${medal ? `<span class="text-sm">${medal}</span>` : `<span class="text-[9px] font-bold text-gray-400 dark:text-gray-500 w-4 text-center">#${i + 1}</span>`}
                <span class="text-xs font-bold text-gray-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate flex-1"
                      onclick="${safeOnclick('window.showThemeDetails', r.theme)}">${escapeHtml(r.theme)}</span>
                <span class="text-[9px] text-gray-400 dark:text-gray-500 shrink-0">${r.gameCount} games</span>
            </div>
            
            <div class="bg-emerald-50/60 dark:bg-emerald-900/15 rounded-lg p-2 mb-1.5">
                <div class="flex items-center gap-1 mb-1">
                    <span class="text-[8px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold">Best recipe</span>
                    ${lift ? `<span class="ml-auto text-[8px] font-bold text-emerald-600 dark:text-emerald-400">+${lift}%</span>` : ''}
                </div>
                <div class="flex flex-wrap gap-1 mb-1.5">
                    ${r.best.feats.map(f => featurePill(f, 'small')).join('<span class="text-emerald-300 dark:text-emerald-700 text-[9px] font-bold self-center">+</span>')}
                </div>
                <div class="flex items-baseline gap-1.5">
                    <span class="text-base font-black ${isTop3 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-800 dark:text-gray-200'}">${r.best.avg.toFixed(2)}</span>
                    <span class="text-[9px] text-gray-400">avg theo · ${r.best.count} games</span>
                </div>
                <div class="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-indigo-500" style="width:${barWidth}%"></div>
                </div>
            </div>
            
            ${r.worst ? `
            <div class="flex items-center gap-1.5 px-1">
                <span class="text-[8px] text-red-400 dark:text-red-500 font-bold shrink-0">✗ Avoid:</span>
                <div class="flex flex-wrap items-center gap-0.5 flex-1 min-w-0">
                    ${r.worst.feats.map(f => `<span class="text-[8px] text-red-400 dark:text-red-500">${escapeHtml(shortLabel[f] || f)}</span>`).join('<span class="text-gray-300 dark:text-gray-600 text-[7px]">+</span>')}
                </div>
                <span class="text-[9px] font-semibold text-red-400 dark:text-red-500 shrink-0">${r.worst.avg.toFixed(1)}</span>
            </div>` : ''}
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    
    // Rich hover tooltip for feature buttons showing game names
    let recipeTooltip = document.getElementById('recipe-feat-tooltip');
    if (!recipeTooltip) {
        recipeTooltip = document.createElement('div');
        recipeTooltip.id = 'recipe-feat-tooltip';
        recipeTooltip.className = 'fixed z-[9999] pointer-events-none opacity-0 transition-opacity duration-150';
        recipeTooltip.style.display = 'none';
        document.body.appendChild(recipeTooltip);
    }
    const featBtnsContainer = document.getElementById('recipe-explorer-features');
    if (featBtnsContainer) {
        featBtnsContainer.addEventListener('mouseenter', (e) => {
            const btn = e.target.closest('.recipe-feat-btn');
            if (!btn) return;
            const feat = btn.dataset.feat;
            const theme = document.getElementById('recipe-explorer-theme')?.value;
            const tg = window._recipeThemeGames?.[theme] || [];
            const selected = [...(window._recipeSelectedFeatures || [])];
            const pool = selected.length > 0 ? tg.filter(g => selected.every(f => g.feats.includes(f))) : tg;
            const matching = pool.filter(g => g.feats.includes(feat))
                .sort((a, b) => b.theo - a.theo);
            if (!matching.length) {
                recipeTooltip.style.display = 'none';
                return;
            }
            const showMax = 8;
            const gameList = matching.slice(0, showMax)
                .map(g => `<div class="flex items-center justify-between gap-3"><span class="truncate">${escapeHtml(g.name)}</span><span class="text-gray-400 shrink-0">${g.theo.toFixed(1)}</span></div>`)
                .join('');
            const more = matching.length > showMax ? `<div class="text-gray-500 text-center mt-1">+${matching.length - showMax} more</div>` : '';
            recipeTooltip.innerHTML = `
                <div class="bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700 px-4 py-3 min-w-[200px] max-w-[300px]">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">${escapeHtml(feat)}</div>
                    <div class="text-[10px] text-gray-400 mb-2">${matching.length} games in ${escapeHtml(theme)}</div>
                    <div class="flex items-center justify-between text-[9px] text-gray-500 uppercase tracking-wider font-bold mb-1"><span>Game</span><span>Theo</span></div>
                    <div class="space-y-1 text-[11px]">${gameList}</div>
                    ${more}
                </div>
            `;
            recipeTooltip.style.display = 'block';
            requestAnimationFrame(() => recipeTooltip.style.opacity = '1');
            const rect = btn.getBoundingClientRect();
            const ttRect = recipeTooltip.getBoundingClientRect();
            let left = rect.left + rect.width / 2 - ttRect.width / 2;
            let top = rect.bottom + 8;
            if (top + ttRect.height > window.innerHeight - 8) top = rect.top - ttRect.height - 8;
            if (left < 8) left = 8;
            if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
            recipeTooltip.style.left = left + 'px';
            recipeTooltip.style.top = top + 'px';
        }, true);
        featBtnsContainer.addEventListener('mouseleave', (e) => {
            const btn = e.target.closest('.recipe-feat-btn');
            if (!btn) return;
            recipeTooltip.style.opacity = '0';
            setTimeout(() => { if (recipeTooltip.style.opacity === '0') recipeTooltip.style.display = 'none'; }, 150);
        }, true);
    }
    
    // Setup interactive explorer with predictive coloring
    window._recipeSelectedFeatures = new Set();
    
    window.clearRecipeFeatures = function() {
        window._recipeSelectedFeatures.clear();
        document.querySelectorAll('.recipe-feat-btn').forEach(btn => {
            btn.className = 'recipe-feat-btn shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-indigo-300';
            btn.style.background = '';
            btn.title = '';
            const arrow = btn.querySelector('.feat-arrow');
            if (arrow) arrow.textContent = '';
        });
        const resultEl = document.getElementById('recipe-explorer-result');
        if (resultEl) resultEl.innerHTML = '<span class="text-xs text-indigo-400 dark:text-indigo-500">Click features to explore</span>';
    };
    
    window.toggleRecipeFeature = function(btn) {
        const feat = btn.dataset.feat;
        if (window._recipeSelectedFeatures.has(feat)) {
            window._recipeSelectedFeatures.delete(feat);
        } else {
            window._recipeSelectedFeatures.add(feat);
        }
        window.updateRecipeExplorer();
    };
    
    window.updateRecipeExplorer = function() {
        const resultDiv = document.getElementById('recipe-explorer-result');
        if (!resultDiv) return;
        
        const theme = document.getElementById('recipe-explorer-theme')?.value;
        const selected = [...window._recipeSelectedFeatures].sort();
        const tg = window._recipeThemeGames?.[theme] || [];
        const themeAvg = tg.length > 0 ? tg.reduce((s, g) => s + g.theo, 0) / tg.length : 0;
        
        // Compute impact of adding each unselected feature (and current combo avg)
        let currentAvg = null;
        let currentMatching = [];
        if (selected.length >= 1 && tg.length > 0) {
            currentMatching = tg.filter(g => selected.every(f => g.feats.includes(f)));
            if (currentMatching.length > 0) {
                currentAvg = currentMatching.reduce((s, g) => s + g.theo, 0) / currentMatching.length;
            }
        }
        
        // Color feature buttons: compare games WITH feature vs WITHOUT within theme
        const allBtns = document.querySelectorAll('#recipe-explorer-features .recipe-feat-btn');
        allBtns.forEach(btn => {
            const feat = btn.dataset.feat;
            const isSelected = window._recipeSelectedFeatures.has(feat);
            const arrow = btn.querySelector('.feat-arrow');
            const neutralClass = 'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-indigo-300';
            
            if (isSelected) {
                btn.className = 'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-indigo-500 dark:border-indigo-400 text-white bg-indigo-500 dark:bg-indigo-600 shadow-sm';
                btn.style.background = '';
                btn.title = 'Selected (click to remove)';
                if (arrow) arrow.textContent = '✓ ';
                return;
            }
            
            if (tg.length < 2) {
                btn.className = neutralClass; btn.style.background = ''; btn.title = ''; if (arrow) arrow.textContent = '';
                return;
            }
            
            // Split theme games into those WITH and WITHOUT this feature
            const pool = selected.length > 0 ? tg.filter(g => selected.every(f => g.feats.includes(f))) : tg;
            const hasFeat = pool.filter(g => g.feats.includes(feat));
            const noFeat = pool.filter(g => !g.feats.includes(feat));
            
            if (hasFeat.length === 0 || noFeat.length === 0) {
                btn.className = 'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-gray-100 dark:border-gray-700 text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-900';
                btn.style.background = '';
                btn.title = hasFeat.length === 0 ? 'No games with this feature' : 'All games have this feature';
                if (arrow) arrow.textContent = '';
                return;
            }
            
            const avgWith = hasFeat.reduce((s, g) => s + g.theo, 0) / hasFeat.length;
            const avgWithout = noFeat.reduce((s, g) => s + g.theo, 0) / noFeat.length;
            const pctChange = avgWithout > 0 ? ((avgWith - avgWithout) / avgWithout) * 100 : 0;
            
            if (avgWith > avgWithout) {
                const intensity = Math.min(1, Math.abs(pctChange) / 40);
                btn.className = 'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-emerald-400 dark:border-emerald-500 text-emerald-800 dark:text-emerald-200 shadow-sm';
                btn.style.background = `rgba(16,185,129,${0.08 + intensity * 0.3})`;
                btn.title = `▲ +${pctChange.toFixed(0)}% better (${avgWith.toFixed(1)} vs ${avgWithout.toFixed(1)}, ${hasFeat.length} games)`;
                if (arrow) arrow.textContent = '▲ ';
            } else if (avgWith < avgWithout) {
                const intensity = Math.min(1, Math.abs(pctChange) / 40);
                btn.className = 'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-red-300 dark:border-red-500 text-red-700 dark:text-red-300 shadow-sm';
                btn.style.background = `rgba(239,68,68,${0.06 + intensity * 0.25})`;
                btn.title = `▼ ${pctChange.toFixed(0)}% worse (${avgWith.toFixed(1)} vs ${avgWithout.toFixed(1)}, ${hasFeat.length} games)`;
                if (arrow) arrow.textContent = '▼ ';
            } else {
                btn.className = neutralClass;
                btn.style.background = '';
                btn.title = `~same (${avgWith.toFixed(1)} avg, ${hasFeat.length} games)`;
                if (arrow) arrow.textContent = '';
            }
        });
        
        // Update result panel
        if (selected.length === 0) {
            resultDiv.innerHTML = '<span class="text-xs text-indigo-400 dark:text-indigo-500">Click features to start exploring</span>';
            return;
        }
        
        if (selected.length === 1) {
            const singleMatching = tg.filter(g => g.feats.includes(selected[0]));
            if (singleMatching.length === 0) {
                resultDiv.innerHTML = `<div class="text-center"><div class="text-[10px] text-gray-400">No ${escapeHtml(theme)} games with ${escapeHtml(selected[0])}</div><div class="text-[10px] text-indigo-400 mt-1">Add more features — green = improves, red = worsens</div></div>`;
            } else {
                const avg = singleMatching.reduce((s, g) => s + g.theo, 0) / singleMatching.length;
                resultDiv.innerHTML = `<div class="text-center"><div class="text-lg font-black text-gray-800 dark:text-gray-200">${avg.toFixed(2)}</div><div class="text-[10px] text-gray-400">${singleMatching.length} games · Pick more features</div><div class="text-[10px] text-indigo-400 mt-1">Green buttons = improves · Red = worsens</div></div>`;
            }
            return;
        }
        
        if (!tg.length) {
            resultDiv.innerHTML = '<span class="text-xs text-gray-400">No games for this theme</span>';
            return;
        }
        
        const matching = tg.filter(g => selected.every(f => g.feats.includes(f)));
        
        if (matching.length === 0) {
            resultDiv.innerHTML = `
                <div class="text-center">
                    <div class="text-2xl mb-1">🚫</div>
                    <div class="text-xs font-semibold text-gray-600 dark:text-gray-400">No games found</div>
                    <div class="text-[10px] text-gray-400 dark:text-gray-500">No ${escapeHtml(theme)} games have this combo</div>
                </div>`;
            return;
        }
        
        const avgTheo = matching.reduce((s, g) => s + g.theo, 0) / matching.length;
        const pct = themeAvg > 0 ? ((avgTheo / themeAvg - 1) * 100) : 0;
        const isGood = avgTheo > themeAvg;
        const sortedMatching = [...matching].sort((a, b) => b.theo - a.theo);
        const showGames = sortedMatching.slice(0, 4);
        const moreCount = sortedMatching.length - showGames.length;
        
        resultDiv.innerHTML = `
            <div class="w-full">
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-2xl">${isGood ? '✅' : '⚠️'}</span>
                    <div>
                        <div class="text-xl font-black ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">${avgTheo.toFixed(2)}</div>
                        <div class="text-[10px] text-gray-500 dark:text-gray-400">${matching.length} games match</div>
                    </div>
                    <div class="ml-auto text-right">
                        <div class="text-base font-bold ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%</div>
                        <div class="text-[10px] text-gray-400">vs theme avg (${themeAvg.toFixed(2)})</div>
                    </div>
                </div>
                <div class="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div class="h-full rounded-full transition-all ${isGood ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-red-300 to-red-400'}" style="width:${Math.min(100, Math.max(5, (avgTheo / (themeAvg * 2)) * 100))}%"></div>
                </div>
                <div class="text-[10px] mt-1.5 ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} font-medium">${isGood ? '▲ Outperforms theme average — recommended combo' : '▼ Underperforms theme average — consider alternatives'}</div>
                <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1"><span>Games with this recipe</span><span>Theo</span></div>
                    ${showGames.map(g => `<div class="flex items-center justify-between text-[10px] py-0.5"><span class="truncate text-gray-700 dark:text-gray-300 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400" onclick="${safeOnclick('window.showGameDetails', g.name)}">${escapeHtml(g.name)}</span><span class="text-gray-400 shrink-0 ml-2">${g.theo.toFixed(1)}</span></div>`).join('')}
                    ${moreCount > 0 ? `<div class="text-[9px] text-gray-400 mt-0.5">+${moreCount} more games</div>` : ''}
                </div>
            </div>`;
    };
}

function renderGameFranchises() {
    const container = document.getElementById('game-franchises');
    if (!container) return;
    
    const games = gameData.allGames || [];
    
    // Normalize name for matching: strip apostrophes, lower-case, collapse spaces
    const norm = s => (s || '').replace(/[''`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Build franchise families using longest common prefix matching
    const nameList = games.map(g => ({ game: g, norm: norm(g.name), words: norm(g.name).split(' ') }));
    
    // For each pair of games, find the longest word prefix they share (min 2 words)
    const prefixMap = {};
    for (let i = 0; i < nameList.length; i++) {
        for (let j = i + 1; j < nameList.length; j++) {
            const a = nameList[i].words, b = nameList[j].words;
            let shared = 0;
            while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
            if (shared >= 2) {
                const prefix = a.slice(0, shared).join(' ');
                if (!prefixMap[prefix]) prefixMap[prefix] = new Set();
                prefixMap[prefix].add(i);
                prefixMap[prefix].add(j);
            }
        }
    }
    
    // Merge overlapping prefixes: if "rakin bacon" has games A,B,C,D and
    // "rakin bacon jackpots" has B,C, keep the longer prefix's games under the shorter one
    const prefixes = Object.entries(prefixMap)
        .map(([p, s]) => ({ prefix: p, indices: s }))
        .sort((a, b) => a.prefix.length - b.prefix.length);
    
    const assigned = new Set();
    const families = {};
    
    // Process from longest prefix to shortest
    for (let i = prefixes.length - 1; i >= 0; i--) {
        const { prefix, indices } = prefixes[i];
        // Find the shortest prefix that contains all these indices
        const unassigned = [...indices].filter(idx => !assigned.has(idx));
        if (unassigned.length < 2) continue;
        
        // Find if a shorter prefix already covers some of these
        let bestPrefix = prefix;
        for (let j = 0; j < i; j++) {
            if (prefix.startsWith(prefixes[j].prefix + ' ') || prefix === prefixes[j].prefix) {
                // Shorter prefix exists — add our games to it instead
                unassigned.forEach(idx => prefixes[j].indices.add(idx));
                bestPrefix = null;
                break;
            }
        }
        
        if (bestPrefix) {
            if (!families[bestPrefix]) families[bestPrefix] = new Set();
            unassigned.forEach(idx => { families[bestPrefix].add(idx); assigned.add(idx); });
        }
    }
    
    // Also add remaining prefixes
    for (const { prefix, indices } of prefixes) {
        if (families[prefix]) continue;
        const unassigned = [...indices].filter(idx => !assigned.has(idx));
        if (unassigned.length >= 2) {
            families[prefix] = new Set(unassigned);
            unassigned.forEach(idx => assigned.add(idx));
        } else if (indices.size >= 2) {
            // All assigned to a longer prefix, merge into the shortest matching family
            const existing = Object.keys(families).find(f => prefix.startsWith(f + ' ') || prefix.startsWith(f));
            if (existing) {
                indices.forEach(idx => families[existing].add(idx));
            } else {
                families[prefix] = indices;
                indices.forEach(idx => assigned.add(idx));
            }
        }
    }
    
    const multis = Object.entries(families)
        .filter(([, idxSet]) => idxSet.size >= 2)
        .map(([prefix, idxSet]) => {
            const gs = [...idxSet].map(i => nameList[i].game);
            const totalTheo = gs.reduce((s, g) => s + (g.performance_theo_win || g.theo_win || 0), 0);
            const avgTheo = totalTheo / gs.length;
            const totalShare = gs.reduce((s, g) => s + (g.performance_market_share_percent || g.market_share_pct || 0), 0);
            const providers = [...new Set(gs.map(g => g.provider_studio).filter(Boolean))];
            // Use the most common casing from actual game names for the display name
            const base = gs[0].name.split(/\s+/).slice(0, prefix.split(' ').length).join(' ');
            return { base, games: gs, count: gs.length, avgTheo, totalShare, providers };
        })
        .sort((a, b) => b.totalShare - a.totalShare)
        .slice(0, 10);
    
    if (!multis.length) {
        container.innerHTML = '<p class="text-gray-400 dark:text-gray-500">No game franchises detected</p>';
        return;
    }
    
    let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    multis.forEach((fam, i) => {
        const topGame = fam.games.sort((a, b) => (b.performance_theo_win || b.theo_win || 0) - (a.performance_theo_win || a.theo_win || 0))[0];
        const providerLabel = fam.providers.length === 1
            ? fam.providers[0]
            : fam.providers.length <= 3
                ? fam.providers.join(', ')
                : fam.providers.slice(0, 2).join(', ') + ` +${fam.providers.length - 2}`;
        html += `
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-600 p-4 hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between mb-2">
                <div>
                    <h4 class="font-bold text-gray-900 dark:text-white text-sm">${escapeHtml(fam.base)}</h4>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${fam.count} titles • ${fam.totalShare.toFixed(2)}% market share</p>
                </div>
                <span class="px-2 py-1 text-xs font-bold rounded-full ${i < 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}">#${i + 1}</span>
            </div>
            <div class="flex items-center gap-2 mb-1">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    ${escapeHtml(providerLabel)}
                </span>
            </div>
            <div class="flex gap-3 text-xs">
                <span class="text-amber-600 dark:text-amber-400 font-semibold">Avg Theo: ${fam.avgTheo.toFixed(2)}</span>
                <span class="text-gray-400">|</span>
                <span class="text-gray-600 dark:text-gray-400">Best: ${escapeHtml(topGame.name)}</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-1">
                ${fam.games.slice(0, 5).map(g => `<span class="px-2 py-0.5 text-[10px] rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors" onclick="${safeOnclick('window.showGameDetails', g.name)}">${escapeHtml(g.name)}</span>`).join('')}
                ${fam.games.length > 5 ? `<span class="px-2 py-0.5 text-[10px] rounded bg-gray-50 dark:bg-gray-600 text-gray-400 dark:text-gray-400">+${fam.games.length - 5} more</span>` : ''}
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

// Render all themes (with optional filtering)
export function renderThemes(themesToRender = null) {
    const tbody = document.querySelector('#themes-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const allThemes = themesToRender || gameData.themes;
    
    // Sync pagination from window (e.g. when filters reset to page 1)
    if (typeof window !== 'undefined' && window.themesCurrentPage !== undefined) {
        themesCurrentPage = window.themesCurrentPage;
    }
    
    // Apply pagination
    const startIndex = (themesCurrentPage - 1) * themesPerPage;
    const endIndex = startIndex + themesPerPage;
    const themes = allThemes.slice(startIndex, endIndex);
    
    // Update pagination info
    updateThemesPaginationInfo(allThemes.length, startIndex, endIndex);
    
    const maxSI = Math.max(...allThemes.map(t => t['Smart Index'] || 0), 1);
    const maxGC = Math.max(...allThemes.map(t => t['Game Count'] || 0), 1);
    const maxMS = Math.max(...allThemes.map(t => t['Market Share %'] || 0), 0.01);
    const avgSI = allThemes.reduce((s, t) => s + (t['Smart Index'] || 0), 0) / (allThemes.length || 1);
    
    themes.forEach((theme, index) => {
        const globalIndex = startIndex + index;
        const si = theme['Smart Index'] || 0;
        const gc = theme['Game Count'] || 0;
        const ms = theme['Market Share %'] ?? 0;
        const barW = Math.max(4, (si / maxSI) * 100);
        const gcBarW = Math.max(4, (gc / maxGC) * 100);
        const msBarW = Math.max(2, (ms / maxMS) * 100);
        const isAboveAvg = si >= avgSI;
        const medal = globalIndex === 0 ? '<span class="mr-1">🥇</span>' : globalIndex === 1 ? '<span class="mr-1">🥈</span>' : globalIndex === 2 ? '<span class="mr-1">🥉</span>' : '';
        const rankBg = globalIndex < 3 ? 'bg-indigo-50 dark:bg-indigo-900/20' : '';
        
        const isUnified = theme._isUnified && theme._subthemes && Object.keys(theme._subthemes).length > 0;
        const expandIcon = isUnified ? '<span class="expand-icon">▶</span> ' : '';
        const themeName = theme.Theme;
        const themeNameEscaped = escapeAttr(themeName);
        
        const row = tbody.insertRow();
        row.className = `theme-row group hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all duration-150 ${rankBg}`;
        row.dataset.themeIndex = globalIndex;
        
        row.innerHTML = `
            <td class="px-4 py-3.5 text-sm font-medium text-gray-400 dark:text-gray-500 w-16">${medal}${globalIndex + 1}</td>
            <td class="px-4 py-3.5">
                ${isUnified ? `<span class="unified-theme-name cursor-pointer font-semibold text-gray-900 dark:text-white" onclick="toggleSubThemes(${globalIndex})">${expandIcon}${themeName}</span>` : `<span class="theme-link cursor-pointer font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" data-theme="${themeNameEscaped}">${themeName}</span>`}
            </td>
            <td class="px-4 py-3.5 w-36">
                <div class="flex items-center gap-2">
                    <span class="text-sm tabular-nums text-gray-700 dark:text-gray-300 w-8 text-right">${gc}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-gray-400 dark:bg-gray-500 transition-all" style="width:${gcBarW}%"></div></div>
                </div>
            </td>
            <td class="px-4 py-3.5 w-56">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold tabular-nums ${isAboveAvg ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}">${si.toFixed(2)}</span>
                    <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all ${isAboveAvg ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-500 dark:to-gray-600'}" style="width:${barW}%"></div></div>
                    <span class="text-[10px] ${isAboveAvg ? 'text-emerald-500' : 'text-gray-400'}">${isAboveAvg ? '▲' : '▼'}</span>
                </div>
            </td>
            <td class="px-4 py-3.5 w-36">
                <div class="flex items-center gap-2">
                    <span class="text-sm tabular-nums text-gray-600 dark:text-gray-400 w-12 text-right">${ms.toFixed(2)}%</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-blue-400 dark:bg-blue-500 transition-all" style="width:${msBarW}%"></div></div>
                </div>
            </td>
        `;
        
        if (isUnified) {
            const subThemes = Object.values(theme._subthemes);
            const parentThemeName = theme.Theme;
            subThemes.forEach((subTheme) => {
                const subRow = tbody.insertRow();
                subRow.className = `sub-theme-row sub-theme-${index} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`;
                subRow.style.display = 'none';
                const subThemeName = subTheme.Theme;
                const subThemeNameEscaped = escapeAttr(subThemeName);
                
                let displayName = subThemeName;
                if (parentThemeName === 'Asian' && !subThemeName.startsWith('Asian')) {
                    displayName = `Asian/${subThemeName}`;
                } else if (parentThemeName === 'Ancient Civilizations' && !subThemeName.includes('Ancient')) {
                    displayName = subThemeName.replace('Greek/', 'Ancient/Greek ');
                }
                
                const subSI = subTheme['Smart Index'] || 0;
                const subIsAbove = subSI >= avgSI;
                const subBarW = Math.max(4, (subSI / maxSI) * 100);
                const subMS = subTheme['Market Share %'] ?? 0;
                
                subRow.innerHTML = `
                    <td class="px-4 py-2.5"></td>
                    <td class="px-4 py-2.5 pl-12">
                        <span class="theme-link cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" data-theme="${subThemeNameEscaped}">
                            └ ${displayName}
                        </span>
                    </td>
                    <td class="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">${subTheme['Game Count']}</td>
                    <td class="px-4 py-2.5">
                        <div class="flex items-center gap-2">
                            <span class="text-sm tabular-nums ${subIsAbove ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}">${subSI.toFixed(2)}</span>
                            <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all ${subIsAbove ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-gray-600'}" style="width:${subBarW}%"></div></div>
                        </div>
                    </td>
                    <td class="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">${subMS.toFixed(2)}%</td>
                `;
            });
        }
    });
    
    // Update count in header
    const countSpan = document.getElementById('themes-count');
    if (countSpan) {
        countSpan.textContent = allThemes.length;
    }
    
    // Add click handlers to theme links
    document.querySelectorAll('.theme-link').forEach(link => {
        link.addEventListener('click', function() {
            const themeName = this.dataset.theme;
            showThemeDetails(themeName);
        });
    });
}

// Toggle sub-themes expansion
window.toggleSubThemes = function(index) {
    const subRows = document.querySelectorAll(`.sub-theme-${index}`);
    const expandIcon = document.querySelector(`[data-theme-index="${index}"] .expand-icon`);
    
    const isExpanded = subRows[0]?.style.display !== 'none';
    
    subRows.forEach(row => {
        row.style.display = isExpanded ? 'none' : 'table-row';
    });
    
    if (expandIcon) {
        expandIcon.textContent = isExpanded ? '▶' : '▼';
    }
};

// Switch ranking formula for themes
window.switchRankingFormula = function(formulaType) {
    log('🔄 Switching themes to formula:', formulaType);
    
    // Update button states
    document.querySelectorAll('.filter-btn[data-formula]').forEach(btn => {
        if (btn.onclick && btn.onclick.toString().includes('switchRankingFormula')) {
            btn.classList.toggle('active', btn.dataset.formula === formulaType);
        }
    });
    
    // Update Smart Index values for all themes based on selected formula
    gameData.themes.forEach(theme => {
        theme['Smart Index'] = theme._formulas[formulaType];
        
        // Update sub-themes if they exist
        if (theme._subthemes) {
            Object.values(theme._subthemes).forEach(subTheme => {
                subTheme['Smart Index'] = subTheme._formulas[formulaType];
            });
        }
    });
    
    // Re-sort by new Smart Index
    gameData.themes.sort((a, b) => b['Smart Index'] - a['Smart Index']);
    
    // Update tooltip to explain current formula
    updateFormulaTooltip(formulaType);
    
    // Sync all dropdowns
    const dropdowns = ['overview-ranking-formula', 'ranking-formula'];
    dropdowns.forEach(id => {
        const dropdown = document.getElementById(id);
        if (dropdown && dropdown.value !== formulaType) {
            dropdown.value = formulaType;
        }
    });
    
    // Re-render themes table
    renderThemes();
    
    // Re-render overview (top 10)
    renderOverview();
    
    // Refresh charts with new data
    refreshCharts();
};

// Switch ranking formula for mechanics
window.switchMechanicFormula = function(formulaType) {
    log('🔄 Switching mechanics to formula:', formulaType);
    
    // Update button states
    document.querySelectorAll('.filter-btn[data-formula]').forEach(btn => {
        if (btn.onclick && btn.onclick.toString().includes('switchMechanicFormula')) {
            btn.classList.toggle('active', btn.dataset.formula === formulaType);
        }
    });
    
    // Update Smart Index values for all mechanics based on selected formula
    gameData.mechanics.forEach(mech => {
        mech['Smart Index'] = mech._formulas[formulaType];
    });
    
    // Re-sort by new Smart Index
    gameData.mechanics.sort((a, b) => b['Smart Index'] - a['Smart Index']);
    
    // Re-render mechanics table
    renderMechanics();
};

// Update formula tooltip based on selected formula
function updateFormulaTooltip(formulaType) {
    const title = document.getElementById('themes-tooltip-title') || document.getElementById('tooltip-title');
    const formula = document.getElementById('themes-tooltip-formula') || document.getElementById('tooltip-formula');
    const content = document.getElementById('themes-tooltip-content') || document.getElementById('tooltip-content');
    
    const tooltips = {
        totalTheo: {
            title: 'Total Theo Win',
            formula: 'Avg Theo × Game Count',
            content: `
                <p><strong>Industry Standard</strong><br>Total expected casino profit from this theme</p>
                <p><strong>Measures:</strong><br>• Total market value<br>• Overall revenue potential</p>
                <p><strong>Use Case:</strong><br>Which themes make the most money overall?</p>
            `
        },
        avgTheo: {
            title: 'Avg Theo Win',
            formula: 'Average Theoretical Win Per Game',
            content: `
                <p><strong>Quality Metric</strong><br>Average expected profit per game</p>
                <p><strong>Measures:</strong><br>• Theme quality<br>• Performance per game</p>
                <p><strong>Use Case:</strong><br>Which themes are highest quality regardless of quantity?</p>
            `
        },
        weightedTheo: {
            title: 'Weighted Theo',
            formula: 'Avg Theo × √(Game Count)',
            content: `
                <p><strong>Statistical Confidence</strong><br>Balances quality with sample size reliability</p>
                <p><strong>Balances:</strong><br>• Quality (Avg Theo)<br>• Sample Size (√Game Count)</p>
                <p><strong>Use Case:</strong><br>Find themes with both quality AND statistical confidence.</p>
            `
        }
    };
    
    const info = tooltips[formulaType];
    if (title) title.textContent = info.title;
    if (formula) formula.textContent = info.formula;
    if (content) content.innerHTML = info.content;
}

// Render mechanics with tooltips
export function renderMechanics(mechanicsToRender = null) {
    const tbody = document.querySelector('#mechanics-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const allMechanics = mechanicsToRender || gameData.mechanics;
    
    if (typeof window !== 'undefined' && window.mechanicsCurrentPage !== undefined) {
        mechanicsCurrentPage = window.mechanicsCurrentPage;
    }
    
    const startIndex = (mechanicsCurrentPage - 1) * mechanicsPerPage;
    const endIndex = startIndex + mechanicsPerPage;
    const mechanics = allMechanics.slice(startIndex, endIndex);
    
    updateMechanicsPaginationInfo(allMechanics.length, startIndex, endIndex);
    
    const mechanicsCountSpan = document.getElementById('mechanics-count');
    if (mechanicsCountSpan) mechanicsCountSpan.textContent = allMechanics.length;
    
    const maxSI = Math.max(...allMechanics.map(m => m['Smart Index'] || 0), 1);
    const maxGC = Math.max(...allMechanics.map(m => m['Game Count'] || 0), 1);
    const avgSI = allMechanics.reduce((s, m) => s + (m['Smart Index'] || 0), 0) / (allMechanics.length || 1);
    
    mechanics.forEach((mech, index) => {
        const globalIndex = startIndex + index;
        const si = mech['Smart Index'] || 0;
        const gc = mech['Game Count'] || 0;
        const barW = Math.max(4, (si / maxSI) * 100);
        const gcBarW = Math.max(4, (gc / maxGC) * 100);
        const isAboveAvg = si >= avgSI;
        const medal = globalIndex === 0 ? '<span class="mr-1">🥇</span>' : globalIndex === 1 ? '<span class="mr-1">🥈</span>' : globalIndex === 2 ? '<span class="mr-1">🥉</span>' : '';
        const rankBg = globalIndex < 3 ? 'bg-indigo-50 dark:bg-indigo-900/20' : '';
        
        const row = tbody.insertRow();
        row.className = `group hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all duration-150 ${rankBg}`;
        row.innerHTML = `
            <td class="px-4 py-3.5 text-sm font-medium text-gray-400 dark:text-gray-500 w-16">${medal}${globalIndex + 1}</td>
            <td class="px-4 py-3.5">
                <span class="mechanic-link cursor-pointer font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" onclick="showMechanicDetails('${mech.Mechanic}')">${mech.Mechanic}</span>
            </td>
            <td class="px-4 py-3.5 w-40">
                <div class="flex items-center gap-2">
                    <span class="text-sm tabular-nums text-gray-700 dark:text-gray-300 w-8 text-right">${gc}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-gray-400 dark:bg-gray-500 transition-all" style="width:${gcBarW}%"></div></div>
                </div>
            </td>
            <td class="px-4 py-3.5 w-56">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold tabular-nums ${isAboveAvg ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}">${si.toFixed(2)}</span>
                    <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all ${isAboveAvg ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-500 dark:to-gray-600'}" style="width:${barW}%"></div></div>
                    <span class="text-[10px] ${isAboveAvg ? 'text-emerald-500' : 'text-gray-400'}">${isAboveAvg ? '▲' : '▼'}</span>
                </div>
            </td>
        `;
    });
}

// Render anomalies with expandable insights (top 30/bottom 30)
export function renderAnomalies() {
    log('⚡ renderAnomalies() called');
    const topDiv = document.getElementById('top-anomalies');
    const bottomDiv = document.getElementById('bottom-anomalies');
    
    log('  - top-anomalies element:', !!topDiv);
    log('  - bottom-anomalies element:', !!bottomDiv);
    
    if (!topDiv || !bottomDiv) {
        console.error('❌ Anomaly containers not found!');
        return;
    }
    
    // Force 4-column grid
    topDiv.style.display = 'grid';
    topDiv.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';
    bottomDiv.style.display = 'none';
    bottomDiv.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';
    
    topDiv.innerHTML = '';
    bottomDiv.innerHTML = '';
    
    log('  - Top anomalies to render:', gameData.top_anomalies?.length || 0);
    log('  - Bottom anomalies to render:', gameData.bottom_anomalies?.length || 0);
    
    // Show top 30 anomalies
    const topAnomalies = gameData.top_anomalies.slice(0, 30);
    log(`  - About to render ${topAnomalies.length} top anomalies...`);
    topAnomalies.forEach((a, index) => {
        try {
            const card = document.createElement('div');
        // White/gray card styling like user screenshot
        card.className = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow duration-200';
        card.dataset.anomalyIndex = index;
        card.dataset.anomalyType = 'top';
        
        // Get related theme data
        const themeData = a.themes.map(theme => 
            gameData.themes.find(t => t.Theme === theme)
        ).filter(Boolean);
        
        // Calculate insights (with NaN protection)
        const avgMarketShare = themeData.length > 0 
            ? themeData.reduce((sum, t) => sum + (t['Market Share %'] || 0), 0) / themeData.length 
            : 0;
        const avgSmartIndex = themeData.length > 0 
            ? themeData.reduce((sum, t) => sum + (t['Smart Index'] || 0), 0) / themeData.length 
            : 1; // Use 1 to avoid division by zero
        
        // Generate REAL data-driven insights using analytics engine
        const smartInsights = analyzeGameSuccessFactors(a.game, a.theo_win_index, a.z_score, a.themes);
        const recommendations = generateRecommendations(smartInsights, a.themes, a.z_score);
        
        // Find game object for provider/features
        const gameObj = (gameData.allGames || []).find(g => g.name === a.game);
        const provider = gameObj?.provider_studio || gameObj?.provider || '';
        const features = gameObj?.features || [];
        const featList = (typeof features === 'string' ? JSON.parse(features || '[]') : features);
        const rank = gameObj?.performance_rank || null;
        const percentile = gameObj?.performance_percentile || '';
        const volatility = gameObj?.specs_volatility || '';
        const marketShare = gameObj?.performance_market_share_percent;
        
        // Compare to theme average
        const themeAvg = themeData.length > 0 
            ? themeData.reduce((sum, t) => sum + (t['Avg Theo Win Index'] || 0), 0) / themeData.length 
            : 0;
        const vsTheme = themeAvg > 0 ? (((a.theo_win_index || 0) / themeAvg - 1) * 100) : 0;
        
        card.innerHTML = `
            <div class="flex items-start justify-between mb-2">
                <div class="text-sm font-bold text-gray-900 dark:text-white leading-tight cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="event.stopPropagation(); ${safeOnclick('window.showGameDetails', a.game || '')}">${escapeHtml(a.game)}</div>
                <span class="text-gray-400 text-xs ml-1 shrink-0">▼</span>
            </div>
            <div class="flex items-baseline gap-2 mb-1.5">
                <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400">${(a.theo_win_index || 0).toFixed(2)}</span>
                ${rank ? `<span class="text-[10px] font-bold text-gray-400">#${rank}</span>` : ''}
                ${percentile ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-semibold">${percentile}</span>` : ''}
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400 mb-2">
                <span>Z-Score: <strong class="text-gray-700 dark:text-gray-300">${(a.z_score || 0).toFixed(2)}</strong></span>
                ${marketShare != null ? `<span>Share: <strong class="text-gray-700 dark:text-gray-300">${marketShare.toFixed(2)}%</strong></span>` : '<span></span>'}
                ${vsTheme ? `<span>vs Theme: <strong class="${vsTheme > 0 ? 'text-emerald-600' : 'text-red-500'}">${vsTheme > 0 ? '+' : ''}${vsTheme.toFixed(0)}%</strong></span>` : '<span></span>'}
                ${volatility ? `<span>Vol: <strong class="text-gray-700 dark:text-gray-300">${volatility}</strong></span>` : '<span></span>'}
            </div>
            ${provider ? `<div class="text-[10px] text-gray-400 dark:text-gray-500 mb-1 cursor-pointer hover:text-indigo-500" onclick="event.stopPropagation(); ${safeOnclick('window.showProviderDetails', provider)}">${escapeHtml(provider)}</div>` : ''}
            <div class="text-[11px] text-gray-700 dark:text-gray-300 mb-1">${a.themes.map(t => `<span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="event.stopPropagation(); ${safeOnclick('window.showThemeDetails', t)}">${escapeHtml(t)}</span>`).join(', ')}</div>
            ${featList.length ? `<div class="flex flex-wrap gap-1 mt-1">${featList.slice(0, 4).map(f => `<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-medium">${f}</span>`).join('')}${featList.length > 4 ? `<span class="text-[9px] text-gray-400">+${featList.length - 4}</span>` : ''}</div>` : ''}
            
            <div class="hidden mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 card-details">
                <div class="mb-4">
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">🎯 Why This Game Succeeds</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        ${smartInsights.map(insight => `<li>• ${insight}</li>`).join('')}
                    </ul>
                </div>
                
                ${themeData.length > 0 ? `
                    <div class="mb-4">
                        <h4 class="font-bold text-gray-900 dark:text-white mb-2">📊 Theme Performance Breakdown</h4>
                        <div class="grid grid-cols-3 gap-2">
                            ${themeData.slice(0, 3).map(t => `
                                <div class="text-center p-2 bg-white dark:bg-gray-800 rounded">
                                    <div class="text-xs text-gray-600 dark:text-gray-400">${t.Theme}</div>
                                    <div class="text-lg font-bold text-emerald-600">${(t['Smart Index'] || 0).toFixed(1)}</div>
                                    <div class="text-xs text-gray-500">${(t['Market Share %'] || 0).toFixed(1)}% market</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div>
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">💡 Key Takeaways</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        ${recommendations.map(rec => `<li>• ${rec}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
        
        card.addEventListener('click', (e) => toggleCardExpansion(e.currentTarget));
        topDiv.appendChild(card);
        } catch (err) {
            console.error(`Error rendering top anomaly #${index} (${a?.game}):`, err);
        }
    });
    
    // Show bottom 30 anomalies
    const bottomAnomalies = gameData.bottom_anomalies.slice(0, 30);
    bottomAnomalies.forEach((a, index) => {
        const card = document.createElement('div');
        // White/gray card styling like user screenshot (same as top)
        card.className = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow duration-200';
        card.dataset.anomalyIndex = index;
        card.dataset.anomalyType = 'bottom';
        
        const themeData = a.themes.map(theme => 
            gameData.themes.find(t => t.Theme === theme)
        ).filter(Boolean);
        
        const avgSmartIndex = themeData.length > 0 
            ? themeData.reduce((sum, t) => sum + (t['Smart Index'] || 0), 0) / themeData.length 
            : 1; // Use 1 to avoid division by zero
        
        // Data-driven insights for bottom performers too
        const bottomInsights = analyzeGameSuccessFactors(a.game, a.theo_win_index, a.z_score, a.themes);
        const bottomRecs = generateRecommendations(bottomInsights, a.themes, a.z_score);
        
        const gameObj = (gameData.allGames || []).find(g => g.name === a.game);
        const provider = gameObj?.provider_studio || gameObj?.provider || '';
        const features = gameObj?.features || [];
        const featList = (typeof features === 'string' ? JSON.parse(features || '[]') : features);
        const rank = gameObj?.performance_rank || null;
        const percentile = gameObj?.performance_percentile || '';
        const volatility = gameObj?.specs_volatility || '';
        const marketShare = gameObj?.performance_market_share_percent;
        
        const themeAvg = themeData.length > 0 
            ? themeData.reduce((sum, t) => sum + (t['Avg Theo Win Index'] || 0), 0) / themeData.length 
            : 0;
        const vsTheme = themeAvg > 0 ? (((a.theo_win_index || 0) / themeAvg - 1) * 100) : 0;
        
        card.innerHTML = `
            <div class="flex items-start justify-between mb-2">
                <div class="text-sm font-bold text-gray-900 dark:text-white leading-tight cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="event.stopPropagation(); ${safeOnclick('window.showGameDetails', a.game || '')}">${escapeHtml(a.game)}</div>
                <span class="text-gray-400 text-xs ml-1 shrink-0">▼</span>
            </div>
            <div class="flex items-baseline gap-2 mb-1.5">
                <span class="text-2xl font-black text-red-600 dark:text-red-400">${(a.theo_win_index || 0).toFixed(2)}</span>
                ${rank ? `<span class="text-[10px] font-bold text-gray-400">#${rank}</span>` : ''}
                ${percentile ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold">${percentile}</span>` : ''}
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400 mb-2">
                <span>Z-Score: <strong class="text-gray-700 dark:text-gray-300">${(a.z_score || 0).toFixed(2)}</strong></span>
                ${marketShare != null ? `<span>Share: <strong class="text-gray-700 dark:text-gray-300">${marketShare.toFixed(2)}%</strong></span>` : '<span></span>'}
                ${vsTheme ? `<span>vs Theme: <strong class="${vsTheme > 0 ? 'text-emerald-600' : 'text-red-500'}">${vsTheme > 0 ? '+' : ''}${vsTheme.toFixed(0)}%</strong></span>` : '<span></span>'}
                ${volatility ? `<span>Vol: <strong class="text-gray-700 dark:text-gray-300">${volatility}</strong></span>` : '<span></span>'}
            </div>
            ${provider ? `<div class="text-[10px] text-gray-400 dark:text-gray-500 mb-1 cursor-pointer hover:text-indigo-500" onclick="event.stopPropagation(); ${safeOnclick('window.showProviderDetails', provider)}">${escapeHtml(provider)}</div>` : ''}
            <div class="text-[11px] text-gray-700 dark:text-gray-300 mb-1">${a.themes.map(t => `<span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="event.stopPropagation(); ${safeOnclick('window.showThemeDetails', t)}">${escapeHtml(t)}</span>`).join(', ')}</div>
            ${featList.length ? `<div class="flex flex-wrap gap-1 mt-1">${featList.slice(0, 4).map(f => `<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">${f}</span>`).join('')}${featList.length > 4 ? `<span class="text-[9px] text-gray-400">+${featList.length - 4}</span>` : ''}</div>` : ''}
            
            <div class="hidden mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 card-details">
                <div class="mb-4">
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">⚠️ Performance Analysis</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        ${bottomInsights.map(insight => `<li>• ${insight}</li>`).join('')}
                    </ul>
                </div>
                
                ${themeData.length > 0 ? `
                    <div class="mb-4">
                        <h4 class="font-bold text-gray-900 dark:text-white mb-2">📊 Theme Context</h4>
                        <div class="grid grid-cols-3 gap-2">
                            ${themeData.slice(0, 3).map(t => `
                                <div class="text-center p-2 bg-white dark:bg-gray-800 rounded">
                                    <div class="text-xs text-gray-600 dark:text-gray-400">${t.Theme}</div>
                                    <div class="text-lg font-bold text-red-600">${(t['Smart Index'] || 0).toFixed(1)}</div>
                                    <div class="text-xs text-gray-500">${(t['Market Share %'] || 0).toFixed(1)}% market</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div>
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">💡 Improvement Opportunities</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        ${bottomRecs.map(rec => `<li>• ${rec}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
        
        card.addEventListener('click', (e) => toggleCardExpansion(e.currentTarget));
        bottomDiv.appendChild(card);
    });
    
    // Set up search and sort handlers
    setupAnomalyControls();
}

function setupAnomalyControls() {
    const searchInput = document.getElementById('anomaly-search');
    const sortSelect = document.getElementById('anomaly-sort');
    
    if (searchInput) {
        searchInput.addEventListener('input', () => filterAnomalyCards(searchInput.value));
    }
    if (sortSelect) {
        sortSelect.addEventListener('change', () => sortAnomalyCards(sortSelect.value));
    }
}

function filterAnomalyCards(query) {
    const term = query.toLowerCase().trim();
    document.querySelectorAll('#top-anomalies > div, #bottom-anomalies > div').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = (!term || text.includes(term)) ? '' : 'none';
    });
}

function sortAnomalyCards(sortBy) {
    ['top-anomalies', 'bottom-anomalies'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const cards = [...container.children];
        cards.sort((a, b) => {
            const getVal = (card) => {
                const text = card.textContent;
                if (sortBy === 'theo') {
                    const match = text.match(/(\d+\.\d+)/);
                    return match ? parseFloat(match[1]) : 0;
                }
                if (sortBy === 'zscore') {
                    const match = text.match(/Z-Score:\s*(-?[\d.]+)/);
                    return match ? parseFloat(match[1]) : 0;
                }
                if (sortBy === 'name') return card.querySelector('.text-base')?.textContent?.trim() || '';
                if (sortBy === 'provider') return card.querySelector('.text-\\[11px\\]')?.textContent?.trim() || '';
                return 0;
            };
            const va = getVal(a), vb = getVal(b);
            if (sortBy === 'name' || sortBy === 'provider') return String(va).localeCompare(String(vb));
            return containerId.includes('top') ? vb - va : va - vb;
        });
        cards.forEach(card => container.appendChild(card));
    });
}

// Toggle card expansion - expand horizontally
function toggleCardExpansion(card) {
    const details = card.querySelector('.card-details');
    const icon = card.querySelector('.float-right');
    
    if (details) {
        const isExpanded = !details.classList.contains('hidden');
        
        if (isExpanded) {
            // Collapse
            details.classList.add('hidden');
            card.style.gridColumn = '';
            card.style.maxWidth = '';
            if (icon) icon.textContent = '▼';
        } else {
            // Expand - span 2 columns horizontally
            details.classList.remove('hidden');
            card.style.gridColumn = 'span 2';
            card.style.maxWidth = '100%';
            if (icon) icon.textContent = '▲';
        }
    }
}

// Page navigation (updated for sidebar)
// Helper function to initialize page-specific functionality after loading template
async function initializePage(pageName) {
    switch(pageName) {
        case 'overview':
            renderOverview();
            initializeCharts();
            break;
            
        case 'themes':
            renderThemes();
            setupSearch('themes');
            setupThemeClickHandlers();
            populateThemesFilters();
            if (window.switchThemeView) {
                window.switchThemeView('all');
            }
            break;
            
        case 'mechanics':
            renderMechanics();
            setupSearch('mechanics');
            populateMechanicsFilters();
            if (window.switchMechanicView) {
                window.switchMechanicView('all');
            }
            break;
            
        case 'games': {
            const mod = await import('./ui-providers-games.js');
            window.renderGames = mod.renderGames;
            window.renderProviders = mod.renderProviders;
            mod.renderGames();
            mod.setupGamesFilters();
            populateGamesFilters();
            break;
        }
        case 'providers': {
            const mod = await import('./ui-providers-games.js');
            window.renderProviders = mod.renderProviders;
            window.renderGames = mod.renderGames;
            mod.renderProviders();
            populateProvidersFilters();
            break;
        }
            
        case 'anomalies':
            showPage('insights');
            return;
            
        case 'insights':
            generateInsights();
            setTimeout(() => {
                renderAnomalies();
                showAnomalies('top');
            }, 100);
            break;

        case 'game-lab': {
            generateInsights();
            setupPrediction();
            const ngMod = await import('../features/name-generator.js');
            ngMod.setupNameGenerator();
            break;
        }
            
        case 'trends':
            setTimeout(async () => {
                try {
                    const { renderTrends } = await import('../features/trends.js');
                    renderTrends();
                } catch (error) {
                    console.error('Error loading trends:', error);
                }
            }, 250);
            break;
            
        case 'prediction':
            showPage('game-lab');
            setTimeout(() => window.navigateGameLab('concept'), 600);
            return;
            
        case 'name-generator':
            showPage('game-lab');
            setTimeout(() => window.navigateGameLab('name-gen'), 600);
            return;

        case 'ai-assistant':
            // AI Assistant initializes itself
            document.getElementById('ai-input')?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAIMessage();
                }
            });
            break;

        case 'tickets':
            renderTickets();
            break;

        default:
            warn(`No initializer for page: ${pageName}`);
    }
}

export async function showPage(page, { pushHistory = true } = {}) {
    // Redirect old pages to their new locations
    if (page === 'anomalies') { showPage('insights', { pushHistory }); return; }
    if (page === 'prediction') { showPage('game-lab', { pushHistory }); setTimeout(() => window.navigateGameLab('concept'), 600); return; }
    if (page === 'name-generator') { showPage('game-lab', { pushHistory }); setTimeout(() => window.navigateGameLab('name-gen'), 600); return; }

    log('🔄 Switching to page:', page);
    
    if (pushHistory) {
        history.pushState({ page }, '', `#${page}`);
    }
    
    // TAILWIND: Remove active styles from all nav items
    document.querySelectorAll('[data-page]').forEach(navItem => {
        // Remove ALL possible active state classes
        navItem.classList.remove(
            'bg-gradient-to-r', 'from-indigo-50', 'to-blue-50', 
            '!text-indigo-600', 'text-indigo-600', '!text-white', 
            'font-semibold', 'font-bold'
        );
        // Remove dark mode classes
        navItem.classList.remove('dark:from-indigo-900/20', 'dark:to-blue-900/20', 'dark:!text-white');
    });
    
    // TAILWIND: Add active styles to clicked nav item
    const activeNav = document.querySelector(`[data-page="${page}"]`);
    if (activeNav) {
        log('✅ Setting active state for:', page);
        // Light mode: light indigo gradient background with indigo text
        activeNav.classList.add('bg-gradient-to-r', 'from-indigo-50', 'to-blue-50', 'text-indigo-600', 'font-semibold');
        // Dark mode: dark indigo gradient with white text
        activeNav.classList.add('dark:from-indigo-900/20', 'dark:to-blue-900/20', 'dark:!text-white');
    } else {
        warn('⚠️ Nav item not found for page:', page);
    }
    
    // Load page template dynamically
    const container = document.getElementById('page-container');
    if (!container) {
        console.error('❌ Page container not found!');
        return;
    }
    
    try {
        const response = await fetch(`src/pages/${page}.html?v=${Date.now()}`);
        if (!response.ok) throw new Error(`Page not found: ${page}`);
        
        const html = await response.text();
        container.innerHTML = html;
        
        // Initialize page-specific functionality
        await initializePage(page);
        
        // Update auth UI for hamburger (login/logout visibility)
        const { updateAuthUI } = await import('../features/auth-ui.js');
        updateAuthUI();
        
        log('✅ Page loaded:', page);
    } catch (error) {
        console.error('Failed to load page:', error);
        container.innerHTML = '<div class="p-8 text-center text-red-600 dark:text-red-400">Failed to load page: ' + page + '</div>';
    }
    
    // TAILWIND: Close any open side panels when changing pages
    const mechanicPanel = document.getElementById('mechanic-panel');
    const themePanel = document.getElementById('theme-panel');
    const gamePanel = document.getElementById('game-panel');
    const providerPanel = document.getElementById('provider-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    
    if (mechanicPanel) mechanicPanel.style.right = '-650px';
    if (themePanel) themePanel.style.right = '-650px';
    if (gamePanel) gamePanel.style.right = '-650px';
    if (providerPanel) providerPanel.style.right = '-650px';
    if (backdrop) {
        backdrop.classList.add('hidden');
        backdrop.classList.remove('block');
    }
    
    // NOTE: Pages are rendered in initializePage() above
    // Do NOT duplicate render calls here to avoid race conditions
    
    // Render trends if switching to trends page
    if (page === 'trends') {
        setTimeout(async () => {
            try {
                const { renderTrends } = await import('../features/trends.js');
                renderTrends();
            } catch (error) {
                console.error('Error loading trends:', error);
            }
        }, 250);
    }
    
    // NOTE: Overview, Providers, Games are all rendered in initializePage()
    // Do NOT render them here to avoid double-rendering and race conditions
    
    // Generate insights if switching to insights page
    if (page === 'insights') {
        setTimeout(() => {
            generateInsights();
            renderAnomalies();
            showAnomalies('top');
        }, 100);
    }
    
    // Show top anomalies by default when switching to anomalies page
    if (page === 'anomalies') {
        setTimeout(() => {
            renderAnomalies();
            const topBtn = document.querySelector('button[onclick="showAnomalies(\'top\')"]');
            if (topBtn) topBtn.click();
        }, 100);
    }

    // Game Lab: expand sub-nav and set up scroll-spy
    updateGameLabSubnav(page);
}

// Game Lab sub-navigation: expand/collapse
function updateGameLabSubnav(page) {
    const subnav = document.getElementById('gamelab-subnav');
    const chevron = document.querySelector('.gamelab-chevron');
    if (!subnav) return;

    if (page === 'game-lab') {
        subnav.style.maxHeight = subnav.scrollHeight + 'px';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
    } else {
        subnav.style.maxHeight = '0';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
}

function toggleGameLabSubnav() {
    const subnav = document.getElementById('gamelab-subnav');
    const chevron = document.querySelector('.gamelab-chevron');
    if (!subnav) return;
    const isExpanded = subnav.style.maxHeight && subnav.style.maxHeight !== '0px';
    if (isExpanded) {
        subnav.style.maxHeight = '0';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    } else {
        subnav.style.maxHeight = subnav.scrollHeight + 'px';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
    }
}

window.switchLabTool = function(toolId) {
    if (toolId === 'symbols') toolId = 'blueprint';
    document.querySelectorAll('.gamelab-section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(`lab-section-${toolId}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.gamelab-sub').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50/50', 'dark:bg-indigo-900/15', 'bg-indigo-50/60');
    });
    const sidebarSub = document.querySelector(`.gamelab-sub[data-section="${toolId}"]`);
    if (sidebarSub) {
        sidebarSub.classList.add('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50/50', 'dark:bg-indigo-900/15');
    }
};

window.navigateGameLab = function(section) {
    const currentPage = window.location.hash.replace('#', '') || 'overview';
    if (currentPage !== 'game-lab') {
        showPage('game-lab');
        setTimeout(() => window.switchLabTool(section), 500);
    } else {
        window.switchLabTool(section);
    }
};

window.handleGameLabClick = function(e) {
    const currentPage = window.location.hash.replace('#', '') || 'overview';
    if (currentPage === 'game-lab') {
        toggleGameLabSubnav();
    } else {
        showPage('game-lab');
    }
};

// Anomaly tab switching
export function showAnomalies(type) {
    log(`🎯 showAnomalies('${type}') called`);
    
    // Get both buttons
    const topButton = document.querySelector(`button[onclick*="showAnomalies('top')"]`);
    const bottomButton = document.querySelector(`button[onclick*="showAnomalies('bottom')"]`);
    
    if (!topButton || !bottomButton) {
        console.error('❌ Anomaly buttons not found!');
        return;
    }
    
    // Active state classes
    const activeGreenClasses = 'border-emerald-500 dark:border-emerald-600 text-emerald-600 dark:text-emerald-400 shadow-md';
    const activeRedClasses = 'border-red-500 dark:border-red-600 text-red-600 dark:text-red-400 shadow-md';
    const inactiveClasses = 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300';
    
    if (type === 'top') {
        // Top button: active (green with shadow)
        topButton.className = `anomaly-tab active px-5 py-2.5 bg-white dark:bg-gray-800 border-2 ${activeGreenClasses} rounded-lg font-semibold transition-all flex items-center gap-2`;
        // Bottom button: inactive (gray)
        bottomButton.className = `anomaly-tab px-5 py-2.5 bg-white dark:bg-gray-800 border-2 ${inactiveClasses} rounded-lg font-semibold transition-all flex items-center gap-2`;
    } else {
        // Top button: inactive (gray)
        topButton.className = `anomaly-tab px-5 py-2.5 bg-white dark:bg-gray-800 border-2 ${inactiveClasses} rounded-lg font-semibold transition-all flex items-center gap-2`;
        // Bottom button: active (red with shadow)
        bottomButton.className = `anomaly-tab active px-5 py-2.5 bg-white dark:bg-gray-800 border-2 ${activeRedClasses} rounded-lg font-semibold transition-all flex items-center gap-2`;
    }
    
    const topContainer = document.getElementById('top-anomalies');
    const bottomContainer = document.getElementById('bottom-anomalies');
    
    if (!topContainer || !bottomContainer) {
        console.error('❌ Anomaly containers not found!');
        return;
    }
    
    // FORCE hide/show with !important via inline styles
    if (type === 'top') {
        topContainer.style.cssText = 'display: grid !important; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem;';
        bottomContainer.style.cssText = 'display: none !important;';
        log('✅ Showing TOP anomalies');
    } else {
        topContainer.style.cssText = 'display: none !important;';
        bottomContainer.style.cssText = 'display: grid !important; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem;';
        log('✅ Showing BOTTOM anomalies');
    }
    
    log(`  Top display: ${topContainer.style.display}, cards: ${topContainer.children.length}`);
    log(`  Bottom display: ${bottomContainer.style.display}, cards: ${bottomContainer.children.length}`);
}

// Table sorting with visual indicators
export function sortTable(tableId, colIdx) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.rows);
    const headers = table.querySelectorAll('th');
    const currentHeader = headers[colIdx];
    
    // Determine sort direction
    const isDescending = !currentHeader.classList.contains('sorted-desc');
    
    // Remove all sort classes
    headers.forEach(h => {
        h.classList.remove('sorted-desc', 'sorted-asc');
    });
    
    // Add appropriate class
    if (isDescending) {
        currentHeader.classList.add('sorted-desc');
    } else {
        currentHeader.classList.add('sorted-asc');
    }
    
    // Sort rows
    rows.sort((a, b) => {
        let aVal = a.cells[colIdx].textContent.replace(/[^0-9.-]/g, '');
        let bVal = b.cells[colIdx].textContent.replace(/[^0-9.-]/g, '');
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        
        let comparison;
        if (!isNaN(aNum) && !isNaN(bNum)) {
            comparison = bNum - aNum;
        } else {
            comparison = bVal.localeCompare(aVal);
        }
        
        return isDescending ? comparison : -comparison;
    });
    
    rows.forEach(row => tbody.appendChild(row));
}

// Search/Filter Themes
export function searchThemes(query) {
    if (!query || query.trim() === '') {
        filteredThemes = null;
        renderThemes();
        return;
    }
    
    const searchTerm = query.toLowerCase().trim();
    filteredThemes = gameData.themes.filter(theme => 
        theme.Theme.toLowerCase().includes(searchTerm)
    );
    
    renderThemes(filteredThemes);
}

// Setup event delegation for theme clicks
export function setupThemeClickHandlers() {
    const tbody = document.querySelector('#themes-table tbody');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const themeLink = e.target.closest('.theme-link');
            if (themeLink) {
                const themeName = themeLink.dataset.theme
                    ?.replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"');
                if (themeName) {
                    showThemeDetails(themeName);
                }
            }
        });
    }
}

// Setup search functionality
export function setupSearch() {
    // Setup theme search
    const searchInput = document.getElementById('theme-search');
    const clearBtn = document.getElementById('clear-search');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            
            // Show/hide clear button
            if (clearBtn) {
                clearBtn.style.display = query ? 'block' : 'none';
            }
            
            // Debounce search (300ms)
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                searchThemes(query);
            }, 300);
        });
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearBtn.style.display = 'none';
                searchThemes('');
                searchInput.focus();
            });
        }
    }
    
    // Setup mechanic search
    setupMechanicSearch();
}

// Mechanic search function
function searchMechanics(query) {
    const trimmedQuery = query.trim().toLowerCase();
    
    if (!trimmedQuery) {
        // Empty query - show all mechanics
        filteredMechanics = null;
        renderMechanics();
        return;
    }
    
    // Filter mechanics by name
    filteredMechanics = gameData.mechanics.filter(mech =>
        mech.Mechanic.toLowerCase().includes(trimmedQuery)
    );
    
    renderMechanics(filteredMechanics);
}

// Setup mechanic search
export function setupMechanicSearch() {
    const searchInput = document.getElementById('mechanic-search');
    const clearBtn = document.getElementById('clear-mechanic-search');
    
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        
        // Show/hide clear button
        if (clearBtn) {
            clearBtn.style.display = query ? 'block' : 'none';
        }
        
        // Debounce search (300ms)
        clearTimeout(mechanicSearchDebounceTimer);
        mechanicSearchDebounceTimer = setTimeout(() => {
            searchMechanics(query);
        }, 300);
    });
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            searchMechanics('');
            searchInput.focus();
        });
    }
}

// Setup CSV export buttons (delegates to ui-export with filteredThemes getter)
export function setupExportButtons() {
    setupExportButtonsBase(() => filteredThemes);
}

// Sidebar Toggle
export function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    
    if (!sidebar || !toggle) return;
    
    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
}

// Dark Mode
export function setupDarkMode() {
    const toggle = document.getElementById('dark-mode-toggle');
    const lightIcon = toggle?.querySelector('.light-icon');
    const darkIcon = toggle?.querySelector('.dark-icon');
    
    if (!toggle) return;
    
    // Load saved preference
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.documentElement.classList.add('dark');
        if (lightIcon) lightIcon.style.display = 'none';
        if (darkIcon) darkIcon.style.display = 'inline';
    }
    
    // Toggle on click
    toggle.addEventListener('click', async () => {
        document.documentElement.classList.toggle('dark');
        const isDarkNow = document.documentElement.classList.contains('dark');
        localStorage.setItem('darkMode', isDarkNow);
        
        if (lightIcon && darkIcon) {
            lightIcon.style.display = isDarkNow ? 'none' : 'inline';
            darkIcon.style.display = isDarkNow ? 'inline' : 'none';
        }
        
        // Refresh charts for dark mode
        try {
            setTimeout(() => refreshCharts(), 100);
        } catch (err) {
            warn('Could not refresh charts:', err);
        }
        // Refresh trends charts if on trends page
        if (document.getElementById('overall-trend-chart')) {
            try {
                const { renderTrends } = await import('../features/trends.js');
                setTimeout(() => renderTrends(), 150);
            } catch (err) {
                warn('Could not refresh trends:', err);
            }
        }
    });
}

// Legacy prediction tab switch (kept for backward compat)
function switchPredictionTab() {}
window.switchPredictionTab = switchPredictionTab;

// Set quick example text
window.setConceptExample = function(btn) {
    const text = btn.dataset.text;
    const input = document.getElementById('concept-input');
    if (input && text) { input.value = text; input.focus(); }
};

// Analyze free-text game concept
function analyzeGameConcept() {
    const input = document.getElementById('concept-input');
    const resultsDiv = document.getElementById('concept-results');
    const detectedDiv = document.getElementById('concept-detected');
    const tagsDiv = document.getElementById('concept-tags');
    if (!input || !resultsDiv) return;
    
    const text = input.value.trim();
    if (!text) {
        input.classList.add('ring-2', 'ring-red-400');
        setTimeout(() => input.classList.remove('ring-2', 'ring-red-400'), 1500);
        return;
    }
    
    const lower = text.toLowerCase();
    
    // NLP-style extraction: detect themes from our data
    const allThemes = (gameData.themes || []).map(t => t.Theme).filter(Boolean);
    const FEATS = ['Cash On Reels','Expanding Reels','Free Spins','Hold and Spin','Nudges','Persistence','Pick Bonus','Respin','Static Jackpot','Wheel','Wild Reels'];
    const shortF = {'Cash On Reels':'Cash Reels','Expanding Reels':'Expanding','Free Spins':'Free Spins','Hold and Spin':'Hold & Spin','Nudges':'Nudges','Persistence':'Persistence','Pick Bonus':'Pick Bonus','Respin':'Respin','Static Jackpot':'Jackpot','Wheel':'Wheel','Wild Reels':'Wilds'};
    
    // Theme aliases for fuzzy matching
    const themeAliases = {
        'egypt': 'Egyptian', 'egyptian': 'Egyptian', 'pharaoh': 'Egyptian', 'cleopatra': 'Egyptian', 'pyramid': 'Egyptian',
        'asian': 'Asian', 'chinese': 'Asian', 'oriental': 'Asian', 'luck': 'Asian', 'fortune': 'Asian',
        'irish': 'Irish', 'leprechaun': 'Irish', 'celtic': 'Irish',
        'dragon': 'Fantasy', 'fantasy': 'Fantasy', 'wizard': 'Fantasy', 'magic': 'Fantasy',
        'adventure': 'Adventure', 'explorer': 'Adventure', 'treasure': 'Adventure', 'quest': 'Adventure',
        'fruit': 'Fruit', 'classic': 'Classic', 'retro': 'Classic', 'nostalgic': 'Classic',
        'animal': 'Animals', 'wildlife': 'Animals', 'safari': 'Animals',
        'ocean': 'Ocean', 'sea': 'Ocean', 'underwater': 'Ocean', 'fish': 'Ocean',
        'greek': 'Greek/Mythology', 'mythology': 'Greek/Mythology', 'zeus': 'Greek/Mythology', 'god': 'Greek/Mythology',
        'norse': 'Norse', 'viking': 'Norse', 'thor': 'Norse', 'odin': 'Norse',
        'western': 'Western', 'cowboy': 'Western', 'wild west': 'Western',
        'horror': 'Horror', 'vampire': 'Horror', 'zombie': 'Horror', 'halloween': 'Horror',
        'space': 'Space', 'cosmic': 'Space', 'galaxy': 'Space', 'alien': 'Space',
        'pirate': 'Pirate', 'aztec': 'Aztec', 'mayan': 'Aztec',
        'music': 'Music', 'rock': 'Music',
        'gem': 'Gems', 'jewel': 'Gems',
    };
    
    // Feature aliases
    const featAliases = {
        'free spin': 'Free Spins', 'freespin': 'Free Spins', 'free game': 'Free Spins', 'bonus spin': 'Free Spins',
        'hold and spin': 'Hold and Spin', 'hold & spin': 'Hold and Spin', 'lock and spin': 'Hold and Spin',
        'wild': 'Wild Reels', 'wilds': 'Wild Reels', 'wild reel': 'Wild Reels', 'sticky wild': 'Wild Reels',
        'expanding': 'Expanding Reels', 'expand': 'Expanding Reels', 'expanding reel': 'Expanding Reels',
        'cash on reel': 'Cash On Reels', 'cash reel': 'Cash On Reels', 'coin on reel': 'Cash On Reels',
        'nudge': 'Nudges', 'nudges': 'Nudges',
        'persist': 'Persistence', 'persistence': 'Persistence', 'sticky': 'Persistence',
        'pick bonus': 'Pick Bonus', 'pick': 'Pick Bonus', 'pick game': 'Pick Bonus', 'pick feature': 'Pick Bonus',
        'respin': 'Respin', 're-spin': 'Respin',
        'jackpot': 'Static Jackpot', 'progressive jackpot': 'Static Jackpot', 'static jackpot': 'Static Jackpot',
        'wheel': 'Wheel', 'wheel bonus': 'Wheel', 'wheel of fortune': 'Wheel',
    };
    
    // Detect themes
    const detectedThemes = new Set();
    for (const [alias, theme] of Object.entries(themeAliases)) {
        if (lower.includes(alias)) {
            const match = allThemes.find(t => t.toLowerCase() === theme.toLowerCase()) || allThemes.find(t => t.toLowerCase().includes(theme.toLowerCase()));
            if (match) detectedThemes.add(match);
        }
    }
    // Also check direct theme name matches
    allThemes.forEach(t => {
        if (lower.includes(t.toLowerCase()) && t.length > 3) detectedThemes.add(t);
    });
    
    // Detect features
    const detectedFeats = new Set();
    for (const [alias, feat] of Object.entries(featAliases)) {
        if (lower.includes(alias)) detectedFeats.add(feat);
    }
    // Direct feature name check
    FEATS.forEach(f => {
        if (lower.includes(f.toLowerCase())) detectedFeats.add(f);
    });
    
    // Detect volatility
    let detectedVol = null;
    if (lower.includes('very high vol')) detectedVol = 'Very High';
    else if (lower.includes('high vol')) detectedVol = 'High';
    else if (lower.includes('medium-high') || lower.includes('medium high')) detectedVol = 'Medium-High';
    else if (lower.includes('low vol')) detectedVol = 'Low';
    else if (lower.includes('medium vol') || lower.includes('medium')) detectedVol = 'Medium';
    
    const themes = [...detectedThemes];
    const feats = [...detectedFeats];
    const primaryTheme = themes[0] || null;
    
    // Show detected tags
    if (detectedDiv && tagsDiv) {
        let tags = '';
        themes.forEach(t => { tags += `<span class="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">🎨 ${escapeHtml(t)}</span>`; });
        feats.forEach(f => { tags += `<span class="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">⚙️ ${escapeHtml(shortF[f]||f)}</span>`; });
        if (detectedVol) tags += `<span class="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">🎲 ${detectedVol}</span>`;
        if (!tags) tags = '<span class="text-xs text-gray-400">No specific themes or features detected — try being more specific</span>';
        tagsDiv.innerHTML = tags;
        detectedDiv.classList.remove('hidden');
    }
    
    // Run analysis
    const allGames = gameData.allGames || [];
    const similarResult = primaryTheme ? predictFromSimilarGames(primaryTheme, feats) : null;
    const stats = getDatasetStats();
    
    const themeData = themes.map(t => gameData.themes.find(td => td.Theme === t)).filter(Boolean);
    const mechData = feats.map(f => gameData.mechanics.find(m => m.Mechanic === f)).filter(Boolean);
    
    // Find matching games (have the detected theme + at least some features)
    const matchingGames = allGames.filter(g => {
        if (!primaryTheme) return false;
        if ((g.theme_consolidated || '').toLowerCase() !== primaryTheme.toLowerCase()) return false;
        if (feats.length === 0) return true;
        const gFeats = parseFeatsLocal(g.features);
        return feats.some(f => gFeats.includes(f));
    }).sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
    
    // Exact recipe matches (have ALL detected features)
    const exactMatches = feats.length > 0 ? matchingGames.filter(g => {
        const gFeats = parseFeatsLocal(g.features);
        return feats.every(f => gFeats.includes(f));
    }) : [];
    
    // Compute stats
    const avgTheo = matchingGames.length > 0 ? matchingGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / matchingGames.length : 0;
    const exactAvgTheo = exactMatches.length > 0 ? exactMatches.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / exactMatches.length : 0;
    const globalAvg = allGames.length > 0 ? allGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allGames.length : 0;
    const predictedTheo = exactMatches.length >= 3 ? exactAvgTheo : similarResult?.predictedTheo ?? avgTheo;
    
    // Market saturation
    const themeGameCount = matchingGames.length;
    const saturation = themeGameCount > 50 ? 'High' : themeGameCount > 20 ? 'Moderate' : themeGameCount > 5 ? 'Low' : 'Very Low';
    const satColor = themeGameCount > 50 ? 'text-red-500' : themeGameCount > 20 ? 'text-amber-500' : 'text-emerald-500';
    
    // Score calculation
    const themeScore = themeData.length > 0 ? themeData[0]['Smart Index'] || 0 : 0;
    const maxSI = stats?.maxThemeSI || 250;
    const normalizedScore = Math.min(Math.round((themeScore / maxSI) * 50 + (predictedTheo / (stats?.maxThemeTheo || 5)) * 30 + (feats.length >= 2 ? 10 : feats.length * 5) + (matchingGames.length >= 3 ? 10 : 0)), 100);
    
    // Determine verdict
    let verdict, verdictColor, verdictBg;
    if (normalizedScore >= 75) { verdict = 'Strong Potential'; verdictColor = 'text-emerald-700 dark:text-emerald-300'; verdictBg = 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'; }
    else if (normalizedScore >= 50) { verdict = 'Decent Potential'; verdictColor = 'text-blue-700 dark:text-blue-300'; verdictBg = 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'; }
    else if (normalizedScore >= 25) { verdict = 'Needs Refinement'; verdictColor = 'text-amber-700 dark:text-amber-300'; verdictBg = 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'; }
    else { verdict = 'High Risk'; verdictColor = 'text-red-700 dark:text-red-300'; verdictBg = 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'; }
    
    // Build results HTML
    let html = '';
    
    // 1. Verdict Card
    html += `
    <div class="${verdictBg} border rounded-2xl p-6">
        <div class="flex items-center justify-between mb-4">
            <div>
                <div class="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Market Analysis</div>
                <div class="text-xl font-bold ${verdictColor}">${verdict}</div>
            </div>
            <div class="text-right">
                <div class="text-4xl font-black ${verdictColor}">${normalizedScore}</div>
                <div class="text-[10px] text-gray-400 font-medium">/ 100</div>
            </div>
        </div>
        <div class="grid grid-cols-3 gap-4 mt-4">
            <div class="text-center">
                <div class="text-lg font-bold text-gray-900 dark:text-white">${predictedTheo ? predictedTheo.toFixed(2) : '—'}</div>
                <div class="text-[10px] text-gray-500">Predicted Theo</div>
            </div>
            <div class="text-center">
                <div class="text-lg font-bold text-gray-900 dark:text-white">${matchingGames.length}</div>
                <div class="text-[10px] text-gray-500">Similar Games</div>
            </div>
            <div class="text-center">
                <div class="text-lg font-bold ${satColor}">${saturation}</div>
                <div class="text-[10px] text-gray-500">Market Saturation</div>
            </div>
        </div>
    </div>`;
    
    // 2. Closest Matches
    if (exactMatches.length > 0 || matchingGames.length > 0) {
        const showGames = exactMatches.length >= 2 ? exactMatches.slice(0, 6) : matchingGames.slice(0, 6);
        const matchLabel = exactMatches.length >= 2 ? `Games with exact recipe (${exactMatches.length})` : `Similar games in ${primaryTheme} (${matchingGames.length})`;
        html += `
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div class="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-bold text-gray-900 dark:text-white">🎮 ${matchLabel}</h3>
                    ${exactMatches.length >= 2 ? `<span class="text-xs text-gray-400">Avg Theo: <span class="font-bold ${exactAvgTheo >= globalAvg ? 'text-emerald-500' : 'text-red-400'}">${exactAvgTheo.toFixed(2)}</span></span>` : ''}
                </div>
            </div>
            <div class="p-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    ${showGames.map(g => {
                        const gFeats = parseFeatsLocal(g.features);
                        const theo = g.performance_theo_win || 0;
                        const isAbove = theo >= globalAvg;
                        return `
                        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors cursor-pointer" onclick="${safeOnclick('window.showGameDetails', g.name)}">
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(g.name)}</div>
                                <div class="text-[10px] text-gray-400">${escapeHtml(g.provider_studio || '')} · ${gFeats.slice(0,2).join(', ')}${gFeats.length > 2 ? ' +' + (gFeats.length-2) : ''}</div>
                            </div>
                            <div class="text-right shrink-0">
                                <div class="text-sm font-bold ${isAbove ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}">${theo.toFixed(2)}</div>
                                <div class="text-[9px] text-gray-400">theo</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>`;
    }
    
    // 3. Feature-by-feature impact for detected theme
    if (primaryTheme && themeData.length > 0) {
        const themeGames = allGames.filter(g => (g.theme_consolidated || '').toLowerCase() === primaryTheme.toLowerCase());
        const themeAvg = themeGames.length > 0 ? themeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / themeGames.length : 0;
        
        const featImpact = FEATS.map(f => {
            const withFeat = themeGames.filter(g => parseFeatsLocal(g.features).includes(f));
            if (withFeat.length < 2) return null;
            const avg = withFeat.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withFeat.length;
            const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg * 100) : 0;
            return { feat: f, avg, lift, count: withFeat.length, selected: feats.includes(f) };
        }).filter(Boolean).sort((a, b) => b.lift - a.lift);
        
        if (featImpact.length > 0) {
            html += `
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
                <div class="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-sm font-bold text-gray-900 dark:text-white">📊 Feature Impact for ${escapeHtml(primaryTheme)}</h3>
                    <p class="text-[10px] text-gray-400 mt-0.5">How each feature affects performance in this theme (baseline: ${themeAvg.toFixed(2)} avg theo)</p>
                </div>
                <div class="p-4 space-y-1.5">
                    ${featImpact.map(fi => {
                        const isPos = fi.lift >= 0;
                        const barW = Math.min(Math.abs(fi.lift) / 30 * 100, 100);
                        return `
                        <div class="flex items-center gap-3 py-1.5 ${fi.selected ? 'bg-indigo-50 dark:bg-indigo-900/20 -mx-2 px-2 rounded-lg ring-1 ring-indigo-200 dark:ring-indigo-800' : ''}">
                            <span class="text-xs w-24 font-medium ${fi.selected ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'} shrink-0">${escapeHtml(shortF[fi.feat]||fi.feat)}</span>
                            <div class="flex-1 flex items-center gap-2">
                                <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden relative">
                                    <div class="absolute inset-y-0 ${isPos ? 'left-1/2' : 'right-1/2'} h-full rounded-full ${isPos ? 'bg-emerald-400' : 'bg-red-400'}" style="width:${barW/2}%"></div>
                                </div>
                            </div>
                            <span class="text-xs font-bold tabular-nums w-14 text-right ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">${isPos ? '+' : ''}${fi.lift.toFixed(0)}%</span>
                            <span class="text-[10px] text-gray-400 w-16 text-right">${fi.count} games</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }
    }
    
    // 4. Suggestions
    const suggestions = [];
    if (!primaryTheme) suggestions.push('Try mentioning a specific theme like "Egyptian", "Asian", "Fantasy", or "Adventure"');
    if (feats.length === 0) suggestions.push('Add specific features like "free spins", "hold and spin", "wild reels", or "jackpot"');
    if (feats.length === 1) suggestions.push('Games with 2-3 features tend to perform better — consider adding another mechanic');
    if (matchingGames.length > 40) suggestions.push(`${primaryTheme} is a crowded market with ${matchingGames.length} existing games — consider a less saturated theme`);
    if (predictedTheo > 0 && predictedTheo < globalAvg) suggestions.push('This combination historically underperforms the market average — consider different features');
    
    // Find best feature not yet selected
    if (primaryTheme && feats.length < 3) {
        const themeGames = allGames.filter(g => (g.theme_consolidated || '').toLowerCase() === primaryTheme.toLowerCase());
        const themeAvg = themeGames.length > 0 ? themeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / themeGames.length : 0;
        let bestUnselected = null;
        let bestLift = -Infinity;
        FEATS.forEach(f => {
            if (feats.includes(f)) return;
            const wf = themeGames.filter(g => parseFeatsLocal(g.features).includes(f));
            if (wf.length < 3) return;
            const avg = wf.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / wf.length;
            const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg * 100) : 0;
            if (lift > bestLift) { bestLift = lift; bestUnselected = f; }
        });
        if (bestUnselected && bestLift > 0) {
            suggestions.push(`Consider adding <strong>${shortF[bestUnselected] || bestUnselected}</strong> — it boosts ${primaryTheme} performance by +${bestLift.toFixed(0)}%`);
        }
    }
    
    if (suggestions.length > 0) {
        html += `
        <div class="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-5">
            <div class="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-2">💡 Suggestions</div>
            <ul class="space-y-1.5">
                ${suggestions.map(s => `<li class="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2"><span class="text-violet-400 mt-0.5">→</span><span>${s}</span></li>`).join('')}
            </ul>
        </div>`;
    }
    
    resultsDiv.innerHTML = html;
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.analyzeGameConcept = analyzeGameConcept;

// Legacy useOpportunityCombo — now fills the concept input instead
async function useOpportunityCombo(theme, mechanic) {
    const container = document.getElementById('page-container');
    const conceptInput = document.getElementById('concept-input');
    if (!conceptInput) {
        await showPage('prediction');
        setTimeout(() => {
            const ci = document.getElementById('concept-input');
            if (ci) { ci.value = `${theme} theme with ${mechanic}`; analyzeGameConcept(); }
        }, 200);
        return;
    }
    conceptInput.value = `${theme} theme with ${mechanic}`;
    analyzeGameConcept();
}
window.useOpportunityCombo = useOpportunityCombo;

// --- Feedback Tickets page ---
async function renderTickets() {
    const container = document.getElementById('tickets-content');
    if (!container) return;
    try {
        const [ticketsRes, sessionRes] = await Promise.all([
            fetch('/api/tickets'),
            fetch('/api/session'),
        ]);
        if (!ticketsRes.ok) throw new Error('Failed to load');
        const tickets = await ticketsRes.json();
        const sessionData = sessionRes.ok ? await sessionRes.json() : {};
        const userIsAdmin = sessionData?.user?.role === 'admin';

        if (tickets.length === 0) {
            container.innerHTML = '<div class="text-center py-12 text-gray-500 dark:text-gray-400">No tickets submitted yet</div>';
            return;
        }

        tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        container.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-900">
                        <tr class="border-b border-gray-200 dark:border-gray-700">
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            ${userIsAdmin ? '<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>' : ''}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${tickets.map(t => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">${new Date(t.createdAt).toLocaleDateString()}</td>
                                <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(t.gameName || '')}</td>
                                <td class="px-4 py-3"><span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">${escapeHtml(t.issueType || '')}</span></td>
                                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">${escapeHtml(t.description || '')}</td>
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${escapeHtml(t.submittedBy || '')}</td>
                                <td class="px-4 py-3"><span class="px-2 py-1 text-xs rounded-full ${t.status === 'open' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'}">${escapeHtml(t.status || '')}</span></td>
                                ${userIsAdmin ? `<td class="px-4 py-3">
                                    ${t.status === 'open' ? `<button onclick="window.resolveTicket('${escapeAttr(t.id)}')" class="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium">Resolve</button>` : '<span class="text-xs text-gray-400">Done</span>'}
                                </td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<div class="text-center py-8 text-red-500">Failed to load tickets</div>';
    }
}

window.resolveTicket = async function(id) {
    try {
        const res = await fetch(`/api/tickets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'resolved' }),
        });
        if (res.ok) window.renderTickets();
    } catch (err) {
        console.error('Failed to resolve ticket:', err);
    }
};

window.renderTickets = renderTickets;

// Initialize Prediction Form
export function setupPrediction() {
    log('🔮 setupPrediction() called');
    const themesContainer = document.getElementById('game-themes');
    const mechanicsContainer = document.getElementById('game-mechanics');
    
    log('  - game-themes element:', !!themesContainer);
    log('  - game-mechanics element:', !!mechanicsContainer);
    
    if (!themesContainer || !mechanicsContainer) {
        warn('⚠️ Prediction containers not found - skipping setup');
        return;
    }
    
    log('  - Populating', gameData.themes.length, 'themes...');
    
    // Populate themes as clickable chips (SINGLE SELECTION ONLY) - show all, sorted by Smart Index
    gameData.themes.forEach(theme => {
        const chip = document.createElement('div');
        chip.className = 'theme-chip inline-block px-4 py-2.5 rounded-lg text-base font-medium cursor-pointer bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-indigo-100 dark:hover:bg-indigo-900 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors';
        chip.dataset.theme = theme.Theme;
        chip.textContent = `${theme.Theme} (${theme['Game Count']} games)`;
        chip.title = `Smart Index: ${theme['Smart Index'].toFixed(1)}`;
        
        chip.addEventListener('click', function() {
            // SINGLE SELECTION: Deselect all other theme chips first
            document.querySelectorAll('#game-themes > div').forEach(c => {
                c.classList.remove('selected', 'bg-indigo-600', 'dark:bg-indigo-500', 'text-white');
                c.classList.add('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
            });
            // Then select this one
            this.classList.add('selected', 'bg-indigo-600', 'dark:bg-indigo-500', 'text-white');
            this.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
        });
        
        themesContainer.appendChild(chip);
    });
    
    // Theme search filter
    const themeSearch = document.getElementById('theme-search');
    if (themeSearch) {
        themeSearch.addEventListener('input', () => {
            const q = themeSearch.value.toLowerCase();
            themesContainer.querySelectorAll('.theme-chip').forEach(chip => {
                chip.style.display = !q || chip.dataset.theme.toLowerCase().includes(q) ? '' : 'none';
            });
        });
    }
    
    // Populate mechanics as clickable chips (no checkboxes) - USE CONFIG (all valid mechanics), not just data
    const validMechanics = Object.keys(VALID_MECHANICS);
    
    // Sort alphabetically for easier finding
    validMechanics.sort().forEach(mechName => {
        const chip = document.createElement('div');
        chip.className = 'mechanic-chip inline-block px-4 py-2.5 rounded-lg text-base font-medium cursor-pointer bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900 hover:text-purple-700 dark:hover:text-purple-300 transition-colors';
        chip.dataset.mechanic = mechName;
        
        // Try to get Smart Index from data, if not available show as "New"
        const dataM = gameData.mechanics.find(m => m.Mechanic === mechName);
        const siText = dataM ? `SI: ${dataM['Smart Index'].toFixed(1)}` : 'New';
        chip.textContent = `${mechName} (${siText})`;
        
        // Add tooltip with description
        const mechDef = getMechanicDefinition(mechName);
        if (mechDef) {
            chip.title = mechDef.description;
        }
        
        chip.addEventListener('click', function() {
            this.classList.toggle('selected');
            // Toggle purple highlight for selected state
            if (this.classList.contains('selected')) {
                this.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
                this.classList.add('bg-purple-600', 'dark:bg-purple-500', 'text-white');
            } else {
                this.classList.add('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
                this.classList.remove('bg-purple-600', 'dark:bg-purple-500', 'text-white');
            }
        });
        
        mechanicsContainer.appendChild(chip);
    });
    
    // Mechanic search filter
    const mechanicSearch = document.getElementById('mechanic-search');
    if (mechanicSearch) {
        mechanicSearch.addEventListener('input', () => {
            const q = mechanicSearch.value.toLowerCase();
            mechanicsContainer.querySelectorAll('.mechanic-chip').forEach(chip => {
                chip.style.display = !q || chip.dataset.mechanic.toLowerCase().includes(q) ? '' : 'none';
            });
        });
    }
}

// Predict Game Success
export function predictGameSuccess() {
    log('🎯 predictGameSuccess() called');
    
    const gameName = document.getElementById('game-name').value;
    const selectedThemes = Array.from(document.querySelectorAll('#game-themes .theme-chip.selected')).map(chip => chip.dataset.theme);
    const selectedMechanics = Array.from(document.querySelectorAll('#game-mechanics .mechanic-chip.selected')).map(chip => chip.dataset.mechanic);

    log('  Selected themes:', selectedThemes);
    log('  Selected mechanics:', selectedMechanics);
    
    if (selectedThemes.length === 0) {
        const themeSection = document.querySelector('.prediction-theme-section, #prediction-themes');
        if (themeSection) {
            themeSection.classList.add('ring-2', 'ring-red-400');
            themeSection.style.animation = 'blink-field 0.3s ease 3';
            setTimeout(() => { themeSection.classList.remove('ring-2', 'ring-red-400'); themeSection.style.animation = ''; }, 1000);
        }
        return;
    }
    
    const primaryTheme = selectedThemes[0];
    
    // 1. SMART: Find actual similar games in dataset
    const similarResult = predictFromSimilarGames(primaryTheme, selectedMechanics);
    const stats = getDatasetStats();
    
    const themeData = selectedThemes.map(theme => gameData.themes.find(t => t.Theme === theme)).filter(Boolean);
    const mechData = selectedMechanics.map(mech => gameData.mechanics.find(m => m.Mechanic === mech)).filter(Boolean);
    
    const avgThemeSmartIndex = themeData.length ? themeData.reduce((sum, t) => sum + (t['Smart Index'] || 0), 0) / themeData.length : 0;
    const avgMechSmartIndex = mechData.length ? mechData.reduce((sum, m) => sum + (m['Smart Index'] || 0), 0) / mechData.length : avgThemeSmartIndex * 0.8;
    const avgThemePerformance = themeData.length ? themeData.reduce((sum, t) => sum + (t['Avg Theo Win Index'] || 0), 0) / themeData.length : 0;
    const themePopularity = themeData.length ? themeData.reduce((sum, t) => sum + (t['Game Count'] || 0), 0) / themeData.length : 0;
    
    // 2. Data-driven scoring (use actual dataset max values)
    const maxSI = stats?.maxThemeSI || 250;
    const maxMechSI = stats?.maxMechSI || 90;
    const maxCount = stats?.maxThemeCount || 500;
    const maxTheo = stats?.maxThemeTheo || 2;
    
    const themeScore = Math.min((avgThemeSmartIndex / maxSI) * 40, 40);
    const mechScore = Math.min((avgMechSmartIndex / maxMechSI) * 30, 30);
    const popularityScore = Math.min((themePopularity / maxCount) * 15, 15);
    const performanceScore = Math.min((avgThemePerformance / maxTheo) * 15, 15);
    
    // 3. Boost score if we have similar games data (primary signal)
    let totalScore = Math.min(Math.round(themeScore + mechScore + popularityScore + performanceScore), 100);
    if (similarResult) {
        const similarBoost = Math.min(similarResult.percentile * 0.3, 15);
        totalScore = Math.min(Math.round(totalScore + similarBoost), 100);
    }
    
    // 4. Use analytics engine for insights (when we have predicted theo)
    const predictedTheo = similarResult?.predictedTheo ?? avgThemePerformance;
    const zScore = gameData.allGames?.length ? ((predictedTheo - 3) / 2) : 0;
    const insights = analyzeGameSuccessFactors('Predicted', predictedTheo, zScore, selectedThemes);
    const engineRecs = generateRecommendations(insights, selectedThemes, zScore);
    
    // Build recommendation text
    let mainRecText = '';
    if (totalScore >= 75) {
        mainRecText = similarResult
            ? `Based on <strong>${similarResult.similarCount} similar games</strong> in our database (avg Theo Win: ${predictedTheo.toFixed(2)}), your concept shows strong potential.`
            : 'Your game concept shows strong potential based on historical data. The theme and mechanic combination is proven to perform well.';
    } else if (totalScore >= 50) {
        mainRecText = similarResult
            ? `Based on ${similarResult.similarCount} similar games (avg Theo: ${predictedTheo.toFixed(2)}). Consider adding popular mechanics or refining theme selection.`
            : 'Your concept has decent potential but could be improved. Consider adding popular mechanics or refining theme selection.';
    } else {
        mainRecText = similarResult
            ? `Only ${similarResult.similarCount} similar games found (avg Theo: ${predictedTheo.toFixed(2)}). Consider themes/mechanics with stronger historical performance.`
            : 'This combination shows weak historical performance. Consider choosing themes or mechanics with higher Smart Index scores.';
    }
    
    const recommendationItems = [mainRecText];
    if (insights?.length) recommendationItems.push(insights.slice(0, 2).join(' '));
    engineRecs.slice(0, 1).forEach(r => recommendationItems.push(r));
    
    // Display results
    const resultsDiv = document.getElementById('prediction-results');
    const outputDiv = document.getElementById('prediction-output');
    const sidebarOutput = document.getElementById('prediction-output-sidebar');
    
    // Determine category class and label
    let categoryClass;
    let categoryLabel;
    if (totalScore >= 75) {
        categoryClass = 'category-excellent';
        categoryLabel = '✨ Excellent Potential';
    } else if (totalScore >= 50) {
        categoryClass = 'category-good';
        categoryLabel = '👍 Good Concept';
    } else if (totalScore >= 25) {
        categoryClass = 'category-average';
        categoryLabel = '⚠️ Needs Work';
    } else {
        categoryClass = 'category-poor';
        categoryLabel = '❌ High Risk';
    }
    
    const htmlContent = `
        <!-- Hero Score -->
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <div class="prediction-score">${totalScore}</div>
            <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.75rem;">out of 100</div>
            <span class="prediction-category ${categoryClass}">${categoryLabel}</span>
        </div>
        
        ${similarResult ? `
        <!-- Similar Games Data -->
        <div class="result-section">
            <strong>📊 Based on ${similarResult.similarCount} similar games</strong>
            <div class="analysis-item">
                <div class="analysis-label">Predicted Theo Win</div>
                <div class="analysis-value">${predictedTheo.toFixed(2)}</div>
            </div>
            <div class="analysis-item">
                <div class="analysis-label">Percentile</div>
                <div class="analysis-value">${similarResult.percentile.toFixed(0)}th</div>
            </div>
            ${similarResult.similarGames?.length ? `
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Examples: ${similarResult.similarGames.map(g => g.name).join(', ')}</p>
            ` : ''}
        </div>
        ` : ''}
        
        <!-- Recommendation Alert -->
        <div class="recommendation-card" style="margin-bottom: 1.25rem;">
            ${recommendationItems.map(t => `<p class="mb-2 last:mb-0">${t}</p>`).join('')}
        </div>
        
        <!-- Performance Breakdown -->
        <div class="result-section">
            <strong>📊 Performance Breakdown</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.75rem;">
                <div>
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.05em;">Theme</div>
                    <div class="metric-value">${Math.round(themeScore)}<span style="font-size: 1rem; color: #94a3b8;">/40</span></div>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${(themeScore/40)*100}%;"></div></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.05em;">Mechanic</div>
                    <div class="metric-value">${Math.round(mechScore)}<span style="font-size: 1rem; color: #94a3b8;">/30</span></div>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${(mechScore/30)*100}%;"></div></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.05em;">Popularity</div>
                    <div class="metric-value">${Math.round(popularityScore)}<span style="font-size: 1rem; color: #94a3b8;">/15</span></div>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${(popularityScore/15)*100}%;"></div></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.05em;">Performance</div>
                    <div class="metric-value">${Math.round(performanceScore)}<span style="font-size: 1rem; color: #94a3b8;">/15</span></div>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${(performanceScore/15)*100}%;"></div></div>
                </div>
            </div>
        </div>
        
        <!-- Theme Analysis -->
        <div class="result-section">
            <strong>🎨 Theme Analysis</strong>
            ${themeData.map(t => `
                <div class="analysis-item">
                    <div class="analysis-label">${t.Theme}</div>
                    <div class="analysis-value">${t['Smart Index'].toFixed(1)}</div>
                </div>
            `).join('')}
        </div>
        
        <!-- Mechanic Analysis -->
        ${mechData.length > 0 ? `
            <div class="result-section">
                <strong>⚙️ Mechanic Analysis</strong>
                ${mechData.map(m => `
                    <div class="analysis-item">
                        <div class="analysis-label">${m.Mechanic}</div>
                        <div class="analysis-value">${m['Smart Index'].toFixed(1)}</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
    
    // Output to SIDEBAR, not below!
    if (sidebarOutput) {
        sidebarOutput.innerHTML = htmlContent;
        log('✅ Prediction results displayed in RIGHT SIDEBAR');
        // Scroll sidebar into view
        const sidebar = document.getElementById('prediction-results-sidebar');
        if (sidebar) {
            sidebar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    } else {
        console.error('❌ prediction-output-sidebar element not found!');
    }
    
    // Also keep old output for backwards compat
    if (outputDiv) outputDiv.innerHTML = htmlContent;
    
    // DON'T show the old results div below
    if (resultsDiv) resultsDiv.style.display = 'none';
    
    log('✅ Prediction complete - results in sidebar');
}

// Market Insights & Analysis
export function generateInsights() {
    log('💡 generateInsights() called');
    
    // Check if containers exist
    const hotDiv = document.getElementById('hot-combinations');
    const gapDiv = document.getElementById('market-gaps');
    const trendDiv = document.getElementById('emerging-trends');
    const satDiv = document.getElementById('saturated-markets');
    const heatmapDiv = document.getElementById('heatmap-container');
    const comboDiv = document.getElementById('combo-explorer');
    const avoidDiv = document.getElementById('avoid-combos');
    const watchDiv = document.getElementById('watch-list-combos');
    
    log('  - Generating insights from', gameData.themes?.length || 0, 'themes...');
    
    // 0. Feature Impact by Theme (% lift when feature is present)
    if (heatmapDiv) {
        try {
            const allG = gameData.allGames || [];
            const FEATS = ['Cash On Reels','Expanding Reels','Free Spins','Hold and Spin','Nudges','Persistence','Pick Bonus','Respin','Static Jackpot','Wheel','Wild Reels'];
            const shortF = {'Cash On Reels':'Cash Reels','Expanding Reels':'Expand','Free Spins':'Free Spins','Hold and Spin':'Hold&Spin','Nudges':'Nudge','Persistence':'Persist','Pick Bonus':'Pick','Respin':'Respin','Static Jackpot':'Jackpot','Wheel':'Wheel','Wild Reels':'Wild Reels'};

            const themeMap = {};
            allG.forEach(g => {
                const theme = g.theme_consolidated || '';
                if (!theme || /^unknown$/i.test(theme)) return;
                const feats = parseFeatsLocal(g.features);
                const theo = g.performance_theo_win || 0;
                if (!themeMap[theme]) themeMap[theme] = { games: [], totalTheo: 0 };
                themeMap[theme].games.push({ feats, theo, name: g.name || '' });
                themeMap[theme].totalTheo += theo;
            });

            const topThemeNames = (gameData.themes || [])
                .filter(t => t.Theme && (t['Game Count'] || 0) >= 5)
                .sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0))
                .slice(0, 12)
                .map(t => t.Theme);

            const matrix = topThemeNames.map(t => {
                const tg = themeMap[t]?.games || [];
                const themeAvg = tg.length > 0 ? tg.reduce((s, g) => s + g.theo, 0) / tg.length : 0;
                return FEATS.map(f => {
                    const withFeat = tg.filter(g => g.feats.includes(f));
                    if (withFeat.length < 2) return null;
                    const avg = withFeat.reduce((s, g) => s + g.theo, 0) / withFeat.length;
                    const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg) * 100 : 0;
                    return { avgTheo: avg, count: withFeat.length, lift, themeAvg, names: withFeat.sort((a,b) => b.theo - a.theo).slice(0,4).map(g => g.name) };
                });
            });

            const allLifts = matrix.flat().filter(Boolean).map(x => x.lift);
            const maxLift = Math.max(...allLifts.map(Math.abs), 1);

            heatmapDiv.innerHTML = `
                <div class="relative">
                <div id="heatmap-tooltip" class="fixed z-[9999] pointer-events-none opacity-0 transition-opacity duration-150" style="display:none"></div>
                <table class="heatmap-table text-[11px] border-collapse w-full">
                    <thead><tr>
                        <th class="p-2 text-left font-medium text-gray-600 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10 min-w-[90px]"></th>
                        ${FEATS.map(f => `<th class="pb-2 pt-0 px-1 text-center font-medium text-gray-600 dark:text-gray-400" title="${escapeAttr(f)}"><div style="writing-mode:vertical-lr;transform:rotate(180deg);white-space:nowrap;font-size:9px;max-height:90px;overflow:hidden;text-overflow:ellipsis;margin:0 auto">${escapeHtml(shortF[f]||f)}</div></th>`).join('')}
                    </tr></thead>
                    <tbody>
                        ${topThemeNames.map((t, i) => `
                            <tr>
                                <td class="p-2 font-medium text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 z-10 whitespace-nowrap text-[10px]">${escapeHtml(t)}</td>
                                ${matrix[i].map((cell, j) => {
                                    if (!cell) return '<td class="p-1 min-w-[44px] h-8 bg-gray-50 dark:bg-gray-700/30 rounded text-center text-[9px] text-gray-300 dark:text-gray-600">·</td>';
                                    const lift = cell.lift;
                                    const intensity = Math.min(Math.abs(lift) / maxLift, 1);
                                    let bg, textCol;
                                    if (lift >= 0) {
                                        const alpha = 0.15 + intensity * 0.55;
                                        bg = `rgba(16,185,129,${alpha})`;
                                        textCol = intensity > 0.3 ? '#065f46' : '#6b7280';
                                    } else {
                                        const alpha = 0.15 + intensity * 0.55;
                                        bg = `rgba(239,68,68,${alpha})`;
                                        textCol = intensity > 0.3 ? '#991b1b' : '#6b7280';
                                    }
                                    const display = lift >= 0 ? `+${lift.toFixed(0)}%` : `${lift.toFixed(0)}%`;
                                    return `<td class="hm-cell p-1 min-w-[44px] h-8 text-center align-middle rounded cursor-pointer transition-all duration-150 hover:scale-110 hover:z-20 hover:shadow-lg hover:ring-2 hover:ring-white/60 text-[10px] font-semibold" style="background:${bg};color:${textCol}" data-theme="${escapeAttr(t)}" data-feat="${escapeAttr(FEATS[j])}" data-theo="${cell.avgTheo.toFixed(2)}" data-count="${cell.count}" data-lift="${lift.toFixed(1)}" data-tavg="${cell.themeAvg.toFixed(2)}" data-names="${escapeAttr(cell.names.join('|'))}" onclick="if(window.useOpportunityCombo){${safeOnclick('window.useOpportunityCombo', t, FEATS[j])}}">${display}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="flex items-center justify-center gap-4 mt-3 text-[9px] text-gray-400">
                    <span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:rgba(16,185,129,0.5)"></span> Improves theme</span>
                    <span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:rgba(239,68,68,0.5)"></span> Worsens theme</span>
                    <span>· = insufficient data</span>
                </div>
                </div>
            `;
            const tooltip = document.getElementById('heatmap-tooltip');
            heatmapDiv.addEventListener('mouseover', (e) => {
                const td = e.target.closest('.hm-cell');
                if (!td || !tooltip) return;
                const theme = td.dataset.theme;
                const feat = td.dataset.feat;
                const theo = parseFloat(td.dataset.theo);
                const count = td.dataset.count;
                const lift = parseFloat(td.dataset.lift);
                const themeAvg = parseFloat(td.dataset.tavg || '0');
                const names = (td.dataset.names || '').split('|').filter(Boolean);
                const isPositive = lift >= 0;
                const liftColor = isPositive ? 'text-emerald-400' : 'text-red-400';
                const perfLabel = lift >= 20 ? '🔥 Strong boost' : lift >= 5 ? '✅ Positive impact' : lift >= -5 ? '➡️ Neutral' : lift >= -20 ? '⚠️ Negative impact' : '❌ Strong drag';
                tooltip.innerHTML = `
                    <div class="bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700 px-4 py-3 min-w-[220px] max-w-[300px]">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">${escapeHtml(theme)}</div>
                        <div class="text-xs text-gray-300 mb-2">+ ${escapeHtml(feat)}</div>
                        <div class="flex items-baseline gap-2 mb-1.5">
                            <span class="text-lg font-bold ${liftColor}">${isPositive ? '+' : ''}${lift.toFixed(1)}%</span>
                            <span class="text-[10px] text-gray-400">lift vs theme avg</span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] mb-1">
                            <span class="text-gray-400">With feature: <span class="text-white font-medium">${theo.toFixed(2)}</span> avg theo</span>
                        </div>
                        <div class="flex items-center justify-between text-[11px] mb-1.5">
                            <span class="text-gray-400">Theme baseline: <span class="text-gray-300">${themeAvg.toFixed(2)}</span></span>
                            <span class="text-gray-400">${count} games</span>
                        </div>
                        ${names.length > 0 ? `<div class="border-t border-gray-700 pt-1.5 mt-1"><div class="text-[9px] text-gray-500 font-bold uppercase mb-1">Top games</div>${names.map(n => `<div class="text-[10px] text-gray-300 truncate">${escapeHtml(n)}</div>`).join('')}</div>` : ''}
                        <div class="text-[9px] pt-1 text-gray-500">${perfLabel}</div>
                    </div>
                `;
                tooltip.style.display = 'block';
                requestAnimationFrame(() => tooltip.style.opacity = '1');
                const rect = td.getBoundingClientRect();
                const ttRect = tooltip.getBoundingClientRect();
                let left = rect.left + rect.width / 2 - ttRect.width / 2;
                let top = rect.top - ttRect.height - 8;
                if (top < 8) top = rect.bottom + 8;
                if (left < 8) left = 8;
                if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
            });
            heatmapDiv.addEventListener('mouseout', (e) => {
                const td = e.target.closest('.hm-cell');
                if (!td || !tooltip) return;
                const related = e.relatedTarget;
                if (related && (related.closest('.hm-cell') || related.closest('#heatmap-tooltip'))) return;
                tooltip.style.opacity = '0';
                setTimeout(() => { if (tooltip.style.opacity === '0') tooltip.style.display = 'none'; }, 150);
            });
        } catch (e) {
            heatmapDiv.innerHTML = '<p class="text-sm text-gray-500">Heatmap data unavailable</p>';
        }
    }

    // 0b. Feature Synergy Explorer — inject full card HTML via JS to avoid HTML-cache issues
    let synergyWrapper = document.getElementById('synergy-explorer-wrapper');
    if (!synergyWrapper) {
        // Fallback: create wrapper dynamically before the provider section
        const providerSection = document.getElementById('provider-theme-matrix')?.closest('.bg-white');
        if (providerSection) {
            synergyWrapper = document.createElement('div');
            synergyWrapper.id = 'synergy-explorer-wrapper';
            synergyWrapper.className = 'mb-4';
            providerSection.parentNode.insertBefore(synergyWrapper, providerSection);
        }
    }
    if (synergyWrapper) {
        synergyWrapper.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div class="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🧬</span>
                    <div>
                        <h3 class="text-sm font-bold text-gray-900 dark:text-white leading-none">Feature Synergy Explorer</h3>
                        <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Which feature pairs perform better together than alone — the winning recipes for game designers</p>
                    </div>
                </div>
            </div>
            <div id="synergy-container" class="p-4"></div>
        </div>`;
    }
    const synergyDiv = document.getElementById('synergy-container');
    if (synergyDiv) {
        try {
            const allG = gameData.allGames || [];
            const FEATS = ['Cash On Reels','Expanding Reels','Free Spins','Hold and Spin','Nudges','Persistence','Pick Bonus','Respin','Static Jackpot','Wheel','Wild Reels'];
            const shortF = {'Cash On Reels':'Cash Reels','Expanding Reels':'Expand','Free Spins':'Free Spins','Hold and Spin':'Hold&Spin','Nudges':'Nudge','Persistence':'Persist','Pick Bonus':'Pick','Respin':'Respin','Static Jackpot':'Jackpot','Wheel':'Wheel','Wild Reels':'Wild Reels'};
            const globalAvg = allG.length > 0 ? allG.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allG.length : 0;

            const pairData = [];
            for (let a = 0; a < FEATS.length; a++) {
                for (let b = a + 1; b < FEATS.length; b++) {
                    const fA = FEATS[a], fB = FEATS[b];
                    const withBoth = allG.filter(g => {
                        const f = parseFeatsLocal(g.features);
                        return f.includes(fA) && f.includes(fB);
                    });
                    if (withBoth.length < 3) continue;
                    const avgTheo = withBoth.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withBoth.length;
                    const onlyA = allG.filter(g => { const f = parseFeatsLocal(g.features); return f.includes(fA) && !f.includes(fB); });
                    const onlyB = allG.filter(g => { const f = parseFeatsLocal(g.features); return f.includes(fB) && !f.includes(fA); });
                    const soloAvgA = onlyA.length > 0 ? onlyA.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / onlyA.length : globalAvg;
                    const soloAvgB = onlyB.length > 0 ? onlyB.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / onlyB.length : globalAvg;
                    const bestSolo = Math.max(soloAvgA, soloAvgB);
                    const synergy = bestSolo > 0 ? ((avgTheo - bestSolo) / bestSolo) * 100 : 0;
                    const liftVsMarket = globalAvg > 0 ? ((avgTheo - globalAvg) / globalAvg) * 100 : 0;
                    const themeMapS = {};
                    withBoth.forEach(g => {
                        const t = g.theme_consolidated || 'Unknown';
                        if (!themeMapS[t]) themeMapS[t] = { sum: 0, count: 0 };
                        themeMapS[t].sum += (g.performance_theo_win || 0);
                        themeMapS[t].count++;
                    });
                    const topThemes = Object.entries(themeMapS)
                        .filter(([, d]) => d.count >= 2)
                        .map(([name, d]) => ({ name, avg: d.sum / d.count, count: d.count }))
                        .sort((x, y) => y.avg - x.avg).slice(0, 3);
                    const topGames = [...withBoth].sort((x, y) => (y.performance_theo_win || 0) - (x.performance_theo_win || 0)).slice(0, 3).map(g => g.name || 'Unknown');
                    pairData.push({ fA, fB, count: withBoth.length, avgTheo, synergy, liftVsMarket, topThemes, topGames });
                }
            }
            pairData.sort((a, b) => b.synergy - a.synergy);
            const topPairs = pairData.slice(0, 12);
            const maxSynergy = Math.max(...topPairs.map(p => Math.abs(p.synergy)), 1);

            synergyDiv.innerHTML = `
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    ${topPairs.map((p, i) => {
                        const barW = Math.min(Math.abs(p.synergy) / maxSynergy * 100, 100);
                        const isPos = p.synergy >= 0;
                        const barColor = isPos ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-red-400 dark:bg-red-500';
                        const synergyColor = isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                        const liftLabel = p.liftVsMarket >= 0 ? `+${p.liftVsMarket.toFixed(0)}%` : `${p.liftVsMarket.toFixed(0)}%`;
                        const themeChips = p.topThemes.map(t => `<span class="inline-block px-1.5 py-0.5 text-[9px] rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" title="${t.count} games, ${t.avg.toFixed(1)} avg">${escapeHtml(t.name)}</span>`).join('');
                        return `
                        <div class="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600" title="Top games: ${p.topGames.map(n => escapeAttr(n)).join(', ')}">
                            <span class="text-sm w-5 text-center shrink-0">${medal || `<span class="text-[10px] text-gray-400 font-medium">${i + 1}</span>`}</span>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-1.5 mb-1">
                                    <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(shortF[p.fA] || p.fA)}</span>
                                    <span class="text-[10px] text-gray-400">+</span>
                                    <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(shortF[p.fB] || p.fB)}</span>
                                    <span class="text-[9px] text-gray-400 ml-1">${p.count} games</span>
                                    <span class="text-[9px] ${p.liftVsMarket >= 0 ? 'text-emerald-500' : 'text-red-400'} ml-auto">${liftLabel} vs mkt</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                        <div class="h-full ${barColor} rounded-full transition-all" style="width:${barW}%"></div>
                                    </div>
                                    <span class="text-xs font-bold ${synergyColor} w-12 text-right shrink-0">${isPos ? '+' : ''}${p.synergy.toFixed(0)}%</span>
                                </div>
                                ${themeChips ? `<div class="flex flex-wrap gap-1 mt-1">${themeChips}</div>` : ''}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                <div class="flex items-center justify-center gap-4 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 text-[9px] text-gray-400">
                    <span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:rgba(16,185,129,0.5)"></span> Synergy boost (pair outperforms solo)</span>
                    <span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:rgba(239,68,68,0.5)"></span> Anti-synergy (pair underperforms)</span>
                    <span>Min 3 games per pair</span>
                </div>
            `;
        } catch (e) {
            synergyDiv.innerHTML = '<p class="text-sm text-gray-500">Feature synergy data unavailable</p>';
        }
    }
    // Game Blueprint — Split layout: config left, tabbed results right
    let blueprintWrapper = document.getElementById('blueprint-advisor-wrapper');
    if (!blueprintWrapper) {
        const heatmapSection = document.getElementById('heatmap-container')?.closest('.grid, .bg-white');
        if (heatmapSection) {
            blueprintWrapper = document.createElement('div');
            blueprintWrapper.id = 'blueprint-advisor-wrapper';
            blueprintWrapper.className = 'mb-4';
            heatmapSection.parentNode.insertBefore(blueprintWrapper, heatmapSection);
        }
    }
    if (blueprintWrapper) {
        blueprintWrapper.innerHTML = `
        <div class="flex gap-5" style="min-height:420px">
            <!-- LEFT: Config Panel (sticky) -->
            <div class="w-[520px] shrink-0">
                <div class="sticky top-28 flex flex-col gap-3 max-h-[calc(100vh-8rem)]">
                    <!-- BIG Blueprint Score (always visible) -->
                    <div id="bp-score-panel" class="rounded-xl shadow-lg p-5 text-center transition-all duration-500" style="background:linear-gradient(135deg,#94a3b8,#64748b)">
                        <div class="text-base font-semibold text-white/70 uppercase tracking-wider mb-1">Blueprint Score</div>
                        <div id="bp-score-value" class="text-6xl font-black text-white leading-none mb-2">—</div>
                        <div class="w-full h-2.5 bg-white/20 rounded-full overflow-hidden mb-3">
                            <div id="bp-score-bar" class="h-full rounded-full transition-all duration-500 bg-white/80" style="width:0%"></div>
                        </div>
                        <div class="grid grid-cols-4 gap-1.5 text-center">
                            <div><div id="bp-bd-theme" class="text-lg font-bold text-white">—</div><div class="text-xs text-white/60">Theme</div></div>
                            <div><div id="bp-bd-feat" class="text-lg font-bold text-white">—</div><div class="text-xs text-white/60">Features</div></div>
                            <div><div id="bp-bd-syn" class="text-lg font-bold text-white">—</div><div class="text-xs text-white/60">Synergy</div></div>
                            <div><div id="bp-bd-opp" class="text-lg font-bold text-white">—</div><div class="text-xs text-white/60">Opportunity</div></div>
                        </div>
                    </div>

                    <!-- Scrollable config area -->
                    <div class="overflow-y-auto flex-1 space-y-3 min-h-0">
                        <!-- Header + Clear -->
                        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800 p-4">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="text-base">🎰</span>
                                    <h3 class="text-base font-bold text-gray-900 dark:text-white">Game Blueprint</h3>
                                </div>
                                <div class="flex items-center gap-1.5">
                                    <button id="bp-pick-btn" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all" title="Auto-pick best combo">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                        Pick for me
                                    </button>
                                    <button id="bp-clear-btn" class="hidden items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-all" title="Reset">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                        Clear
                                    </button>
                                </div>
                            </div>
                            <div class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Theme Category</div>
                            <div id="bp-category-pills" class="flex flex-wrap gap-1.5"></div>
                            <div id="bp-subtheme-row" class="mt-3 hidden">
                                <div class="flex items-center justify-between mb-1.5">
                                    <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sub-themes</div>
                                    <div class="flex gap-1">
                                        <button id="bp-sub-all" class="text-[10px] px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">All</button>
                                        <button id="bp-sub-none" class="text-[10px] px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-colors">None</button>
                                    </div>
                                </div>
                                <div id="bp-subtheme-checks" class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto"></div>
                            </div>
                        </div>

                        <!-- Feature Pills -->
                        <div id="bp-features-panel" class="hidden bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 p-4">
                            <div class="flex items-center justify-between mb-2">
                                <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Features <span class="normal-case font-normal">— click to add</span></div>
                                <span id="bp-feat-count" class="hidden text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"></span>
                            </div>
                            <div id="bp-feat-container" class="flex flex-wrap gap-1.5"></div>
                            <div id="bp-synergy-container" class="mt-2"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- RIGHT: Tabbed Results Panel -->
            <div class="flex-1 min-w-0">
                <div id="bp-results-area" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden">
                    <div id="bp-empty-state" class="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-500 text-base gap-2">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-40"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                        Choose a theme category to start building
                    </div>
                    <div id="bp-tabs-wrapper" class="hidden">
                        <div class="flex border-b border-gray-200 dark:border-gray-700 px-3 pt-1 gap-1">
                            <button class="bp-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 transition-all" data-tab="insights">📊 Insights</button>
                            <button class="bp-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all" data-tab="symbols">🎲 Symbols</button>
                            <button class="bp-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all" data-tab="competition">⚔️ Competition</button>
                        </div>
                        <div id="bp-tab-insights" class="bp-tab-content p-6"></div>
                        <div id="bp-tab-symbols" class="bp-tab-content p-6 hidden"></div>
                        <div id="bp-tab-competition" class="bp-tab-content p-6 hidden"></div>
                    </div>
                </div>
            </div>
        </div>`;

        const allG = gameData.allGames || [];
        const clearBtn = document.getElementById('bp-clear-btn');
        const categoryPills = document.getElementById('bp-category-pills');
        const subthemeRow = document.getElementById('bp-subtheme-row');
        const subthemeChecks = document.getElementById('bp-subtheme-checks');
        const featuresPanel = document.getElementById('bp-features-panel');
        const featContainer = document.getElementById('bp-feat-container');
        const featCountBadge = document.getElementById('bp-feat-count');
        const synergyContainer = document.getElementById('bp-synergy-container');
        const scorePanel = document.getElementById('bp-score-panel');
        const scoreValue = document.getElementById('bp-score-value');
        const scoreBar = document.getElementById('bp-score-bar');
        const bdTheme = document.getElementById('bp-bd-theme');
        const bdFeat = document.getElementById('bp-bd-feat');
        const bdSyn = document.getElementById('bp-bd-syn');
        const bdOpp = document.getElementById('bp-bd-opp');
        const emptyState = document.getElementById('bp-empty-state');
        const tabsWrapper = document.getElementById('bp-tabs-wrapper');
        const tabInsights = document.getElementById('bp-tab-insights');
        const tabCompetition = document.getElementById('bp-tab-competition');
        const tabSymbols = document.getElementById('bp-tab-symbols');
        let activeTab = 'insights';

        const FEATS = ['Cash On Reels','Expanding Reels','Free Spins','Hold and Spin','Nudges','Persistence','Pick Bonus','Respin','Static Jackpot','Wheel','Wild Reels'];
        const shortF = {'Cash On Reels':'Cash Reels','Expanding Reels':'Expand','Free Spins':'Free Spins','Hold and Spin':'Hold&Spin','Nudges':'Nudge','Persistence':'Persist','Pick Bonus':'Pick','Respin':'Respin','Static Jackpot':'Jackpot','Wheel':'Wheel','Wild Reels':'Wild Reels'};
        const featureColors = {
            'Cash On Reels': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
            'Expanding Reels': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
            'Free Spins': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
            'Hold and Spin': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
            'Nudges': 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
            'Persistence': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
            'Pick Bonus': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
            'Respin': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
            'Static Jackpot': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
            'Wheel': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
            'Wild Reels': 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
        };

        // Tab switching
        document.querySelectorAll('.bp-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                activeTab = tab.dataset.tab;
                document.querySelectorAll('.bp-tab').forEach(t => {
                    const isActive = t.dataset.tab === activeTab;
                    t.className = `bp-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${isActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30'}`;
                });
                document.querySelectorAll('.bp-tab-content').forEach(c => c.classList.add('hidden'));
                document.getElementById(`bp-tab-${activeTab}`)?.classList.remove('hidden');
            });
        });

        const themeConsolidationGroups = {};
        allG.forEach(g => {
            const primary = g.theme_primary || '';
            const consolidated = g.theme_consolidated || primary || '';
            if (!consolidated || /^unknown$/i.test(consolidated)) return;
            if (!themeConsolidationGroups[consolidated]) themeConsolidationGroups[consolidated] = { _total: 0, subs: {} };
            themeConsolidationGroups[consolidated]._total++;
            if (primary && primary !== consolidated) {
                themeConsolidationGroups[consolidated].subs[primary] = (themeConsolidationGroups[consolidated].subs[primary] || 0) + 1;
            }
        });

        const categoryList = Object.entries(themeConsolidationGroups)
            .map(([cat, data]) => ({
                cat,
                total: data._total,
                subs: Object.entries(data.subs).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
            }))
            .filter(c => c.total >= 5)
            .sort((a, b) => b.total - a.total);

        let selectedCategories = new Set();
        let selectedSubThemes = new Set();
        let selectedFeatures = new Set();
        const globalAvg = allG.length > 0 ? allG.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allG.length : 0;

        categoryPills.innerHTML = categoryList.map(c =>
            `<button class="bp-cat-pill px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400 transition-all duration-150 cursor-pointer" data-cat="${escapeAttr(c.cat)}">${escapeHtml(c.cat)} <span class="text-xs text-gray-400 font-normal">${c.total}</span></button>`
        ).join('');

        function selectCategory(catName, forceOn) {
            if (forceOn) {
                selectedCategories.add(catName);
            } else {
                if (selectedCategories.has(catName)) selectedCategories.delete(catName);
                else selectedCategories.add(catName);
            }
            selectedSubThemes.clear();
            selectedFeatures.clear();
            refreshCategoryUI();
        }

        function refreshCategoryUI() {
            document.querySelectorAll('.bp-cat-pill').forEach(p => {
                const isSel = selectedCategories.has(p.dataset.cat);
                p.className = `bp-cat-pill px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150 cursor-pointer ${
                    isSel ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 shadow-sm' :
                    'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400'
                }`;
            });

            if (selectedCategories.size === 0) {
                subthemeRow.classList.add('hidden');
                clearBtn.classList.add('hidden');
                clearBtn.classList.remove('inline-flex');
                featuresPanel.classList.add('hidden');
                emptyState.classList.remove('hidden');
                scorePanel.style.background = 'linear-gradient(135deg,#94a3b8,#64748b)';
                scoreValue.textContent = '—';
                scoreBar.style.width = '0%';
                bdTheme.textContent = '—'; bdFeat.textContent = '—'; bdSyn.textContent = '—'; bdOpp.textContent = '—';
                tabsWrapper.classList.add('hidden');
                return;
            }

            const allSubs = [];
            selectedCategories.forEach(catName => {
                const catData = categoryList.find(c => c.cat === catName);
                if (catData) catData.subs.forEach(s => allSubs.push(s));
            });

            if (allSubs.length > 0) {
                subthemeRow.classList.remove('hidden');
                subthemeChecks.innerHTML = allSubs.map(s =>
                    `<label class="inline-flex items-center gap-1.5 cursor-pointer group">
                        <input type="checkbox" value="${escapeAttr(s.name)}" class="bp-sub-cb rounded border-gray-300 dark:border-gray-600 text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5" checked>
                        <span class="text-sm text-gray-700 dark:text-gray-300 group-hover:text-indigo-600 transition-colors">${escapeHtml(s.name)} <span class="text-xs text-gray-400">(${s.count})</span></span>
                    </label>`
                ).join('');
                allSubs.forEach(s => selectedSubThemes.add(s.name));
                subthemeChecks.addEventListener('change', () => {
                    selectedSubThemes.clear();
                    document.querySelectorAll('.bp-sub-cb:checked').forEach(cb => selectedSubThemes.add(cb.value));
                    renderBlueprint();
                });
                document.getElementById('bp-sub-all')?.addEventListener('click', () => {
                    document.querySelectorAll('.bp-sub-cb').forEach(cb => { cb.checked = true; });
                    selectedSubThemes.clear();
                    allSubs.forEach(s => selectedSubThemes.add(s.name));
                    renderBlueprint();
                });
                document.getElementById('bp-sub-none')?.addEventListener('click', () => {
                    document.querySelectorAll('.bp-sub-cb').forEach(cb => { cb.checked = false; });
                    selectedSubThemes.clear();
                    renderBlueprint();
                });
            } else {
                subthemeRow.classList.add('hidden');
            }

            clearBtn.classList.remove('hidden');
            clearBtn.classList.add('inline-flex');
            featuresPanel.classList.remove('hidden');
            emptyState.classList.add('hidden');
            tabsWrapper.classList.remove('hidden');
            renderBlueprint();
        }

        categoryPills.addEventListener('click', (e) => {
            const pill = e.target.closest('.bp-cat-pill');
            if (pill) selectCategory(pill.dataset.cat);
        });

        clearBtn.addEventListener('click', () => {
            selectedCategories.clear();
            selectedSubThemes.clear();
            selectedFeatures.clear();
            document.querySelectorAll('.bp-cat-pill').forEach(p => {
                p.className = 'bp-cat-pill px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400 transition-all duration-150 cursor-pointer';
            });
            subthemeRow.classList.add('hidden');
            clearBtn.classList.add('hidden');
            clearBtn.classList.remove('inline-flex');
            featuresPanel.classList.add('hidden');
            emptyState.classList.remove('hidden');
            scorePanel.style.background = 'linear-gradient(135deg,#94a3b8,#64748b)';
            scoreValue.textContent = '—';
            scoreBar.style.width = '0%';
            bdTheme.textContent = '—';
            bdFeat.textContent = '—';
            bdSyn.textContent = '—';
            bdOpp.textContent = '—';
            tabsWrapper.classList.add('hidden');
            tabInsights.innerHTML = '';
            tabCompetition.innerHTML = '';
            tabSymbols.innerHTML = '';
        });

        const pickBtn = document.getElementById('bp-pick-btn');
        pickBtn.addEventListener('click', () => {
            const catScores = categoryList.map(cat => {
                const games = allG.filter(g => (g.theme_consolidated || g.theme_primary || '') === cat.cat);
                if (games.length < 3) return null;
                const avg = games.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / games.length;
                const lift = globalAvg > 0 ? (avg - globalAvg) / globalAvg * 100 : 0;
                const featResults = FEATS.map(f => {
                    const withF = games.filter(g => parseFeatsLocal(g.features).includes(f));
                    if (withF.length < 2) return null;
                    const fAvg = withF.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withF.length;
                    return { feat: f, lift: avg > 0 ? (fAvg - avg) / avg * 100 : 0, count: withF.length };
                }).filter(Boolean);
                const topFeats = featResults.filter(f => f.lift > 0).sort((a, b) => b.lift - a.lift).slice(0, 3);
                const featBoost = topFeats.length > 0 ? topFeats.reduce((s, f) => s + f.lift, 0) / topFeats.length : 0;
                const competitors = topFeats.length > 0 ? games.filter(g => {
                    const gf = parseFeatsLocal(g.features);
                    return topFeats.every(tf => gf.includes(tf.feat));
                }).length : games.length;
                const oppScore = competitors === 0 ? 40 : competitors <= 3 ? 25 : competitors <= 8 ? 10 : 0;
                const totalScore = lift + featBoost * 0.5 + oppScore;
                return { cat: cat.cat, totalScore, topFeats, gameCount: games.length };
            }).filter(Boolean).sort((a, b) => b.totalScore - a.totalScore);

            if (catScores.length === 0) return;
            const topN = catScores.slice(0, Math.min(5, catScores.length));
            const minScore = Math.min(...topN.map(c => c.totalScore));
            const weights = topN.map(c => Math.max(1, c.totalScore - minScore + 10));
            const totalW = weights.reduce((a, b) => a + b, 0);
            let r = Math.random() * totalW;
            let picked = topN[0];
            for (let i = 0; i < topN.length; i++) {
                r -= weights[i];
                if (r <= 0) { picked = topN[i]; break; }
            }
            const featPool = picked.topFeats.length > 0 ? picked.topFeats : [];
            const numFeats = Math.min(featPool.length, 1 + Math.floor(Math.random() * Math.min(3, featPool.length)));
            const shuffled = [...featPool].sort(() => Math.random() - 0.5);
            const chosenFeats = shuffled.slice(0, numFeats);

            selectedCategories.clear();
            selectedSubThemes.clear();
            selectedFeatures.clear();
            selectedCategories.add(picked.cat);
            chosenFeats.forEach(f => selectedFeatures.add(f.feat));
            refreshCategoryUI();
        });

        function getThemeGames() {
            if (selectedCategories.size === 0) return [];
            return allG.filter(g => {
                const primary = g.theme_primary || '';
                const consolidated = g.theme_consolidated || primary || '';
                if (!selectedCategories.has(consolidated)) return false;
                if (selectedSubThemes.size === 0) return true;
                if (selectedSubThemes.has(primary)) return true;
                if (primary === consolidated) return true;
                return false;
            });
        }

        function computeBlueprintScore(themeGames, featScores) {
            if (themeGames.length === 0) return { score: 0, breakdown: {} };
            const themeAvg = themeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / themeGames.length;
            const themeStrength = Math.min(100, Math.max(0, 50 + (themeAvg - globalAvg) / Math.max(globalAvg, 0.01) * 200));
            let featQuality = 50;
            if (selectedFeatures.size > 0) {
                const selScores = featScores.filter(f => selectedFeatures.has(f.feat));
                let liftScore = 50;
                if (selScores.length > 0) {
                    const avgLift = selScores.reduce((s, f) => s + f.lift, 0) / selScores.length;
                    liftScore = Math.min(100, Math.max(0, 50 + avgLift * 3));
                }
                const matchGames = themeGames.filter(g => {
                    const gf = parseFeatsLocal(g.features);
                    return [...selectedFeatures].some(f => gf.includes(f));
                });
                let perfScore = 50;
                if (matchGames.length >= 2) {
                    const matchAvg = matchGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / matchGames.length;
                    perfScore = Math.min(100, Math.max(0, 50 + (matchAvg - globalAvg) / Math.max(globalAvg, 0.01) * 200));
                }
                featQuality = Math.round(perfScore * 0.6 + liftScore * 0.4);
            }
            let synergyScore = 50;
            if (selectedFeatures.size >= 2) {
                const feats = [...selectedFeatures];
                let totalSyn = 0, pairs = 0;
                for (let i = 0; i < feats.length; i++) {
                    for (let j = i + 1; j < feats.length; j++) {
                        const bothGames = themeGames.filter(g => {
                            const gf = parseFeatsLocal(g.features);
                            return gf.includes(feats[i]) && gf.includes(feats[j]);
                        });
                        if (bothGames.length >= 2) {
                            const pairAvg = bothGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / bothGames.length;
                            totalSyn += (pairAvg - themeAvg) / Math.max(themeAvg, 0.01) * 100;
                            pairs++;
                        }
                    }
                }
                if (pairs > 0) synergyScore = Math.min(100, Math.max(0, 50 + (totalSyn / pairs) * 3));
            }
            let marketOpp = 50;
            if (selectedFeatures.size > 0) {
                const exactMatches = themeGames.filter(g => {
                    const gf = parseFeatsLocal(g.features);
                    return [...selectedFeatures].every(f => gf.includes(f));
                }).length;
                if (exactMatches === 0) marketOpp = 95;
                else if (exactMatches <= 2) marketOpp = 80;
                else if (exactMatches <= 5) marketOpp = 65;
                else if (exactMatches <= 10) marketOpp = 45;
                else marketOpp = 25;
            }
            const score = Math.round(themeStrength * 0.25 + featQuality * 0.30 + synergyScore * 0.20 + marketOpp * 0.25);
            return { score, breakdown: { themeStrength: Math.round(themeStrength), featQuality: Math.round(featQuality), synergyScore: Math.round(synergyScore), marketOpp: Math.round(marketOpp) } };
        }

        function updateScore(s, bd) {
            scoreValue.textContent = s;
            scoreBar.style.width = s + '%';
            bdTheme.textContent = bd.themeStrength ?? '—';
            bdFeat.textContent = bd.featQuality ?? '—';
            bdSyn.textContent = bd.synergyScore ?? '—';
            bdOpp.textContent = bd.marketOpp ?? '—';
            const gradient = s >= 70 ? 'linear-gradient(135deg,#059669,#10b981)' : s >= 40 ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'linear-gradient(135deg,#dc2626,#f43f5e)';
            scorePanel.style.background = gradient;
        }

        function renderBlueprint() {
            const themeGames = getThemeGames();
            if (themeGames.length === 0) {
                tabInsights.innerHTML = '<div class="text-center text-gray-400 text-sm py-8">No games match the selected sub-themes</div>';
                tabCompetition.innerHTML = '';
                tabSymbols.innerHTML = '';
                updateScore(0, {});
                return;
            }

            const themeAvg = themeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / themeGames.length;
            const liftVsMarket = globalAvg > 0 ? ((themeAvg - globalAvg) / globalAvg * 100) : 0;

            const volMap = {};
            themeGames.forEach(g => {
                const v = (g.specs_volatility || g.volatility || '').trim();
                if (v) { if (!volMap[v]) volMap[v] = { count: 0, sum: 0 }; volMap[v].count++; volMap[v].sum += (g.performance_theo_win || 0); }
            });
            const bestVol = Object.entries(volMap).map(([n, d]) => ({ name: n, avg: d.sum / d.count })).sort((a, b) => b.avg - a.avg)[0];
            const rtps = themeGames.map(g => parseFloat(g.specs_rtp || g.rtp)).filter(r => r && !isNaN(r) && r > 80 && r < 100);
            const avgRtp = rtps.length > 0 ? rtps.reduce((s, r) => s + r, 0) / rtps.length : 0;

            const featScores = FEATS.map(f => {
                const withF = themeGames.filter(g => parseFeatsLocal(g.features).includes(f));
                const avg = withF.length >= 2 ? withF.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withF.length : 0;
                const lift = withF.length >= 2 && themeAvg > 0 ? ((avg - themeAvg) / themeAvg * 100) : null;
                return { feat: f, count: withF.length, avg, lift };
            }).sort((a, b) => {
                if (a.lift === null && b.lift === null) return 0;
                if (a.lift === null) return 1;
                if (b.lift === null) return -1;
                return b.lift - a.lift;
            });

            const featScoresWithData = featScores.filter(f => f.lift !== null);
            const { score, breakdown } = computeBlueprintScore(themeGames, featScoresWithData);
            updateScore(score, breakdown);

            featContainer.innerHTML = featScores.map(f => {
                const isSelected = selectedFeatures.has(f.feat);
                const hasData = f.lift !== null;
                const arrow = hasData ? (f.lift >= 0 ? '↑' : '↓') : '';
                const liftLabel = hasData ? `${arrow}${Math.abs(f.lift).toFixed(0)}%` : 'new';
                const cls = isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 shadow-sm'
                    : !hasData ? 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                    : f.lift >= 10 ? 'bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                    : f.lift >= 0 ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    : 'bg-white dark:bg-gray-800 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20';
                return `<button class="bp-feat-pill inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150 cursor-pointer ${cls}" data-feat="${escapeAttr(f.feat)}">${isSelected ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ' : ''}${escapeHtml(shortF[f.feat] || f.feat)} <span class="text-xs opacity-75">${liftLabel}</span></button>`;
            }).join('');

            if (selectedFeatures.size > 0) {
                featCountBadge.textContent = `${selectedFeatures.size} selected`;
                featCountBadge.classList.remove('hidden');
            } else {
                featCountBadge.classList.add('hidden');
            }

            // Synergy in left panel
            let synergyHtml = '';
            if (selectedFeatures.size >= 2) {
                const feats = [...selectedFeatures];
                const pairs = [];
                for (let i = 0; i < feats.length; i++) {
                    for (let j = i + 1; j < feats.length; j++) {
                        const bothGames = themeGames.filter(g => {
                            const gf = parseFeatsLocal(g.features);
                            return gf.includes(feats[i]) && gf.includes(feats[j]);
                        });
                        if (bothGames.length >= 2) {
                            const pairAvg = bothGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / bothGames.length;
                            const syn = themeAvg > 0 ? ((pairAvg - themeAvg) / themeAvg * 100) : 0;
                            pairs.push({ a: feats[i], b: feats[j], syn, count: bothGames.length });
                        }
                    }
                }
                if (pairs.length > 0) {
                    synergyHtml = pairs.map(p => {
                        const color = p.syn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                        return `<div class="flex items-center gap-2 text-xs py-0.5">
                            <span class="text-gray-600 dark:text-gray-300">${escapeHtml(shortF[p.a] || p.a)} + ${escapeHtml(shortF[p.b] || p.b)}</span>
                            <span class="font-bold ${color}">${p.syn >= 0 ? '+' : ''}${p.syn.toFixed(0)}%</span>
                        </div>`;
                    }).join('');
                }
            }
            synergyContainer.innerHTML = synergyHtml;

            // === TAB: INSIGHTS ===
            let predHtml = '';
            if (selectedFeatures.size > 0) {
                const matchingGames = themeGames.filter(g => {
                    const gf = parseFeatsLocal(g.features);
                    return [...selectedFeatures].some(f => gf.includes(f));
                });
                if (matchingGames.length >= 2) {
                    const theos = matchingGames.map(g => g.performance_theo_win || 0).sort((a, b) => a - b);
                    const p25 = theos[Math.floor(theos.length * 0.25)] || 0;
                    const p75 = theos[Math.floor(theos.length * 0.75)] || 0;
                    const barLeft = globalAvg > 0 ? Math.min(100, Math.max(0, (p25 / (globalAvg * 2)) * 100)) : 0;
                    const barRight = globalAvg > 0 ? Math.min(100, Math.max(barLeft + 5, (p75 / (globalAvg * 2)) * 100)) : 50;
                    const avgLine = globalAvg > 0 ? Math.min(100, (globalAvg / (globalAvg * 2)) * 100) : 50;
                    const midpoint = (p25 + p75) / 2;
                    const vsMkt = midpoint - globalAvg;
                    const vsMktAbs = Math.abs(vsMkt).toFixed(1);
                    const vsMktColor = vsMkt >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                    const vsMktLabel = vsMkt >= 0 ? `+${vsMktAbs} above market avg` : `${vsMktAbs} below market avg`;
                    predHtml = `<div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 mb-5">
                        <div class="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Predicted Performance</div>
                        <div class="flex items-baseline gap-2 mb-1">
                            <span class="text-2xl font-bold text-gray-900 dark:text-white">${p25.toFixed(1)} – ${p75.toFixed(1)}</span>
                            <span class="text-sm text-gray-500">Theo Win</span>
                        </div>
                        <div class="text-base font-bold ${vsMktColor} mb-2">${vsMktLabel}</div>
                        <div class="relative h-3 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mb-1.5">
                            <div class="absolute h-full bg-indigo-400/60 dark:bg-indigo-500/60 rounded-full" style="left:${barLeft}%;width:${barRight - barLeft}%"></div>
                            <div class="absolute top-0 bottom-0 w-0.5 bg-gray-500 dark:bg-gray-300" style="left:${avgLine}%"></div>
                        </div>
                        <div class="text-xs text-gray-500">Market avg: ${globalAvg.toFixed(1)} · Based on ${matchingGames.length} games</div>
                    </div>`;
                }
            }

            let recipeSection = '';
            try {
                const tGames = themeGames.map(g => ({ feats: parseFeatsLocal(g.features).sort(), theo: g.performance_theo_win || 0 }));
                const combos = [];
                for (let size = 2; size <= 4; size++) {
                    const indices = [];
                    const gen = (start) => {
                        if (indices.length === size) {
                            const combo = indices.map(i => FEATS[i]);
                            const matching = tGames.filter(g => combo.every(f => g.feats.includes(f)));
                            if (matching.length >= 3) {
                                const avg = matching.reduce((s, g) => s + g.theo, 0) / matching.length;
                                const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg * 100) : 0;
                                combos.push({ feats: combo, count: matching.length, avg, lift });
                            }
                            return;
                        }
                        for (let i = start; i < FEATS.length; i++) { indices.push(i); gen(i + 1); indices.pop(); }
                    };
                    gen(0);
                }
                combos.sort((a, b) => b.avg - a.avg);
                const topCombos = combos.slice(0, 5);
                if (topCombos.length > 0) {
                    recipeSection = `<div class="mb-5">
                        <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Best Feature Recipes</div>
                        ${topCombos.map((c, i) => {
                            const hasSelected = selectedFeatures.size > 0 && c.feats.some(f => selectedFeatures.has(f));
                            const chips = c.feats.map(f => `<span class="px-2 py-0.5 rounded text-xs font-medium ${featureColors[f] || 'bg-gray-100 text-gray-700'}">${escapeHtml(shortF[f] || f)}</span>`).join('<span class="text-gray-400 text-[10px]">+</span>');
                            const liftColor = c.lift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500';
                            return `<div class="flex items-center gap-2 py-2 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-700' : ''} ${hasSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/10 rounded px-1' : ''}">
                                <span class="text-xs text-gray-400 w-3">${i + 1}</span>
                                <div class="flex flex-wrap items-center gap-1 flex-1">${chips}</div>
                                <span class="text-xs text-gray-400">${c.count}</span>
                                <span class="text-sm font-bold ${liftColor} w-14 text-right">${c.lift >= 0 ? '+' : ''}${c.lift.toFixed(0)}%</span>
                            </div>`;
                        }).join('')}
                    </div>`;
                }
            } catch(e) { /* skip */ }

            const mechMap = {};
            themeGames.forEach(g => { const m = g.mechanic_primary || g.mechanic || ''; if (m) { if (!mechMap[m]) mechMap[m] = { count: 0, sum: 0 }; mechMap[m].count++; mechMap[m].sum += (g.performance_theo_win || 0); } });
            const topMechanics = Object.entries(mechMap).map(([n, d]) => ({ name: n, count: d.count, avg: d.sum / d.count })).sort((a, b) => b.avg - a.avg).slice(0, 5);
            const provMap = {};
            themeGames.forEach(g => { const p = g.provider_studio || g.provider || ''; if (p) provMap[p] = (provMap[p] || 0) + 1; });
            const topProvs = Object.entries(provMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

            const themesLabel = [...selectedCategories].join(' & ');
            const featsLabel = [...selectedFeatures].map(f => shortF[f] || f);
            const topMech = topMechanics.length > 0 ? topMechanics[0].name : '';
            const topProv = topProvs.length > 0 ? topProvs[0][0] : '';
            const perfWord = liftVsMarket >= 10 ? 'strong' : liftVsMarket >= 0 ? 'solid' : 'competitive';
            const volWord = bestVol ? bestVol.name.toLowerCase() : 'mixed';
            let conceptText = `A <strong>${escapeHtml(themesLabel)}</strong>-themed slot`;
            if (featsLabel.length > 0) conceptText += ` featuring <strong>${featsLabel.map(f => escapeHtml(f)).join('</strong>, <strong>')}</strong>`;
            conceptText += `. The ${escapeHtml(themesLabel)} category has ${themeGames.length} games in market with ${perfWord} performance`;
            if (liftVsMarket !== 0) conceptText += ` (${liftVsMarket >= 0 ? '+' : ''}${liftVsMarket.toFixed(0)}% vs avg)`;
            conceptText += ` and ${volWord} volatility.`;
            if (topMech) conceptText += ` Top mechanic: <strong>${escapeHtml(topMech)}</strong>.`;
            if (topProv) conceptText += ` Market leader: ${escapeHtml(topProv)}.`;

            const conceptHtml = `<div class="mb-5 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/40">
                <div class="flex items-start gap-2">
                    <span class="text-lg mt-0.5">💡</span>
                    <div>
                        <div class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">Game Concept</div>
                        <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${conceptText}</div>
                    </div>
                </div>
            </div>`;

            tabInsights.innerHTML = `
                ${conceptHtml}
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center">
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${themeGames.length}</div>
                        <div class="text-xs text-gray-500">Games</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center">
                        <div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">${themeAvg.toFixed(1)}</div>
                        <div class="text-xs text-gray-500">Avg Theo</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center">
                        <div class="text-2xl font-bold ${liftVsMarket >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}">${liftVsMarket >= 0 ? '+' : ''}${liftVsMarket.toFixed(0)}%</div>
                        <div class="text-xs text-gray-500">vs Market</div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center">
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${bestVol ? escapeHtml(bestVol.name) : '—'}</div>
                        <div class="text-xs text-gray-500">Volatility${avgRtp ? ` · ${avgRtp.toFixed(1)}%` : ''}</div>
                    </div>
                </div>
                ${predHtml}
                ${recipeSection}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <div class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Top Mechanics</div>
                        <div class="space-y-1.5">${topMechanics.map((m, i) => `<div class="flex items-center gap-2 text-sm"><span class="w-4 text-gray-400">${i+1}</span><span class="flex-1 text-gray-800 dark:text-gray-200 truncate">${escapeHtml(m.name)}</span><span class="text-gray-400 text-xs">${m.count}</span><span class="text-emerald-600 dark:text-emerald-400 font-semibold w-10 text-right">${m.avg.toFixed(1)}</span></div>`).join('') || '<span class="text-sm text-gray-400">No data</span>'}</div>
                    </div>
                    <div>
                        <div class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Active Providers</div>
                        <div class="flex flex-wrap gap-1.5">${topProvs.map(([p, c]) => `<span class="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">${escapeHtml(p)} (${c})</span>`).join('')}</div>
                    </div>
                </div>
            `;

            // === TAB: COMPETITION ===
            let compGames;
            if (selectedFeatures.size > 0) {
                compGames = themeGames.map(g => {
                    const gf = parseFeatsLocal(g.features);
                    const featOverlap = [...selectedFeatures].filter(f => gf.includes(f)).length;
                    const featTotal = new Set([...selectedFeatures, ...gf.filter(f => FEATS.includes(f))]).size;
                    const jaccard = featTotal > 0 ? featOverlap / featTotal : 0;
                    return { ...g, jaccard, gf };
                }).filter(g => g.jaccard > 0).sort((a, b) => b.jaccard - a.jaccard || (b.performance_theo_win || 0) - (a.performance_theo_win || 0)).slice(0, 8);
            } else {
                compGames = [...themeGames].sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0)).slice(0, 8).map(g => ({ ...g, gf: parseFeatsLocal(g.features) }));
            }

            const blueOcean = selectedFeatures.size >= 2 && themeGames.filter(g => {
                const gf = parseFeatsLocal(g.features);
                return [...selectedFeatures].every(f => gf.includes(f));
            }).length === 0;

            const exactCount = selectedFeatures.size > 0 ? themeGames.filter(g => {
                const gf = parseFeatsLocal(g.features);
                return [...selectedFeatures].every(f => gf.includes(f));
            }).length : 0;
            const densityLabel = exactCount === 0 ? 'Blue Ocean' : exactCount <= 3 ? 'Low' : exactCount <= 8 ? 'Moderate' : 'High';
            const densityColor = exactCount === 0 ? 'text-emerald-600 dark:text-emerald-400' : exactCount <= 3 ? 'text-blue-600 dark:text-blue-400' : exactCount <= 8 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500';

            const nudgeHint = selectedFeatures.size === 0 ? `<div class="mb-5 px-4 py-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-sm text-gray-500 dark:text-gray-400 text-center">Select features in the left panel to see competitor analysis</div>` : '';

            tabCompetition.innerHTML = `
                ${nudgeHint}
                ${selectedFeatures.size > 0 ? `<div class="flex items-center gap-4 mb-5 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                    <div class="text-center">
                        <div class="text-3xl font-bold ${densityColor}">${exactCount}</div>
                        <div class="text-xs text-gray-500 uppercase">Direct Rivals</div>
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-300">Competition density: <span class="font-bold ${densityColor}">${densityLabel}</span></div>
                </div>` : ''}
                ${blueOcean ? `<div class="mb-5 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2">
                    <span>💎</span> Blue Ocean — no existing game combines ${[...selectedFeatures].map(f => shortF[f] || f).join(' + ')} in this theme
                </div>` : ''}
                <hr class="border-gray-200 dark:border-gray-700 mb-4">
                <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">${selectedFeatures.size > 0 ? 'Closest Competitors' : 'Top Performers'}</div>
                <div class="space-y-2.5">
                    ${compGames.map((g, idx) => {
                        const theo = (g.performance_theo_win || 0).toFixed(1);
                        const featPills = (g.gf || []).filter(f => FEATS.includes(f)).slice(0, 5).map(f => {
                            const isShared = selectedFeatures.has(f);
                            const cls = isShared ? featureColors[f] || 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
                            return `<span class="px-2 py-0.5 rounded text-xs font-medium ${cls}">${escapeHtml(shortF[f] || f)}</span>`;
                        }).join('');
                        const provider = g.provider_studio || g.provider || '';
                        return `<div class="flex items-center gap-3 py-3 px-4 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/20 hover:bg-white dark:hover:bg-gray-700/40 hover:shadow-sm transition-all">
                            <span class="text-sm text-gray-400 font-bold w-5 shrink-0">${idx + 1}</span>
                            <div class="flex-1 min-w-0">
                                <div class="text-base font-semibold text-gray-800 dark:text-gray-200 truncate">${escapeHtml(g.name || 'Unknown')}</div>
                                ${provider ? `<div class="text-xs text-gray-400 truncate">${escapeHtml(provider)}</div>` : ''}
                                <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">${featPills}</div>
                            </div>
                            <div class="text-right shrink-0 w-14">
                                <div class="text-base font-bold text-indigo-600 dark:text-indigo-400">${theo}</div>
                                <div class="text-xs text-gray-400">theo</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `;

            // === TAB: SYMBOLS ===
            let symGames = themeGames.filter(g => parseSymbols(g.symbols).length > 0);
            if (selectedFeatures.size > 0) {
                const filtered = symGames.filter(g => {
                    const gf = parseFeatsLocal(g.features);
                    return [...selectedFeatures].some(f => gf.includes(f));
                });
                if (filtered.length >= 3) symGames = filtered;
            }

            if (symGames.length >= 3) {
                const sorted = [...symGames].sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
                const top25 = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.25)));
                const { catStats } = aggregateSymbolStats(symGames);
                function buildPkg(games) {
                    const sf = {}, cf = {};
                    games.forEach(g => {
                        const syms = parseSymbols(g.symbols);
                        const sc = new Set();
                        syms.forEach(s => {
                            const str = normalizeSymbolName(String(s));
                            if (!str) return;
                            const cat = categorizeSymbol(str);
                            sf[str] = (sf[str] || 0) + 1;
                            if (!sc.has(cat)) { cf[cat] = (cf[cat] || 0) + 1; sc.add(cat); }
                        });
                    });
                    return {
                        topSym: Object.entries(sf).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count, cat: categorizeSymbol(name) })),
                        catBreak: Object.entries(cf).sort((a, b) => b[1] - a[1]).map(([cat, count]) => ({ cat, pct: (count / games.length * 100).toFixed(0) })),
                        avgTheo: games.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / games.length,
                        gameCount: games.length
                    };
                }
                const highPerf = buildPkg(top25);
                const standard = buildPkg(symGames);
                const outlierGames = top25.filter(g => {
                    const syms = parseSymbols(g.symbols).map(s => normalizeSymbolName(String(s))).filter(Boolean);
                    const cats = new Set(syms.map(s => categorizeSymbol(s)));
                    return [...cats].filter(c => (catStats[c]?.gameCount || 0) / symGames.length < 0.4).length >= 2;
                });
                const innovation = buildPkg(outlierGames.length >= 3 ? outlierGames : top25.slice(0, Math.ceil(top25.length / 2)));

                const ratingStars = (avg) => {
                    const norm = themeAvg > 0 ? (avg / themeAvg) : 1;
                    const stars = Math.min(5, Math.max(1, Math.round(norm * 3)));
                    return '<span class="text-amber-400">' + '★'.repeat(stars) + '</span><span class="text-gray-300 dark:text-gray-600">' + '★'.repeat(5 - stars) + '</span>';
                };
                function renderPkgCard(pkg, title, icon, borderColor) {
                    const symChips = pkg.topSym.map(s => {
                        const col = SYMBOL_CAT_COLORS[s.cat];
                        return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ring-1 ${col.cls} ${col.ring}">${escapeHtml(s.name)}</span>`;
                    }).join('');
                    const catMini = pkg.catBreak.slice(0, 5).map(c => {
                        const col = SYMBOL_CAT_COLORS[c.cat];
                        return `<span class="text-xs flex items-center gap-1"><span class="w-2 h-2 rounded-full ${col?.bar || 'bg-gray-400'}"></span>${c.cat} ${c.pct}%</span>`;
                    }).join('');
                    return `<div class="border ${borderColor} rounded-xl p-5 bg-white dark:bg-gray-800">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-2"><span class="text-2xl">${icon}</span><span class="text-base font-bold text-gray-800 dark:text-gray-200">${title}</span></div>
                            <div class="flex items-center gap-2"><span class="text-base">${ratingStars(pkg.avgTheo)}</span><span class="text-base font-bold text-gray-600 dark:text-gray-400">${pkg.avgTheo.toFixed(1)}</span></div>
                        </div>
                        <div class="flex flex-wrap gap-2 mb-3">${symChips}</div>
                        <div class="flex flex-wrap gap-2.5 text-gray-400">${catMini}</div>
                        <div class="text-xs text-gray-400 mt-2.5">Based on ${pkg.gameCount} games</div>
                    </div>`;
                }

                tabSymbols.innerHTML = `
                    <div class="flex items-center gap-2 mb-5">
                        <span class="text-2xl">🎲</span>
                        <div>
                            <div class="text-lg font-bold text-gray-900 dark:text-white">Symbol Package Suggestions</div>
                            <div class="text-xs text-gray-500">${symGames.length} games analyzed${selectedFeatures.size > 0 ? ', filtered by your features' : ''}</div>
                        </div>
                    </div>
                    <div class="space-y-4">
                        ${renderPkgCard(highPerf, 'High Performance', '🏆', 'border-emerald-200 dark:border-emerald-800')}
                        ${renderPkgCard(standard, 'Market Standard', '📊', 'border-blue-200 dark:border-blue-800')}
                        ${renderPkgCard(innovation, 'Innovation Pick', '💡', 'border-violet-200 dark:border-violet-800')}
                    </div>
                `;
            } else {
                tabSymbols.innerHTML = '<div class="text-center text-gray-400 text-sm py-8">Not enough symbol data for this theme</div>';
            }

            // Wire up feature pill clicks in left panel
            featContainer.querySelectorAll('.bp-feat-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const feat = pill.dataset.feat;
                    if (selectedFeatures.has(feat)) selectedFeatures.delete(feat);
                    else selectedFeatures.add(feat);
                    renderBlueprint();
                });
            });
        }
    }

    // Best Multi-Feature Recipes (any combo size: 2, 3, or 4 features)
    if (comboDiv) {
        try {
            const allG = gameData.allGames || [];
            const FEATS = ['Cash On Reels','Expanding Reels','Free Spins','Hold and Spin','Nudges','Persistence','Pick Bonus','Respin','Static Jackpot','Wheel','Wild Reels'];
            const shortF = {'Cash On Reels':'Cash Reels','Expanding Reels':'Expand','Free Spins':'Free Spins','Hold and Spin':'Hold&Spin','Nudges':'Nudge','Persistence':'Persist','Pick Bonus':'Pick','Respin':'Respin','Static Jackpot':'Jackpot','Wheel':'Wheel','Wild Reels':'Wild Reels'};
            const featureColors = {
                'Cash On Reels': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                'Expanding Reels': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
                'Free Spins': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
                'Hold and Spin': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
                'Nudges': 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
                'Persistence': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
                'Pick Bonus': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
                'Respin': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
                'Static Jackpot': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
                'Wheel': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
                'Wild Reels': 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
            };
            
            // Build combos of size 2, 3, and 4 across all themes
            const themeMap = {};
            allG.forEach(g => {
                const theme = g.theme_consolidated || '';
                if (!theme || /^unknown$/i.test(theme)) return;
                if (!themeMap[theme]) themeMap[theme] = [];
                themeMap[theme].push({ feats: parseFeatsLocal(g.features).sort(), theo: g.performance_theo_win || 0 });
            });
            
            const allCombos = [];
            for (const [theme, games] of Object.entries(themeMap)) {
                if (games.length < 5) continue;
                const themeAvg = games.reduce((s, g) => s + g.theo, 0) / games.length;
                const combos = {};
                games.forEach(g => {
                    const f = g.feats.filter(x => FEATS.includes(x));
                    // 2-feature combos
                    for (let i = 0; i < f.length; i++) for (let j = i+1; j < f.length; j++) {
                        const k = `${f[i]}|${f[j]}`;
                        if (!combos[k]) combos[k] = { feats: [f[i], f[j]], count: 0, total: 0 };
                        combos[k].count++; combos[k].total += g.theo;
                    }
                    // 3-feature combos
                    for (let i = 0; i < f.length; i++) for (let j = i+1; j < f.length; j++) for (let k = j+1; k < f.length; k++) {
                        const key = `${f[i]}|${f[j]}|${f[k]}`;
                        if (!combos[key]) combos[key] = { feats: [f[i], f[j], f[k]], count: 0, total: 0 };
                        combos[key].count++; combos[key].total += g.theo;
                    }
                    // 4-feature combos
                    for (let i = 0; i < f.length; i++) for (let j = i+1; j < f.length; j++) for (let k = j+1; k < f.length; k++) for (let l = k+1; l < f.length; l++) {
                        const key = `${f[i]}|${f[j]}|${f[k]}|${f[l]}`;
                        if (!combos[key]) combos[key] = { feats: [f[i], f[j], f[k], f[l]], count: 0, total: 0 };
                        combos[key].count++; combos[key].total += g.theo;
                    }
                });
                Object.values(combos).forEach(c => {
                    if (c.count >= 3) {
                        const avg = c.total / c.count;
                        const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg * 100) : 0;
                        allCombos.push({ theme, feats: c.feats, count: c.count, avg, lift, themeAvg });
                    }
                });
            }
            
            allCombos.sort((a, b) => b.avg - a.avg);
            const topCombos = allCombos.slice(0, 20);
            const maxComboAvg = topCombos.length > 0 ? topCombos[0].avg : 1;
            
            if (topCombos.length > 0) {
                comboDiv.innerHTML = `<div class="space-y-1.5">
                    ${topCombos.map((c, i) => {
                        const barW = Math.max(8, (c.avg / maxComboAvg) * 100);
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="text-[9px] text-gray-400 w-5 text-center">${i+1}</span>`;
                        const liftColor = c.lift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                        const sizeLabel = c.feats.length === 2 ? '2F' : c.feats.length === 3 ? '3F' : '4F';
                        const sizeBg = c.feats.length === 2 ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : c.feats.length === 3 ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
                        return `
                        <div class="group flex items-start gap-2 p-2 rounded-lg hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all">
                            <span class="shrink-0 mt-0.5 w-5 text-center">${medal}</span>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-1.5 mb-1">
                                    <span class="text-[10px] font-bold text-gray-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showThemeDetails', c.theme)}">${escapeHtml(c.theme)}</span>
                                    <span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full ${sizeBg}">${sizeLabel}</span>
                                </div>
                                <div class="flex flex-wrap gap-1 mb-1">
                                    ${c.feats.map(f => `<span class="px-1.5 py-0.5 text-[9px] font-semibold rounded-full ${featureColors[f] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'} whitespace-nowrap">${escapeHtml(shortF[f]||f)}</span>`).join('')}
                                </div>
                                <div class="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400" style="width:${barW}%"></div>
                                </div>
                            </div>
                            <div class="shrink-0 text-right">
                                <div class="text-xs font-bold text-gray-900 dark:text-white tabular-nums">${c.avg.toFixed(1)}</div>
                                <div class="text-[9px] ${liftColor} font-medium tabular-nums">${c.lift >= 0 ? '+' : ''}${c.lift.toFixed(0)}%</div>
                                <div class="text-[9px] text-gray-400">${c.count} games</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
            } else {
                comboDiv.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">No combo data available</p>';
            }
        } catch (e) {
            comboDiv.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">Combo data unavailable</p>';
        }
    }
    if (avoidDiv) {
        const avoid = getAvoidCombos(5);
        avoidDiv.innerHTML = avoid.length > 0 ? avoid.map(c => `
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">${c.theme} + ${c.feature}</div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">${c.count} games</span>
                    <span class="text-[10px] font-bold text-red-600 dark:text-red-400">${c.avgTheo.toFixed(1)} avg theo</span>
                </div>
            </div>
        `).join('') : '<p class="text-xs text-gray-400">No underperformers</p>';
    }
    if (watchDiv) {
        const watch = getWatchListCombos(5);
        watchDiv.innerHTML = watch.length > 0 ? watch.map(c => `
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">${c.theme} + ${c.feature}</div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">${c.count} games</span>
                    <span class="text-[10px] font-bold text-amber-600 dark:text-amber-400">${c.avgTheo.toFixed(1)} avg theo</span>
                </div>
            </div>
        `).join('') : '<p class="text-xs text-gray-400">No watch items</p>';
    }
    
    if (document.getElementById('hot-combinations')) {
        generateTopPerformers();
        log('  ✅ Top performers generated');
    }
    if (document.getElementById('market-gaps')) {
        generateOpportunities();
        log('  ✅ Opportunities generated');
    }
    if (document.getElementById('emerging-trends')) {
        generateEmergingTrends();
        log('  ✅ Emerging trends generated');
    }
    if (document.getElementById('saturated-markets')) {
        generateSaturatedMarkets();
        log('  ✅ Saturated markets generated');
    }
    if (document.getElementById('provider-theme-matrix')) {
        generateProviderThemeMatrix();
        log('  ✅ Provider theme matrix generated');
    }
    if (document.getElementById('volatility-analysis')) {
        generateVolatilityAnalysis();
        log('  ✅ Volatility analysis generated');
    }
    
    log('💡 All insights generated successfully');
}

function generateProviderThemeMatrix() {
    const container = document.getElementById('provider-theme-matrix');
    if (!container) return;
    
    const allGames = gameData.allGames || [];
    if (!allGames.length) { container.innerHTML = '<p class="text-sm text-gray-500">No data</p>'; return; }
    
    // Build provider -> theme -> {count, totalTheo} map
    const providerMap = {};
    allGames.forEach(g => {
        const prov = g.provider_studio || g.provider || '';
        const theme = g.theme_consolidated || g.theme_primary || '';
        const theo = g.performance_theo_win || 0;
        if (!prov || !theme) return;
        if (!providerMap[prov]) providerMap[prov] = { total: 0, totalTheo: 0, themes: {} };
        providerMap[prov].total++;
        providerMap[prov].totalTheo += theo;
        if (!providerMap[prov].themes[theme]) providerMap[prov].themes[theme] = { count: 0, totalTheo: 0 };
        providerMap[prov].themes[theme].count++;
        providerMap[prov].themes[theme].totalTheo += theo;
    });
    
    // Top 10 providers by game count
    const topProviders = Object.entries(providerMap)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);
    
    // Find each provider's best theme
    let html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">';
    topProviders.forEach(([prov, data]) => {
        const avgTheo = data.totalTheo / data.total;
        const bestTheme = Object.entries(data.themes)
            .filter(([, d]) => d.count >= 2)
            .sort((a, b) => (b[1].totalTheo / b[1].count) - (a[1].totalTheo / a[1].count))[0];
        const bestThemeName = bestTheme ? bestTheme[0] : 'N/A';
        const bestTheoAvg = bestTheme ? (bestTheme[1].totalTheo / bestTheme[1].count) : 0;
        const themeCount = Object.keys(data.themes).length;
        
        html += `
            <div class="p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-sm transition-shadow">
                <div class="text-xs font-bold text-gray-900 dark:text-white truncate mb-1" title="${prov}">${prov}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400 mb-2">${data.total} games · ${themeCount} themes</div>
                <div class="text-xs text-gray-600 dark:text-gray-300 mb-0.5">Best theme:</div>
                <div class="text-sm font-semibold text-indigo-600 dark:text-indigo-400 truncate" title="${bestThemeName}">${bestThemeName}</div>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">${bestTheoAvg.toFixed(1)} avg</span>
                    <span class="text-[10px] text-gray-400">vs ${avgTheo.toFixed(1)} overall</span>
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function generateVolatilityAnalysis() {
    const container = document.getElementById('volatility-analysis');
    if (!container) return;
    
    const allGames = gameData.allGames || [];
    if (!allGames.length) { container.innerHTML = '<p class="text-sm text-gray-500">No data</p>'; return; }
    
    const buckets = { 'Low': [], 'Medium': [], 'High': [], 'Very High': [] };
    allGames.forEach(g => {
        const vol = (g.specs_volatility || g.volatility || '').trim();
        const theo = g.performance_theo_win || 0;
        if (vol && buckets[vol] !== undefined && theo > 0) {
            buckets[vol].push(theo);
        }
    });
    
    const styles = {
        'Low':       { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', label: 'text-emerald-700 dark:text-emerald-400', best: 'text-emerald-600 dark:text-emerald-400' },
        'Medium':    { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', label: 'text-blue-700 dark:text-blue-400', best: 'text-blue-600 dark:text-blue-400' },
        'High':      { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', label: 'text-amber-700 dark:text-amber-400', best: 'text-amber-600 dark:text-amber-400' },
        'Very High': { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', label: 'text-red-700 dark:text-red-400', best: 'text-red-600 dark:text-red-400' }
    };
    
    let html = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">';
    Object.entries(buckets).forEach(([vol, theos]) => {
        const count = theos.length;
        const avg = count > 0 ? theos.reduce((s, t) => s + t, 0) / count : 0;
        const sorted = [...theos].sort((a, b) => a - b);
        const median = count > 0 ? sorted[Math.floor(count / 2)] : 0;
        const max = count > 0 ? sorted[count - 1] : 0;
        const s = styles[vol];
        
        html += `
            <div class="p-4 rounded-xl ${s.bg} border ${s.border}">
                <div class="text-xs font-bold uppercase tracking-wider ${s.label} mb-2">${vol}</div>
                <div class="text-2xl font-bold text-gray-900 dark:text-white mb-1">${avg.toFixed(1)}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400 mb-2">avg theo win</div>
                <div class="space-y-1 text-[11px] text-gray-600 dark:text-gray-400">
                    <div class="flex justify-between"><span>Games</span><span class="font-semibold text-gray-900 dark:text-white">${count}</span></div>
                    <div class="flex justify-between"><span>Median</span><span class="font-semibold">${median.toFixed(1)}</span></div>
                    <div class="flex justify-between"><span>Best</span><span class="font-semibold ${s.best}">${max.toFixed(1)}</span></div>
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function generateTopPerformers() {
    const hotDiv = document.getElementById('hot-combinations');
    const withData = (gameData.themes || []).filter(t => (t['Game Count'] || 0) >= 5);
    const sorted = [...withData].sort((a, b) => (b["Smart Index"] || 0) - (a["Smart Index"] || 0));
    const topThemes = sorted.slice(0, 5);
    const maxIndex = topThemes[0]?.["Smart Index"] || 1;
    
    if (!topThemes.length) { hotDiv.innerHTML = '<p class="text-xs text-gray-400">No data</p>'; return; }
    
    hotDiv.innerHTML = topThemes.map((t, i) => {
        const pct = Math.round(((t["Smart Index"] || 0) / maxIndex) * 100);
        return `
        <div class="flex items-center gap-3 group cursor-pointer" onclick="${safeOnclick('window.showThemeDetails', t.Theme)}">
            <span class="text-[10px] font-bold text-indigo-400 w-4 text-right">${i + 1}</span>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-0.5">
                    <span class="text-xs font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${t.Theme}</span>
                    <span class="text-[10px] text-gray-400 shrink-0 ml-2">${t['Game Count']} games · ${(t["Smart Index"] || 0).toFixed(1)} smart idx</span>
                </div>
                <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-indigo-400 dark:bg-indigo-500 rounded-full" style="width:${pct}%"></div></div>
            </div>
        </div>`;
    }).join('');
}

function generateOpportunities() {
    const gapDiv = document.getElementById('market-gaps');
    const themes = (gameData.themes || []).filter(t => (t['Game Count'] || 0) >= 5);
    const theos = themes.map(t => t['Avg Theo Win Index'] || 0).filter(x => x > 0);
    const shares = themes.map(t => t['Market Share %'] || 0).filter(x => x >= 0);
    const medianTheo = theos.length ? theos.sort((a,b)=>a-b)[Math.floor(theos.length/2)] : 3;
    const p60Share = shares.length ? shares.sort((a,b)=>a-b)[Math.floor(shares.length*0.6)] : 5;
    const opportunities = themes
        .filter(t => (t['Game Count'] || 0) <= 30)
        .filter(t => (t['Avg Theo Win Index'] || 0) >= medianTheo)
        .filter(t => (t['Market Share %'] || 0) <= Math.max(p60Share, 5))
        .map(t => ({ ...t, opportunityScore: (t['Avg Theo Win Index'] || 0) / ((t['Market Share %'] || 0) + 0.1) }))
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, 5);
    
    if (opportunities.length === 0) {
        gapDiv.innerHTML = '<p class="insights-item-text">No clear opportunities detected</p>';
        return;
    }
    
    const maxOppTheo = opportunities[0]?.['Avg Theo Win Index'] || 1;
    gapDiv.innerHTML = opportunities.map((opp, i) => {
        const pct = Math.round(((opp['Avg Theo Win Index'] || 0) / maxOppTheo) * 100);
        return `
        <div class="flex items-center gap-3 group cursor-pointer" onclick="${safeOnclick('window.showThemeDetails', opp.Theme)}">
            <span class="text-[10px] font-bold text-emerald-400 w-4 text-right">${i + 1}</span>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-0.5">
                    <span class="text-xs font-semibold text-gray-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">${opp.Theme}</span>
                    <span class="text-[10px] text-gray-400 shrink-0 ml-2">${opp['Game Count']} games · ${(opp['Avg Theo Win Index'] || 0).toFixed(1)} avg theo</span>
                </div>
                <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-emerald-400 dark:bg-emerald-500 rounded-full" style="width:${pct}%"></div></div>
            </div>
        </div>`;
    }).join('');
}

function generateEmergingTrends() {
    const trendDiv = document.getElementById('emerging-trends');
    const themes = (gameData.themes || []).filter(t => (t['Game Count'] || 0) >= 5 && (t['Game Count'] || 0) <= 15);
    const medianTheo = (() => { const t = themes.map(x => x['Avg Theo Win Index'] || 0).filter(x=>x>0).sort((a,b)=>a-b); return t.length ? t[Math.floor(t.length/2)] : 3; })();
    const emerging = themes
        .filter(t => (t['Avg Theo Win Index'] || 0) >= medianTheo)
        .sort((a, b) => (b['Avg Theo Win Index'] || 0) - (a['Avg Theo Win Index'] || 0))
        .slice(0, 5);
    
    if (emerging.length === 0) {
        trendDiv.innerHTML = '<p style="color: #94A3B8;">No clear emerging trends detected</p>';
        return;
    }
    
    trendDiv.innerHTML = emerging.map(trend => `
        <div class="flex items-center justify-between gap-2 group cursor-pointer" onclick="${safeOnclick('window.showThemeDetails', trend.Theme)}">
            <span class="text-xs font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${trend.Theme}</span>
            <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">${trend['Game Count']} games</span>
                <span class="text-[10px] font-bold text-gray-700 dark:text-gray-300">${(trend['Avg Theo Win Index'] || 0).toFixed(1)} avg theo</span>
            </div>
        </div>
    `).join('');
}

function generateSaturatedMarkets() {
    const satDiv = document.getElementById('saturated-markets');
    const counts = (gameData.themes || []).map(t => t['Game Count'] || 0).filter(x => x > 0).sort((a,b)=>b-a);
    const p75Count = counts.length ? counts[Math.floor(counts.length * 0.25)] : 30;
    const proven = (gameData.themes || [])
        .filter(t => (t['Game Count'] || 0) >= Math.max(p75Count, 20))
        .sort((a, b) => b['Game Count'] - a['Game Count'])
        .slice(0, 5);
    
    if (proven.length === 0) {
        satDiv.innerHTML = '<p class="insights-item-text">No high-volume themes detected</p>';
        return;
    }
    
    const maxGames = proven[0]?.['Game Count'] || 1;
    satDiv.innerHTML = proven.length > 0 ? proven.map(theme => {
        const pct = Math.round(((theme['Game Count'] || 0) / maxGames) * 100);
        return `
        <div class="flex items-center gap-2 group cursor-pointer" onclick="${safeOnclick('window.showThemeDetails', theme.Theme)}">
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-0.5">
                    <span class="text-xs font-semibold text-gray-900 dark:text-white truncate group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">${theme.Theme}</span>
                    <span class="text-[10px] text-gray-400 shrink-0 ml-2">${theme['Game Count']} games · ${(theme['Market Share %'] || 0).toFixed(1)}% share</span>
                </div>
                <div class="h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-orange-400 dark:bg-orange-500 rounded-full" style="width:${pct}%"></div></div>
            </div>
        </div>`;
    }).join('') : '<p class="text-xs text-gray-400">No high-volume themes</p>';
}

// AI Assistant Functions
let aiConversationHistory = [];

export function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const question = input.value.trim();
    
    if (!question) return;
    
    askAI(question);
    input.value = '';
}

export function askAI(question) {
    const chatDiv = document.getElementById('ai-chat');
    
    // Add user message
    const userMessage = document.createElement('div');
    userMessage.className = 'ai-message ai-user';
    userMessage.innerHTML = `
        <div class="ai-avatar">👤</div>
        <div class="ai-content">
            <strong>You</strong>
            <p>${question}</p>
        </div>
    `;
    chatDiv.appendChild(userMessage);
    
    // Generate AI response
    setTimeout(() => {
        const response = generateAIResponse(question);
        const aiMessage = document.createElement('div');
        aiMessage.className = 'ai-message ai-system';
        aiMessage.innerHTML = `
            <div class="ai-avatar">🤖</div>
            <div class="ai-content">
                <strong>AI Assistant</strong>
                ${response}
            </div>
        `;
        chatDiv.appendChild(aiMessage);
        chatDiv.scrollTop = chatDiv.scrollHeight;
    }, 500);
    
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function generateAIResponse(question) {
    const lowerQuestion = question.toLowerCase();
    
    // Theme-related questions
    if (lowerQuestion.includes('money') || lowerQuestion.includes('cash') || lowerQuestion.includes('luxury')) {
        const moneyTheme = gameData.themes.find(t => t.Theme === 'Money/Cash') || gameData.themes.find(t => t.Theme.toLowerCase().includes('money'));
        if (moneyTheme) {
            return `
                <p><strong>Money/Cash Theme Analysis:</strong></p>
                <p>${moneyTheme.Theme} is a <strong>top-performing theme</strong> with solid metrics:</p>
                <ul>
                    <li><strong>${moneyTheme['Game Count']}</strong> games (high volume)</li>
                    <li><strong>Smart Index: ${(moneyTheme['Smart Index'] || 0).toFixed(1)}</strong></li>
                    <li><strong>${(moneyTheme['Market Share %'] || 0).toFixed(1)}%</strong> market share</li>
                    <li>Average Theo Win: ${(moneyTheme['Avg Theo Win Index'] || 0).toFixed(3)}</li>
                </ul>
                <p>💡 <strong>Why it works:</strong> Universal appeal, clear win/reward messaging, combines well with Fire/Volcanic and Asian themes.</p>
            `;
        }
    }
    
    if (lowerQuestion.includes('asian') || lowerQuestion.includes('chinese') || lowerQuestion.includes('dragon')) {
        const asianTheme = gameData.themes.find(t => t.Theme === 'Asian/Chinese') || gameData.themes.find(t => t.Theme.toLowerCase().includes('asian'));
        if (asianTheme) {
            return `
                <p><strong>Asian/Chinese Theme Performance:</strong></p>
                <ul>
                    <li><strong>${asianTheme['Game Count']}</strong> games in database</li>
                    <li><strong>Smart Index: ${(asianTheme['Smart Index'] || 0).toFixed(1)}</strong></li>
                    <li>Average Theo Win: ${(asianTheme['Avg Theo Win Index'] || 0).toFixed(3)}</li>
                </ul>
                <p>This theme performs well due to:</p>
                <ul>
                    <li>Cultural symbolism and luck themes resonate globally</li>
                    <li>Often paired with prosperity/money themes</li>
                    <li>Strong visual appeal with dragons, gold, red colors</li>
                </ul>
                <p>💡 <strong>Best combinations:</strong> Pair with Money/Cash, Dragons themes, or Hold & Win mechanic.</p>
            `;
        }
    }
    
    // Jackpot clarification (check early - "work best with jackpot" should hit this)
    if (lowerQuestion.includes('jackpot')) {
        return `
            <p><strong>⚠️ Important: "Jackpot" is NOT a game mechanic!</strong></p>
            <p>Jackpots are <strong>standard payout tiers</strong> found in almost every slot game. They represent the maximum win potential, not a unique gameplay feature.</p>
            <p><strong>What ARE real mechanics?</strong></p>
            <ul>
                <li><strong>Hold & Win</strong> - Lock symbols and trigger respins</li>
                <li><strong>Megaways</strong> - Dynamic reel system with up to 117,649 ways</li>
                <li><strong>Free Spins</strong> - Bonus rounds with free games</li>
                <li><strong>Cascade/Avalanche</strong> - Symbols drop and refill for consecutive wins</li>
                <li><strong>Cluster Pays</strong> - Adjacent symbols form wins</li>
            </ul>
            <p>💡 <strong>Tip:</strong> Focus on mechanics that change HOW the game plays, not what it pays!</p>
        `;
    }
    
    if ((lowerQuestion.includes('megaways') || lowerQuestion.includes('ways')) && !lowerQuestion.includes('always')) {
        const ways = gameData.mechanics.find(m => m.Mechanic === 'Ways');
        const megaways = gameData.mechanics.find(m => m.Mechanic === 'Megaways');
        if (ways && megaways) {
            return `
                <p><strong>Ways vs Megaways Mechanics:</strong></p>
                <p><strong>Ways (${ways['Game Count']} games):</strong></p>
                <ul>
                    <li>Smart Index: ${(ways['Smart Index'] || 0).toFixed(1)}</li>
                    <li>Fixed ways (243, 1024, 4096)</li>
                    <li>Proven, reliable mechanic</li>
                </ul>
                <p><strong>Megaways (${megaways['Game Count']} games):</strong></p>
                <ul>
                    <li>Smart Index: ${(megaways['Smart Index'] || 0).toFixed(1)}</li>
                    <li>Dynamic ways up to 117,649</li>
                    <li>Modern, exciting format</li>
                </ul>
                <p>💡 <strong>Recommendation:</strong> Choose based on target audience - Megaways for modern players, Ways for classic appeal.</p>
            `;
        }
    }
    
    // Hold & Win specific
    if (lowerQuestion.includes('hold') && (lowerQuestion.includes('win') || lowerQuestion.includes('&'))) {
        const holdWin = gameData.mechanics.find(m => m.Mechanic && m.Mechanic.toLowerCase().includes('hold'));
        if (holdWin) {
            return `
                <p><strong>Hold & Win Mechanic:</strong></p>
                <ul>
                    <li><strong>${holdWin['Game Count']}</strong> games (Smart Index: ${(holdWin['Smart Index'] || 0).toFixed(1)})</li>
                    <li>Locks symbols in place and triggers respins</li>
                    <li>Pairs well with Money/Cash, Fire/Volcanic, and Asian themes</li>
                </ul>
                <p>💡 <strong>Pro tip:</strong> Hold & Win often works best with sticky/multiplier features for maximum excitement.</p>
            `;
        }
    }
    
    // Combination / multiple themes / focus (covers "top performing combinations", "multiple themes or focus on one")
    if (lowerQuestion.includes('combination') || lowerQuestion.includes('together') || lowerQuestion.includes('pair')
        || lowerQuestion.includes('multiple themes') || lowerQuestion.includes('focus on one') || lowerQuestion.includes('one theme')
        || (lowerQuestion.includes('top') && lowerQuestion.includes('performing'))) {
        const topThemes = [...(gameData.themes || [])].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0)).slice(0, 5);
        return `
            <p><strong>Top Performing Theme Combinations:</strong></p>
            <p>From our data, the strongest themes to combine:</p>
            <ul>
                ${topThemes.map(t => `<li><strong>${t.Theme}</strong>: ${t['Game Count']} games, Smart Index ${(t['Smart Index'] || 0).toFixed(1)}</li>`).join('')}
            </ul>
            <p><strong>Mechanic Pairings:</strong></p>
            <ul>
                <li><strong>Megaways + Free Spins</strong> - Dynamic reels + bonus rounds</li>
                <li><strong>Hold & Win + Sticky Wilds</strong> - Lock features + persistent symbols</li>
                <li><strong>Cascade + Multiplier</strong> - Consecutive wins + value boosts</li>
            </ul>
            <p>💡 <strong>Pro tip:</strong> Limit to <strong>2–3 themes</strong> and <strong>1–2 core mechanics</strong>. Focus beats dilution—one strong concept outperforms a busy mix.</p>
        `;
    }
    
    // Market gap questions
    if (lowerQuestion.includes('gap') || lowerQuestion.includes('opportunity') || lowerQuestion.includes('underutilized')) {
        const lowAdoptionThemes = (gameData.themes || [])
            .filter(t => t['Game Count'] < 50 && (t['Smart Index'] || 0) > 50)
            .slice(0, 5);
        
        return `
            <p><strong>Market Opportunities - Underutilized Themes:</strong></p>
            <p>These themes have good Smart Index but low adoption:</p>
            <ul>
                ${lowAdoptionThemes.length ? lowAdoptionThemes.map(t => `
                    <li><strong>${t.Theme}</strong>: Only ${t['Game Count']} games, Smart Index ${(t['Smart Index'] || 0).toFixed(1)}</li>
                `).join('') : '<li>No clear underutilized themes in current data</li>'}
            </ul>
            <p>💡 <strong>Strategy:</strong> These represent "blue ocean" opportunities - less competition but proven appeal.</p>
        `;
    }
    
    // Default response with recommendations
    const themes = (gameData.themes || []).slice(0, 3);
    const mechanics = (gameData.mechanics || []).slice(0, 3);
    return `
        <p>Here are some insights based on our data:</p>
        <p><strong>Top Themes by Smart Index:</strong></p>
        <ul>
            ${themes.length ? themes.map(t => `
                <li><strong>${t.Theme}</strong>: ${t['Game Count']} games, Smart Index ${(t['Smart Index'] || 0).toFixed(1)}</li>
            `).join('') : '<li>No theme data available</li>'}
        </ul>
        <p><strong>Top Mechanics:</strong></p>
        <ul>
            ${mechanics.length ? mechanics.map(m => `
                <li><strong>${m.Mechanic}</strong>: Smart Index ${(m['Smart Index'] || 0).toFixed(1)}</li>
            `).join('') : '<li>No mechanic data available</li>'}
        </ul>
        <p>💡 Try: "What themes work best with Jackpot mechanics?", "Top performing combinations?", or "Market gaps?"</p>
    `;
}

// ============================================================================
// ITEMS PER PAGE CONTROLS
// ============================================================================

// Global pagination state - exposed to window for onclick handlers
window.themesPerPage = 50;
window.mechanicsPerPage = 50;
window.gamesPerPage = 50;
window.providersPerPage = 50;

window.themesCurrentPage = 1;
window.mechanicsCurrentPage = 1;
window.gamesCurrentPage = 1;
window.providersCurrentPage = 1;

// Local references for easier access
let themesPerPage = window.themesPerPage;
let mechanicsPerPage = window.mechanicsPerPage;
let gamesPerPage = window.gamesPerPage;
let providersPerPage = window.providersPerPage;

let themesCurrentPage = window.themesCurrentPage;
let mechanicsCurrentPage = window.mechanicsCurrentPage;
let gamesCurrentPage = window.gamesCurrentPage;
let providersCurrentPage = window.providersCurrentPage;

// Themes per page
window.changeThemesPerPage = function(value) {
    window.themesPerPage = parseInt(value);
    themesPerPage = window.themesPerPage;
    window.themesCurrentPage = 1;
    themesCurrentPage = 1;
    renderThemes();
};

// Mechanics per page
window.changeMechanicsPerPage = function(value) {
    window.mechanicsPerPage = parseInt(value);
    mechanicsPerPage = window.mechanicsPerPage;
    window.mechanicsCurrentPage = 1;
    mechanicsCurrentPage = 1;
    renderMechanics();
};

// Games per page
window.changeGamesPerPage = function(value) {
    window.gamesPerPage = parseInt(value);
    gamesPerPage = window.gamesPerPage;
    window.gamesCurrentPage = 1;
    gamesCurrentPage = 1;
    if (window._setGamesPerPage) {
        window._setGamesPerPage(value);
    } else {
        window.renderGames?.();
    }
};

// Providers per page
window.changeProvidersPerPage = function(value) {
    window.providersPerPage = parseInt(value);
    providersPerPage = window.providersPerPage;
    window.providersCurrentPage = 1;
    providersCurrentPage = 1;
    window.renderProviders?.();
};

// Pagination navigation
window.goToThemesPage = function(page) {
    const totalPages = Math.ceil((filteredThemes || gameData.themes).length / window.themesPerPage);
    if (page < 1 || page > totalPages) return;
    window.themesCurrentPage = page;
    themesCurrentPage = page;
    renderThemes(filteredThemes);
};

window.goToMechanicsPage = function(page) {
    const totalPages = Math.ceil((filteredMechanics || gameData.mechanics).length / window.mechanicsPerPage);
    if (page < 1 || page > totalPages) return;
    window.mechanicsCurrentPage = page;
    mechanicsCurrentPage = page;
    renderMechanics(filteredMechanics);
};

window.goToGamesPage = function(page) {
    const totalPages = Math.ceil(gameData.allGames.length / window.gamesPerPage);
    if (page < 1 || page > totalPages) return;
    window.gamesCurrentPage = page;
    gamesCurrentPage = page;
    window.renderGames?.();
};

window.goToProvidersPage = function(page) {
    const totalPages = Math.ceil(gameData.providers.length / window.providersPerPage);
    if (page < 1 || page > totalPages) return;
    window.providersCurrentPage = page;
    providersCurrentPage = page;
    window.renderProviders?.();
};

// Expose showPage to window for navigation
window.showPage = showPage;

// Browser back/forward navigation
window.addEventListener('popstate', (e) => {
    const page = e.state?.page || 'overview';
    showPage(page, { pushHistory: false });
});

// Helper functions to update pagination footer
function updateThemesPaginationInfo(total, start, end) {
    const actualEnd = Math.min(end, total);
    const totalPages = Math.ceil(total / themesPerPage);
    
    // Update dropdown
    const select = document.getElementById('themes-per-page-footer');
    if (select) select.value = themesPerPage;
    
    // Update page info
    const currentPageSpan = document.getElementById('themes-current-page');
    const totalPagesSpan = document.getElementById('themes-total-pages');
    if (currentPageSpan) currentPageSpan.textContent = themesCurrentPage;
    if (totalPagesSpan) totalPagesSpan.textContent = totalPages;
    
    // Update showing info
    const showingInfo = document.getElementById('themes-showing-info');
    if (showingInfo) {
        showingInfo.innerHTML = `Showing <span class="font-semibold">${start + 1}-${actualEnd}</span> of <span class="font-semibold">${total}</span>`;
    }
    
    // Enable/disable prev/next buttons
    const prevBtn = document.getElementById('themes-prev-btn');
    const nextBtn = document.getElementById('themes-next-btn');
    if (prevBtn) prevBtn.disabled = themesCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = themesCurrentPage >= totalPages;
}

function updateMechanicsPaginationInfo(total, start, end) {
    const actualEnd = Math.min(end, total);
    const totalPages = Math.ceil(total / mechanicsPerPage);
    
    const select = document.getElementById('mechanics-per-page-footer');
    if (select) select.value = mechanicsPerPage;
    
    const currentPageSpan = document.getElementById('mechanics-current-page');
    const totalPagesSpan = document.getElementById('mechanics-total-pages');
    if (currentPageSpan) currentPageSpan.textContent = mechanicsCurrentPage;
    if (totalPagesSpan) totalPagesSpan.textContent = totalPages;
    
    const showingInfo = document.getElementById('mechanics-showing-info');
    if (showingInfo) {
        showingInfo.innerHTML = `Showing <span class="font-semibold">${start + 1}-${actualEnd}</span> of <span class="font-semibold">${total}</span>`;
    }
    
    const prevBtn = document.getElementById('mechanics-prev-btn');
    const nextBtn = document.getElementById('mechanics-next-btn');
    if (prevBtn) prevBtn.disabled = mechanicsCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = mechanicsCurrentPage >= totalPages;
}

function updateProvidersPaginationInfo(total, start, end) {
    const actualEnd = Math.min(end, total);
    const totalPages = Math.ceil(total / providersPerPage);
    
    const select = document.getElementById('providers-per-page-footer');
    if (select) select.value = providersPerPage;
    
    const currentPageSpan = document.getElementById('providers-current-page');
    const totalPagesSpan = document.getElementById('providers-total-pages');
    if (currentPageSpan) currentPageSpan.textContent = providersCurrentPage;
    if (totalPagesSpan) totalPagesSpan.textContent = totalPages;
    
    const showingInfo = document.getElementById('providers-showing-info');
    if (showingInfo) {
        showingInfo.innerHTML = `Showing <span class="font-semibold">${start + 1}-${actualEnd}</span> of <span class="font-semibold">${total}</span>`;
    }
    
    const prevBtn = document.getElementById('providers-prev-btn');
    const nextBtn = document.getElementById('providers-next-btn');
    if (prevBtn) prevBtn.disabled = providersCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = providersCurrentPage >= totalPages;
}

function updateGamesPaginationInfo(total, start, end) {
    const actualEnd = Math.min(end, total);
    const totalPages = Math.ceil(total / gamesPerPage);
    
    const select = document.getElementById('games-per-page-footer');
    if (select) select.value = gamesPerPage;
    
    const currentPageSpan = document.getElementById('games-current-page');
    const totalPagesSpan = document.getElementById('games-total-pages');
    if (currentPageSpan) currentPageSpan.textContent = gamesCurrentPage;
    if (totalPagesSpan) totalPagesSpan.textContent = totalPages;
    
    const showingInfo = document.getElementById('games-showing-info');
    if (showingInfo) {
        showingInfo.innerHTML = `Showing <span class="font-semibold">${start + 1}-${actualEnd}</span> of <span class="font-semibold">${total}</span>`;
    }
    
    const prevBtn = document.getElementById('games-prev-btn');
    const nextBtn = document.getElementById('games-next-btn');
    if (prevBtn) prevBtn.disabled = gamesCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = gamesCurrentPage >= totalPages;
}
