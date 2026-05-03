// Shared chart state and orchestration (initialize / refresh all overview charts)
import { Chart } from './chart-setup.js';
import { log } from '../lib/env.js';
import { gameData } from '../lib/data.js';
import { F } from '../lib/game-fields.js';
import { getThemeMetrics, getFeatureMetrics } from '../lib/metrics.js';
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
import { createNarrativeChart } from './chart-art.js';

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
let _retryTimers = [];

const CHART_CANVAS_IDS = [
    'chart-providers',
    'chart-volatility',
    'chart-rtp',
    'chart-art-themes',
    'chart-themes',
    'chart-mechanics',
    'chart-brands',
    'chart-scatter',
    'chart-games',
];

function destroyStaleCharts() {
    // Destroy tracked instances first
    for (const key of Object.keys(chartInstances)) {
        try {
            chartInstances[key]?.destroy();
        } catch (_) {
            /* already destroyed or canvas gone */
        }
        chartInstances[key] = null;
    }
    // Clear any orphans left in Chart.js's internal registry (e.g. canvas removed
    // from DOM before destroy was called during SPA navigation).
    for (const id of CHART_CANVAS_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        const existing = Chart.getChart(el);
        if (existing) {
            try {
                existing.destroy();
            } catch (_) {
                /* already destroyed */
            }
        }
    }
}

export async function initializeCharts() {
    log('🎨 Initializing modern charts...');

    // Cancel pending retry timers from previous init (SPA re-navigation)
    for (const t of _retryTimers) clearTimeout(t);
    _retryTimers = [];

    // Clear Chart.js registry for canvases that may have been removed from DOM
    // before their Chart instance was destroyed (e.g. SPA page navigation).
    destroyStaleCharts();

    // Add loading shimmer to chart containers until charts render
    document.querySelectorAll('canvas[id^="chart-"]').forEach(c => {
        const wrapper = c.parentElement;
        if (wrapper) wrapper.classList.add('chart-loading');
    });
    const clearLoading = () => {
        document.querySelectorAll('.chart-loading').forEach(el => el.classList.remove('chart-loading'));
    };

    // Set up category filter FIRST so viewGames is ready before chart creation.
    // This ensures coverage pills injected by chart creators aren't immediately
    // removed by applyCategory().
    await initCategoryFilter();

    createThemesChart();
    createMechanicsChart();
    createGamesChart();
    createScatterChart();
    await Promise.all([createProvidersChart(), createVolatilityChart(), createRtpChart(), createNarrativeChart()]);
    createBrandsChart();

    const retryMissing = async () => {
        if (!chartInstances.scatter) createScatterChart();
        if (!chartInstances.games) createGamesChart();
        await Promise.all([
            !chartInstances.providers ? createProvidersChart() : Promise.resolve(),
            !chartInstances.volatility ? createVolatilityChart() : Promise.resolve(),
            !chartInstances.rtp ? createRtpChart() : Promise.resolve(),
            !chartInstances.narratives ? createNarrativeChart() : Promise.resolve(),
        ]);
        if (!chartInstances.brands) createBrandsChart();
    };
    _retryTimers.push(setTimeout(retryMissing, 500));
    _retryTimers.push(setTimeout(retryMissing, 1500));

    clearLoading();
    _chartsInitialized = true;
    log('✅ Modern charts initialized');
}

export async function refreshCharts() {
    if (isRefreshing) return;

    isRefreshing = true;
    destroyStaleCharts();
    createThemesChart();
    createMechanicsChart();
    createGamesChart();
    createScatterChart();
    await Promise.all([createProvidersChart(), createVolatilityChart(), createRtpChart(), createNarrativeChart()]);
    createBrandsChart();
    setTimeout(() => {
        isRefreshing = false;
    }, 100);
}

export async function refreshInsightsCharts() {
    if (isRefreshing) return;
    isRefreshing = true;

    document.querySelectorAll('[id$="-landscape"] canvas, canvas[id*="landscape"]').forEach(c => {
        const wrapper = c.parentElement;
        if (wrapper) wrapper.classList.add('chart-loading');
    });

    try {
        await Promise.all([
            createVolatilityLandscapeChart(),
            createRtpLandscapeChart(),
            createProviderLandscapeChart(),
            createBrandLandscapeChart(),
        ]);
    } catch (e) {
        console.error('[INSIGHTS-REFRESH]', e);
    }

    document.querySelectorAll('.chart-loading').forEach(el => el.classList.remove('chart-loading'));
    setTimeout(() => {
        isRefreshing = false;
    }, 100);
}

/**
 * Populate the per-page category dropdown and wire its change handler.
 * Called after charts init and also when navigating to insights.
 */
export async function initCategoryFilter() {
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

    await applyCategory(select, allGames);

    select.onchange = async () => {
        await applyCategory(select, allGames);

        await refreshCharts();

        if (document.getElementById('chart-market-landscape')) {
            try {
                _createMarketLandscape();
            } catch (_e) {
                /* not on insights */
            }
            await refreshInsightsCharts();
        }
    };
}

async function applyCategory(select, allGames) {
    const val = select.value;
    gameData.activeCategory = val || null;

    if (val) {
        gameData.viewGames = allGames.filter(g => F.gameCategory(g) === val);
    } else {
        gameData.viewGames = null;
    }

    const [viewThemes, viewMechanics] = await Promise.all([recomputeThemes(), recomputeMechanics()]);
    gameData.viewThemes = viewThemes;
    gameData.viewMechanics = viewMechanics;
    gameData.themes = viewThemes;
    gameData.mechanics = viewMechanics;

    document.querySelectorAll('[data-coverage-pill]').forEach(el => el.remove());

    const catLabel = document.getElementById('games-category-label');
    if (catLabel) {
        if (val) {
            catLabel.textContent = val;
            catLabel.classList.remove('hidden');
        } else {
            catLabel.textContent = '';
            catLabel.classList.add('hidden');
        }
    }
}

/**
 * Map SQL theme rows to the dual-key format used by all UI consumers.
 * This is the SINGLE definition — called from data.js (initial load) and applyCategory (filter changes).
 */
export function mapSqlThemes(sqlRows) {
    return sqlRows
        .filter(t => t.theme && !/^unknown$/i.test(t.theme) && !t.theme.toUpperCase().includes('FLAGGED FOR RESEARCH'))
        .map(t => ({
            Theme: t.theme,
            theme: t.theme,
            'Game Count': t.count,
            game_count: t.count,
            'Avg Theo Win Index': t.avgTheo,
            avg_theo_win: t.avgTheo,
            'Market Share %': t.totalMkt || 0,
            total_market_share: t.totalMkt || 0,
            'Performance Index': t.performanceIndex,
            performanceIndex: t.performanceIndex,
            'Smart Index': t.performanceIndex,
            smartIndex: t.performanceIndex,
            qualified: t.qualified,
        }));
}

/**
 * Map SQL mechanic/feature rows to the dual-key format used by all UI consumers.
 * This is the SINGLE definition — called from data.js (initial load) and applyCategory (filter changes).
 */
export function mapSqlMechanics(sqlRows) {
    return sqlRows.map(f => ({
        Mechanic: f.feature,
        mechanic: f.feature,
        'Game Count': f.count,
        game_count: f.count,
        'Avg Theo Win Index': f.avgTheo,
        avg_theo_win: f.avgTheo,
        'Market Share %': f.totalMkt || 0,
        total_market_share: f.totalMkt || 0,
        'Performance Index': f.performanceIndex,
        performanceIndex: f.performanceIndex,
        'Smart Index': f.performanceIndex,
        smartIndex: f.performanceIndex,
        qualified: f.qualified,
    }));
}

async function recomputeThemes() {
    return mapSqlThemes(await getThemeMetrics(gameData.activeCategory));
}

async function recomputeMechanics() {
    return mapSqlMechanics(await getFeatureMetrics(gameData.activeCategory));
}

export { chartInstances };
