// RTP landscape bubble chart
import { gameData, getActiveGames } from '../lib/data.js';
import { getRtpBandMetrics } from '../lib/metrics.js';
import { saLabelSolver } from '../lib/sa-label-solver.js';
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

const RTP_COLORS = ['#10b981', '#34d399', '#60a5fa', '#f59e0b', '#f97316', '#ef4444'];

export function createRtpChart() {
    try {
        const canvas = document.getElementById('chart-rtp');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        if (chartInstances.rtp) {
            chartInstances.rtp.destroy();
            chartInstances.rtp = null;
        }

        const allGames = getActiveGames();
        if (!allGames.length) return;

        const bandData = getRtpBandMetrics(allGames);
        if (!bandData.length) return;

        const rtpTotal = bandData.reduce((s, b) => s + b.count, 0);
        const rtpPct = ((rtpTotal / allGames.length) * 100).toFixed(0);

        const xVals = bandData.map(b => b.count);
        const yVals = bandData.map(b => b.avgTheo);
        const xWarp = createXWarp(xVals);
        const medX = xWarp.warpVal(median(xVals));
        const medY = median(yVals);

        const maxCount = Math.max(...xVals, 1);
        const bubbleData = bandData.map(b => ({
            x: xWarp.warpVal(b.count),
            y: b.avgTheo,
            r: Math.max(10, Math.min(28, 10 + Math.sqrt(b.count / maxCount) * 18)),
        }));

        const labels = bandData.map(b => b.label);

        chartInstances.rtp = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'RTP Bands',
                        data: bubbleData,
                        backgroundColor: bandData.map((_, i) => RTP_COLORS[i % RTP_COLORS.length] + 'AA'),
                        borderColor: bandData.map((_, i) => RTP_COLORS[i % RTP_COLORS.length]),
                        borderWidth: 1.5,
                        hoverRadius: 4,
                    },
                ],
            },
            plugins: [createQuadrantPlugin('rtpQuadrant', medX, medY, chartColors)],
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
                            title: items => `📐 RTP ${labels[items[0].dataIndex]}`,
                            label: item => {
                                const b = bandData[item.dataIndex];
                                const globalAvg =
                                    bandData.reduce((s, x) => s + x.avgTheo * x.count, 0) /
                                    bandData.reduce((s, x) => s + x.count, 0);
                                const diff = b.avgTheo - globalAvg;
                                const arrow = diff >= 0 ? '▲' : '▼';
                                return [
                                    `Games: ${b.count}  |  Avg PI: ${b.avgTheo.toFixed(2)}`,
                                    `${arrow} ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} vs market avg (${globalAvg.toFixed(2)})`,
                                    `Based on ${rtpTotal} games with RTP data (${rtpPct}%)`,
                                ];
                            },
                        },
                    },
                },
                scales: bubbleScaleOptionsWarped(chartColors, xWarp),
                onClick: (_evt, elements) => {
                    if (!elements.length) return;
                    const idx = elements[0].index;
                    const band = bandData[idx];
                    if (band && window.showRtpBandDetails) window.showRtpBandDetails(band.label);
                },
            },
        });
        injectCoveragePill('chart-rtp', rtpTotal, allGames.length, 'with RTP data');
    } catch (err) {
        console.error('[RTP-CHART] FAILED:', err);
    }
}

export function createRtpLandscapeChart() {
    const canvas = document.getElementById('chart-rtp-landscape');
    if (!canvas) return;

    if (chartInstances.rtpLandscape) {
        chartInstances.rtpLandscape.destroy();
        chartInstances.rtpLandscape = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const bandData = getRtpBandMetrics(allGames);
        if (!bandData.length) return;

        const rtpTotal = bandData.reduce((s, b) => s + b.count, 0);
        const rtpPct = ((rtpTotal / allGames.length) * 100).toFixed(0);

        const xVals = bandData.map(b => b.count);
        const yVals = bandData.map(b => b.avgTheo);
        const xWarp = createXWarp(xVals);
        const medX = xWarp.warpVal(median(xVals));
        const medY = median(yVals);

        const maxCount = Math.max(...xVals, 1);
        const bubbleData = bandData.map(b => ({
            x: xWarp.warpVal(b.count),
            y: b.avgTheo,
            r: Math.max(8, Math.min(40, 8 + Math.sqrt(b.count / maxCount) * 32)),
        }));

        const labels = bandData.map(b => b.label);
        const rtpBorder = bandData.map((_, i) => RTP_COLORS[i % RTP_COLORS.length]);
        const saPlugin = createSABubbleLabelPlugin('rtpLandscapeLabels', bubbleData, labels, rtpBorder);

        chartInstances.rtpLandscape = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'RTP Bands',
                        data: bubbleData,
                        backgroundColor: bandData.map((_, i) => RTP_COLORS[i % RTP_COLORS.length] + '99'),
                        borderColor: rtpBorder,
                        borderWidth: 1.5,
                        hoverRadius: 6,
                    },
                ],
            },
            plugins: [createQuadrantPlugin('rtpLandscapeQuadrant', medX, medY, chartColors), saPlugin],
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
                            title: items => `📐 RTP ${labels[items[0].dataIndex]}`,
                            label: item => {
                                const b = bandData[item.dataIndex];
                                const pct = ((b.count / allGames.length) * 100).toFixed(1);
                                return [
                                    `Games: ${b.count} (${pct}%)  |  Avg PI: ${b.avgTheo.toFixed(2)}`,
                                    `Based on ${rtpTotal} games with RTP data (${rtpPct}%)`,
                                ];
                            },
                        },
                    },
                },
                scales: bubbleScaleOptionsWarped(chartColors, xWarp),
                onHover: createSAHoverHandler(),
                onClick: createSAClickHandler(idx => {
                    const band = bandData[idx];
                    if (band && window.showRtpBandDetails) window.showRtpBandDetails(band.label);
                }),
            },
        });
        chartInstances.rtpLandscape._saModule = { saLabelSolver };
        injectCoveragePill('chart-rtp-landscape', rtpTotal, allGames.length, 'with RTP data');
    } catch (err) {
        console.error('[RTP-LANDSCAPE] FAILED:', err);
    }
}
