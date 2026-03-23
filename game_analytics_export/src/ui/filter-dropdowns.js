/**
 * Filter Dropdowns for Themes and Mechanics pages
 * Populates and handles Provider/Mechanic/Theme filters
 */

import { gameData } from '../lib/data.js';
import { F } from '../lib/game-fields.js';
import { log } from '../lib/env.js';
import { renderThemes } from './renderers/themes-renderer.js';
import { renderMechanics } from './renderers/mechanics-renderer.js';
import { parseFeatures } from '../lib/parse-features.js';
import { calculateSmartIndex, getThemeMetrics } from '../lib/metrics.js';

/**
 * Populate Themes page filters
 */
export function populateThemesFilters() {
    // Get unique providers from all games
    const providers = [...new Set(gameData.allGames.map(g => F.provider(g)))].filter(p => p && p !== 'Unknown').sort();

    // Get unique mechanics from all games
    const mechanics = [...new Set(gameData.allGames.map(g => g.mechanic_primary))].filter(m => m).sort();

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

    log(`✅ Themes filters populated: ${providers.length} providers, ${mechanics.length} mechanics`);
}

/**
 * Populate Mechanics page filters
 */
export function populateMechanicsFilters() {
    // Get unique providers from all games
    const providers = [...new Set(gameData.allGames.map(g => F.provider(g)))].filter(p => p && p !== 'Unknown').sort();

    // Get unique themes from all games
    const themes = [...new Set(gameData.allGames.map(g => g.theme_primary))].filter(t => t).sort();

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
 * Filter themes based on selected provider and mechanic
 */
function filterThemes() {
    const providerValue = document.getElementById('themes-filter-provider')?.value || '';
    const mechanicValue = document.getElementById('themes-filter-mechanic')?.value || '';

    // If no filters selected, show all
    if (!providerValue && !mechanicValue) {
        renderThemes();
        return;
    }

    // Filter games first
    let filteredGames = gameData.allGames;

    if (providerValue) {
        filteredGames = filteredGames.filter(g => F.provider(g) === providerValue);
    }

    if (mechanicValue) {
        filteredGames = filteredGames.filter(g => g.mechanic_primary === mechanicValue);
    }

    const themeMetrics = getThemeMetrics(filteredGames);
    const globalAvgTheo =
        themeMetrics.length > 0 ? themeMetrics.reduce((s, t) => s + t.avgTheo, 0) / themeMetrics.length : 0;
    const filteredThemes = themeMetrics.map(t => ({
        Theme: t.theme,
        'Game Count': t.count,
        'Avg Theo Win Index': t.avgTheo,
        avg_theo_win: t.avgTheo,
        game_count: t.count,
        'Smart Index': calculateSmartIndex(t.avgTheo, t.count, globalAvgTheo),
        'Market Share %': ((t.count / filteredGames.length) * 100).toFixed(2),
    }));
    filteredThemes.sort((a, b) => b['Smart Index'] - a['Smart Index']);

    // Update count
    const themesCountSpan = document.getElementById('themes-count');
    if (themesCountSpan) {
        themesCountSpan.textContent = filteredThemes.length;
    }

    renderThemes(filteredThemes);
    log(`🔍 Filtered to ${filteredThemes.length} themes (${filteredGames.length} games)`);
}

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
        filteredGames = filteredGames.filter(g => g.theme_primary === themeValue);
    }

    // Aggregate mechanics from filtered games
    const mechanicStats = {};
    filteredGames.forEach(game => {
        const mechanicName = game.mechanic_primary || 'Unknown';
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

    // Calculate Smart Index (canonical formula)
    const mechArr = Object.values(mechanicStats);
    const globalAvgMechTheo =
        mechArr.length > 0
            ? mechArr.reduce((s, m) => s + (m['Game Count'] > 0 ? m.totalTheoWin / m['Game Count'] : 0), 0) /
              mechArr.length
            : 0;
    const filteredMechanics = mechArr.map(mech => {
        const avgTheo = mech['Game Count'] > 0 ? mech.totalTheoWin / mech['Game Count'] : 0;
        mech['Avg Theo Win Index'] = avgTheo;
        mech.avg_theo_win = avgTheo;
        mech.game_count = mech['Game Count'];
        mech['Smart Index'] = calculateSmartIndex(avgTheo, mech['Game Count'], globalAvgMechTheo);
        return mech;
    });

    filteredMechanics.sort((a, b) => b['Smart Index'] - a['Smart Index']);

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
    const mechanics = [...new Set(gameData.allGames.map(g => g.mechanic_primary))].filter(m => m).sort();
    const themes = [...new Set(gameData.allGames.map(g => g.theme_primary))].filter(t => t).sort();

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
        mechanicSelect.innerHTML = '<option value="">All Features</option>';
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
