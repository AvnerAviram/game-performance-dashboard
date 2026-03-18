// Main Application Entry Point
import { isLoggedIn, redirectToLogin, verifySession } from './lib/auth.js';
import { loadGameData } from './lib/data.js';
import { log, DEBUG } from './lib/env.js';

// Optional Sentry - init if VITE_SENTRY_DSN is set in .env
let captureError = () => {};
if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SENTRY_DSN) {
  import('@sentry/browser').then(({ init, captureException }) => {
    init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env?.DEV ? 'development' : 'production' });
    captureError = captureException;
  });
}
import { 
    updateHeaderStats,
    renderOverview, 
    renderThemes, 
    renderMechanics, 
    renderAnomalies,
    generateInsights,
    showPage, 
    showAnomalies, 
    sortTable,
    setupSearch,
    setupThemeClickHandlers,
    setupExportButtons,
    setupDarkMode,
    setupSidebar,
    setupPrediction,
    predictGameSuccess,
    sendAIMessage,
    askAI
} from './ui/ui.js';
import { showGameDetails, closeGamePanel, showProviderDetails, closeProviderPanel } from './ui/ui-panels.js';
import './lib/filters.js'; // Smart filters for themes/mechanics
import './ui/tooltip-manager.js'; // Tooltip singleton manager
import './ui/sidebar-collapse.js'; // Sidebar toggle

import { refreshCharts } from './ui/charts-modern.js';
window.refreshCharts = refreshCharts;
import './ui/pagination.js'; // Pagination controls
import { setupAuthUI } from './features/auth-ui.js';
import { populateThemesFilters, populateMechanicsFilters, populateProvidersFilters, populateGamesFilters } from './ui/filter-dropdowns.js';

// Initialize app
async function init() {
    log('🎮 Dashboard initializing...');

    if (!isLoggedIn()) {
        redirectToLogin();
        return;
    }

    // Verify server session is still valid
    const sessionUser = await verifySession();
    if (!sessionUser) {
        redirectToLogin();
        return;
    }

    try {
        const data = await loadGameData();
        if (!data) throw new Error('Failed to load game data');
        log('✅ Data loaded:', { games: data.allGames?.length || 0, themes: data.themes?.length || 0, mechanics: data.mechanics?.length || 0 });

        updateHeaderStats();
        setupSidebar();
        setupDarkMode();
        setupAuthUI();

        window.setupAIInput = () => {
            document.getElementById('ai-input')?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
            });
        };

        await showPage('overview');

        // Hide loading overlay
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.opacity = '0';
        setTimeout(() => overlay?.remove(), 300);
        log('✅ Dashboard ready');
    } catch (error) {
        if (DEBUG) console.error('❌ Init failed:', error);
        captureError(error);
        hideLoadingShowError(error);
    }
}

function hideLoadingShowError(error) {
    document.getElementById('loading-overlay')?.remove();
    const isDev = DEBUG;
    document.body.innerHTML = `
        <div class="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
            <h1 class="text-xl font-bold text-red-600 dark:text-red-400 mb-4">Unable to load dashboard</h1>
            <p class="text-gray-600 dark:text-gray-400 mb-4 max-w-md text-center">Failed to load data. Please check your connection and try again.</p>
            <ul class="text-left text-sm text-gray-500 dark:text-gray-500 mb-6 list-disc pl-6">
                <li>Use an HTTP server (not file://)</li>
                <li>Ensure <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">data/games_master.json</code> exists</li>
            </ul>
            <button onclick="location.reload()" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors">Retry</button>
            ${isDev ? `<pre class="mt-6 text-left text-xs text-gray-500 overflow-auto max-h-40 p-4 bg-gray-100 dark:bg-gray-800 rounded">${error.stack || error.message}</pre>` : ''}
        </div>
    `;
}

// Make functions available globally for HTML onclick handlers
window.showPage = showPage;
window.showAnomalies = showAnomalies;
window.sortTable = sortTable;
window.predictGameSuccess = predictGameSuccess;
window.sendAIMessage = sendAIMessage;
window.askAI = askAI;
window.renderThemes = renderThemes;
window.renderMechanics = renderMechanics;
// renderProviders/renderGames set by ui.js when Providers/Games page loads (lazy)

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
