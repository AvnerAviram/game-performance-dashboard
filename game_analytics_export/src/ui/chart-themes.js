// Theme, mechanics, games, scatter, and market landscape charts
import { getActiveGames, getActiveThemes, getActiveMechanics } from '../lib/data.js';
import { parseFeatures } from '../lib/parse-features.js';
import { log } from '../lib/env.js';
import {
    generateModernColors,
    getChartColors,
    getModernTooltipConfig,
    stripParenthetical,
    wrapLabel,
    getModernGridConfig,
    createXWarp,
    bubbleScaleOptionsWarped,
    needsLeaderLine,
    snapLabelToBubble,
    injectCoveragePill,
} from './chart-utils.js';
import { chartInstances } from './chart-config.js';
import { F } from '../lib/game-fields.js';
import { saLabelSolver } from '../lib/sa-label-solver.js';
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
    const chartColors = getChartColors();
    const top10 = getActiveThemes().slice(0, 10);

    const allGames = getActiveGames();
    const withTheme = allGames.filter(g => F.themeConsolidated(g) && !/^unknown$/i.test(F.themeConsolidated(g)));

    chartInstances.themes = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(t => stripParenthetical(t.Theme)),
            datasets: [
                {
                    label: 'Performance Index',
                    data: top10.map(t => t['Smart Index']),
                    backgroundColor: generateModernColors(ctx, 10),
                    borderWidth: 0,
                    borderRadius: 6,
                    borderSkipped: false,
                    hoverBackgroundColor: generateModernColors(ctx, 10),
                    barThickness: 18,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 8 } },
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
                            return `Performance Index: ${tooltipItem.parsed.x.toFixed(2)}`;
                        },
                        afterBody: tooltipItems => {
                            const theme = top10[tooltipItems[0].dataIndex];
                            const avgTheoWin = theme['Avg Theo Win Index'] || theme['Avg Theoretical Win'] || 0;
                            return [`Games: ${theme['Game Count']}`, `Avg Performance Index: ${avgTheoWin.toFixed(2)}`];
                        },
                    },
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 4 },
                    grid: getModernGridConfig(),
                },
                y: {
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 11 },
                        padding: 6,
                        autoSkip: false,
                    },
                    grid: { display: false },
                },
            },
        },
    });
    injectCoveragePill('chart-themes', withTheme.length, allGames.length, 'with theme data');
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
    const chartColors = getChartColors();
    const mechanicData = consolidateMechanicsByCanonicalName(getActiveMechanics());
    const mechAllGames = getActiveGames();
    const withFeatures = mechAllGames.filter(g => parseFeatures(g.features).length > 0);

    chartInstances.mechanics = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: mechanicData.map(m => m.Mechanic),
            datasets: [
                {
                    label: 'Games',
                    data: mechanicData.map(m => m['Game Count']),
                    backgroundColor: generateModernColors(ctx, 10),
                    borderWidth: 0,
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: 18,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 8 } },
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
                            return `Games: ${tooltipItem.parsed.x}`;
                        },
                        afterBody: tooltipItems => {
                            const mechanic = mechanicData[tooltipItems[0].dataIndex];
                            const theoWin = mechanic['Avg Theo Win Index'] || mechanic['Avg Theoretical Win'] || 0;
                            return [`Avg Performance Index: ${theoWin.toFixed(2)}`];
                        },
                    },
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 4 },
                    grid: getModernGridConfig(),
                },
                y: {
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 11 },
                        padding: 6,
                        autoSkip: false,
                    },
                    grid: { display: false },
                },
            },
        },
    });
    injectCoveragePill('chart-mechanics', withFeatures.length, mechAllGames.length, 'with mechanics data');
}

export function createGamesChart() {
    const canvas = document.getElementById('chart-games');
    if (!canvas) return;

    if (chartInstances.games) {
        chartInstances.games.destroy();
    }

    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();

    const gamesAll = getActiveGames();
    const withTheo = gamesAll.filter(g => F.theoWin(g) > 0);
    const topGames = [...gamesAll].sort((a, b) => (F.theoWin(b) || 0) - (F.theoWin(a) || 0)).slice(0, 10);

    chartInstances.games = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topGames.map(g => g.name || 'Unknown'),
            datasets: [
                {
                    label: 'Performance Index',
                    data: topGames.map(g => F.theoWin(g) || 0),
                    backgroundColor: generateModernColors(ctx, 10),
                    borderWidth: 0,
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: 18,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 8 } },
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
                        label: item => `Performance Index: ${item.parsed.x.toFixed(2)}`,
                        afterBody: items => {
                            const game = topGames[items[0].dataIndex];
                            return [
                                `Provider: ${F.provider(game)}`,
                                `Theme: ${game?.theme_consolidated || 'N/A'}`,
                                `Ranked by Performance Index among verified games`,
                            ];
                        },
                    },
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 4 },
                    grid: getModernGridConfig(),
                },
                y: {
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 11 },
                        padding: 6,
                        autoSkip: false,
                    },
                    grid: { display: false },
                },
            },
        },
    });
    injectCoveragePill('chart-games', withTheo.length, gamesAll.length, 'with Theo Win data');
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

        const allThemes = getActiveThemes().filter(t => (t['Game Count'] || 0) >= 2);
        log('[SCATTER] filtered themes:', allThemes.length);
        if (!allThemes.length) return;

        const xVals = allThemes.map(t => t['Game Count'] || 0);
        const yVals = allThemes.map(t => t['Avg Theo Win Index'] || 0);
        const xWarp = createXWarp(xVals);
        const rawMedX = [...xVals].sort((a, b) => a - b)[Math.floor(xVals.length / 2)] || 10;
        const medX = xWarp.warpVal(rawMedX);
        const medY = [...yVals].sort((a, b) => a - b)[Math.floor(yVals.length / 2)] || 2;

        const maxCount = Math.max(...xVals, 1);
        const bubbleData = allThemes.map(t => {
            const x = t['Game Count'] || 0;
            const y = t['Avg Theo Win Index'] || 0;
            const r = Math.max(5, Math.min(16, Math.sqrt(x / maxCount) * 14 + 3));
            return { x: xWarp.warpVal(x), y, r };
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
                                const t = allThemes[item.dataIndex];
                                const gc = t ? t['Game Count'] || 0 : Math.round(item.parsed.x);
                                return `Games: ${gc}  |  Avg PI: ${item.parsed.y.toFixed(2)}  |  ${q}`;
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

        const scatterAllGames = getActiveGames();
        const scatterWithTheme = scatterAllGames.filter(
            g => F.themeConsolidated(g) && !/^unknown$/i.test(F.themeConsolidated(g))
        );
        injectCoveragePill('chart-scatter', scatterWithTheme.length, scatterAllGames.length, 'with theme data');

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
        const allThemes = getActiveThemes().filter(t => (t['Game Count'] || 0) >= 2);
        const allGames = getActiveGames();

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
        const rawMedX = [...xVals].sort((a, b) => a - b)[Math.floor(xVals.length / 2)] || 10;
        const medY = [...yVals].sort((a, b) => a - b)[Math.floor(yVals.length / 2)] || 2;

        const maxProv = Math.max(...allThemes.map(t => (providerCountByTheme[t.Theme] || new Set()).size), 1);
        const maxCount = Math.max(...xVals, 1);
        const rMin = 6;
        const rMax = 40;

        const sqrtY = v => Math.sqrt(Math.max(0, v));

        // ── X-axis warp: log10 + piecewise stretch of dense band ──
        const logX = v => Math.log10(Math.max(1, v));
        const logXVals = xVals.map(logX);
        const sortedLogX = [...logXVals].sort((a, b) => a - b);
        const WX_LO = sortedLogX[Math.floor(sortedLogX.length * 0.2)] || 1.0;
        const WX_HI = sortedLogX[Math.floor(sortedLogX.length * 0.8)] || 2.0;
        const WX_K = 2.5;
        const WX_SPAN = (WX_HI - WX_LO) * WX_K;
        const warpX = lv => {
            if (lv <= WX_LO) return lv;
            if (lv <= WX_HI) return WX_LO + (lv - WX_LO) * WX_K;
            return WX_LO + WX_SPAN + (lv - WX_HI);
        };
        const unwarpX = wv => {
            if (wv <= WX_LO) return wv;
            const warpedHi = WX_LO + WX_SPAN;
            if (wv <= warpedHi) return WX_LO + (wv - WX_LO) / WX_K;
            return WX_HI + (wv - warpedHi);
        };
        const medX = warpX(logX(rawMedX));

        // ── Y-axis warp: sqrt + piecewise stretch of dense band (dynamic) ──
        const sqrtYVals = yVals.map(v => Math.sqrt(Math.max(0, v)));
        const sortedSqrtY = [...sqrtYVals].sort((a, b) => a - b);
        const WARP_LO = sortedSqrtY.length ? sortedSqrtY[Math.floor(sortedSqrtY.length * 0.2)] : 0.3;
        const WARP_HI = sortedSqrtY.length ? sortedSqrtY[Math.floor(sortedSqrtY.length * 0.8)] : 0.8;
        const WARP_K = 3.0;
        const WARP_SPAN = (WARP_HI - WARP_LO) * WARP_K;
        const warpY = sv => {
            if (sv <= WARP_LO) return sv;
            if (sv <= WARP_HI) return WARP_LO + (sv - WARP_LO) * WARP_K;
            return WARP_LO + WARP_SPAN + (sv - WARP_HI);
        };
        const unwarpY = wv => {
            if (wv <= WARP_LO) return wv;
            const warpedHi = WARP_LO + WARP_SPAN;
            if (wv <= warpedHi) return WARP_LO + (wv - WARP_LO) / WARP_K;
            return WARP_HI + (wv - warpedHi);
        };

        const sqrtMedY = sqrtY(medY);
        const warpedMedY = warpY(sqrtMedY);

        const quadrantColor = (sy, sx) => {
            if (sy >= warpedMedY && sx < medX) return { bg: 'rgba(16,185,129,', border: 'rgba(16,185,129,' };
            if (sy >= warpedMedY && sx >= medX) return { bg: 'rgba(99,102,241,', border: 'rgba(99,102,241,' };
            if (sy < warpedMedY && sx < medX) return { bg: 'rgba(100,116,139,', border: 'rgba(100,116,139,' };
            return { bg: 'rgba(239,68,68,', border: 'rgba(239,68,68,' };
        };
        const quadrantName = (sy, sx) => {
            if (sy >= warpedMedY) return sx < medX ? '💎 Opportunity' : '🏆 Leader';
            return sx < medX ? '🔍 Niche' : '⚠️ Saturated';
        };

        // ── All themes as individual bubbles ──
        const majorThemes = allThemes.map(t => ({
            name: t.Theme || '',
            count: t['Game Count'] || 0,
            yOrig: t['Avg Theo Win Index'] || 0,
            provCount: (providerCountByTheme[t.Theme] || new Set()).size,
        }));

        // ── Build major bubble data (dataset 0) ──
        const majorData = majorThemes.map(t => ({
            x: warpX(logX(t.count)),
            y: warpY(sqrtY(t.yOrig)),
            r: rMin + Math.sqrt(t.count / maxCount) * (rMax - rMin),
            yOrig: t.yOrig,
        }));
        const majorLabels = majorThemes.map(t => t.name);
        const majorBg = majorData.map(d => quadrantColor(d.y, d.x).bg + '0.45)');
        const majorBorder = majorData.map(d => quadrantColor(d.y, d.x).border + '0.7)');

        const isDarkMode = document.documentElement.classList.contains('dark');

        // ── Quadrant plugin ──
        const quadrantPlugin = {
            id: 'marketLandscapeQuadrants',
            beforeDatasetsDraw(chart) {
                const {
                    ctx: c,
                    chartArea: { left, right, top, bottom },
                    scales: { x: xScale, y: yScale },
                } = chart;
                const mx = xScale.getPixelForValue(medX);
                const my = yScale.getPixelForValue(warpedMedY);
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

        const truncName = (name, max = 18) => (name.length > max ? name.slice(0, max - 1) + '…' : name);

        // ── Label plugin (datasets 0 + 1) ──
        let labelHitBoxes = [];
        let cachedLabels = null;
        let lastPosKey = null;

        const bubbleLabelPlugin = {
            id: 'bubbleLabels',
            afterDatasetsDraw(chart) {
                const { ctx: c, chartArea } = chart;
                c.save();
                const isDark = document.documentElement.classList.contains('dark');
                const labelColor = isDark ? '#94a3b8' : '#64748b';

                const hasActiveHover = chart.getActiveElements().length > 0;
                const meta0 = chart.getDatasetMeta(0);
                const posKey = meta0.data.map(el => `${el.x.toFixed(0)},${el.y.toFixed(0)}`).join('|');
                const positionsChanged = posKey !== lastPosKey;
                const shouldRecalc = !cachedLabels || (!hasActiveHover && positionsChanged);

                if (shouldRecalc) {
                    lastPosKey = posKey;

                    const areaW = chartArea.right - chartArea.left;
                    const areaH = chartArea.bottom - chartArea.top;
                    const fontSize = 10;
                    const fontStr = `600 ${fontSize}px Inter, system-ui, sans-serif`;
                    c.font = fontStr;

                    const labs = [];
                    const ancs = [];
                    const labMeta = [];

                    const meta0 = chart.getDatasetMeta(0);
                    const midX = chartArea.left + areaW / 2;
                    const midY = chartArea.top + areaH / 2;

                    meta0.data.forEach((pt, i) => {
                        const label = truncName(majorLabels[i]);
                        if (!label) return;
                        const pxR = pt.options?.radius ?? majorData[i]?.r ?? 12;
                        const tw = c.measureText(label).width;
                        const th = fontSize + 2;

                        const ang = Math.atan2(pt.y - midY, pt.x - midX);
                        const offX = Math.cos(ang) * (pxR + 8);
                        const offY = Math.sin(ang) * (pxR + 8);
                        let ix = pt.x + offX - tw / 2;
                        let iy = pt.y + offY - th / 2;
                        ix = Math.max(chartArea.left, Math.min(chartArea.right - tw, ix));
                        iy = Math.max(chartArea.top, Math.min(chartArea.bottom - th, iy));

                        labs.push({ x: ix, y: iy, width: tw, height: th });
                        ancs.push({ x: pt.x, y: pt.y, r: pxR });
                        labMeta.push({
                            label,
                            datasetIndex: 0,
                            index: i,
                            leaderColor: majorBorder[i],
                        });
                    });

                    saLabelSolver(labs, ancs, areaW, areaH, chartArea.left, chartArea.top);

                    const hitBoxes = [];
                    const entries = [];
                    const leaderThreshold = 15;

                    for (let k = 0; k < labs.length; k++) {
                        const l = labs[k];
                        const a = ancs[k];
                        const meta = labMeta[k];
                        const dist = Math.hypot(l.x + l.width / 2 - a.x, l.y + l.height / 2 - a.y);
                        const showLeader = needsLeaderLine(dist, leaderThreshold, k, ancs);

                        if (!showLeader && dist > a.r + 6) {
                            snapLabelToBubble(l, a, chartArea);
                        }

                        const rect = { x1: l.x, x2: l.x + l.width, y1: l.y, y2: l.y + l.height };
                        hitBoxes.push({ rect, datasetIndex: meta.datasetIndex, index: meta.index });
                        entries.push({
                            label: meta.label,
                            rect,
                            fs: fontStr,
                            key: `${meta.datasetIndex}:${meta.index}`,
                            dx: l.x + l.width / 2,
                            dy: l.y + l.height / 2,
                            al: 'center',
                            bl: 'middle',
                            leader: showLeader,
                            bx: a.x,
                            by: a.y,
                            br: a.r,
                            leaderColor: meta.leaderColor,
                        });
                    }

                    labelHitBoxes = hitBoxes;
                    cachedLabels = entries;
                }

                // Draw from cache — positions never shift on hover
                const highlightColor = isDark ? '#e2e8f0' : '#1e293b';

                // Pass 1: draw all leader lines behind text (text drawn on top in pass 2)
                cachedLabels.forEach(entry => {
                    if (!entry.leader) return;
                    const isHovered = hoveredLabelKey === entry.key;
                    const r = entry.rect;
                    const nearX = (r.x1 + r.x2) / 2;
                    const nearY = (r.y1 + r.y2) / 2;
                    const lc = isHovered ? highlightColor : entry.leaderColor;
                    c.save();
                    c.strokeStyle = lc;
                    c.lineWidth = 1.5;
                    c.setLineDash([4, 3]);
                    c.beginPath();
                    c.moveTo(entry.bx, entry.by);
                    c.lineTo(nearX, nearY);
                    c.stroke();
                    c.setLineDash([]);
                    c.restore();
                });

                // Pass 2: draw text backgrounds then text on top of lines
                const bgColor = isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.88)';
                cachedLabels.forEach(entry => {
                    const r = entry.rect;
                    c.fillStyle = bgColor;
                    c.fillRect(r.x1 - 2, r.y1 - 1, r.x2 - r.x1 + 4, r.y2 - r.y1 + 2);
                });
                cachedLabels.forEach(entry => {
                    const isHovered = hoveredLabelKey === entry.key;
                    if (isHovered) {
                        const boldFont = entry.fs
                            .replace(/\d+px/, m => Math.min(parseInt(m) + 1, 13) + 'px')
                            .replace(/^(bold|\d{3})\s/, '700 ');
                        c.font = boldFont;
                        c.fillStyle = highlightColor;
                    } else {
                        c.font = entry.fs;
                        c.fillStyle = labelColor;
                    }
                    c.textAlign = entry.al;
                    c.textBaseline = entry.bl;
                    c.fillText(entry.label, entry.dx, entry.dy);
                });

                c.restore();
            },
        };

        // ── Label hover/click helpers ──
        const findLabelHit = (mouseX, mouseY) => {
            const canvasRect = canvas.getBoundingClientRect();
            const cx = mouseX - canvasRect.left;
            const cy = mouseY - canvasRect.top;
            let closest = null;
            let closestDist = Infinity;
            for (const hb of labelHitBoxes) {
                const r = hb.rect;
                const mx = (r.x1 + r.x2) / 2;
                const my = (r.y1 + r.y2) / 2;
                const hw = (r.x2 - r.x1) / 2 + 12;
                const hh = (r.y2 - r.y1) / 2 + 8;
                const dx = Math.max(0, Math.abs(cx - mx) - hw);
                const dy = Math.max(0, Math.abs(cy - my) - hh);
                if (dx === 0 && dy === 0) {
                    const dist = Math.hypot(cx - mx, cy - my);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closest = hb;
                    }
                }
            }
            return closest;
        };

        let labelHoverActive = false;
        let hoveredLabelKey = null;

        const showLabelTooltip = (hit, mouseX, mouseY) => {
            const tip = document.getElementById('label-tooltip');
            const titleEl = document.getElementById('label-tooltip-title');
            const bodyEl = document.getElementById('label-tooltip-body');
            const swatchEl = document.getElementById('label-tooltip-swatch');
            if (!tip || !titleEl || !bodyEl) return;
            if (hit.datasetIndex === 0) {
                const t = majorThemes[hit.index];
                if (!t) return;
                const q = quadrantName(majorData[hit.index].y, majorData[hit.index].x);
                titleEl.textContent = `🎨 ${stripParenthetical(majorLabels[hit.index])}`;
                bodyEl.textContent = `Games: ${t.count}  |  Avg PI: ${t.yOrig.toFixed(2)}  |  Providers: ${t.provCount}  |  ${q}`;
                if (swatchEl) {
                    const color = quadrantColor(majorData[hit.index].y, majorData[hit.index].x);
                    swatchEl.style.backgroundColor = color.bg + '0.6)';
                }
            } else {
                return;
            }
            const container = canvas.parentElement;
            const containerRect = container.getBoundingClientRect();
            tip.classList.remove('hidden');
            const tipW = tip.offsetWidth;
            const tipH = tip.offsetHeight;
            let lx = mouseX - containerRect.left + 14;
            let ly = mouseY - containerRect.top - tipH - 15;
            if (ly < 4) ly = mouseY - containerRect.top + 25;
            if (lx + tipW > containerRect.width - 8) {
                lx = mouseX - containerRect.left - tipW - 14;
            }
            tip.style.left = `${Math.max(4, lx)}px`;
            tip.style.top = `${Math.max(4, ly)}px`;
        };

        const hideLabelTooltip = () => {
            const tip = document.getElementById('label-tooltip');
            if (tip) tip.classList.add('hidden');
        };

        // ── Build chart ──
        chartInstances.marketLandscape = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [
                    {
                        label: 'Themes',
                        data: majorData,
                        backgroundColor: majorBg,
                        borderColor: majorBorder,
                        borderWidth: 1.5,
                        hoverRadius: 6,
                    },
                ],
            },
            plugins: [quadrantPlugin, bubbleLabelPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 },
                onClick: (e, elements) => {
                    const chart = chartInstances.marketLandscape;
                    if (!chart) return;
                    if (!elements.length) return;
                    const el = elements[0];
                    if (el.datasetIndex === 0 && window.showThemeDetails) {
                        const name = majorLabels[el.index];
                        if (name) window.showThemeDetails(name);
                    }
                },
                onHover: (e, elements) => {
                    const chart = chartInstances.marketLandscape;
                    if (!chart) return;
                    const native = e.native;

                    // Bubble hover — show HTML tooltip following cursor
                    if (elements.length && native) {
                        const el = elements[0];
                        if (el.datasetIndex === 0) {
                            showLabelTooltip({ datasetIndex: 0, index: el.index }, native.clientX, native.clientY);
                            labelHoverActive = true;
                        }
                        const newKey = `${el.datasetIndex}:${el.index}`;
                        if (hoveredLabelKey !== newKey) {
                            hoveredLabelKey = newKey;
                            chart.draw();
                        }
                        native.target.style.cursor = 'pointer';
                        return;
                    }

                    // Label hover — show same HTML tooltip following cursor
                    if (native) {
                        const hit = findLabelHit(native.clientX, native.clientY);
                        if (hit) {
                            native.target.style.cursor = 'pointer';
                            showLabelTooltip(hit, native.clientX, native.clientY);
                            const newKey = `${hit.datasetIndex}:${hit.index}`;
                            if (hoveredLabelKey !== newKey) {
                                hoveredLabelKey = newKey;
                            }
                            chart.setActiveElements([{ datasetIndex: hit.datasetIndex, index: hit.index }]);
                            chart.draw();
                            labelHoverActive = true;
                            return;
                        }
                    }

                    // Nothing hovered — clear
                    if (labelHoverActive || hoveredLabelKey) {
                        labelHoverActive = false;
                        hoveredLabelKey = null;
                        hideLabelTooltip();
                        chart.setActiveElements([]);
                        chart.draw();
                    }
                    native.target.style.cursor = 'default';
                },
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                },
                scales: {
                    y: {
                        min: 0,
                        grace: '10%',
                        title: {
                            display: true,
                            text: 'Avg Performance Index',
                            color: chartColors.textColor,
                            font: { size: 10, weight: 'bold' },
                        },
                        afterBuildTicks(axis) {
                            const nice = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3];
                            axis.ticks = nice
                                .map(v => warpY(Math.sqrt(v)))
                                .filter(wv => wv <= (axis.max || 2))
                                .map(v => ({ value: v }));
                        },
                        ticks: {
                            color: chartColors.textColor,
                            font: { size: 10 },
                            padding: 6,
                            callback: val => {
                                const sv = unwarpY(val);
                                const orig = sv * sv;
                                if (orig === 0) return '0';
                                return orig < 1 ? orig.toFixed(2) : orig.toFixed(1);
                            },
                        },
                        grid: getModernGridConfig(),
                    },
                    x: {
                        type: 'linear',
                        min: 0,
                        title: {
                            display: true,
                            text: 'Game Count',
                            color: chartColors.textColor,
                            font: { size: 10, weight: 'bold' },
                        },
                        afterBuildTicks(axis) {
                            const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500];
                            axis.ticks = nice
                                .map(v => warpX(logX(v)))
                                .filter(wv => wv >= 0 && wv <= (axis.max || 5))
                                .map(v => ({ value: v }));
                        },
                        ticks: {
                            color: chartColors.textColor,
                            font: { size: 10 },
                            padding: 6,
                            callback: val => {
                                const lv = unwarpX(val);
                                const orig = Math.round(Math.pow(10, lv));
                                const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500];
                                const closest = nice.reduce((a, b) =>
                                    Math.abs(b - orig) < Math.abs(a - orig) ? b : a
                                );
                                return closest.toLocaleString();
                            },
                        },
                        grid: getModernGridConfig(),
                    },
                },
            },
        });
        canvas.addEventListener('click', e => {
            const chart = chartInstances.marketLandscape;
            if (!chart) return;
            const hit = findLabelHit(e.clientX, e.clientY);
            if (hit && hit.datasetIndex === 0 && window.showThemeDetails) {
                const name = majorLabels[hit.index];
                if (name) window.showThemeDetails(name);
            }
            if (hit && hit.datasetIndex === 1) {
                showClusterPanel(chart);
            }
        });

        const mlWithTheme = allGames.filter(g => F.themeConsolidated(g) && !/^unknown$/i.test(F.themeConsolidated(g)));
        injectCoveragePill('chart-market-landscape', mlWithTheme.length, allGames.length, 'with theme data');
    } catch (err) {
        console.error('[MARKET-LANDSCAPE] FAILED:', err);
    }
}
