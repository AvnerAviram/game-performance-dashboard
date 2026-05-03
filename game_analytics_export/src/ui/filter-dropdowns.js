/**
 * Filter Dropdowns for Themes and Mechanics pages
 * Populates and handles Provider/Mechanic/Theme filters
 */

import { gameData, getActiveGames } from '../lib/data.js';
import { F } from '../lib/game-fields.js';
import { log } from '../lib/env.js';
import { renderThemes } from './renderers/themes-renderer.js';
import { renderMechanics } from './renderers/mechanics-renderer.js';
import { parseFeatures } from '../lib/parse-features.js';
import { calculateSmartIndex } from '../lib/metrics.js';
import { MIN_QUALIFIED_GAMES } from '../lib/shared-config.js';

/**
 * Populate Themes page filters
 */
export function populateThemesFilters() {
    // Get unique providers from all games
    const providers = [...new Set(gameData.allGames.map(g => F.provider(g)))].filter(p => p && p !== 'Unknown').sort();

    // Get unique features from all games
    const featureSet = new Set();
    gameData.allGames.forEach(g => parseFeatures(g.features).forEach(f => featureSet.add(f)));
    const mechanics = [...featureSet].sort();

    // Populate provider dropdown
    const providerSelect = document.getElementById('themes-filter-provider');
    if (providerSelect) {
        providerSelect.innerHTML = '<option value="">All Providers</option>';
        providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider;
            option.textContent = provider;
            providerSelect.appendChild(option);
        });

        // Add change event
        providerSelect.onchange = () => filterThemes();
    }

    // Populate mechanic dropdown
    const mechanicSelect = document.getElementById('themes-filter-mechanic');
    if (mechanicSelect) {
        mechanicSelect.innerHTML = '<option value="">All Mechanics</option>';
        mechanics.forEach(mechanic => {
            const option = document.createElement('option');
            option.value = mechanic;
            option.textContent = mechanic;
            mechanicSelect.appendChild(option);
        });

        // Add change event
        mechanicSelect.onchange = () => filterThemes();
    }

    // Category filter (Slot, Live Casino, Table Game)
    const categorySelect = document.getElementById('themes-category-filter');
    if (categorySelect) {
        categorySelect.onchange = () => filterThemes();
    }

    log(`✅ Themes filters populated: ${providers.length} providers, ${mechanics.length} mechanics`);
}

/**
 * Populate Mechanics page filters
 */
export function populateMechanicsFilters() {
    // Get unique providers from all games
    const providers = [...new Set(gameData.allGames.map(g => F.provider(g)))].filter(p => p && p !== 'Unknown').sort();

    // Get unique themes from all games
    const themes = [...new Set(gameData.allGames.map(g => F.themeConsolidated(g)))]
        .filter(t => t && t !== 'Unknown')
        .sort();

    // Populate provider dropdown
    const providerSelect = document.getElementById('mechanics-filter-provider');
    if (providerSelect) {
        providerSelect.innerHTML = '<option value="">All Providers</option>';
        providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider;
            option.textContent = provider;
            providerSelect.appendChild(option);
        });

        // Add change event
        providerSelect.onchange = () => filterMechanics();
    }

    // Populate theme dropdown
    const themeSelect = document.getElementById('mechanics-filter-theme');
    if (themeSelect) {
        themeSelect.innerHTML = '<option value="">All Themes</option>';
        themes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme;
            option.textContent = theme;
            themeSelect.appendChild(option);
        });

        // Add change event
        themeSelect.onchange = () => filterMechanics();
    }

    log(`✅ Mechanics filters populated: ${providers.length} providers, ${themes.length} themes`);
}

/**
 * Filter themes based on selected provider, mechanic, and optional tab view.
 * @param {string} [view] — tab preset ('all'|'leaders'|'opportunities'|'premium')
 */
function filterThemes(view) {
    const providerValue = document.getElementById('themes-filter-provider')?.value || '';
    const mechanicValue = document.getElementById('themes-filter-mechanic')?.value || '';
    const categoryValue = document.getElementById('themes-category-filter')?.value || '';

    // If no filters selected and no view override, show all
    if (!providerValue && !mechanicValue && !categoryValue && !view) {
        renderThemes();
        return;
    }

    // Filter games - start from allGames if category filter is applied, otherwise from active
    let filteredGames = categoryValue ? gameData.allGames : getActiveGames();

    if (categoryValue) {
        filteredGames = filteredGames.filter(g => (g.category || 'Slot') === categoryValue);
    }

    if (providerValue) {
        filteredGames = filteredGames.filter(g => F.provider(g) === providerValue);
    }

    if (mechanicValue) {
        filteredGames = filteredGames.filter(g => parseFeatures(g.features).includes(mechanicValue));
    }

    const themeMap = {};
    filteredGames.forEach(g => {
        const t = F.themeConsolidated(g) || 'Unknown';
        if (!themeMap[t]) themeMap[t] = { count: 0, totalTheo: 0 };
        themeMap[t].count++;
        themeMap[t].totalTheo += F.theoWin(g);
    });
    const themeMetrics = Object.entries(themeMap).map(([theme, d]) => ({
        theme,
        count: d.count,
        avgTheo: d.count > 0 ? d.totalTheo / d.count : 0,
    }));
    const globalAvgTheo =
        themeMetrics.length > 0 ? themeMetrics.reduce((s, t) => s + t.avgTheo, 0) / themeMetrics.length : 0;
    const filteredThemes = themeMetrics.map(t => {
        const pi = calculateSmartIndex(t.avgTheo, t.count, globalAvgTheo);
        return {
            Theme: t.theme,
            'Game Count': t.count,
            'Avg Theo Win Index': t.avgTheo,
            avg_theo_win: t.avgTheo,
            game_count: t.count,
            'Smart Index': pi,
            'Performance Index': pi,
            performanceIndex: pi,
            smartIndex: pi,
            qualified: t.count >= MIN_QUALIFIED_GAMES,
            'Market Share %': ((t.count / filteredGames.length) * 100).toFixed(2),
        };
    });
    filteredThemes.sort((a, b) => {
        if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
        return b['Smart Index'] - a['Smart Index'];
    });

    // Apply tab view filter if provided
    let result = filteredThemes;
    if (view === 'leaders') {
        const sortedByCount = [...filteredThemes].sort((a, b) => b['Game Count'] - a['Game Count']);
        const threshold = sortedByCount[Math.floor(sortedByCount.length * 0.2)]?.['Game Count'] || 5;
        result = filteredThemes.filter(t => t['Game Count'] >= threshold);
        result.sort((a, b) => (b['Market Share %'] || 0) - (a['Market Share %'] || 0));
    } else if (view === 'opportunities') {
        const avgPerf = filteredThemes.reduce((s, t) => s + (t['Avg Theo Win Index'] || 0), 0) / filteredThemes.length;
        result = filteredThemes.filter(
            t => t['Game Count'] >= 3 && t['Avg Theo Win Index'] >= avgPerf && t['Market Share %'] < 5
        );
    } else if (view === 'premium') {
        const sortedByPerf = [...filteredThemes].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
        const threshold = sortedByPerf[Math.floor(sortedByPerf.length * 0.25)]?.['Smart Index'] || 1.5;
        result = filteredThemes.filter(t => (t['Smart Index'] || 0) >= threshold);
    }

    const themesCountSpan = document.getElementById('themes-count');
    if (themesCountSpan) {
        themesCountSpan.textContent = result.length;
    }

    renderThemes(result);
    log(`🔍 Filtered to ${result.length} themes (${filteredGames.length} games, view: ${view || 'all'})`);
}
window.filterThemes = filterThemes;

/**
 * Filter mechanics based on selected provider and theme
 */
function filterMechanics() {
    const providerValue = document.getElementById('mechanics-filter-provider')?.value || '';
    const themeValue = document.getElementById('mechanics-filter-theme')?.value || '';

    // If no filters selected, show all
    if (!providerValue && !themeValue) {
        renderMechanics();
        return;
    }

    // Filter games first
    let filteredGames = gameData.allGames;

    if (providerValue) {
        filteredGames = filteredGames.filter(g => F.provider(g) === providerValue);
    }

    if (themeValue) {
        filteredGames = filteredGames.filter(g => F.themeConsolidated(g) === themeValue);
    }

    // Aggregate features from filtered games
    const mechanicStats = {};
    filteredGames.forEach(game => {
        const feats = parseFeatures(game.features);
        if (!feats.length) feats.push('Unknown');
        feats.forEach(mechanicName => {
            if (!mechanicStats[mechanicName]) {
                mechanicStats[mechanicName] = {
                    Mechanic: mechanicName,
                    'Game Count': 0,
                    'Smart Index': 0,
                    totalTheoWin: 0,
                };
            }
            mechanicStats[mechanicName]['Game Count']++;
            mechanicStats[mechanicName].totalTheoWin += F.theoWin(game);
        });
    });

    // Calculate Smart Index (canonical formula)
    const mechArr = Object.values(mechanicStats);
    const globalAvgMechTheo =
        mechArr.length > 0
            ? mechArr.reduce((s, m) => s + (m['Game Count'] > 0 ? m.totalTheoWin / m['Game Count'] : 0), 0) /
              mechArr.length
            : 0;
    const filteredMechanics = mechArr.map(mech => {
        const avgTheo = mech['Game Count'] > 0 ? mech.totalTheoWin / mech['Game Count'] : 0;
        const pi = calculateSmartIndex(avgTheo, mech['Game Count'], globalAvgMechTheo);
        mech['Avg Theo Win Index'] = avgTheo;
        mech.avg_theo_win = avgTheo;
        mech.game_count = mech['Game Count'];
        mech['Smart Index'] = pi;
        mech['Performance Index'] = pi;
        mech.performanceIndex = pi;
        mech.smartIndex = pi;
        mech.qualified = mech['Game Count'] >= MIN_QUALIFIED_GAMES;
        return mech;
    });

    filteredMechanics.sort((a, b) => {
        if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
        return b['Smart Index'] - a['Smart Index'];
    });

    // Update count
    const mechanicsCountSpan = document.getElementById('mechanics-count');
    if (mechanicsCountSpan) {
        mechanicsCountSpan.textContent = filteredMechanics.length;
    }

    renderMechanics(filteredMechanics);
    log(`🔍 Filtered to ${filteredMechanics.length} mechanics (${filteredGames.length} games)`);
}

/**
 * Populate Providers page filters
 */
export function populateProvidersFilters() {
    const featureSet = new Set();
    gameData.allGames.forEach(g => parseFeatures(g.features).forEach(f => featureSet.add(f)));
    const mechanics = [...featureSet].sort();
    const themes = [...new Set(gameData.allGames.map(g => F.themeConsolidated(g)))]
        .filter(t => t && t !== 'Unknown')
        .sort();

    const mechanicSelect = document.getElementById('providers-filter-mechanic');
    if (mechanicSelect) {
        mechanicSelect.innerHTML = '<option value="">All Mechanics</option>';
        mechanics.forEach(mechanic => {
            const option = document.createElement('option');
            option.value = mechanic;
            option.textContent = mechanic;
            mechanicSelect.appendChild(option);
        });
        mechanicSelect.onchange = () => {
            if (window.providersCurrentPage) window.providersCurrentPage = 1;
            if (window.renderProviders) window.renderProviders();
        };
    }

    const themeSelect = document.getElementById('providers-filter-theme');
    if (themeSelect) {
        themeSelect.innerHTML = '<option value="">All Themes</option>';
        themes.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme;
            option.textContent = theme;
            themeSelect.appendChild(option);
        });
        themeSelect.onchange = () => {
            if (window.providersCurrentPage) window.providersCurrentPage = 1;
            if (window.renderProviders) window.renderProviders();
        };
    }

    log(`✅ Providers filters populated: ${mechanics.length} mechanics, ${themes.length} themes`);
}

/**
 * Populate Games page filters
 */
export function populateGamesFilters() {
    const providers = [...new Set(gameData.allGames.map(g => F.provider(g)))].filter(p => p && p !== 'Unknown').sort();
    const featureSet = new Set();
    gameData.allGames.forEach(g => {
        parseFeatures(g.features).forEach(f => featureSet.add(f));
    });
    const mechanics = [...featureSet].sort();

    const providerSelect = document.getElementById('games-filter-provider');
    if (providerSelect) {
        providerSelect.innerHTML = '<option value="">All Providers</option>';
        providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider;
            option.textContent = provider;
            providerSelect.appendChild(option);
        });
    }

    const mechanicSelect = document.getElementById('games-filter-mechanic');
    if (mechanicSelect) {
        mechanicSelect.innerHTML = '<option value="">All Mechanics</option>';
        mechanics.forEach(mechanic => {
            const option = document.createElement('option');
            option.value = mechanic;
            option.textContent = mechanic;
            mechanicSelect.appendChild(option);
        });
    }

    log(`✅ Games filters populated: ${providers.length} providers, ${mechanics.length} mechanics`);
}

// Export filter functions for external use
window.filterThemes = filterThemes;
window.filterMechanics = filterMechanics;
