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
    showPage,
    showAnomalies,
    sortTable,
    setupDarkMode,
    predictGameSuccess,
    sendAIMessage,
    askAI,
    renderThemes,
    renderMechanics,
} from './ui/ui.js';

// Side-effect imports: these register window globals (panels, filters, pagination, etc.)
import './ui/ui-panels.js';
import './lib/filters.js';
import './ui/tooltip-manager.js';
import './ui/sidebar-collapse.js';
import './ui/pagination.js';
import './ui/filter-dropdowns.js';

import { refreshCharts } from './ui/charts-modern.js';
window.refreshCharts = refreshCharts;
import { setupAuthUI } from './features/auth-ui.js';

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
        setupDarkMode();
        setupAuthUI();

        window.setupAIInput = () => {
            document.getElementById('ai-input')?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
            });
        };

        const initialPage = window.location.hash.replace('#', '') || 'overview';
        await showPage(initialPage);

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
    console.error('Dashboard init failed:', error);
    const container = document.createElement('div');
    container.className = 'min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-900';

    const h1 = document.createElement('h1');
    h1.className = 'text-xl font-bold text-red-600 dark:text-red-400 mb-4';
    h1.textContent = 'Unable to load dashboard';
    container.appendChild(h1);

    const p = document.createElement('p');
    p.className = 'text-gray-600 dark:text-gray-400 mb-4 max-w-md text-center';
    p.textContent = 'Failed to load data. Please check your connection and try again.';
    container.appendChild(p);

    const btn = document.createElement('button');
    btn.className = 'px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors';
    btn.textContent = 'Retry';
    btn.onclick = () => location.reload();
    container.appendChild(btn);

    if (DEBUG) {
        const pre = document.createElement('pre');
        pre.className = 'mt-6 text-left text-xs text-gray-500 overflow-auto max-h-40 p-4 bg-gray-100 dark:bg-gray-800 rounded';
        pre.textContent = error.stack || error.message;
        container.appendChild(pre);
    }

    document.body.innerHTML = '';
    document.body.appendChild(container);
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
