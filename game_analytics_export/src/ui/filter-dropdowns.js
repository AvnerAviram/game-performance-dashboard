/**
 * Filter Dropdowns for Themes and Mechanics pages
 * Populates and handles Provider/Mechanic/Theme filters
 */

import { gameData } from '../lib/data.js';
import { log } from '../lib/env.js';
import { renderThemes } from './renderers/themes-renderer.js';
import { renderMechanics } from './renderers/mechanics-renderer.js';
import { parseFeatures } from '../lib/parse-features.js';

/**
 * Populate Themes page filters
 */
export function populateThemesFilters() {
    // Get unique providers from all games
    const providers = [...new Set(gameData.allGames.map(g => g.provider_studio || 'Unknown'))].filter(p => p && p !== 'Unknown').sort();
    
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
    const providers = [...new Set(gameData.allGames.map(g => g.provider_studio || 'Unknown'))].filter(p => p && p !== 'Unknown').sort();
    
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
        filteredGames = filteredGames.filter(g => g.provider_studio === providerValue);
    }
    
    if (mechanicValue) {
        filteredGames = filteredGames.filter(g => g.mechanic_primary === mechanicValue);
    }
    
    // Aggregate themes from filtered games
    const themeStats = {};
    filteredGames.forEach(game => {
        const themeName = game.theme_primary || 'Unknown';
        if (!themeStats[themeName]) {
            themeStats[themeName] = {
                Theme: themeName,
                'Game Count': 0,
                'Smart Index': 0,
                'Market Share %': 0,
                totalTheoWin: 0
            };
        }
        themeStats[themeName]['Game Count']++;
        themeStats[themeName].totalTheoWin += game.performance?.theo_win || 0;
    });
    
    // Calculate averages and format
    const filteredThemes = Object.values(themeStats).map(theme => {
        theme['Smart Index'] = theme['Game Count'] > 0 ? theme.totalTheoWin / theme['Game Count'] : 0;
        theme['Market Share %'] = ((theme['Game Count'] / filteredGames.length) * 100).toFixed(2);
        return theme;
    });
    
    // Sort by Smart Index descending
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
        filteredGames = filteredGames.filter(g => g.provider_studio === providerValue);
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
                totalTheoWin: 0
            };
        }
        mechanicStats[mechanicName]['Game Count']++;
        mechanicStats[mechanicName].totalTheoWin += game.performance?.theo_win || 0;
    });
    
    // Calculate averages
    const filteredMechanics = Object.values(mechanicStats).map(mech => {
        mech['Smart Index'] = mech['Game Count'] > 0 ? mech.totalTheoWin / mech['Game Count'] : 0;
        return mech;
    });
    
    // Sort by Smart Index descending
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
    const providers = [...new Set(gameData.allGames.map(g => g.provider_studio))].filter(p => p).sort();
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
