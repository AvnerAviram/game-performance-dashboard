// Volatility landscape bubble chart — filtered to verified/extracted confidence only
import { Chart } from './chart-setup.js';
import { gameData, getActiveGames } from '../lib/data.js';
import { VOL_COLORS } from '../lib/shared-config.js';
import { getVolatilityMetrics } from '../lib/metrics.js';
import {
    getChartColors,
    getModernTooltipConfig,
    createQuadrantPlugin,
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
import { chartInstances } from './chart-config.js';
import { F, isReliableConfidence } from '../lib/game-fields.js';

export function createVolatilityChart() {
    try {
        const canvas = document.getElementById('chart-volatility');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        if (chartInstances.volatility) {
            chartInstances.volatility.destroy();
            chartInstances.volatility = null;
        }

        const allGames = getActiveGames();
        if (!allGames.length) return;

        const reliableGames = allGames.filter(g => isReliableConfidence(F.volatilityConfidence(g)));

        const sorted = getVolatilityMetrics(reliableGames).map(v => ({
            name: v.volatility,
            count: v.count,
            avgTheo: v.avgTheo,
        }));
        if (!sorted.length) return;

        const xVals = sorted.map(v => v.count);
        const yVals = sorted.map(v => v.avgTheo);
        const xWarp = createXWarp(xVals);
        const medX = xWarp.warpVal(median(xVals));
        const medY = median(yVals);
        const reliableTotal = reliableGames.length;

        const maxCount = Math.max(...xVals, 1);
        const bubbleData = sorted.map(v => ({
            x: xWarp.warpVal(v.count),
            y: v.avgTheo,
            r: Math.max(10, Math.min(28, 10 + Math.sqrt(v.count / maxCount) * 18)),
            _label: v.name,
        }));

        const labels = sorted.map(v => v.name);

        chartInstances.volatility = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Volatility',
                        data: bubbleData,
                        backgroundColor: sorted.map(v => (VOL_COLORS[v.name] || '#94a3b8') + 'AA'),
                        borderColor: sorted.map(v => VOL_COLORS[v.name] || '#94a3b8'),
                        borderWidth: 1.5,
                        hoverRadius: 4,
                    },
                ],
            },
            plugins: [createQuadrantPlugin('volQuadrant', medX, medY, chartColors)],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: items => `🎲 ${labels[items[0].dataIndex]} Volatility`,
                            label: item => {
                                const v = sorted[item.dataIndex];
                                const globalAvg =
                                    sorted.reduce((s, x) => s + x.avgTheo * x.count, 0) /
                                    sorted.reduce((s, x) => s + x.count, 0);
                                const diff = v.avgTheo - globalAvg;
                                const arrow = diff >= 0 ? '▲' : '▼';
                                return [
                                    `Games: ${v.count}  |  Avg PI: ${v.avgTheo.toFixed(2)}`,
                                    `${arrow} ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} vs market avg (${globalAvg.toFixed(2)})`,
                                    `Based on ${reliableTotal} verified games`,
                                ];
                            },
                        },
                    },
                },
                scales: bubbleScaleOptionsWarped(chartColors, xWarp),
                onClick: (_evt, elements) => {
                    if (window.xrayActive) return;
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    const vol = volData[idx];
                    if (vol && window.showVolatilityDetails) window.showVolatilityDetails(vol.volatility);
                },
            },
        });
    } catch (err) {
        console.error('[VOLATILITY-CHART] FAILED:', err);
    }
}

export function createVolatilityLandscapeChart() {
    const canvas = document.getElementById('chart-volatility-landscape');
    if (!canvas) return;

    if (chartInstances.volatilityLandscape) {
        chartInstances.volatilityLandscape.destroy();
        chartInstances.volatilityLandscape = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const reliableGames = allGames.filter(g => isReliableConfidence(F.volatilityConfidence(g)));

        const sorted = getVolatilityMetrics(reliableGames).map(v => ({
            name: v.volatility,
            count: v.count,
            avgTheo: v.avgTheo,
        }));
        if (!sorted.length) return;

        const xVals = sorted.map(v => v.count);
        const yVals = sorted.map(v => v.avgTheo);
        const xWarp = createXWarp(xVals);
        const medX = xWarp.warpVal(median(xVals));
        const medY = median(yVals);
        const reliableTotal = reliableGames.length;

        const maxCount = Math.max(...xVals, 1);
        const bubbleData = sorted.map(v => ({
            x: xWarp.warpVal(v.count),
            y: v.avgTheo,
            r: Math.max(8, Math.min(40, 8 + Math.sqrt(v.count / maxCount) * 32)),
            _label: v.name,
        }));

        const labels = sorted.map(v => v.name);
        const volBorder = sorted.map(v => VOL_COLORS[v.name] || '#94a3b8');

        const VOL_BARS_MAP = {
            Low: 1,
            'Low-Medium': 2,
            'Medium-Low': 3,
            Medium: 3,
            'Medium-High': 4,
            High: 5,
            'Very High': 5,
        };

        const drawVolIcon = (ctx, x, y, h, dataIndex, isDark) => {
            const name = sorted[dataIndex]?.name;
            const filled = VOL_BARS_MAP[name] || 3;
            const color = VOL_COLORS[name] || '#94a3b8';
            const totalBars = 5;
            const barW = 2;
            const gap = 1;
            const maxH = h - 1;
            const minH = 2;
            for (let b = 0; b < totalBars; b++) {
                const barH = minH + ((maxH - minH) * b) / (totalBars - 1);
                const bx = x + b * (barW + gap);
                const by = y + h - barH;
                ctx.fillStyle = b < filled ? color : isDark ? '#334155' : '#e2e8f0';
                ctx.fillRect(bx, by, barW, barH);
            }
        };

        const saPlugin = createSABubbleLabelPlugin('volLandscapeLabels', bubbleData, labels, volBorder, {
            iconWidth: 18,
            drawIcon: drawVolIcon,
            labelColors: sorted.map(v => VOL_COLORS[v.name] || '#94a3b8'),
        });

        chartInstances.volatilityLandscape = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Volatility',
                        data: bubbleData,
                        backgroundColor: sorted.map(v => (VOL_COLORS[v.name] || '#94a3b8') + '99'),
                        borderColor: volBorder,
                        borderWidth: 1.5,
                        hoverRadius: 6,
                    },
                ],
            },
            plugins: [createQuadrantPlugin('volLandscapeQuadrant', medX, medY, chartColors), saPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: items => `🎲 ${labels[items[0].dataIndex]} Volatility`,
                            label: item => {
                                const v = sorted[item.dataIndex];
                                const pct = ((v.count / reliableTotal) * 100).toFixed(1);
                                return [
                                    `Games: ${v.count} (${pct}%)  |  Avg PI: ${v.avgTheo.toFixed(2)}`,
                                    `Based on ${reliableTotal} verified games`,
                                ];
                            },
                        },
                    },
                },
                scales: bubbleScaleOptionsWarped(chartColors, xWarp),
                onHover: createSAHoverHandler(),
                onClick: createSAClickHandler(idx => {
                    const vol = sorted[idx];
                    if (vol && window.showVolatilityDetails) window.showVolatilityDetails(vol.name);
                }),
            },
        });
        injectCoveragePill('chart-volatility-landscape', reliableTotal, allGames.length, 'with verified volatility');
    } catch (err) {
        console.error('[VOLATILITY-LANDSCAPE] FAILED:', err);
    }
}
