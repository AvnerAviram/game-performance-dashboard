// Shared chart state and orchestration (initialize / refresh all overview charts)
import { log } from '../lib/env.js';
import { gameData } from '../lib/data.js';
import { F } from '../lib/game-fields.js';
import { getThemeMetrics, getFeatureMetrics, addSmartIndex } from '../lib/metrics.js';
import { createProvidersChart, createProviderLandscapeChart } from './chart-providers.js';
import {
    createThemesChart,
    createMechanicsChart,
    createGamesChart,
    createScatterChart,
    createMarketLandscapeChart as _createMarketLandscape,
} from './chart-themes.js';
import { createVolatilityChart, createVolatilityLandscapeChart } from './chart-volatility.js';
import { createRtpChart, createRtpLandscapeChart } from './chart-rtp.js';
import { createBrandsChart, createBrandLandscapeChart } from './chart-brands.js';
import { createArtThemeChart } from './chart-art.js';

/** Re-export for consumers that import from charts-modern.js barrel */
export { createMarketLandscapeChart } from './chart-themes.js';
export {
    createVolatilityLandscapeChart,
    createRtpLandscapeChart,
    createProviderLandscapeChart,
    createBrandLandscapeChart,
};

let _chartsInitialized = false;
let chartInstances = {};
let isRefreshing = false;

export function initializeCharts() {
    log('🎨 Initializing modern charts...');

    // Set up category filter FIRST so viewGames is ready before chart creation.
    // This ensures coverage pills injected by chart creators aren't immediately
    // removed by applyCategory().
    initCategoryFilter();

    createThemesChart();
    createMechanicsChart();
    createGamesChart();
    createScatterChart();
    createProvidersChart();
    createVolatilityChart();
    createRtpChart();
    createBrandsChart();
    createArtThemeChart();

    const retryMissing = () => {
        if (!chartInstances.scatter) createScatterChart();
        if (!chartInstances.games) createGamesChart();
        if (!chartInstances.providers) createProvidersChart();
        if (!chartInstances.volatility) createVolatilityChart();
        if (!chartInstances.rtp) createRtpChart();
        if (!chartInstances.brands) createBrandsChart();
        if (!chartInstances.artThemes) createArtThemeChart();
    };
    setTimeout(retryMissing, 500);
    setTimeout(retryMissing, 1500);

    _chartsInitialized = true;
    log('✅ Modern charts initialized');
}

export function refreshCharts() {
    if (isRefreshing) return;

    isRefreshing = true;
    createThemesChart();
    createMechanicsChart();
    createGamesChart();
    createScatterChart();
    createProvidersChart();
    createVolatilityChart();
    createRtpChart();
    createBrandsChart();
    createArtThemeChart();
    setTimeout(() => {
        isRefreshing = false;
    }, 100);
}

export function refreshInsightsCharts() {
    if (isRefreshing) return;
    isRefreshing = true;
    try {
        createVolatilityLandscapeChart();
        createRtpLandscapeChart();
        createProviderLandscapeChart();
        createBrandLandscapeChart();
    } catch (e) {
        console.error('[INSIGHTS-REFRESH]', e);
    }
    setTimeout(() => {
        isRefreshing = false;
    }, 100);
}

/**
 * Populate the per-page category dropdown and wire its change handler.
 * Called after charts init and also when navigating to insights.
 */
export function initCategoryFilter() {
    const select = document.getElementById('page-category-filter');
    if (!select) return;

    const allGames = gameData.allGames || [];

    if (select.options.length <= 1) {
        select.options[0].textContent = `All Types (${allGames.length})`;

        const catCounts = {};
        allGames.forEach(g => {
            const c = F.gameCategory(g);
            if (c) catCounts[c] = (catCounts[c] || 0) + 1;
        });
        Object.entries(catCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([c, count]) => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = `${c} (${count})`;
                select.appendChild(opt);
            });
    }

    // Sync dropdown to active category, or default to "Slot"
    if (gameData.activeCategory) {
        select.value = gameData.activeCategory;
    } else {
        const slotOption = [...select.options].find(o => o.value.toLowerCase() === 'slot');
        if (slotOption) {
            select.value = slotOption.value;
        }
    }

    applyCategory(select, allGames);

    select.onchange = () => {
        applyCategory(select, allGames);

        refreshCharts();

        if (document.getElementById('chart-market-landscape')) {
            try {
                _createMarketLandscape();
            } catch (_e) {
                /* not on insights */
            }
            refreshInsightsCharts();
        }
    };
}

function applyCategory(select, allGames) {
    const val = select.value;
    gameData.activeCategory = val || null;

    if (val) {
        gameData.viewGames = allGames.filter(g => F.gameCategory(g) === val);
        gameData.viewThemes = recomputeThemes(gameData.viewGames);
        gameData.viewMechanics = recomputeMechanics(gameData.viewGames);
    } else {
        gameData.viewGames = null;
        gameData.viewThemes = null;
        gameData.viewMechanics = null;
    }

    document.querySelectorAll('[data-coverage-pill]').forEach(el => el.remove());

    const catLabel = document.getElementById('games-category-label');
    if (catLabel) catLabel.textContent = val || 'All';
}

function recomputeThemes(games) {
    const raw = getThemeMetrics(games).filter(
        t => t.theme && !/^unknown$/i.test(t.theme) && !t.theme.toUpperCase().includes('FLAGGED FOR RESEARCH')
    );
    const mapped = raw.map(t => ({
        Theme: t.theme,
        theme: t.theme,
        'Game Count': t.count,
        game_count: t.count,
        'Avg Theo Win Index': t.avgTheo,
        avg_theo_win: t.avgTheo,
        'Market Share %': 0,
        total_market_share: 0,
    }));
    return addSmartIndex(mapped.map(r => ({ ...r, count: r.game_count }))).map(r => ({
        ...r,
        'Smart Index': r.smartIndex,
    }));
}

function recomputeMechanics(games) {
    const raw = getFeatureMetrics(games);
    const mapped = raw.map(f => ({
        Mechanic: f.feature,
        mechanic: f.feature,
        'Game Count': f.count,
        game_count: f.count,
        'Avg Theo Win Index': f.avgTheo,
        avg_theo_win: f.avgTheo,
        'Market Share %': 0,
        total_market_share: 0,
    }));
    return addSmartIndex(mapped.map(r => ({ ...r, count: r.game_count }))).map(r => ({
        ...r,
        'Smart Index': r.smartIndex,
    }));
}

export { chartInstances };
