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
    EmptyState
} from '../components/dashboard-components.js';
import { populateThemesFilters, populateMechanicsFilters, populateProvidersFilters, populateGamesFilters } from './filter-dropdowns.js';
import { setupExportButtons as setupExportButtonsBase } from './ui-export.js';
import { getSuggestedIdeas, getTopCombos, getAvoidCombos, getWatchListCombos, getHeatmapData } from '../features/idea-generator.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../lib/sanitize.js';
import { log, warn } from '../lib/env.js';

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

// Mechanic details panel functions
window.showMechanicDetails = function(mechanicName) {
    const mechDef = getMechanicDefinition(mechanicName);
    const mechData = gameData.mechanics.find(m => m.Mechanic === mechanicName);
    
    if (!mechData) {
        console.error('Mechanic data not found:', mechanicName);
        return;
    }
    
    // Populate panel
    document.getElementById('mechanic-panel-title').textContent = mechanicName;
    document.getElementById('mechanic-description').textContent = mechDef?.description || `${mechanicName} is a game feature found in ${mechData['Game Count']} games.`;
    document.getElementById('mechanic-how-it-works').textContent = mechDef?.whatItDoes || '';
    
    // Examples list - show game names from mechanic definitions
    const examplesList = document.getElementById('mechanic-examples');
    examplesList.innerHTML = '';
    if (mechDef?.examples && mechDef.examples.length > 0) {
        mechDef.examples.slice(0, 10).forEach(ex => {
            const gameName = ex.replace(/\s*\(.*\)$/, '').trim();
            const li = document.createElement('li');
            li.className = 'py-1.5 leading-relaxed cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors';
            li.textContent = ex;
            li.addEventListener('click', () => window.showGameDetails(gameName));
            examplesList.appendChild(li);
        });
    } else {
        examplesList.innerHTML = '<li class="py-1.5 mechanic-panel-body">No examples available</li>';
    }
    
    // Statistics - using MetricGrid component
    const statsMetrics = [
        { label: 'Games', value: mechData['Game Count'] },
        { label: 'Market Share', value: `${mechData['Market Share %'].toFixed(1)}%` },
        { label: 'Avg Theo Win', value: mechData['Avg Theo Win Index'].toFixed(3) },
        { label: 'Total Theo Win', value: `<span class="text-green-600 dark:text-green-400">${mechData['Smart Index'].toFixed(2)}</span>` }
    ];
    const statsDiv = document.getElementById('mechanic-stats');
    statsDiv.innerHTML = MetricGrid(statsMetrics);
    
    // Match example games to actual game data
    const exampleGameNames = mechDef?.examples || [];
    const matchedGames = [];
    const matchedGameNames = new Set();
    
    exampleGameNames.forEach(exampleName => {
        // Strip parentheses content (e.g., "88 Fortunes (10 spins)" -> "88 Fortunes")
        const cleanName = exampleName.replace(/\s*\([^)]*\)/g, '').trim();
        
        const game = gameData.allGames.find(g => 
            g.name.toLowerCase() === cleanName.toLowerCase() ||
            g.name.toLowerCase().includes(cleanName.toLowerCase()) ||
            cleanName.toLowerCase().includes(g.name.toLowerCase())
        );
        if (game) {
            const perf = getPerformance(game);
            if (perf.theo_win > 0) {
                matchedGames.push(game);
                matchedGameNames.add(game.name);
            }
        }
    });
    
    // If we have fewer than 10 games, add more top performers from the entire dataset
    if (matchedGames.length < 10) {
        const additionalGames = gameData.allGames
            .filter(g => {
                if (matchedGameNames.has(g.name)) return false;
                const perf = getPerformance(g);
                return perf.theo_win > 0;
            })
            .sort((a, b) => {
                const perfA = getPerformance(a);
                const perfB = getPerformance(b);
                return perfB.theo_win - perfA.theo_win;
            })
            .slice(0, 10 - matchedGames.length);
        
        matchedGames.push(...additionalGames);
    }
    
    // Top Performing Games (sorted by Theo Win) - Show 10 games using GameListItem component
    const topGamesList = document.getElementById('mechanic-top-games');
    const topGames = matchedGames
        .sort((a, b) => {
            const perfA = getPerformance(a);
            const perfB = getPerformance(b);
            return perfB.theo_win - perfA.theo_win;
        })
        .slice(0, 10);
    
    if (topGames.length > 0) {
        topGamesList.innerHTML = topGames.map(game => GameListItem(game)).join('');
        topGamesList.parentElement.classList.remove('hidden');
    } else {
        topGamesList.innerHTML = EmptyState('No games found for this mechanic');
        topGamesList.parentElement.classList.add('hidden');
    }
    
    // Hide Top Themes and Top Providers sections (not relevant for mechanics)
    const topThemesDiv = document.getElementById('mechanic-top-themes');
    if (topThemesDiv && topThemesDiv.parentElement) {
        topThemesDiv.parentElement.classList.add('hidden');
    }
    
    const providersDiv = document.getElementById('mechanic-providers');
    if (providersDiv && providersDiv.parentElement) {
        providersDiv.parentElement.classList.add('hidden');
    }
    
    // Frequency with enhanced info
    const freqText = mechDef.frequency || 'Common in modern slot games';
    const usageInfo = mechData['Market Share %'] > 50 
        ? ' • Industry standard feature' 
        : mechData['Market Share %'] > 10 
            ? ' • Popular feature' 
            : ' • Specialty feature';
    document.getElementById('mechanic-frequency').textContent = freqText + usageInfo;
    
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
    const statsDiv = document.getElementById('theme-stats');
    statsDiv.innerHTML = MetricGrid(themeStatsMetrics);
    
    // Sub-themes
    const subThemesDiv = document.getElementById('theme-sub-themes');
    if (themeData.top_sub_themes && themeData.top_sub_themes.length > 0) {
        subThemesDiv.innerHTML = `
            <ul class="list-none p-0 m-0 space-y-1">
                ${themeData.top_sub_themes.map(st => `
                    <li class="text-gray-700 dark:text-gray-300">
                        <strong class="font-semibold">${st.theme}</strong> 
                        <span class="text-gray-500 dark:text-gray-400">(${st.count} games)</span>
                    </li>
                `).join('')}
            </ul>
        `;
    } else {
        subThemesDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-500">No sub-theme variations</p>';
    }
    
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
    
    // Sort by count
    const topProviders = Object.entries(providerCounts)
        .map(([provider, count]) => ({ provider, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 7);
    
    if (topProviders.length > 0) {
        providersDiv.innerHTML = `
            <ul class="list-none p-0 m-0">
                ${topProviders.map(p => `
                    <li class="py-2 border-b border-gray-200 dark:border-gray-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded px-2 -mx-2 transition-colors"
                        onclick="${safeOnclick('window.showProviderDetails', p.provider || '')}">
                        <strong class="block break-words text-gray-800 dark:text-gray-200">${escapeHtml(p.provider)}</strong>
                        <span class="text-gray-500 dark:text-gray-400 text-sm">${p.count} ${p.count === 1 ? 'game' : 'games'}</span>
                    </li>
                `).join('')}
            </ul>
        `;
    } else {
        providersDiv.innerHTML = '<p class="text-gray-500 dark:text-gray-500">No provider data</p>';
    }
    
    // Top Games - Show 7 games with actual provider info
    const topGamesList = document.getElementById('theme-top-games');
    topGamesList.innerHTML = '';
    
    // Sort games by performance and take top 7
    const topGames = themeGames
        .sort((a, b) => {
            const aTheo = a.performance_theo_win || a.performance?.theo_win || 0;
            const bTheo = b.performance_theo_win || b.performance?.theo_win || 0;
            return bTheo - aTheo;
        })
        .slice(0, 7);
    
    if (topGames.length > 0) {
        topGamesList.innerHTML = topGames.map(game => GameListItem(game)).join('');
    } else {
        topGamesList.innerHTML = '<li class="text-gray-500 dark:text-gray-500">No games available</li>';
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
    
    // Populate table
    const tbody = document.querySelector('#overview-table tbody');
    tbody.innerHTML = '';
    
    gameData.themes.slice(0, 10).forEach((theme, i) => {
        const row = tbody.insertRow();
        row.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors';
        
        // Create rank badge with gradient for top 3
        let rankBadge = `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm"`;
        if (i === 0) {
            rankBadge += ` style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white;">${i + 1}</span>`;
        } else if (i === 1) {
            rankBadge += ` style="background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%); color: white;">${i + 1}</span>`;
        } else if (i === 2) {
            rankBadge += ` style="background: linear-gradient(135deg, #fb923c 0%, #f97316 100%); color: white;">${i + 1}</span>`;
        } else {
            rankBadge += ` class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">${i + 1}</span>`;
        }
        
        row.innerHTML = `
            <td class="px-6 py-4 text-center">${rankBadge}</td>
            <td class="px-6 py-4">
                <span class="text-base font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      onclick="${safeOnclick('window.showThemeDetails', theme.Theme)}">${escapeHtml(theme.Theme)}</span>
            </td>
            <td class="px-6 py-4">
                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                    ${theme['Game Count']} games
                </span>
            </td>
            <td class="px-6 py-4">
                <span class="text-base font-bold text-green-600 dark:text-green-400">${theme['Smart Index'].toFixed(2)}</span>
            </td>
        `;
    });
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
    
    themes.forEach((theme, index) => {
        const globalIndex = startIndex + index;
        const row = tbody.insertRow();
        row.className = 'theme-row hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors';
        row.dataset.themeIndex = globalIndex;
        
        // Check if this is a unified theme with sub-themes
        const isUnified = theme._isUnified && theme._subthemes && Object.keys(theme._subthemes).length > 0;
        const expandIcon = isUnified ? '<span class="expand-icon">▶</span> ' : '';
        
        const themeName = theme.Theme;
        const themeNameEscaped = escapeAttr(themeName);
        
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${globalIndex + 1}</td>
            <td class="px-4 py-3">
                ${isUnified ? `<span class="unified-theme-name cursor-pointer text-gray-900 dark:text-white" onclick="toggleSubThemes(${globalIndex})">${expandIcon}${themeName}</span>` : `<span class="theme-link cursor-pointer text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors" data-theme="${themeNameEscaped}">${themeName}</span>`}
            </td>
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${theme['Game Count']}</td>
            <td class="px-4 py-3">
                <span class="text-amber-600 dark:text-amber-400">${theme['Smart Index'].toFixed(2)}</span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${(theme['Market Share %'] ?? 0).toFixed(2)}%</td>
        `;
        
        // If unified, prepare sub-theme rows (hidden by default)
        if (isUnified) {
            const subThemes = Object.values(theme._subthemes);
            const parentThemeName = theme.Theme;
            subThemes.forEach((subTheme) => {
                const subRow = tbody.insertRow();
                subRow.className = `sub-theme-row sub-theme-${index} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`;
                subRow.style.display = 'none';
                const subThemeName = subTheme.Theme;
                const subThemeNameEscaped = escapeAttr(subThemeName);
                
                // Show parent prefix if sub-theme name doesn't already contain it
                let displayName = subThemeName;
                if (parentThemeName === 'Asian' && !subThemeName.startsWith('Asian')) {
                    displayName = `Asian/${subThemeName}`;
                } else if (parentThemeName === 'Ancient Civilizations' && !subThemeName.includes('Ancient')) {
                    // Greek/Mythology -> Ancient/Greek Mythology
                    displayName = subThemeName.replace('Greek/', 'Ancient/Greek ');
                }
                
                subRow.innerHTML = `
                    <td class="px-4 py-3"></td>
                    <td class="px-4 py-3 pl-12">
                        <span class="theme-link cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" data-theme="${subThemeNameEscaped}">
                            └ ${displayName}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${subTheme['Game Count']}</td>
                    <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${subTheme['Smart Index'].toFixed(2)}</td>
                    <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${(subTheme['Market Share %'] ?? 0).toFixed(2)}%</td>
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
    
    // Sync pagination from window (e.g. when filters reset to page 1)
    if (typeof window !== 'undefined' && window.mechanicsCurrentPage !== undefined) {
        mechanicsCurrentPage = window.mechanicsCurrentPage;
    }
    
    // Apply pagination
    const startIndex = (mechanicsCurrentPage - 1) * mechanicsPerPage;
    const endIndex = startIndex + mechanicsPerPage;
    const mechanics = allMechanics.slice(startIndex, endIndex);
    
    // Update pagination info
    updateMechanicsPaginationInfo(allMechanics.length, startIndex, endIndex);
    
    // Update mechanics count in header
    const mechanicsCountSpan = document.getElementById('mechanics-count');
    if (mechanicsCountSpan) {
        mechanicsCountSpan.textContent = allMechanics.length;
    }
    
    mechanics.forEach((mech, index) => {
        const globalIndex = startIndex + index;
        const row = tbody.insertRow();
        row.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors';
        row.innerHTML = `
            <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${globalIndex + 1}</td>
            <td class="px-4 py-3">
                <span class="mechanic-link cursor-pointer text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors" onclick="showMechanicDetails('${mech.Mechanic}')">${mech.Mechanic}</span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${mech['Game Count']}</td>
            <td class="px-4 py-3">
                <span class="text-amber-600 dark:text-amber-400">${mech['Smart Index'].toFixed(2)}</span>
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
        
        card.innerHTML = `
            <div class="text-base font-bold text-gray-900 dark:text-white mb-2">
                <span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="event.stopPropagation(); ${safeOnclick('window.showGameDetails', a.game || '')}">${escapeHtml(a.game)}</span>
                <span class="float-right text-gray-400">▼</span>
            </div>
            <div class="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">${(a.theo_win_index || 0).toFixed(2)}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">Theo Win Index • Z-Score: ${(a.z_score || 0).toFixed(2)}</div>
            <div class="text-sm text-gray-700 dark:text-gray-300">${a.themes.map(t => `<span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="event.stopPropagation(); ${safeOnclick('window.showThemeDetails', t)}">${escapeHtml(t)}</span>`).join(', ')}</div>
            
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
        
        card.innerHTML = `
            <div class="text-base font-bold text-gray-900 dark:text-white mb-2">
                <span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="event.stopPropagation(); ${safeOnclick('window.showGameDetails', a.game || '')}">${escapeHtml(a.game)}</span>
                <span class="float-right text-gray-400">▼</span>
            </div>
            <div class="text-3xl font-bold text-red-600 dark:text-red-400 mb-1">${(a.theo_win_index || 0).toFixed(2)}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">Theo Win Index • Z-Score: ${(a.z_score || 0).toFixed(2)}</div>
            <div class="text-sm text-gray-700 dark:text-gray-300">${a.themes.map(t => `<span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="event.stopPropagation(); ${safeOnclick('window.showThemeDetails', t)}">${escapeHtml(t)}</span>`).join(', ')}</div>
            
            <div class="hidden mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 card-details">
                <div class="mb-4">
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">⚠️ Performance Challenges</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        <li>• Performance is <strong>${Math.abs(a.z_score).toFixed(1)} standard deviations</strong> below average</li>
                        <li>• Theme combination may lack market appeal</li>
                        <li>• Underperforms theme average by <strong>${(((avgSmartIndex - a.theo_win_index) / avgSmartIndex) * 100).toFixed(0)}%</strong></li>
                    </ul>
                </div>
                
                <div class="mb-4">
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">💡 Improvement Opportunities</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        <li>• Consider testing different theme combinations</li>
                        <li>• Add popular mechanics to boost engagement</li>
                        <li>• Analyze successful games in same themes</li>
                        <li>• Review game design and player feedback</li>
                    </ul>
                </div>
            </div>
        `;
        
        card.addEventListener('click', (e) => toggleCardExpansion(e.currentTarget));
        bottomDiv.appendChild(card);
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
            showAnomalies('top');
            break;
            
        case 'insights':
            generateInsights();
            break;
            
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
            setupPrediction();
            break;
            
        case 'ai-assistant':
            // AI Assistant initializes itself
            document.getElementById('ai-input')?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAIMessage();
                }
            });
            break;
            
        default:
            warn(`No initializer for page: ${pageName}`);
    }
}

export async function showPage(page) {
    log('🔄 Switching to page:', page);
    
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
        const response = await fetch(`src/pages/${page}.html`);
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
        }, 100);
    }
    
    // Show top anomalies by default when switching to anomalies page
    if (page === 'anomalies') {
        setTimeout(() => {
            // Re-render anomalies to ensure bottom cards exist
            renderAnomalies();
            
            const topBtn = document.querySelector('button[onclick="showAnomalies(\'top\')"]');
            if (topBtn) {
                topBtn.click();
            }
        }, 100);
    }
}

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

// Prediction tab switch
function switchPredictionTab(tab) {
    const testArea = document.getElementById('prediction-test-area');
    const oppArea = document.getElementById('prediction-opportunities-area');
    const tabTest = document.getElementById('tab-test-idea');
    const tabOpp = document.getElementById('tab-opportunities');
    if (!testArea || !oppArea) return;
    if (tab === 'opportunities') {
        testArea.classList.add('hidden');
        oppArea.classList.remove('hidden');
        tabTest?.classList.remove('active', 'bg-indigo-600', 'text-white');
        tabTest?.classList.add('bg-slate-200', 'dark:bg-slate-700', 'text-gray-700', 'dark:text-gray-300');
        tabOpp?.classList.add('active', 'bg-indigo-600', 'text-white');
        tabOpp?.classList.remove('bg-slate-200', 'dark:bg-slate-700', 'text-gray-700', 'dark:text-gray-300');
        populateOpportunityCombos();
    } else {
        testArea.classList.remove('hidden');
        oppArea.classList.add('hidden');
        tabTest?.classList.add('active', 'bg-indigo-600', 'text-white');
        tabTest?.classList.remove('bg-slate-200', 'dark:bg-slate-700', 'text-gray-700', 'dark:text-gray-300');
        tabOpp?.classList.remove('active', 'bg-indigo-600', 'text-white');
        tabOpp?.classList.add('bg-slate-200', 'dark:bg-slate-700', 'text-gray-700', 'dark:text-gray-300');
    }
}
window.switchPredictionTab = switchPredictionTab;

function populateOpportunityCombos() {
    const list = document.getElementById('opportunity-combos-list');
    if (!list) return;
    const ideas = getSuggestedIdeas();
    list.innerHTML = ideas.length > 0 ? ideas.map(idea => `
        <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
            <div>
                <span class="font-semibold text-gray-900 dark:text-white">${idea.theme}</span>
                <span class="text-gray-500 dark:text-gray-400"> + </span>
                <span class="font-semibold text-gray-900 dark:text-white">${idea.mechanic}</span>
                <span class="text-sm text-gray-600 dark:text-gray-400 ml-2">${idea.count} games • Avg Theo: ${idea.avgTheo.toFixed(2)}</span>
            </div>
            <button onclick="${safeOnclick('useOpportunityCombo', idea.theme || '', idea.mechanic || '')}" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">Test this</button>
        </div>
    `).join('') : '<p class="text-sm text-gray-500 dark:text-gray-400">No opportunity combos – need more game data</p>';
}

async function useOpportunityCombo(theme, mechanic) {
    const container = document.getElementById('page-container');
    const onPrediction = container?.querySelector('#prediction-test-area');
    if (!onPrediction) {
        await showPage('prediction');
    }
    switchPredictionTab('test');
    setTimeout(() => {
        const themeChip = document.querySelector(`#game-themes .theme-chip[data-theme="${theme}"]`);
        const mechChips = document.querySelectorAll(`#game-mechanics .mechanic-chip[data-mechanic="${mechanic}"]`);
        if (themeChip) {
            document.querySelectorAll('#game-themes .theme-chip').forEach(c => {
                c.classList.remove('selected', 'bg-indigo-600', 'dark:bg-indigo-500', 'text-white');
                c.classList.add('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
            });
            themeChip.classList.add('selected', 'bg-indigo-600', 'dark:bg-indigo-500', 'text-white');
            themeChip.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
        }
        if (mechChips.length) {
            mechChips.forEach(c => {
                if (!c.classList.contains('selected')) {
                    c.classList.add('selected', 'bg-purple-600', 'dark:bg-purple-500', 'text-white');
                    c.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
                }
            });
        }
        document.getElementById('theme-search');
        if (document.getElementById('theme-search')) document.getElementById('theme-search').value = '';
        if (document.getElementById('mechanic-search')) document.getElementById('mechanic-search').value = '';
    }, 100);
}
window.useOpportunityCombo = useOpportunityCombo;

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
        alert('Please select at least one theme');
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
    
    if (!hotDiv || !gapDiv || !trendDiv || !satDiv) {
        console.error('❌ One or more insight containers missing!');
        return;
    }
    
    log('  - Generating insights from', gameData.themes.length, 'themes...');
    
    // 0. Heatmap
    if (heatmapDiv) {
        try {
            const { themes, mechanics, matrix, minTheo, maxTheo } = getHeatmapData(10, 10);
            const range = maxTheo - minTheo || 1;
            heatmapDiv.innerHTML = `
                <table class="heatmap-table text-xs border-collapse">
                    <thead><tr>
                        <th class="p-1.5 text-left font-medium text-gray-600 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10 min-w-[100px]">Theme</th>
                        ${mechanics.map(m => `<th class="p-1.5 text-center font-medium text-gray-600 dark:text-gray-400 truncate max-w-[70px]" title="${m}">${m.length > 8 ? m.slice(0,7)+'…' : m}</th>`).join('')}
                    </tr></thead>
                    <tbody>
                        ${themes.map((t, i) => `
                            <tr>
                                <td class="p-1.5 font-medium text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 z-10" title="${t}">${t.length > 12 ? t.slice(0,11)+'…' : t}</td>
                                ${matrix[i].map((cell, j) => {
                                    if (!cell) return '<td class="p-1 w-10 h-8 bg-gray-100 dark:bg-gray-700/50"></td>';
                                    const pct = range > 0 ? ((cell.avgTheo - minTheo) / range) * 100 : 0;
                                    const hue = 220 - Math.round(pct * 0.8);
                                    const bg = `hsl(${hue}, 60%, ${45 + pct * 0.2}%)`;
                                    return `<td class="p-1 w-10 h-8 text-center align-middle rounded cursor-pointer hover:ring-2 hover:ring-indigo-400 dark:hover:ring-indigo-500" style="background:${bg};color:${pct > 50 ? 'white' : '#1e293b'}" title="${escapeAttr(t)} + ${escapeAttr(mechanics[j])}: ${cell.avgTheo.toFixed(2)} (${cell.count} games). Click to test in Prediction" onclick="if(window.useOpportunityCombo){${safeOnclick('window.useOpportunityCombo', t, mechanics[j])}}">${cell.avgTheo.toFixed(1)}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            heatmapDiv.innerHTML = '<p class="text-sm text-gray-500">Heatmap data unavailable</p>';
        }
    }
    if (comboDiv) {
        const combos = getTopCombos(10);
        comboDiv.innerHTML = combos.length > 0 ? `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead><tr class="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600">
                        <th class="pb-3 pr-4">Theme</th><th class="pb-3 pr-4">Mechanic</th><th class="pb-3 pr-4">Games</th><th class="pb-3">Avg Theo</th>
                    </tr></thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                        ${combos.map(c => `
                            <tr class="hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                                <td class="py-2.5 pr-4 font-medium text-gray-900 dark:text-white">${c.theme}</td>
                                <td class="py-2.5 pr-4 text-gray-700 dark:text-gray-300">${c.mechanic}</td>
                                <td class="py-2.5 pr-4"><span class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${c.count}</span></td>
                                <td class="py-2.5 font-semibold text-emerald-600 dark:text-emerald-400">${c.avgTheo.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : '<p class="text-sm text-gray-500 dark:text-gray-400">No combo data available</p>';
    }
    if (avoidDiv) {
        const avoid = getAvoidCombos(5);
        avoidDiv.innerHTML = avoid.length > 0 ? avoid.map(c => `
            <div class="p-3 rounded-lg border-l-4 border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/10 dark:border-l-red-500">
                <div class="font-semibold text-gray-900 dark:text-white">${c.theme} + ${c.mechanic}</div>
                <div class="flex gap-2 mt-1.5 flex-wrap">
                    <span class="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">${c.count} games</span>
                    <span class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Theo ${c.avgTheo.toFixed(2)}</span>
                </div>
            </div>
        `).join('') : '<p class="text-sm text-gray-500 dark:text-gray-400">No underperformers with sufficient sample</p>';
    }
    if (watchDiv) {
        const watch = getWatchListCombos(5);
        watchDiv.innerHTML = watch.length > 0 ? watch.map(c => `
            <div class="p-3 rounded-lg border-l-4 border-amber-400 dark:border-amber-500 bg-amber-50/50 dark:bg-amber-900/10 dark:border-l-amber-500">
                <div class="font-semibold text-gray-900 dark:text-white">${c.theme} + ${c.mechanic}</div>
                <div class="flex gap-2 mt-1.5 flex-wrap">
                    <span class="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">${c.count} games</span>
                    <span class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Theo ${c.avgTheo.toFixed(2)}</span>
                </div>
            </div>
        `).join('') : '<p class="text-sm text-gray-500 dark:text-gray-400">No small-sample combos to watch</p>';
    }
    
    // 1. Top Performing Themes - Best performers (data-driven: top 25% by Smart Index)
    generateTopPerformers();
    log('  ✅ Top performers generated');
    
    // 2. Opportunity Finder - High quality + Low saturation
    generateOpportunities();
    log('  ✅ Opportunities generated');
    
    // 3. Emerging Trends - Rising themes
    generateEmergingTrends();
    log('  ✅ Emerging trends generated');
    
    // 4. Saturated Markets - High competition
    generateSaturatedMarkets();
    log('  ✅ Saturated markets generated');
    
    log('💡 All insights generated successfully');
}

function generateTopPerformers() {
    const hotDiv = document.getElementById('hot-combinations');
    const withData = (gameData.themes || []).filter(t => (t['Game Count'] || 0) >= 5);
    const sorted = [...withData].sort((a, b) => (b["Smart Index"] || 0) - (a["Smart Index"] || 0));
    const topThemes = sorted.slice(0, 5);
    
    if (topThemes.length === 0) {
        hotDiv.innerHTML = '<p class="insights-item-text">No data available</p>';
        return;
    }
    
    hotDiv.innerHTML = topThemes.map(theme => `
        <div class="p-3 rounded-lg border-l-4 border-amber-400 dark:border-amber-500 bg-amber-50/40 dark:bg-amber-900/10">
            <div class="font-semibold text-gray-900 dark:text-white">${theme.Theme}</div>
            <div class="flex gap-2 mt-1.5 flex-wrap">
                <span class="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">${theme['Game Count']} games</span>
                <span class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold">Index ${(theme["Smart Index"] || 0).toFixed(1)}</span>
            </div>
        </div>
    `).join('');
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
    
    gapDiv.innerHTML = opportunities.map(opp => `
        <div class="p-3 rounded-lg border-l-4 border-emerald-400 dark:border-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/10">
            <div class="font-semibold text-gray-900 dark:text-white">${opp.Theme}</div>
            <div class="flex gap-2 mt-1.5 flex-wrap">
                <span class="text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">${opp['Game Count']} games</span>
                <span class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Theo ${(opp['Avg Theo Win Index'] || 0).toFixed(2)}</span>
                <span class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${(opp['Market Share %'] || 0).toFixed(1)}% market</span>
            </div>
        </div>
    `).join('');
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
        <div class="p-3 rounded-lg border-l-4 border-blue-400 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-900/10">
            <div class="font-semibold text-gray-900 dark:text-white">${trend.Theme}</div>
            <div class="flex gap-2 mt-1.5 flex-wrap">
                <span class="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">${trend['Game Count']} games</span>
                <span class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold">Theo ${(trend['Avg Theo Win Index'] || 0).toFixed(2)}</span>
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
    
    satDiv.innerHTML = proven.length > 0 ? proven.map(theme => `
        <div class="p-3 rounded-lg border-l-4 border-orange-400 dark:border-orange-500 bg-orange-50/40 dark:bg-orange-900/10">
            <div class="font-semibold text-gray-900 dark:text-white">${theme.Theme}</div>
            <div class="flex gap-2 mt-1.5 flex-wrap">
                <span class="text-xs px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-medium">${theme['Game Count']} games</span>
                <span class="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">${(theme['Market Share %'] || 0).toFixed(1)}% market</span>
            </div>
        </div>
    `).join('') : '<p class="text-sm text-gray-600 dark:text-gray-400">No high-volume themes detected</p>';
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
