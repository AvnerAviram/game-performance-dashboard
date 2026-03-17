// Modern Chart.js Visualizations with Gradients & Custom Tooltips
import { gameData } from '../lib/data.js';
import { log } from '../lib/env.js';

let chartsInitialized = false;
let chartInstances = {};
let isRefreshing = false; // Prevent multiple simultaneous refreshes

// Gaming-themed Color Palette with Gradients
const modernColors = {
    gold: { start: '#fbbf24', end: '#f59e0b' },
    purple: { start: '#a855f7', end: '#e879f9' },
    cyan: { start: '#06b6d4', end: '#3b82f6' },
    emerald: { start: '#10b981', end: '#059669' },
    orange: { start: '#f97316', end: '#ef4444' },
    indigo: { start: '#6366f1', end: '#8b5cf6' },
    rose: { start: '#f43f5e', end: '#fb7185' },
    amber: { start: '#fbbf24', end: '#fb923c' }
};

// Create gradient for canvas
function createGradient(ctx, color, direction = 'vertical') {
    const gradient = direction === 'vertical' 
        ? ctx.createLinearGradient(0, 0, 0, 400)
        : ctx.createLinearGradient(0, 0, 400, 0);
    
    gradient.addColorStop(0, color.start);
    gradient.addColorStop(1, color.end);
    return gradient;
}

// Generate modern gradient colors for multiple bars
function generateModernColors(ctx, count) {
    const colorKeys = ['gold', 'purple', 'cyan', 'emerald', 'orange', 'indigo', 'rose', 'amber'];
    const result = [];
    
    for (let i = 0; i < count; i++) {
        const colorKey = colorKeys[i % colorKeys.length];
        result.push(createGradient(ctx, modernColors[colorKey]));
    }
    
    return result;
}

// Get theme based colors for charts
function getChartColors() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        textColor: isDark ? '#e2e8f0' : '#1E293B',
        gridColor: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)',
        backgroundColor: isDark ? 'transparent' : '#ffffff',
        tooltipBg: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        tooltipBorder: isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'
    };
}

// Modern custom tooltip configuration
function getModernTooltipConfig() {
    const colors = getChartColors();
    return {
        enabled: true,
        backgroundColor: colors.tooltipBg,
        titleColor: colors.textColor,
        bodyColor: colors.textColor,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        padding: 12,
        titleFont: {
            size: 13,
            weight: 'bold'
        },
        bodyFont: {
            size: 12
        },
        displayColors: true,
        boxWidth: 10,
        boxHeight: 10,
        cornerRadius: 6,
        caretSize: 5
    };
}

// Strip parenthetical suffix from labels (e.g. "Hold & Win (Cash Eruption Bonus)" -> "Hold & Win")
function stripParenthetical(label) {
    if (typeof label !== 'string') return label;
    return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;
}

// Modern grid and scale configuration
function getModernGridConfig() {
    const colors = getChartColors();
    return {
        color: colors.gridColor,
        lineWidth: 1,
        drawBorder: false,
        drawTicks: false
    };
}

// Top 10 Themes Bar Chart (Modern)
export function createThemesChart() {
    const canvas = document.getElementById('chart-themes');
    if (!canvas) {
        console.error('❌ Themes chart canvas NOT FOUND');
        return;
    }
    
    // Destroy existing chart
    if (chartInstances.themes) {
        chartInstances.themes.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    const top10 = gameData.themes.slice(0, 10);
    const chartColors = getChartColors();
    
    chartInstances.themes = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(t => stripParenthetical(t.Theme)),
            datasets: [{
                label: 'Performance Index',
                data: top10.map(t => t['Smart Index']),
                backgroundColor: generateModernColors(ctx, 10),
                borderWidth: 0,
                borderRadius: 8,
                borderSkipped: false,
                hoverBackgroundColor: generateModernColors(ctx, 10)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (e, elements) => {
                if (elements.length && window.showThemeDetails) {
                    const idx = elements[0].index;
                    const theme = top10[idx]?.Theme;
                    if (theme) window.showThemeDetails(theme);
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: (tooltipItems) => `🎨 ${stripParenthetical(top10[tooltipItems[0].dataIndex].Theme)}`,
                        label: (tooltipItem) => {
                            const theme = top10[tooltipItem.dataIndex];
                            return `Performance Index: ${tooltipItem.parsed.y.toFixed(2)}`;
                        },
                        afterBody: (tooltipItems) => {
                            const theme = top10[tooltipItems[0].dataIndex];
                            const avgTheoWin = theme['Avg Theo Win Index'] || theme['Avg Theoretical Win'] || 0;
                            return [
                                `Games: ${theme['Game Count']}`,
                                `Avg Theo Win: ${avgTheoWin.toFixed(2)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: chartColors.textColor,
                        font: {
                            size: 11
                        },
                        padding: 8
                    },
                    grid: getModernGridConfig()
                },
                x: {
                    ticks: {
                        color: chartColors.textColor,
                        font: {
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 45,
                        padding: 8
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Consolidate mechanics by canonical name (e.g. "Hold & Win (Cash Eruption Bonus)" + "Hold & Win" -> one "Hold & Win")
function consolidateMechanicsByCanonicalName(mechanics) {
    const byCanonical = {};
    mechanics.forEach(m => {
        const canonical = stripParenthetical(m.Mechanic) || m.Mechanic;
        if (!byCanonical[canonical]) {
            byCanonical[canonical] = { Mechanic: canonical, 'Game Count': 0, totalTheoWin: 0 };
        }
        const gc = m['Game Count'] || 0;
        byCanonical[canonical]['Game Count'] += gc;
        byCanonical[canonical].totalTheoWin += (m['Avg Theo Win Index'] || m.avg_theo_win || 0) * gc;
    });
    return Object.values(byCanonical)
        .map(m => ({ ...m, 'Avg Theo Win Index': m['Game Count'] > 0 ? m.totalTheoWin / m['Game Count'] : 0 }))
        .sort((a, b) => b['Game Count'] - a['Game Count'])
        .slice(0, 10);
}

// Top Mechanics Bar Chart (Modern)
export function createMechanicsChart() {
    const canvas = document.getElementById('chart-mechanics');
    if (!canvas) return;
    
    if (chartInstances.mechanics) {
        chartInstances.mechanics.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    const mechanicData = consolidateMechanicsByCanonicalName(gameData.mechanics);
    const chartColors = getChartColors();
    
    chartInstances.mechanics = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: mechanicData.map(m => m.Mechanic),
            datasets: [{
                label: 'Games',
                data: mechanicData.map(m => m['Game Count']),
                backgroundColor: generateModernColors(ctx, 10),
                borderWidth: 0,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (e, elements) => {
                if (elements.length && window.showMechanicDetails) {
                    const idx = elements[0].index;
                    const mechanic = mechanicData[idx]?.Mechanic;
                    if (mechanic) window.showMechanicDetails(mechanic);
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: (tooltipItems) => {
                            return `⚙️ ${mechanicData[tooltipItems[0].dataIndex].Mechanic}`;
                        },
                        label: (tooltipItem) => {
                            return `Games: ${tooltipItem.parsed.y}`;
                        },
                        afterBody: (tooltipItems) => {
                            const mechanic = mechanicData[tooltipItems[0].dataIndex];
                            const theoWin = mechanic['Avg Theo Win Index'] || mechanic['Avg Theoretical Win'] || 0;
                            return [`Avg Theo Win: ${theoWin.toFixed(2)}`];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: chartColors.textColor,
                        font: {
                            size: 11
                        },
                        padding: 8
                    },
                    grid: getModernGridConfig()
                },
                x: {
                    ticks: {
                        color: chartColors.textColor,
                        font: {
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 45,
                        padding: 8
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Scatter Plot (Modern with Gradient Bubbles)
export function createScatterChart() {
    const canvas = document.getElementById('chart-scatter');
    if (!canvas) return;
    
    if (chartInstances.scatter) {
        chartInstances.scatter.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();
    
    // Prepare scatter data - filter themes with 2+ games to reduce low-count clutter
    const scatterData = gameData.themes
        .filter(theme => (theme['Game Count'] || 0) >= 2)
        .map(theme => ({
            x: theme['Game Count'] || 0,
            y: theme['Avg Theo Win Index'] || theme['Smart Index'] || 0,
            label: theme.Theme
        }));
    
    const isDark = document.documentElement.classList.contains('dark');
    const pointColor = isDark ? 'rgba(99, 102, 241, 0.45)' : 'rgba(99, 102, 241, 0.5)';
    const pointBorder = isDark ? 'rgba(129, 140, 248, 0.8)' : 'rgba(99, 102, 241, 0.7)';
    
    chartInstances.scatter = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Themes',
                data: scatterData,
                backgroundColor: pointColor,
                borderColor: pointBorder,
                borderWidth: 1.5,
                pointRadius: 5,
                pointHoverRadius: 10,
                pointStyle: 'circle'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (e, elements) => {
                if (elements.length && window.showThemeDetails) {
                    const pt = elements[0];
                    const label = scatterData[pt.index]?.label;
                    if (label) window.showThemeDetails(label);
                }
            },
            layout: {
                padding: { top: 24, right: 24, bottom: 16, left: 16 }
            },
            interaction: {
                mode: 'point',
                intersect: true
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: (tooltipItems) => {
                            return `🎨 ${stripParenthetical(tooltipItems[0].raw.label)}`;
                        },
                        label: (tooltipItem) => {
                            return `Games: ${tooltipItem.parsed.x}`;
                        },
                        afterBody: (tooltipItems) => {
                            return [`Performance Index: ${tooltipItems[0].parsed.y.toFixed(2)}`];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: '8%',
                    title: {
                        display: true,
                        text: 'Performance Index',
                        color: chartColors.textColor,
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        padding: 14
                    },
                    ticks: {
                        color: chartColors.textColor,
                        font: {
                            size: 11
                        },
                        padding: 10
                    },
                    grid: getModernGridConfig()
                },
                x: {
                    grace: '8%',
                    title: {
                        display: true,
                        text: 'Game Count',
                        color: chartColors.textColor,
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        padding: 14
                    },
                    ticks: {
                        color: chartColors.textColor,
                        font: {
                            size: 11
                        },
                        padding: 10
                    },
                    grid: getModernGridConfig()
                }
            }
        }
    });
}

// Initialize all charts
export function initializeCharts() {
    log('🎨 Initializing modern charts...');
    
    // Always re-render charts to fix navigation issue
    createThemesChart();
    createMechanicsChart();
    createScatterChart();
    
    chartsInitialized = true;
    log('✅ Modern charts initialized');
}

// Refresh all charts (for dark mode toggle)
export function refreshCharts() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    createThemesChart();
    createMechanicsChart();
    createScatterChart();
    setTimeout(() => { isRefreshing = false; }, 100);
}

// Export for external use
export { chartInstances };
