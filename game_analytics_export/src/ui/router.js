// SPA Router - page navigation and Game Lab sub-navigation
import { log, warn } from '../lib/env.js';
import { initializeCharts } from './charts-modern.js';
import {
    populateThemesFilters,
    populateMechanicsFilters,
    populateProvidersFilters,
    populateGamesFilters,
} from './filter-dropdowns.js';
import { renderOverview } from './renderers/overview-renderer.js';
import { renderThemes, setupThemeClickHandlers } from './renderers/themes-renderer.js';
import { renderMechanics } from './renderers/mechanics-renderer.js';
import { renderAnomalies, generateInsights } from './renderers/insights-renderer.js';
import { setupSearch } from './search.js';
import { sendAIMessage } from '../features/ai-assistant.js';
import { renderTickets } from '../features/tickets.js';
import { setupPrediction } from '../features/prediction.js';
import { updateAuthUI } from '../features/auth-ui.js';
import { resetFilterState } from '../lib/filters.js';

async function initializePage(pageName) {
    resetFilterState(pageName);
    switch (pageName) {
        case 'overview':
            renderOverview();
            initializeCharts();
            break;

        case 'themes':
            renderThemes();
            setupSearch('themes');
            setupThemeClickHandlers();
            populateThemesFilters();
            if (window.switchThemeView) window.switchThemeView('all');
            break;

        case 'mechanics':
            renderMechanics();
            setupSearch('mechanics');
            populateMechanicsFilters();
            if (window.switchMechanicView) window.switchMechanicView('all');
            break;

        case 'games': {
            const mod = await import('./ui-providers-games.js');
            mod.resetGamesState();
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
            window.providersCurrentPage = 1;
            mod.renderProviders();
            populateProvidersFilters();
            break;
        }

        case 'anomalies':
            showPage('insights');
            return;

        case 'insights':
            generateInsights();
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
                } catch (_error) {
                    console.error('Error loading trends:', _error);
                }
            }, 250);
            break;

        case 'art':
            setTimeout(async () => {
                try {
                    const { renderArt } = await import('./renderers/art-renderer.js');
                    renderArt();
                } catch (_error) {
                    console.error('Error loading art page:', _error);
                }
            }, 250);
            break;

        case 'prediction':
            await showPage('game-lab');
            window.switchLabTool('concept');
            return;

        case 'name-generator':
            await showPage('game-lab');
            window.switchLabTool('name-gen');
            return;

        case 'ai-assistant':
            document.getElementById('ai-input')?.addEventListener('keypress', e => {
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

const VALID_PAGES = new Set([
    'overview',
    'themes',
    'mechanics',
    'games',
    'providers',
    'insights',
    'anomalies',
    'game-lab',
    'trends',
    'art',
    'tickets',
    'prediction',
    'name-generator',
    'ai-assistant',
]);

export async function showPage(page, { pushHistory = true } = {}) {
    if (!VALID_PAGES.has(page)) {
        warn('⚠️ Invalid page requested:', page);
        page = 'overview';
    }

    if (page === 'anomalies') {
        showPage('insights', { pushHistory });
        return;
    }
    if (page === 'prediction') {
        await showPage('game-lab', { pushHistory: false });
        if (pushHistory) history.pushState({ page: 'prediction' }, '', '#prediction');
        window.switchLabTool('concept');
        return;
    }
    if (page === 'name-generator') {
        await showPage('game-lab', { pushHistory: false });
        if (pushHistory) history.pushState({ page: 'name-generator' }, '', '#name-generator');
        window.switchLabTool('name-gen');
        return;
    }

    log('🔄 Switching to page:', page);

    if (pushHistory) {
        history.pushState({ page }, '', `#${page}`);
    }

    document.querySelectorAll('[data-page]').forEach(navItem => {
        navItem.classList.remove(
            'bg-gradient-to-r',
            'from-indigo-50',
            'to-blue-50',
            '!text-indigo-600',
            'text-indigo-600',
            '!text-white',
            'font-semibold',
            'font-bold'
        );
        navItem.classList.remove('dark:from-indigo-900/20', 'dark:to-blue-900/20', 'dark:!text-white');
    });

    const activeNav = document.querySelector(`[data-page="${page}"]`);
    if (activeNav) {
        activeNav.classList.add('bg-gradient-to-r', 'from-indigo-50', 'to-blue-50', 'text-indigo-600', 'font-semibold');
        activeNav.classList.add('dark:from-indigo-900/20', 'dark:to-blue-900/20', 'dark:!text-white');
    } else {
        warn('⚠️ Nav item not found for page:', page);
    }

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
        container.scrollTop = 0;

        try {
            await initializePage(page);
        } catch (initErr) {
            console.error(`Page "${page}" init error:`, initErr);
            const banner = document.createElement('div');
            banner.className =
                'mx-4 mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm';
            banner.textContent = 'Some content on this page failed to load. Data may be incomplete.';
            container.prepend(banner);
        }

        updateAuthUI();

        log('✅ Page loaded:', page);
    } catch (error) {
        console.error('Failed to load page:', error);
        container.innerHTML = '<div class="p-8 text-center text-red-600 dark:text-red-400">Failed to load page</div>';
    }

    // Close any open side panels when changing pages
    ['mechanic-panel', 'theme-panel', 'game-panel', 'provider-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.right = '-650px';
    });
    const backdrop = document.getElementById('mechanic-backdrop');
    if (backdrop) {
        backdrop.classList.add('hidden');
        backdrop.classList.remove('block');
    }

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

    if (page === 'anomalies') {
        setTimeout(() => {
            renderAnomalies();
            const topBtn = document.querySelector('button[onclick="showAnomalies(\'top\')"]');
            if (topBtn) topBtn.click();
        }, 100);
    }

    updateGameLabSubnav(page);
}

// Game Lab sub-navigation
function updateGameLabSubnav(_page) {
    // no-op: Game Lab items are always visible in sidebar
}

window.switchLabTool = function (toolId) {
    if (toolId === 'symbols') toolId = 'blueprint';
    document.querySelectorAll('.gamelab-section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(`lab-section-${toolId}`);
    if (target) target.classList.remove('hidden');

    const activeClasses = [
        'bg-gradient-to-r',
        'from-indigo-50',
        'to-blue-50',
        'text-indigo-600',
        'font-semibold',
        'dark:from-indigo-900/20',
        'dark:to-blue-900/20',
        'dark:!text-white',
    ];
    document.querySelectorAll('.gamelab-sub').forEach(btn => {
        btn.classList.remove(...activeClasses);
    });
    const sidebarSub = document.querySelector(`.gamelab-sub[data-section="${toolId}"]`);
    if (sidebarSub) {
        sidebarSub.classList.add(...activeClasses);
    }
};

window.navigateGameLab = async function (section) {
    const gameLabLoaded = document.getElementById('lab-section-blueprint');
    if (!gameLabLoaded) {
        await showPage('game-lab');
    }
    window.switchLabTool(section);
};

window.handleGameLabClick = function (_e) {
    window.navigateGameLab('blueprint');
};

window.showPage = showPage;

window.addEventListener('popstate', e => {
    const page = e.state?.page || 'overview';
    showPage(page, { pushHistory: false });
});
