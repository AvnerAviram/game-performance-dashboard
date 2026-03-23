// Theme, mechanics, games, scatter, and market landscape charts
import { gameData } from '../lib/data.js';
import { log } from '../lib/env.js';
import {
    generateModernColors,
    getChartColors,
    getModernTooltipConfig,
    stripParenthetical,
    wrapLabel,
    getModernGridConfig,
} from './chart-utils.js';
import { chartInstances } from './chart-config.js';
import { F } from '../lib/game-fields.js';

export function createThemesChart() {
    const canvas = document.getElementById('chart-themes');
    if (!canvas) {
        console.error('❌ Themes chart canvas NOT FOUND');
        return;
    }

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
            datasets: [
                {
                    label: 'Performance Index',
                    data: top10.map(t => t['Smart Index']),
                    backgroundColor: generateModernColors(ctx, 10),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    hoverBackgroundColor: generateModernColors(ctx, 10),
                },
            ],
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
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: tooltipItems => `🎨 ${stripParenthetical(top10[tooltipItems[0].dataIndex].Theme)}`,
                        label: tooltipItem => {
                            const _theme = top10[tooltipItem.dataIndex];
                            return `Performance Index: ${tooltipItem.parsed.y.toFixed(2)}`;
                        },
                        afterBody: tooltipItems => {
                            const theme = top10[tooltipItems[0].dataIndex];
                            const avgTheoWin = theme['Avg Theo Win Index'] || theme['Avg Theoretical Win'] || 0;
                            return [`Games: ${theme['Game Count']}`, `Avg Theo Win: ${avgTheoWin.toFixed(2)}`];
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: chartColors.textColor, font: { size: 11 }, padding: 8 },
                    grid: getModernGridConfig(),
                },
                x: {
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 10 },
                        maxRotation: 0,
                        minRotation: 0,
                        padding: 2,
                        autoSkip: false,
                    },
                    grid: { display: false },
                },
            },
        },
    });
}

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
            labels: mechanicData.map(m => wrapLabel(m.Mechanic, 12)),
            datasets: [
                {
                    label: 'Games',
                    data: mechanicData.map(m => m['Game Count']),
                    backgroundColor: generateModernColors(ctx, 10),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                },
            ],
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
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: tooltipItems => {
                            return `⚙️ ${mechanicData[tooltipItems[0].dataIndex].Mechanic}`;
                        },
                        label: tooltipItem => {
                            return `Games: ${tooltipItem.parsed.y}`;
                        },
                        afterBody: tooltipItems => {
                            const mechanic = mechanicData[tooltipItems[0].dataIndex];
                            const theoWin = mechanic['Avg Theo Win Index'] || mechanic['Avg Theoretical Win'] || 0;
                            return [`Avg Theo Win: ${theoWin.toFixed(2)}`];
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: chartColors.textColor, font: { size: 11 }, padding: 8 },
                    grid: getModernGridConfig(),
                },
                x: {
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 9 },
                        maxRotation: 0,
                        minRotation: 0,
                        padding: 2,
                        autoSkip: false,
                    },
                    grid: { display: false },
                },
            },
        },
    });
}

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
            labels: topGames.map(g => wrapLabel(g.name || 'Unknown', 10)),
            datasets: [
                {
                    label: 'Theo Win',
                    data: topGames.map(g => g.performance_theo_win || 0),
                    backgroundColor: generateModernColors(ctx, 10),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                },
            ],
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
            onHover: (e, elements) => {
                e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: items => `🎮 ${topGames[items[0].dataIndex]?.name || ''}`,
                        label: item => `Theo Win: ${item.parsed.y.toFixed(2)}`,
                        afterBody: items => {
                            const game = topGames[items[0].dataIndex];
                            return [`Provider: ${F.provider(game)}`, `Theme: ${game?.theme_consolidated || 'N/A'}`];
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 9 },
                        maxRotation: 0,
                        minRotation: 0,
                        padding: 2,
                        autoSkip: false,
                    },
                    grid: { display: false },
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                    grid: getModernGridConfig(),
                },
            },
        },
    });
}

export function createScatterChart() {
    log('[SCATTER] createScatterChart called');
    const canvas = document.getElementById('chart-scatter');
    if (!canvas) {
        log('[SCATTER] canvas NOT FOUND');
        return;
    }

    if (chartInstances.scatter) {
        chartInstances.scatter.destroy();
        chartInstances.scatter = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();

        const allThemes = gameData.themes.filter(t => (t['Game Count'] || 0) >= 2);
        log('[SCATTER] filtered themes:', allThemes.length);
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

        log('[SCATTER] data sample:', JSON.stringify(bubbleData.slice(0, 3)));

        const quadrantPlugin = {
            id: 'quadrantLabels',
            beforeDatasetsDraw(chart) {
                const {
                    ctx: c,
                    chartArea: { left, right, top, bottom },
                    scales: { x: xScale, y: yScale },
                } = chart;
                const mx = xScale.getPixelForValue(medX);
                const my = yScale.getPixelForValue(medY);

                c.save();
                c.setLineDash([5, 4]);
                c.lineWidth = 1;
                c.strokeStyle = chartColors.gridColor || 'rgba(148,163,184,0.4)';
                c.beginPath();
                c.moveTo(mx, top);
                c.lineTo(mx, bottom);
                c.stroke();
                c.beginPath();
                c.moveTo(left, my);
                c.lineTo(right, my);
                c.stroke();
                c.setLineDash([]);
                c.restore();
            },
            afterDatasetsDraw(chart) {
                const {
                    ctx: c,
                    chartArea: { left, right, top, bottom },
                    scales: { x: xScale, y: yScale },
                } = chart;
                const _mx = xScale.getPixelForValue(medX);
                const _my = yScale.getPixelForValue(medY);
                const pad = 8;

                c.save();
                c.font = 'bold 10px Inter, system-ui, sans-serif';
                c.globalAlpha = 0.55;

                c.fillStyle = 'rgb(16,185,129)';
                c.textAlign = 'left';
                c.textBaseline = 'top';
                c.fillText('💎 Opportunity', left + pad, top + pad);

                c.fillStyle = 'rgb(99,102,241)';
                c.textAlign = 'right';
                c.textBaseline = 'top';
                c.fillText('🏆 Leaders', right - pad, top + pad);

                c.fillStyle = 'rgb(156,163,175)';
                c.textAlign = 'left';
                c.textBaseline = 'bottom';
                c.fillText('🔍 Niche', left + pad, bottom - pad);

                c.fillStyle = 'rgb(239,68,68)';
                c.textAlign = 'right';
                c.textBaseline = 'bottom';
                c.fillText('⚠️ Saturated', right - pad, bottom - pad);

                c.restore();
            },
        };

        chartInstances.scatter = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Themes',
                        data: bubbleData,
                        backgroundColor: bgColors,
                        borderColor: borderColors,
                        borderWidth: 1.5,
                        hoverRadius: 4,
                    },
                ],
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
                            title: items => {
                                const idx = items[0].dataIndex;
                                return `🎨 ${stripParenthetical(themeLabels[idx])}`;
                            },
                            label: item => {
                                const q =
                                    item.parsed.y >= medY
                                        ? item.parsed.x < medX
                                            ? '💎 Opportunity'
                                            : '🏆 Leader'
                                        : item.parsed.x < medX
                                          ? '🔍 Niche'
                                          : '⚠️ Saturated';
                                return `Games: ${item.parsed.x}  |  Avg Theo: ${item.parsed.y.toFixed(2)}  |  ${q}`;
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
                            text: 'Avg Theo Win',
                            color: chartColors.textColor,
                            font: { size: 10, weight: 'bold' },
                        },
                        ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                        grid: getModernGridConfig(),
                    },
                    x: {
                        grace: '10%',
                        title: {
                            display: true,
                            text: 'Game Count',
                            color: chartColors.textColor,
                            font: { size: 10, weight: 'bold' },
                        },
                        ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                        grid: getModernGridConfig(),
                    },
                },
            },
        });

        log(
            '[SCATTER] chart created:',
            !!chartInstances.scatter,
            'width:',
            chartInstances.scatter?.width,
            'height:',
            chartInstances.scatter?.height
        );
    } catch (err) {
        console.error('[SCATTER] FAILED:', err);
    }
}

export function createMarketLandscapeChart() {
    const canvas = document.getElementById('chart-market-landscape');
    if (!canvas) return;

    if (chartInstances.marketLandscape) {
        chartInstances.marketLandscape.destroy();
        chartInstances.marketLandscape = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allThemes = (gameData.themes || []).filter(t => (t['Game Count'] || 0) >= 2);
        const allGames = gameData.allGames || [];

        if (!allThemes.length) return;

        const providerCountByTheme = {};
        allGames.forEach(g => {
            const theme = g.theme_consolidated || g.Theme || '';
            const prov = F.provider(g);
            if (!theme || /^unknown$/i.test(theme)) return;
            if (!providerCountByTheme[theme]) providerCountByTheme[theme] = new Set();
            if (prov) providerCountByTheme[theme].add(prov);
        });

        const xVals = allThemes.map(t => t['Game Count'] || 0);
        const yVals = allThemes.map(t => t['Avg Theo Win Index'] || 0);
        const medX = [...xVals].sort((a, b) => a - b)[Math.floor(xVals.length / 2)] || 10;
        const medY = [...yVals].sort((a, b) => a - b)[Math.floor(yVals.length / 2)] || 2;

        const provCounts = allThemes.map(t => (providerCountByTheme[t.Theme] || new Set()).size);
        const maxProv = Math.max(...provCounts, 1);
        const rMin = 12;
        const rMax = 30;

        const bubbleData = allThemes.map(t => {
            const x = t['Game Count'] || 0;
            const y = t['Avg Theo Win Index'] || 0;
            const provCount = (providerCountByTheme[t.Theme] || new Set()).size;
            const r = maxProv > 0 ? rMin + (provCount / maxProv) * (rMax - rMin) : rMin;
            return { x, y, r };
        });

        const themeLabels = allThemes.map(t => t.Theme || '');

        const bgColors = bubbleData.map(d => {
            if (d.y >= medY && d.x < medX) return 'rgba(16,185,129,0.45)';
            if (d.y >= medY && d.x >= medX) return 'rgba(99,102,241,0.45)';
            if (d.y < medY && d.x < medX) return 'rgba(100,116,139,0.4)';
            return 'rgba(239,68,68,0.4)';
        });
        const borderColors = bubbleData.map(d => {
            if (d.y >= medY && d.x < medX) return 'rgba(16,185,129,0.7)';
            if (d.y >= medY && d.x >= medX) return 'rgba(99,102,241,0.7)';
            if (d.y < medY && d.x < medX) return 'rgba(100,116,139,0.6)';
            return 'rgba(239,68,68,0.6)';
        });

        const quadrantPlugin = {
            id: 'marketLandscapeQuadrants',
            beforeDatasetsDraw(chart) {
                const {
                    ctx: c,
                    chartArea: { left, right, top, bottom },
                    scales: { x: xScale, y: yScale },
                } = chart;
                const mx = xScale.getPixelForValue(medX);
                const my = yScale.getPixelForValue(medY);
                c.save();
                c.setLineDash([5, 4]);
                c.lineWidth = 1;
                c.strokeStyle = chartColors.gridColor || 'rgba(148,163,184,0.4)';
                c.beginPath();
                c.moveTo(mx, top);
                c.lineTo(mx, bottom);
                c.stroke();
                c.beginPath();
                c.moveTo(left, my);
                c.lineTo(right, my);
                c.stroke();
                c.setLineDash([]);
                c.restore();
            },
            afterDatasetsDraw(chart) {
                const {
                    ctx: c,
                    chartArea: { left, right, top, bottom },
                } = chart;
                const pad = 8;
                c.save();
                c.font = 'bold 10px Inter, system-ui, sans-serif';
                c.globalAlpha = 0.55;
                c.fillStyle = 'rgb(16,185,129)';
                c.textAlign = 'left';
                c.textBaseline = 'top';
                c.fillText('💎 Opportunity', left + pad, top + pad);
                c.fillStyle = 'rgb(99,102,241)';
                c.textAlign = 'right';
                c.textBaseline = 'top';
                c.fillText('🏆 Leaders', right - pad, top + pad);
                c.fillStyle = 'rgb(156,163,175)';
                c.textAlign = 'left';
                c.textBaseline = 'bottom';
                c.fillText('🔍 Niche', left + pad, bottom - pad);
                c.fillStyle = 'rgb(239,68,68)';
                c.textAlign = 'right';
                c.textBaseline = 'bottom';
                c.fillText('⚠️ Saturated', right - pad, bottom - pad);
                c.restore();
            },
        };

        const bubbleLabelPlugin = {
            id: 'bubbleLabels',
            afterDatasetsDraw(chart) {
                const { ctx: c, chartArea } = chart;
                const meta = chart.getDatasetMeta(0);
                c.save();
                const isDark = document.documentElement.classList.contains('dark');
                const labelColor = isDark ? '#94a3b8' : '#64748b';
                const placedRects = [];
                const sorted = meta.data.map((pt, i) => ({ pt, i, r: bubbleData[i].r })).sort((a, b) => b.r - a.r);
                const bubblePixels = meta.data.map(el => ({
                    x: el.x,
                    y: el.y,
                    r: el.options?.radius ?? el.outerRadius ?? 12,
                }));

                sorted.forEach(({ pt, i, r: dataR }) => {
                    const label = themeLabels[i] || '';
                    if (!label) return;

                    const pxR = bubblePixels[i].r;
                    const fontSize = pxR >= 18 ? 11 : 10;
                    c.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
                    const tw = c.measureText(label).width;
                    const th = fontSize + 2;
                    const gap = 10;

                    const cx = pt.x,
                        cy = pt.y;
                    const candidates = [
                        { x: cx, y: cy - pxR - gap, al: 'center', bl: 'bottom' },
                        { x: cx + pxR + gap, y: cy, al: 'left', bl: 'middle' },
                        { x: cx - pxR - gap, y: cy, al: 'right', bl: 'middle' },
                        { x: cx, y: cy + pxR + gap, al: 'center', bl: 'top' },
                        { x: cx + pxR + gap, y: cy - pxR * 0.5, al: 'left', bl: 'bottom' },
                        { x: cx - pxR - gap, y: cy - pxR * 0.5, al: 'right', bl: 'bottom' },
                        { x: cx, y: cy - pxR - gap - th - 4, al: 'center', bl: 'bottom' },
                        { x: cx + pxR + gap, y: cy + pxR * 0.5, al: 'left', bl: 'top' },
                        { x: cx - pxR - gap, y: cy + pxR * 0.5, al: 'right', bl: 'top' },
                    ];

                    const toRect = (lx, ly, al, bl) => {
                        const x1 = al === 'center' ? lx - tw / 2 : al === 'right' ? lx - tw : lx;
                        const y1 = bl === 'bottom' ? ly - th : bl === 'top' ? ly : ly - th / 2;
                        return { x1, x2: x1 + tw, y1, y2: y1 + th };
                    };

                    const overlapsRect = (a, b) =>
                        !(a.x2 < b.x1 - 3 || a.x1 > b.x2 + 3 || a.y2 < b.y1 - 1 || a.y1 > b.y2 + 1);

                    const overlapsCircle = (rect, bx, by, br) => {
                        const nx = Math.max(rect.x1, Math.min(bx, rect.x2));
                        const ny = Math.max(rect.y1, Math.min(by, rect.y2));
                        return Math.hypot(nx - bx, ny - by) < br + 4;
                    };

                    const inBounds = rect =>
                        rect.x1 >= chartArea.left - 4 &&
                        rect.x2 <= chartArea.right + 4 &&
                        rect.y1 >= chartArea.top - 4 &&
                        rect.y2 <= chartArea.bottom + 4;

                    let best = null;
                    let bestScore = -1;
                    for (const cand of candidates) {
                        const rect = toRect(cand.x, cand.y, cand.al, cand.bl);
                        if (!inBounds(rect)) continue;
                        const hitsLabel = placedRects.some(p => overlapsRect(rect, p));
                        const hitsBub = bubblePixels.some((b, bi) => bi !== i && overlapsCircle(rect, b.x, b.y, b.r));
                        const score = (hitsLabel ? 0 : 2) + (hitsBub ? 0 : 1);
                        if (score > bestScore) {
                            bestScore = score;
                            best = { ...cand, rect };
                            if (score === 3) break;
                        }
                    }

                    if (!best || bestScore < 2) return;

                    c.textAlign = best.al;
                    c.textBaseline = best.bl;
                    c.fillStyle = labelColor;
                    c.fillText(label, best.x, best.y);
                    placedRects.push(best.rect);
                });
                c.restore();
            },
        };

        chartInstances.marketLandscape = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Themes',
                        data: bubbleData,
                        backgroundColor: bgColors,
                        borderColor: borderColors,
                        borderWidth: 1.5,
                        hoverRadius: 6,
                    },
                ],
            },
            plugins: [quadrantPlugin, bubbleLabelPlugin],
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
                            title: items => `🎨 ${stripParenthetical(themeLabels[items[0].dataIndex])}`,
                            label: item => {
                                const idx = item.dataIndex;
                                const provCount = (providerCountByTheme[themeLabels[idx]] || new Set()).size;
                                const q =
                                    item.parsed.y >= medY
                                        ? item.parsed.x < medX
                                            ? '💎 Opportunity'
                                            : '🏆 Leader'
                                        : item.parsed.x < medX
                                          ? '🔍 Niche'
                                          : '⚠️ Saturated';
                                return `Games: ${item.parsed.x}  |  Avg Theo: ${item.parsed.y.toFixed(2)}  |  Providers: ${provCount}  |  ${q}`;
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
                            text: 'Avg Theo Win Index',
                            color: chartColors.textColor,
                            font: { size: 10, weight: 'bold' },
                        },
                        ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                        grid: getModernGridConfig(),
                    },
                    x: {
                        type: 'logarithmic',
                        min: 1,
                        title: {
                            display: true,
                            text: 'Game Count (log scale)',
                            color: chartColors.textColor,
                            font: { size: 10, weight: 'bold' },
                        },
                        ticks: {
                            color: chartColors.textColor,
                            font: { size: 10 },
                            padding: 6,
                            callback: val => ([2, 5, 10, 20, 50, 100, 200].includes(val) ? val : ''),
                        },
                        grid: getModernGridConfig(),
                    },
                },
            },
        });
    } catch (err) {
        console.error('[MARKET-LANDSCAPE] FAILED:', err);
    }
}
