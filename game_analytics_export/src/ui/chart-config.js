// Shared chart state and orchestration (initialize / refresh all overview charts)
import { log } from '../lib/env.js';
import { createProvidersChart } from './chart-providers.js';
import { createThemesChart, createMechanicsChart, createGamesChart, createScatterChart } from './chart-themes.js';
import { createVolatilityChart } from './chart-volatility.js';
import { createRtpChart } from './chart-rtp.js';

/** Re-export for consumers that import from charts-modern.js barrel */
export { createMarketLandscapeChart } from './chart-themes.js';

let _chartsInitialized = false;
let chartInstances = {};
let isRefreshing = false;

export function initializeCharts() {
    log('🎨 Initializing modern charts...');

    createThemesChart();
    createMechanicsChart();
    createGamesChart();
    createScatterChart();
    createProvidersChart();
    createVolatilityChart();
    createRtpChart();

    const retryMissing = () => {
        if (!chartInstances.scatter) createScatterChart();
        if (!chartInstances.games) createGamesChart();
        if (!chartInstances.providers) createProvidersChart();
        if (!chartInstances.volatility) createVolatilityChart();
        if (!chartInstances.rtp) createRtpChart();
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
    setTimeout(() => {
        isRefreshing = false;
    }, 100);
}

export { chartInstances };
