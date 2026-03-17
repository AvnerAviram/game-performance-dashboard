/**
 * Page Manager - Loads page templates and initializes them
 */

import { log, warn } from '../lib/env.js';
import { 
    renderOverview,
    renderThemes,
    renderMechanics,
    showAnomalies,
    generateInsights,
    setupSearch,
    setupThemeClickHandlers
} from '../ui/ui.js';

import { renderProviders, renderGames, setupGamesFilters, setupProvidersFilters } from '../ui/ui-providers-games.js';
import { initializeCharts } from '../ui/charts-modern.js';
import { setupPrediction } from '../ui/ui.js';
import { updateAuthUI } from '../features/auth-ui.js';

export async function loadPage(pageName) {
    const container = document.getElementById('page-container');
    
    try {
        // Load page template with cache busting
        const response = await fetch(`src/pages/${pageName}.html?v=${Date.now()}`);
        if (!response.ok) throw new Error(`Page not found: ${pageName}`);
        
        const html = await response.text();
        container.innerHTML = html;
        
        // Anomalies page: set main background to white so any bottom gap blends (no gray band)
        const main = document.getElementById('main-content');
        if (main) {
            if (pageName === 'anomalies' || pageName === 'insights') {
                main.classList.add('bg-white', 'dark:bg-gray-900');
            } else {
                main.classList.remove('bg-white', 'dark:bg-gray-900');
            }
        }
        
        // Initialize page-specific functionality
        await initializePage(pageName);
        
        // Update auth UI for hamburger (login/logout visibility)
        updateAuthUI();
        
        log(`✅ Page loaded: ${pageName}`);
    } catch (error) {
        console.error('Failed to load page:', error);
        container.innerHTML = '<div class="p-8 text-center text-red-600 dark:text-red-400">Failed to load page: ' + pageName + '</div>';
    }
}

async function initializePage(pageName) {
    // Call appropriate render function based on page
    switch(pageName) {
        case 'overview':
            await renderOverview();
            initializeCharts();
            break;
            
        case 'themes':
            await renderThemes();
            setupSearch('themes');
            setupThemeClickHandlers();
            break;
            
        case 'mechanics':
            await renderMechanics();
            setupSearch('mechanics');
            break;
            
        case 'games':
            await renderGames();
            setupGamesFilters();
            break;
            
        case 'providers':
            await renderProviders();
            setupProvidersFilters();
            break;
            
        case 'anomalies':
            showAnomalies('top');
            break;
            
        case 'insights':
            await generateInsights();
            break;
            
        case 'trends':
            // Trends page initializes itself via app.js
            break;
            
        case 'prediction':
            setupPrediction();
            break;
            
        case 'ai-assistant':
            // AI Assistant initializes itself
            break;
            
        default:
            warn(`No initializer for page: ${pageName}`);
    }
}

// Make globally available
window.loadPage = loadPage;
