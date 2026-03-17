// Trends Module - Year-over-year analysis (Chart.js)
import { log, warn } from '../lib/env.js';

export const trendsData = {
    "2021": { "avg": 0.556, "games": 1009 },
    "2022": { "avg": 0.321, "games": 460 },
    "2023": { "avg": 0.321, "games": 771 },
    "2024": { "avg": 0.428, "games": 941 },
    "2025": { "avg": 1.288, "games": 1021 }
};

export const themesTrends = {
    "Money/Cash": [0.52, 0.35, 0.38, 0.51, 2.18],
    "Other/Unknown": [0.48, 0.29, 0.30, 0.42, 1.95],
    "Asian/Chinese": [0.61, 0.31, 0.29, 0.38, 1.62],
    "Animals": [0.58, 0.28, 0.26, 0.35, 1.35],
    "Fire/Volcanic": [0.50, 0.32, 0.31, 0.40, 1.56],
    "Magic/Fantasy": [1.12, 0.45, 0.50, 0.61, 1.52],
    "Classic/Retro": [0.90, 0.35, 0.28, 0.49, 1.35],
    "Egyptian": [0.50, 0.30, 0.25, 0.35, 0.85],
    "Nature/Elements": [0.42, 0.25, 0.27, 0.32, 0.62],
    "Festive/Seasonal": [0.45, 0.27, 0.30, 0.34, 0.67]
};

export const mechanicsTrends = {
    "Standard": [0.48, 0.29, 0.30, 0.39, 0.42],
    "Mega": [0.72, 0.39, 0.40, 0.49, 2.57],
    "Power/Extra Features": [1.59, 0.77, 0.63, 0.75, 2.68],
    "Ways to Win": [0.59, 0.28, 0.32, 0.56, 2.06],
    "Progressive Jackpot": [1.28, 0.66, 0.70, 0.71, 1.54],
    "Megaways": [0.70, 0.39, 0.43, 0.68, 2.20],
    "Link/Linked": [0.60, 0.27, 0.33, 0.45, 1.13],
    "Money Pot": [0.50, 0.25, 0.28, 0.38, 0.95],
    "Spin": [0.45, 0.22, 0.25, 0.35, 0.89],
    "Wild": [0.52, 0.26, 0.30, 0.40, 0.93]
};

const trendChartInstances = {};

function getThemeColors() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        text: isDark ? '#e2e8f0' : '#1e293b',
        grid: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)',
        bg: isDark ? 'transparent' : '#ffffff'
    };
}

function getLineColors() {
    return [
        '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#a855f7'
    ];
}

export function renderTrends() {
    if (typeof Chart === 'undefined') {
        warn('Chart.js not loaded yet, trends will render when available');
        return;
    }

    const el = document.getElementById('overall-trend-chart');
    if (!el || el.offsetParent === null || el.offsetWidth === 0) {
        setTimeout(renderTrends, 100);
        return;
    }

    const years = ['2021', '2022', '2023', '2024', '2025'];
    const avgPerf = years.map(y => trendsData[y].avg);
    const colors = getThemeColors();
    const lineColors = getLineColors();

    // Destroy existing charts
    ['overall-trend-chart', 'theme-trend-chart', 'mechanic-trend-chart'].forEach(id => {
        if (trendChartInstances[id]) {
            trendChartInstances[id].destroy();
            trendChartInstances[id] = null;
        }
    });

    // 1. Overall performance trend
    const overallCanvas = document.getElementById('overall-trend-chart');
    if (overallCanvas) {
        const ctx = overallCanvas.getContext('2d');
        trendChartInstances['overall-trend-chart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: [{
                    label: 'Avg Performance Index',
                    data: avgPerf,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 6,
                    pointHoverRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 16, right: 24, bottom: 48, left: 56 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: colors.bg,
                        titleColor: colors.text,
                        bodyColor: colors.text,
                        borderColor: colors.grid,
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { color: colors.grid },
                        ticks: { color: colors.text, maxRotation: 0 }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: colors.grid },
                        ticks: { color: colors.text }
                    }
                }
            }
        });
    }

    // 2. Theme trends
    const themeCanvas = document.getElementById('theme-trend-chart');
    if (themeCanvas) {
        const themeTraces = Object.entries(themesTrends).map(([name, values], i) => ({
            label: name,
            data: values,
            borderColor: lineColors[i % lineColors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            pointRadius: 4,
            pointHoverRadius: 8
        }));

        const ctx = themeCanvas.getContext('2d');
        trendChartInstances['theme-trend-chart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: themeTraces
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 16, right: 24, bottom: 72, left: 56 } },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: colors.text, boxWidth: 12, padding: 16 }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: colors.bg,
                        titleColor: colors.text,
                        bodyColor: colors.text
                    }
                },
                scales: {
                    x: {
                        grid: { color: colors.grid },
                        ticks: { color: colors.text, maxRotation: 0 }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: colors.grid },
                        ticks: { color: colors.text }
                    }
                }
            }
        });
    }

    // 3. Mechanic trends
    const mechanicCanvas = document.getElementById('mechanic-trend-chart');
    if (mechanicCanvas) {
        const mechanicTraces = Object.entries(mechanicsTrends).map(([name, values], i) => ({
            label: name,
            data: values,
            borderColor: lineColors[i % lineColors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            pointRadius: 4,
            pointHoverRadius: 8
        }));

        const ctx = mechanicCanvas.getContext('2d');
        trendChartInstances['mechanic-trend-chart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: mechanicTraces
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 16, right: 24, bottom: 72, left: 56 } },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: colors.text, boxWidth: 12, padding: 16 }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: colors.bg,
                        titleColor: colors.text,
                        bodyColor: colors.text
                    }
                },
                scales: {
                    x: {
                        grid: { color: colors.grid },
                        ticks: { color: colors.text, maxRotation: 0 }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: colors.grid },
                        ticks: { color: colors.text }
                    }
                }
            }
        });
    }

    // Force resize after layout settles (fixes charts in SPA when container had 0 width initially)
    setTimeout(() => {
        ['overall-trend-chart', 'theme-trend-chart', 'mechanic-trend-chart'].forEach(id => {
            const inst = trendChartInstances[id];
            if (inst) inst.resize();
        });
    }, 100);

    log('✅ All trend charts rendered (Chart.js)');
}
