// Top Providers horizontal bar chart
import { gameData } from '../lib/data.js';
import { getProviderMetrics } from '../lib/metrics.js';
import { generateModernColors, getChartColors, getModernTooltipConfig, getModernGridConfig } from './chart-utils.js';
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
        const allGames = gameData.allGames || [];
        if (!allGames.length) return;

        const top10 = getProviderMetrics(allGames).slice(0, 10);

        if (!top10.length) return;

        chartInstances.providers = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(p => p.name),
                datasets: [
                    {
                        label: 'GGR Share %',
                        data: top10.map(p => p.ggrShare),
                        backgroundColor: generateModernColors(ctx, 10),
                        borderWidth: 0,
                        borderRadius: 8,
                        borderSkipped: false,
                    },
                ],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { left: 4, right: 8 } },
                onClick: (e, elements) => {
                    if (elements.length && window.showProviderDetails) {
                        const prov = top10[elements[0].index];
                        if (prov?.name) window.showProviderDetails(prov.name);
                    }
                },
                onHover: (e, elements) => {
                    e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: items => `🏢 ${top10[items[0].dataIndex].name}`,
                            label: item => {
                                const p = top10[item.dataIndex];
                                return `GGR Share: ${p.ggrShare.toFixed(2)}%  |  Avg Theo: ${p.avgTheo.toFixed(2)}  |  ${p.count} games`;
                            },
                        },
                    },
                },
                scales: {
                    y: {
                        ticks: {
                            color: chartColors.textColor,
                            font: { size: 11 },
                            padding: 4,
                        },
                        grid: { display: false },
                    },
                    x: {
                        beginAtZero: true,
                        ticks: {
                            color: chartColors.textColor,
                            font: { size: 10 },
                            padding: 6,
                            callback: val => val + '%',
                        },
                        grid: getModernGridConfig(),
                    },
                },
            },
        });
    } catch (err) {
        console.error('[PROVIDERS-CHART] FAILED:', err);
    }
}
