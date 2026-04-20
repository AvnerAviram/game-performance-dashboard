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

        const LABEL_COUNT = 20;
        const allProviders = getProviderMetrics(allGames);
        if (!allProviders.length) return;
        const majors = allProviders.slice(0, LABEL_COUNT);
        const minors = allProviders.slice(LABEL_COUNT);

        const xVals = allProviders.map(p => p.count);
        const yVals = allProviders.map(p => p.avgTheo);
        const xWarp = createXWarp(xVals);
        const medX = xWarp.warpVal(median(xVals));
        const medY = median(yVals);

        const maxShare = Math.max(...majors.map(p => p.ggrShare), 1);
        const majorData = majors.map(p => ({
            x: xWarp.warpVal(p.count),
            y: p.avgTheo,
            r: Math.max(6, Math.min(20, 6 + Math.sqrt(p.ggrShare / maxShare) * 14)),
            _label: p.name,
        }));
        const majorLabels = majors.map(p => p.name);
        const majorBorders = majorData.map(d => quadrantBorderColor(d.x, d.y, medX, medY));

        const clusters = [
            { key: 'tl', items: [] },
            { key: 'tr', items: [] },
            { key: 'bl', items: [] },
            { key: 'br', items: [] },
        ];
        for (const p of minors) {
            const wx = xWarp.warpVal(p.count);
            const wy = p.avgTheo;
            const ci = wx < medX ? (wy >= medY ? 0 : 2) : wy >= medY ? 1 : 3;
            clusters[ci].items.push(p);
        }
        const clusterData = [];
        const clusterLabelsArr = [];
        for (const c of clusters) {
            if (!c.items.length) continue;
            const avgX = c.items.reduce((s, p) => s + xWarp.warpVal(p.count), 0) / c.items.length;
            const avgY = c.items.reduce((s, p) => s + p.avgTheo, 0) / c.items.length;
            clusterData.push({ x: avgX, y: avgY, r: 12 + Math.sqrt(c.items.length) * 3 });
            clusterLabelsArr.push(`+${c.items.length}`);
        }

        const datasets = [
            {
                label: 'Providers',
                data: majorData,
                backgroundColor: majorData.map(d => quadrantBgColor(d.x, d.y, medX, medY)),
                borderColor: majorBorders,
                borderWidth: 1.5,
                hoverRadius: 4,
            },
        ];
        if (clusterData.length) {
            datasets.push({
                label: `${minors.length} other providers`,
                data: clusterData,
                backgroundColor: 'rgba(148,163,184,0.15)',
                borderColor: 'rgba(148,163,184,0.4)',
                borderWidth: 1,
                borderDash: [3, 2],
                hoverRadius: 4,
            });
        }

        const clusterLabelPlugin = {
            id: 'provClusterLabels',
            afterDatasetsDraw(chart) {
                if (!clusterData.length) return;
                const { ctx: c } = chart;
                const meta1 = chart.getDatasetMeta(1);
                if (!meta1?.data?.length) return;
                c.save();
                c.font = 'bold 11px Inter, system-ui, sans-serif';
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillStyle = 'rgba(100,116,139,0.7)';
                meta1.data.forEach((pt, i) => {
                    c.fillText(clusterLabelsArr[i], pt.x, pt.y);
                });
                c.restore();
            },
        };

        const saPlugin = createSABubbleLabelPlugin('provOverviewLabels', majorData, majorLabels, majorBorders);

        chartInstances.providers = new Chart(ctx, {
            type: 'bubble',
            data: { datasets },
            plugins: [createQuadrantPlugin('provQuadrant', medX, medY, chartColors), saPlugin, clusterLabelPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                onHover: createSAHoverHandler(),
                onClick: (e, elements) => {
                    if (window.xrayActive) return;
                    if (elements.length && elements[0].datasetIndex === 0 && window.showProviderDetails) {
                        const prov = majors[elements[0].index];
                        if (prov?.name) window.showProviderDetails(prov.name);
                        return;
                    }
                    if (!elements.length) {
                        const chart = chartInstances.providers;
                        if (chart?._saFindLabel) {
                            const rect = chart.canvas.getBoundingClientRect();
                            const cx = e.native.clientX - rect.left;
                            const cy = e.native.clientY - rect.top;
                            const li = chart._saFindLabel(cx, cy);
                            if (li >= 0 && majorLabels[li] && window.showProviderDetails) {
                                window.showProviderDetails(majorLabels[li]);
                            }
                        }
                    }
                },
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        filter: ti => ti.datasetIndex === 0,
                        callbacks: {
                            title: items => `🏢 ${majorLabels[items[0].dataIndex]}`,
                            label: item => {
                                const p = majors[item.dataIndex];
                                const q = quadrantLabel(item.parsed.x, item.parsed.y, medX, medY);
                                return `Games: ${p.count}  |  Avg PI: ${p.avgTheo.toFixed(2)}  |  GGR: ${p.ggrShare.toFixed(1)}%  |  ${q}`;
                            },
                        },
                    },
                },
                scales: bubbleScaleOptionsWarped(chartColors, xWarp),
            },
        });
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
            _label: p.name,
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
