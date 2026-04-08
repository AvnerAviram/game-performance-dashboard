// Provider landscape bubble chart
import { Chart } from './chart-setup.js';
import { gameData, getActiveGames } from '../lib/data.js';
import { getProviderMetrics } from '../lib/metrics.js';
import {
    getChartColors,
    getModernTooltipConfig,
    createQuadrantPlugin,
    quadrantBgColor,
    quadrantBorderColor,
    quadrantLabel,
    median,
    bubbleScaleOptions,
    bubbleScaleOptionsLog,
    bubbleScaleOptionsWarped,
    createXWarp,
    createBubbleLabelPlugin,
    createSABubbleLabelPlugin,
    createSAHoverHandler,
    createSAClickHandler,
    injectCoveragePill,
} from './chart-utils.js';
import { F } from '../lib/game-fields.js';
import { chartInstances } from './chart-config.js';

export function createProvidersChart() {
    const canvas = document.getElementById('chart-providers');
    if (!canvas) return;

    if (chartInstances.providers) {
        chartInstances.providers.destroy();
        chartInstances.providers = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const providers = getProviderMetrics(allGames).slice(0, 20);
        if (!providers.length) return;

        const xVals = providers.map(p => p.count);
        const yVals = providers.map(p => p.avgTheo);
        const xWarp = createXWarp(xVals);
        const medX = xWarp.warpVal(median(xVals));
        const medY = median(yVals);

        const maxShare = Math.max(...providers.map(p => p.ggrShare), 1);
        const bubbleData = providers.map(p => ({
            x: xWarp.warpVal(p.count),
            y: p.avgTheo,
            r: Math.max(6, Math.min(20, 6 + Math.sqrt(p.ggrShare / maxShare) * 14)),
        }));

        const labels = providers.map(p => p.name);

        const provBorderOv = bubbleData.map(d => quadrantBorderColor(d.x, d.y, medX, medY));

        chartInstances.providers = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Providers',
                        data: bubbleData,
                        backgroundColor: bubbleData.map(d => quadrantBgColor(d.x, d.y, medX, medY)),
                        borderColor: provBorderOv,
                        borderWidth: 1.5,
                        hoverRadius: 4,
                    },
                ],
            },
            plugins: [createQuadrantPlugin('provQuadrant', medX, medY, chartColors)],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                onClick: (e, elements) => {
                    if (elements.length && window.showProviderDetails) {
                        const prov = providers[elements[0].index];
                        if (prov?.name) window.showProviderDetails(prov.name);
                    }
                },
                onHover: (e, elements) => {
                    e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: items => `🏢 ${labels[items[0].dataIndex]}`,
                            label: item => {
                                const p = providers[item.dataIndex];
                                const q = quadrantLabel(item.parsed.x, item.parsed.y, medX, medY);
                                return `Games: ${p.count}  |  Avg PI: ${p.avgTheo.toFixed(2)}  |  GGR: ${p.ggrShare.toFixed(1)}%  |  ${q}`;
                            },
                        },
                    },
                },
                scales: bubbleScaleOptionsWarped(chartColors, xWarp),
            },
        });
        const withTheo = allGames.filter(g => F.theoWin(g) > 0);
        // Coverage pill omitted on overview
    } catch (err) {
        console.error('[PROVIDERS-CHART] FAILED:', err);
    }
}

export function createProviderLandscapeChart() {
    const canvas = document.getElementById('chart-provider-landscape');
    if (!canvas) return;

    if (chartInstances.providerLandscape) {
        chartInstances.providerLandscape.destroy();
        chartInstances.providerLandscape = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const providers = getProviderMetrics(allGames).slice(0, 25);
        if (!providers.length) return;

        const xVals = providers.map(p => p.count);
        const yVals = providers.map(p => p.avgTheo);
        const xWarp = createXWarp(xVals);
        const medX = xWarp.warpVal(median(xVals));
        const medY = median(yVals);

        const maxCount = Math.max(...xVals, 1);
        const rMin = 6;
        const rMax = 36;
        const bubbleData = providers.map(p => ({
            x: xWarp.warpVal(p.count),
            y: p.avgTheo,
            r: rMin + Math.sqrt(p.count / maxCount) * (rMax - rMin),
        }));

        const labels = providers.map(p => p.name);
        const provBorder = bubbleData.map(d => quadrantBorderColor(d.x, d.y, medX, medY));
        const saPlugin = createSABubbleLabelPlugin('provLandscapeLabels', bubbleData, labels, provBorder);

        chartInstances.providerLandscape = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Providers',
                        data: bubbleData,
                        backgroundColor: bubbleData.map(d => quadrantBgColor(d.x, d.y, medX, medY, 0.45)),
                        borderColor: provBorder,
                        borderWidth: 1.5,
                        hoverRadius: 6,
                    },
                ],
            },
            plugins: [createQuadrantPlugin('provLandscapeQuadrant', medX, medY, chartColors), saPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                onHover: createSAHoverHandler(),
                onClick: createSAClickHandler(idx => {
                    const p = providers[idx];
                    if (p?.name && window.showProviderDetails) window.showProviderDetails(p.name);
                }),
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: items => `🏢 ${labels[items[0].dataIndex]}`,
                            label: item => {
                                const p = providers[item.dataIndex];
                                const q = quadrantLabel(item.parsed.x, item.parsed.y, medX, medY);
                                return `Games: ${p.count}  |  Avg PI: ${p.avgTheo.toFixed(2)}  |  GGR: ${p.ggrShare.toFixed(1)}%  |  ${q}`;
                            },
                        },
                    },
                },
                scales: bubbleScaleOptionsWarped(chartColors, xWarp),
            },
        });
        const plWithTheo = allGames.filter(g => F.theoWin(g) > 0);
        injectCoveragePill('chart-provider-landscape', plWithTheo.length, allGames.length, 'with Theo Win data');
    } catch (err) {
        console.error('[PROVIDER-LANDSCAPE] FAILED:', err);
    }
}
