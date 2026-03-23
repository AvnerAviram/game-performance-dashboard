// Volatility distribution bar chart
import { gameData } from '../lib/data.js';
import { VOL_COLORS } from '../lib/shared-config.js';
import { getVolatilityMetrics } from '../lib/metrics.js';
import { getChartColors, getModernTooltipConfig } from './chart-utils.js';
import { chartInstances } from './chart-config.js';

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

        const allGames = gameData.allGames || [];
        if (!allGames.length) return;

        const sorted = getVolatilityMetrics(allGames).map(v => ({
            name: v.volatility,
            count: v.count,
            avgTheo: v.avgTheo,
        }));
        if (!sorted.length) return;

        const globalAvg = sorted.reduce((s, v) => s + v.avgTheo * v.count, 0) / sorted.reduce((s, v) => s + v.count, 0);

        chartInstances.volatility = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(v => v.name),
                datasets: [
                    {
                        label: 'Avg Theo Win',
                        data: sorted.map(v => v.avgTheo),
                        backgroundColor: sorted.map(v => VOL_COLORS[v.name] || '#94a3b8'),
                        borderRadius: 6,
                        borderSkipped: false,
                        barPercentage: 0.7,
                        categoryPercentage: 0.8,
                    },
                ],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { color: chartColors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
                        ticks: { color: chartColors.textColor, font: { size: 10 } },
                        title: {
                            display: true,
                            text: 'Avg Theo Win Index',
                            color: chartColors.textColor,
                            font: { size: 10 },
                        },
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: chartColors.textColor, font: { size: 11, weight: 'bold' } },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: items => `🎲 ${sorted[items[0].dataIndex].name} Volatility`,
                            label: item => {
                                const v = sorted[item.dataIndex];
                                const diff = v.avgTheo - globalAvg;
                                const arrow = diff >= 0 ? '▲' : '▼';
                                return [
                                    `Avg Theo Win: ${v.avgTheo.toFixed(2)}`,
                                    `${v.count} games (${((v.count / allGames.length) * 100).toFixed(1)}%)`,
                                    `${arrow} ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} vs market avg (${globalAvg.toFixed(2)})`,
                                ];
                            },
                        },
                    },
                    subtitle: {
                        display: true,
                        text: `Market avg: ${globalAvg.toFixed(1)}`,
                        color: chartColors.isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                        font: { size: 10, style: 'italic' },
                        padding: { top: 0, bottom: 0 },
                    },
                },
            },
        });
    } catch (err) {
        console.error('[VOLATILITY-CHART] FAILED:', err);
    }
}
