import { getActiveGames } from '../lib/data.js';
import { getArtSettingMetrics } from '../lib/metrics.js';
import { F } from '../lib/game-fields.js';
import {
    getChartColors,
    getModernTooltipConfig,
    getModernGridConfig,
    createQuadrantPlugin,
    quadrantBgColor,
    quadrantBorderColor,
    quadrantLabel,
    median,
    bubbleScaleOptionsWarped,
    createXWarp,
    injectCoveragePill,
} from './chart-utils.js';
import { chartInstances } from './chart-config.js';

export function createArtSettingChart() {
    const canvas = document.getElementById('chart-art-settings');
    if (!canvas) return;

    if (chartInstances.artSettings) {
        chartInstances.artSettings.destroy();
        chartInstances.artSettings = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allGames = getActiveGames();
        const artGames = allGames.filter(g => F.artSetting(g));
        if (!artGames.length) return;

        const settings = getArtSettingMetrics(artGames);
        if (!settings.length) return;

        const xVals = settings.map(s => s.count);
        const yVals = settings.map(s => s.avgTheo);
        const xWarp = createXWarp(xVals);
        const rawMedX = [...xVals].sort((a, b) => a - b)[Math.floor(xVals.length / 2)] || 10;
        const medX = xWarp.warpVal(rawMedX);
        const medY = [...yVals].sort((a, b) => a - b)[Math.floor(yVals.length / 2)] || 1;

        const maxCount = Math.max(...xVals, 1);
        const bubbleData = settings.map(s => ({
            x: xWarp.warpVal(s.count),
            y: s.avgTheo,
            r: Math.max(5, Math.min(16, Math.sqrt(s.count / maxCount) * 14 + 3)),
        }));

        const labels = settings.map(s => s.setting.split('/')[0]);

        chartInstances.artSettings = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Art Settings',
                        data: bubbleData,
                        backgroundColor: bubbleData.map(d => quadrantBgColor(d.x, d.y, medX, medY)),
                        borderColor: bubbleData.map(d => quadrantBorderColor(d.x, d.y, medX, medY)),
                        borderWidth: 1.5,
                        hoverRadius: 4,
                    },
                ],
            },
            plugins: [createQuadrantPlugin('artQuadrant', medX, medY, chartColors)],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                onClick: (e, elements) => {
                    if (elements.length && window.showArtSetting) {
                        const s = settings[elements[0].index];
                        if (s?.setting) window.showArtSetting(s.setting);
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
                            title: items => `🎨 ${settings[items[0].dataIndex].setting}`,
                            label: item => {
                                const s = settings[item.dataIndex];
                                const q = quadrantLabel(item.parsed.x, item.parsed.y, medX, medY);
                                return `Games: ${s.count}  |  Avg PI: ${s.avgTheo.toFixed(2)}  |  ${q}`;
                            },
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grace: '10%',
                        title: {
                            display: true,
                            text: 'Avg Performance Index',
                            color: chartColors.textColor,
                            font: { size: 10, weight: 'bold' },
                        },
                        ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                        grid: getModernGridConfig(),
                    },
                    x: bubbleScaleOptionsWarped(chartColors, xWarp).x,
                },
            },
        });
        injectCoveragePill('chart-art-settings', artGames.length, allGames.length, 'with art data');
    } catch (err) {
        console.error('[ART-SETTINGS-CHART] FAILED:', err);
    }
}
