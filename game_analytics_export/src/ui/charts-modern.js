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

// Wrap long labels into multiline arrays for Chart.js (splits at word boundary)
function wrapLabel(str, maxLen) {
    if (!str || str.length <= maxLen) return str;
    const words = str.split(/[\s/]+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        if (cur && (cur + ' ' + w).length > maxLen) {
            lines.push(cur);
            cur = w;
        } else {
            cur = cur ? cur + ' ' + w : w;
        }
    }
    if (cur) lines.push(cur);
    return lines.length > 4 ? [...lines.slice(0, 3), lines.slice(3).join(' ')] : lines;
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
            labels: top10.map(t => wrapLabel(stripParenthetical(t.Theme), 10)),
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
            layout: { padding: { bottom: 4 } },
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
                    ticks: { color: chartColors.textColor, font: { size: 11 }, padding: 8 },
                    grid: getModernGridConfig()
                },
                x: {
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 8 },
                        maxRotation: 0,
                        minRotation: 0,
                        padding: 2,
                        autoSkip: false
                    },
                    grid: { display: false }
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
            labels: mechanicData.map(m => wrapLabel(m.Mechanic, 10)),
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
            layout: { padding: { bottom: 4 } },
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
                    ticks: { color: chartColors.textColor, font: { size: 11 }, padding: 8 },
                    grid: getModernGridConfig()
                },
                x: {
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 8 },
                        maxRotation: 0,
                        minRotation: 0,
                        padding: 2,
                        autoSkip: false
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

// Top 10 Games Bar Chart
export function createGamesChart() {
    const canvas = document.getElementById('chart-games');
    if (!canvas) return;
    
    if (chartInstances.games) {
        chartInstances.games.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();
    
    const topGames = [...gameData.allGames]
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
        .slice(0, 10);
    
    chartInstances.games = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topGames.map(g => wrapLabel(g.name || 'Unknown', 6)),
            datasets: [{
                label: 'Theo Win',
                data: topGames.map(g => g.performance_theo_win || 0),
                backgroundColor: generateModernColors(ctx, 10),
                borderWidth: 0,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { bottom: 4 } },
            onClick: (e, elements) => {
                if (elements.length && window.showGameDetails) {
                    const game = topGames[elements[0].index];
                    if (game?.name) window.showGameDetails(game.name);
                }
            },
            onHover: (e, elements) => { e.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: (items) => `🎮 ${topGames[items[0].dataIndex]?.name || ''}`,
                        label: (item) => `Theo Win: ${item.parsed.y.toFixed(2)}`,
                        afterBody: (items) => {
                            const game = topGames[items[0].dataIndex];
                            return [
                                `Provider: ${game?.provider_studio || 'Unknown'}`,
                                `Theme: ${game?.theme_consolidated || 'N/A'}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 7 },
                        maxRotation: 0,
                        minRotation: 0,
                        padding: 2,
                        autoSkip: false
                    },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                    grid: getModernGridConfig()
                }
            }
        }
    });
}

// Theme Distribution Bubble Chart
export function createScatterChart() {
    console.log('[SCATTER] createScatterChart called');
    const canvas = document.getElementById('chart-scatter');
    if (!canvas) { console.warn('[SCATTER] canvas NOT FOUND'); return; }
    
    if (chartInstances.scatter) {
        chartInstances.scatter.destroy();
        chartInstances.scatter = null;
    }
    
    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        
        const allThemes = gameData.themes.filter(t => (t['Game Count'] || 0) >= 2);
        console.log('[SCATTER] filtered themes:', allThemes.length);
        if (!allThemes.length) return;
        
        const xVals = allThemes.map(t => t['Game Count'] || 0);
        const yVals = allThemes.map(t => t['Avg Theo Win Index'] || 0);
        const medX = [...xVals].sort((a, b) => a - b)[Math.floor(xVals.length / 2)] || 10;
        const medY = [...yVals].sort((a, b) => a - b)[Math.floor(yVals.length / 2)] || 2;
        
        const bubbleData = allThemes.map(t => {
            const x = t['Game Count'] || 0;
            const y = t['Avg Theo Win Index'] || 0;
            const r = Math.max(5, Math.min(16, Math.sqrt(x) * 2));
            return { x, y, r };
        });
        
        const themeLabels = allThemes.map(t => t.Theme || '');
        
        const bgColors = bubbleData.map(d => {
            if (d.y >= medY && d.x < medX) return 'rgba(16,185,129,0.65)';
            if (d.y >= medY && d.x >= medX) return 'rgba(99,102,241,0.65)';
            if (d.y < medY && d.x < medX) return 'rgba(156,163,175,0.55)';
            return 'rgba(239,68,68,0.55)';
        });
        const borderColors = bubbleData.map(d => {
            if (d.y >= medY && d.x < medX) return 'rgb(16,185,129)';
            if (d.y >= medY && d.x >= medX) return 'rgb(99,102,241)';
            if (d.y < medY && d.x < medX) return 'rgb(156,163,175)';
            return 'rgb(239,68,68)';
        });
        
        console.log('[SCATTER] data sample:', JSON.stringify(bubbleData.slice(0, 3)));
        
        // Plugin: draw quadrant labels + median dashed lines
        const quadrantPlugin = {
            id: 'quadrantLabels',
            beforeDatasetsDraw(chart) {
                const { ctx: c, chartArea: { left, right, top, bottom }, scales: { x: xScale, y: yScale } } = chart;
                const mx = xScale.getPixelForValue(medX);
                const my = yScale.getPixelForValue(medY);
                
                // Dashed median lines
                c.save();
                c.setLineDash([5, 4]);
                c.lineWidth = 1;
                c.strokeStyle = chartColors.gridColor || 'rgba(148,163,184,0.4)';
                c.beginPath(); c.moveTo(mx, top); c.lineTo(mx, bottom); c.stroke();
                c.beginPath(); c.moveTo(left, my); c.lineTo(right, my); c.stroke();
                c.setLineDash([]);
                c.restore();
            },
            afterDatasetsDraw(chart) {
                const { ctx: c, chartArea: { left, right, top, bottom }, scales: { x: xScale, y: yScale } } = chart;
                const mx = xScale.getPixelForValue(medX);
                const my = yScale.getPixelForValue(medY);
                const pad = 8;
                
                c.save();
                c.font = 'bold 10px Inter, system-ui, sans-serif';
                c.globalAlpha = 0.55;
                
                // Top-left: Opportunity (high perf, few games)
                c.fillStyle = 'rgb(16,185,129)';
                c.textAlign = 'left';
                c.textBaseline = 'top';
                c.fillText('💎 Opportunity', left + pad, top + pad);
                
                // Top-right: Leaders (high perf, many games)
                c.fillStyle = 'rgb(99,102,241)';
                c.textAlign = 'right';
                c.textBaseline = 'top';
                c.fillText('🏆 Leaders', right - pad, top + pad);
                
                // Bottom-left: Niche (low perf, few games)
                c.fillStyle = 'rgb(156,163,175)';
                c.textAlign = 'left';
                c.textBaseline = 'bottom';
                c.fillText('🔍 Niche', left + pad, bottom - pad);
                
                // Bottom-right: Saturated (low perf, many games)
                c.fillStyle = 'rgb(239,68,68)';
                c.textAlign = 'right';
                c.textBaseline = 'bottom';
                c.fillText('⚠️ Saturated', right - pad, bottom - pad);
                
                c.restore();
            }
        };
        
        chartInstances.scatter = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: 'Themes',
                    data: bubbleData,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    hoverRadius: 4
                }]
            },
            plugins: [quadrantPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                onClick: (e, elements) => {
                    if (elements.length && window.showThemeDetails) {
                        const name = themeLabels[elements[0].index];
                        if (name) window.showThemeDetails(name);
                    }
                },
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                return `🎨 ${stripParenthetical(themeLabels[idx])}`;
                            },
                            label: (item) => {
                                const q = item.parsed.y >= medY
                                    ? (item.parsed.x < medX ? '💎 Opportunity' : '🏆 Leader')
                                    : (item.parsed.x < medX ? '🔍 Niche' : '⚠️ Saturated');
                                return `Games: ${item.parsed.x}  |  Avg Theo: ${item.parsed.y.toFixed(2)}  |  ${q}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grace: '10%',
                        title: { display: true, text: 'Avg Theo Win', color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
                        ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                        grid: getModernGridConfig()
                    },
                    x: {
                        grace: '10%',
                        title: { display: true, text: 'Game Count', color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
                        ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                        grid: getModernGridConfig()
                    }
                }
            }
        });
        
        console.log('[SCATTER] chart created:', !!chartInstances.scatter, 'width:', chartInstances.scatter?.width, 'height:', chartInstances.scatter?.height);
    } catch(err) {
        console.error('[SCATTER] FAILED:', err);
    }
}

// Top Providers horizontal bar chart
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
        
        // Aggregate by provider
        const provMap = {};
        allGames.forEach(g => {
            const prov = g.provider_studio || g.provider || '';
            if (!prov) return;
            if (!provMap[prov]) provMap[prov] = { count: 0, totalTheo: 0 };
            provMap[prov].count++;
            provMap[prov].totalTheo += (g.performance_theo_win || 0);
        });
        
        const top10 = Object.entries(provMap)
            .map(([name, d]) => ({
                name,
                count: d.count,
                avgTheo: d.totalTheo / d.count,
                score: (d.totalTheo / d.count) * Math.sqrt(d.count)
            }))
            .filter(p => p.count >= 3)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        
        if (!top10.length) return;
        
        chartInstances.providers = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(p => wrapLabel(p.name, 10)),
                datasets: [{
                    label: 'Provider Score',
                    data: top10.map(p => p.score),
                    backgroundColor: generateModernColors(ctx, 10),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { bottom: 4 } },
                onClick: (e, elements) => {
                    if (elements.length && window.showProviderDetails) {
                        const prov = top10[elements[0].index];
                        if (prov?.name) window.showProviderDetails(prov.name);
                    }
                },
                onHover: (e, elements) => { e.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: (items) => `🏢 ${top10[items[0].dataIndex].name}`,
                            label: (item) => {
                                const p = top10[item.dataIndex];
                                return `Score: ${p.score.toFixed(1)}  |  Avg Theo: ${p.avgTheo.toFixed(2)}  |  ${p.count} games`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: chartColors.textColor,
                            font: { size: 8 },
                            maxRotation: 0,
                            minRotation: 0,
                            padding: 2,
                            autoSkip: false
                        },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                        grid: getModernGridConfig()
                    }
                }
            }
        });
    } catch (err) {
        console.error('[PROVIDERS-CHART] FAILED:', err);
    }
}

// Volatility Distribution Doughnut Chart
export function createVolatilityChart() {
    try {
        const canvas = document.getElementById('chart-volatility');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        if (chartInstances.volatility) { chartInstances.volatility.destroy(); chartInstances.volatility = null; }
        
        const allGames = gameData.allGames || [];
        if (!allGames.length) return;
        
        const volMap = {};
        allGames.forEach(g => {
            const vol = (g.specs_volatility || '').trim();
            if (!vol) return;
            if (!volMap[vol]) volMap[vol] = { count: 0, totalTheo: 0 };
            volMap[vol].count++;
            volMap[vol].totalTheo += (g.performance_theo_win || 0);
        });
        
        const ORDER = ['Very High', 'High', 'Medium-High', 'Medium', 'Medium-Low', 'Low-Medium', 'Low'];
        const sorted = ORDER.filter(v => volMap[v]).map(v => ({
            name: v, count: volMap[v].count, avgTheo: volMap[v].totalTheo / volMap[v].count
        }));
        if (!sorted.length) return;
        
        const globalAvg = sorted.reduce((s, v) => s + v.avgTheo * v.count, 0) / sorted.reduce((s, v) => s + v.count, 0);
        
        const VOL_COLORS = {
            'Low': '#10b981', 'Low-Medium': '#34d399', 'Medium-Low': '#6ee7b7', 'Medium': '#60a5fa',
            'Medium-High': '#f59e0b', 'High': '#f97316', 'Very High': '#ef4444'
        };
        
        chartInstances.volatility = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(v => v.name),
                datasets: [{
                    label: 'Avg Theo Win',
                    data: sorted.map(v => v.avgTheo),
                    backgroundColor: sorted.map(v => VOL_COLORS[v.name] || '#94a3b8'),
                    borderRadius: 6,
                    borderSkipped: false,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { color: chartColors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
                        ticks: { color: chartColors.textColor, font: { size: 10 } },
                        title: { display: true, text: 'Avg Theo Win Index', color: chartColors.textColor, font: { size: 10 } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: chartColors.textColor, font: { size: 11, weight: 'bold' } }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: (items) => `🎲 ${sorted[items[0].dataIndex].name} Volatility`,
                            label: (item) => {
                                const v = sorted[item.dataIndex];
                                const diff = v.avgTheo - globalAvg;
                                const arrow = diff >= 0 ? '▲' : '▼';
                                return [
                                    `Avg Theo Win: ${v.avgTheo.toFixed(2)}`,
                                    `${v.count} games (${((v.count / allGames.length) * 100).toFixed(1)}%)`,
                                    `${arrow} ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} vs market avg (${globalAvg.toFixed(2)})`
                                ];
                            }
                        }
                    },
                    subtitle: {
                        display: true,
                        text: `Market avg: ${globalAvg.toFixed(1)}`,
                        color: chartColors.isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                        font: { size: 10, style: 'italic' },
                        padding: { top: 0, bottom: 0 }
                    }
                }
            }
        });
    } catch (err) {
        console.error('[VOLATILITY-CHART] FAILED:', err);
    }
}

// RTP Performance Chart
export function createRtpChart() {
    try {
        const canvas = document.getElementById('chart-rtp');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        if (chartInstances.rtp) { chartInstances.rtp.destroy(); chartInstances.rtp = null; }
        
        const allGames = gameData.allGames || [];
        if (!allGames.length) return;
        
        const bands = [
            { label: '> 97%', min: 97, max: 200 },
            { label: '96-97%', min: 96, max: 97 },
            { label: '95-96%', min: 95, max: 96 },
            { label: '94-95%', min: 94, max: 95 },
            { label: '93-94%', min: 93, max: 94 },
            { label: '< 93%', min: 0, max: 93 }
        ];
        
        const bandData = bands.map(b => {
            const games = allGames.filter(g => {
                const rtp = parseFloat(g.specs_rtp);
                return rtp && !isNaN(rtp) && rtp >= b.min && rtp < b.max;
            });
            const totalTheo = games.reduce((s, g) => s + (g.performance_theo_win || 0), 0);
            return { ...b, count: games.length, avgTheo: games.length > 0 ? totalTheo / games.length : 0 };
        }).filter(b => b.count > 0);
        
        if (!bandData.length) return;
        
        const globalAvg = bandData.reduce((s, b) => s + b.avgTheo * b.count, 0) / bandData.reduce((s, b) => s + b.count, 0);
        
        const RTP_COLORS = ['#10b981', '#34d399', '#60a5fa', '#f59e0b', '#f97316', '#ef4444'];
        
        chartInstances.rtp = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bandData.map(b => b.label),
                datasets: [{
                    label: 'Avg Theo Win',
                    data: bandData.map(b => b.avgTheo),
                    backgroundColor: bandData.map((_, i) => RTP_COLORS[i % RTP_COLORS.length]),
                    borderRadius: 6,
                    borderSkipped: false,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { color: chartColors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
                        ticks: { color: chartColors.textColor, font: { size: 10 } },
                        title: { display: true, text: 'Avg Theo Win Index', color: chartColors.textColor, font: { size: 10 } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: chartColors.textColor, font: { size: 11, weight: 'bold' } }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: (items) => `📐 RTP ${bandData[items[0].dataIndex].label}`,
                            label: (item) => {
                                const b = bandData[item.dataIndex];
                                const diff = b.avgTheo - globalAvg;
                                const arrow = diff >= 0 ? '▲' : '▼';
                                return [
                                    `Avg Theo Win: ${b.avgTheo.toFixed(2)}`,
                                    `${b.count} games (${((b.count / allGames.length) * 100).toFixed(1)}%)`,
                                    `${arrow} ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} vs market avg (${globalAvg.toFixed(2)})`
                                ];
                            }
                        }
                    },
                    subtitle: {
                        display: true,
                        text: `Market avg: ${globalAvg.toFixed(1)}`,
                        color: chartColors.isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                        font: { size: 10, style: 'italic' },
                        padding: { top: 0, bottom: 0 }
                    }
                }
            }
        });
    } catch (err) {
        console.error('[RTP-CHART] FAILED:', err);
    }
}

// Initialize all charts
export function initializeCharts() {
    log('🎨 Initializing modern charts...');
    
    createThemesChart();
    createMechanicsChart();
    createGamesChart();
    createScatterChart();
    createProvidersChart();
    createVolatilityChart();
    createRtpChart();
    
    // Retry charts after short delay if canvas wasn't in DOM yet or data wasn't ready
    const retryMissing = () => {
        if (!chartInstances.scatter) createScatterChart();
        if (!chartInstances.games) createGamesChart();
        if (!chartInstances.providers) createProvidersChart();
        if (!chartInstances.volatility) createVolatilityChart();
        if (!chartInstances.rtp) createRtpChart();
    };
    setTimeout(retryMissing, 500);
    setTimeout(retryMissing, 1500);
    
    chartsInitialized = true;
    log('✅ Modern charts initialized');
}

// Refresh all charts (for dark mode toggle)
export function refreshCharts() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    createThemesChart();
    createMechanicsChart();
    createGamesChart();
    createScatterChart();
    createProvidersChart();
    createVolatilityChart();
    createRtpChart();
    setTimeout(() => { isRefreshing = false; }, 100);
}

// Export for external use
export { chartInstances };
