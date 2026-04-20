import { Chart } from './chart-setup.js';
import { getActiveGames } from '../lib/data.js';
import { getArtThemeMetrics } from '../lib/metrics.js';
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

export function createArtThemeChart() {
    const canvas = document.getElementById('chart-art-themes');
    if (!canvas) return;

    if (chartInstances.artThemes) {
        chartInstances.artThemes.destroy();
        chartInstances.artThemes = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allGames = getActiveGames();
        const artGames = allGames.filter(g => F.artTheme(g));
        if (!artGames.length) return;

        const themes = getArtThemeMetrics(artGames);
        if (!themes.length) return;

        const xVals = themes.map(s => s.count);
        const yVals = themes.map(s => s.avgTheo);
        const xWarp = createXWarp(xVals);
        const rawMedX = [...xVals].sort((a, b) => a - b)[Math.floor(xVals.length / 2)] || 10;
        const medX = xWarp.warpVal(rawMedX);
        const medY = [...yVals].sort((a, b) => a - b)[Math.floor(yVals.length / 2)] || 1;

        const maxCount = Math.max(...xVals, 1);
        const bubbleData = themes.map(s => ({
            x: xWarp.warpVal(s.count),
            y: s.avgTheo,
            r: Math.max(5, Math.min(16, Math.sqrt(s.count / maxCount) * 14 + 3)),
        }));

        const labels = themes.map(s => s.theme.split('/')[0]);

        const artBorders = bubbleData.map(d => quadrantBorderColor(d.x, d.y, medX, medY));

        chartInstances.artThemes = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Art Themes',
                        data: bubbleData,
                        backgroundColor: bubbleData.map(d => quadrantBgColor(d.x, d.y, medX, medY)),
                        borderColor: artBorders,
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
                    if (window.xrayActive) return;
                    if (elements.length && window.showArtTheme) {
                        const s = themes[elements[0].index];
                        if (s?.theme) window.showArtTheme(s.theme);
                    }
                },
                onHover: (e, elements) => {
                    e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 16 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: items => `🎨 ${themes[items[0].dataIndex].theme}`,
                            label: item => {
                                const s = themes[item.dataIndex];
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
                    x: {
                        ...bubbleScaleOptionsWarped(chartColors, xWarp, 'Number of Games').x,
                        min: -0.15,
                    },
                },
            },
        });
        // Coverage pill omitted on overview
    } catch (err) {
        console.error('[ART-THEMES-CHART] FAILED:', err);
    }
}
