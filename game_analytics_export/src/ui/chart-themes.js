// Theme, mechanics, games, scatter, and market landscape charts
import { Chart } from './chart-setup.js';
import { getActiveGames, getActiveThemes, getActiveMechanics } from '../lib/data.js';
import { parseFeatures } from '../lib/parse-features.js';
import { calculateSmartIndex } from '../lib/metrics.js';
import { log } from '../lib/env.js';
import {
    generateModernColors,
    getChartColors,
    getModernTooltipConfig,
    stripParenthetical,
    wrapLabel,
    getModernGridConfig,
    quadrantLabel,
    median,
    createBubbleLandscape,
    injectCoveragePill,
} from './chart-utils.js';
import { chartInstances } from './chart-config.js';
import { F } from '../lib/game-fields.js';
import { getDefaultSort, getRankingMode } from '../lib/filters.js';
import { MIN_QUALIFIED_GAMES } from '../lib/shared-config.js';
export function createThemesChart() {
    const canvas = document.getElementById('chart-themes');
    if (!canvas) {
        console.error('❌ Themes chart canvas NOT FOUND');
        return;
    }

    if (chartInstances.themes) {
        chartInstances.themes.destroy();
    }
    Chart.getChart(canvas)?.destroy();

    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();
    const isGrossing = getRankingMode() === 'grossing';
    const top10 = [...getActiveThemes()].sort(getDefaultSort()).slice(0, 10);
    const metricKey = isGrossing ? 'Market Share %' : 'Avg Theo Win Index';
    const metricLabel = isGrossing ? 'Market Share' : 'Avg Theo Win Index';
    const secondaryKey = isGrossing ? 'Avg Theo Win Index' : 'Market Share %';
    const secondaryLabel = isGrossing ? 'Performance Index' : 'Market Share';

    const allGames = getActiveGames();
    const withTheme = allGames.filter(g => F.themeConsolidated(g) && !/^unknown$/i.test(F.themeConsolidated(g)));

    chartInstances.themes = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(t => stripParenthetical(t.Theme)),
            datasets: [
                {
                    label: metricKey,
                    data: top10.map(t => t[metricKey] || 0),
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
                if (window.xrayActive) return;
                if (elements.length && window.showThemeDetails) {
                    const idx = elements[0].index;
                    const theme = top10[idx]?.Theme;
                    if (theme) window.showThemeDetails(theme);
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: true,
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: tooltipItems => {
                            if (!tooltipItems?.length) return '';
                            return `🎨 ${stripParenthetical(top10[tooltipItems[0].dataIndex]?.Theme || '')}`;
                        },
                        label: tooltipItem => {
                            if (!tooltipItem) return '';
                            const val = tooltipItem.parsed.x.toFixed(2);
                            return isGrossing ? `${metricLabel}: ${val}%` : `${metricLabel}: ${val}`;
                        },
                        afterBody: tooltipItems => {
                            if (!tooltipItems?.length) return [];
                            const theme = top10[tooltipItems[0].dataIndex];
                            if (!theme) return [];
                            const secVal = theme[secondaryKey] || theme['Smart Index'] || theme.performanceIndex || 0;
                            const secFmt = isGrossing ? secVal.toFixed(2) : `${secVal.toFixed(2)}%`;
                            return [`Games: ${theme['Game Count']}`, `${secondaryLabel}: ${secFmt}`];
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
            byCanonical[canonical] = { Mechanic: canonical, 'Game Count': 0, totalTheoWin: 0, 'Market Share %': 0 };
        }
        const gc = m['Game Count'] || 0;
        byCanonical[canonical]['Game Count'] += gc;
        byCanonical[canonical]['Market Share %'] += m['Market Share %'] || 0;
        byCanonical[canonical].totalTheoWin += (m['Avg Theo Win Index'] || m.avg_theo_win || 0) * gc;
    });
    const rows = Object.values(byCanonical).map(m => ({
        ...m,
        'Avg Theo Win Index': m['Game Count'] > 0 ? m.totalTheoWin / m['Game Count'] : 0,
    }));
    const globalAvg = rows.reduce((s, r) => s + (r['Avg Theo Win Index'] || 0), 0) / (rows.length || 1);
    return rows
        .map(m => ({
            ...m,
            'Smart Index': calculateSmartIndex(m['Avg Theo Win Index'], m['Game Count'], globalAvg),
            qualified: (m['Game Count'] || 0) >= MIN_QUALIFIED_GAMES,
        }))
        .sort(getDefaultSort())
        .slice(0, 10);
}

export function createMechanicsChart() {
    const canvas = document.getElementById('chart-mechanics');
    if (!canvas) return;

    if (chartInstances.mechanics) {
        chartInstances.mechanics.destroy();
    }
    Chart.getChart(canvas)?.destroy();

    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();
    const isGrossing = getRankingMode() === 'grossing';
    const mechanicData = consolidateMechanicsByCanonicalName(getActiveMechanics());
    const mechMetricKey = isGrossing ? 'Market Share %' : 'Avg Theo Win Index';
    const mechMetricLabel = isGrossing ? 'Market Share' : 'Avg Theo Win Index';
    const mechSecondaryKey = isGrossing ? 'Avg Theo Win Index' : 'Market Share %';
    const mechSecondaryLabel = isGrossing ? 'Performance Index' : 'Market Share';
    const mechAllGames = getActiveGames();
    const withFeatures = mechAllGames.filter(g => parseFeatures(g.features).length > 0);

    chartInstances.mechanics = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: mechanicData.map(m => m.Mechanic),
            datasets: [
                {
                    label: mechMetricKey,
                    data: mechanicData.map(m => m[mechMetricKey] || 0),
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
                if (window.xrayActive) return;
                if (elements.length && window.showMechanicDetails) {
                    const idx = elements[0].index;
                    const mechanic = mechanicData[idx]?.Mechanic;
                    if (mechanic) window.showMechanicDetails(mechanic);
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: true,
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: tooltipItems => {
                            if (!tooltipItems?.length) return '';
                            return `⚙️ ${mechanicData[tooltipItems[0].dataIndex]?.Mechanic || ''}`;
                        },
                        label: tooltipItem => {
                            if (!tooltipItem) return '';
                            const val = tooltipItem.parsed.x.toFixed(2);
                            return isGrossing ? `${mechMetricLabel}: ${val}%` : `${mechMetricLabel}: ${val}`;
                        },
                        afterBody: tooltipItems => {
                            if (!tooltipItems?.length) return [];
                            const mechanic = mechanicData[tooltipItems[0].dataIndex];
                            if (!mechanic) return [];
                            const secVal = mechanic[mechSecondaryKey] || mechanic['Smart Index'] || 0;
                            const secFmt = isGrossing ? secVal.toFixed(2) : `${secVal.toFixed(2)}%`;
                            return [`Games: ${mechanic['Game Count']}`, `${mechSecondaryLabel}: ${secFmt}`];
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
    Chart.getChart(canvas)?.destroy();

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
                if (window.xrayActive) return;
                if (elements.length && window.showGameDetails) {
                    const game = topGames[elements[0].index];
                    if (game?.name) window.showGameDetails(game.name);
                }
            },
            onHover: (e, elements) => {
                e.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            },
            interaction: { mode: 'nearest', intersect: true },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: items => {
                            if (!items?.length) return '';
                            return `🎮 ${topGames[items[0].dataIndex]?.name || ''}`;
                        },
                        label: item => {
                            if (!item) return '';
                            return `Performance Index: ${item.parsed.x.toFixed(2)}`;
                        },
                        afterBody: items => {
                            if (!items?.length) return [];
                            const game = topGames[items[0].dataIndex];
                            if (!game) return [];
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
    try {
        const allThemes = [...getActiveThemes()].filter(t => (t['Game Count'] || 0) >= 2).sort(getDefaultSort());
        log('[SCATTER] filtered themes:', allThemes.length);
        if (!allThemes.length) return;

        const medX = median(allThemes.map(t => t['Game Count'] || 0));
        const medY = median(allThemes.map(t => t['Avg Theo Win Index'] || 0));

        const majors = allThemes.slice(0, 12);
        const maxCount = Math.max(...allThemes.map(t => t['Game Count'] || 0), 1);

        const data = majors.map(t => {
            const full = stripParenthetical(t.Theme || '');
            return {
                name: full,
                shortName: full.includes('/') ? full.split('/')[0].trim() : full,
                x: t['Game Count'] || 0,
                y: t['Avg Theo Win Index'] || 0,
                r: 6 + Math.sqrt((t['Game Count'] || 0) / maxCount) * 34,
                _theme: t,
            };
        });

        const allGames = getActiveGames();
        const withTheme = allGames.filter(g => F.theoWin(g) > 0);

        createBubbleLandscape('chart-scatter', {
            data,
            instanceKey: 'scatter',
            instanceRegistry: chartInstances,
            labels: 'top',
            maxLabels: 4,
            quadrantLabels: false,
            labelPosition: 'below',
            medianX: medX,
            medianY: medY,
            tooltipFn: item => {
                const t = item._theme;
                const q = quadrantLabel(t['Game Count'] || 0, t['Avg Theo Win Index'] || 0, medX, medY);
                return [
                    `Games: ${t['Game Count'] || 0}  |  Avg PI: ${(t['Avg Theo Win Index'] || 0).toFixed(2)}  |  ${q}`,
                ];
            },
            onBubbleClick: item => {
                if (item._theme?.Theme && window.showThemeDetails) window.showThemeDetails(item._theme.Theme);
            },
        });

        injectCoveragePill('chart-scatter', withTheme.length, allGames.length, 'with performance data');
        log('[SCATTER] chart created:', !!chartInstances.scatter);
    } catch (err) {
        console.error('[SCATTER] FAILED:', err);
    }
}

export function createMarketLandscapeChart(providerFilter) {
    try {
        const allGamesRaw = getActiveGames();
        const allGames = providerFilter ? allGamesRaw.filter(g => F.provider(g) === providerFilter) : allGamesRaw;

        let allThemes;
        if (providerFilter) {
            const themeAgg = {};
            for (const g of allGames) {
                const t = F.themeConsolidated(g);
                if (!t || /^unknown$/i.test(t)) continue;
                if (!themeAgg[t]) themeAgg[t] = { count: 0, theoSum: 0, mktSum: 0 };
                themeAgg[t].count++;
                themeAgg[t].theoSum += F.theoWin(g);
                themeAgg[t].mktSum += F.marketShare(g);
            }
            allThemes = Object.entries(themeAgg)
                .filter(([, s]) => s.count >= 2)
                .map(([theme, s]) => ({
                    Theme: theme,
                    'Game Count': s.count,
                    'Avg Theo Win Index': s.theoSum / s.count,
                    'Market Share %': s.mktSum,
                }));
        } else {
            allThemes = getActiveThemes().filter(t => (t['Game Count'] || 0) >= 2);
        }
        if (!allThemes.length) return;

        const maxCount = Math.max(...allThemes.map(t => t['Game Count'] || 0), 1);
        const medX = median(allThemes.map(t => t['Game Count'] || 0));
        const medY = median(allThemes.map(t => t['Avg Theo Win Index'] || 0));

        const data = allThemes.map(t => {
            const full = stripParenthetical(t.Theme || '');
            return {
                name: full,
                shortName: full.includes('/') ? full.split('/')[0].trim() : full,
                x: t['Game Count'] || 0,
                y: t['Avg Theo Win Index'] || 0,
                r: 6 + Math.sqrt((t['Game Count'] || 0) / maxCount) * 34,
                _theme: t,
            };
        });

        const mlWithTheme = allGames.filter(g => F.themeConsolidated(g) && !/^unknown$/i.test(F.themeConsolidated(g)));

        createBubbleLandscape('chart-market-landscape', {
            data,
            instanceKey: 'marketLandscape',
            instanceRegistry: chartInstances,
            xLabel: 'Game Count',
            labels: 'all',
            medianX: medX,
            medianY: medY,
            tooltipFn: item => {
                const t = item._theme;
                const q = quadrantLabel(t['Game Count'] || 0, t['Avg Theo Win Index'] || 0, medX, medY);
                return [
                    `Games: ${t['Game Count'] || 0}  |  Avg PI: ${(t['Avg Theo Win Index'] || 0).toFixed(2)}  |  ${q}`,
                ];
            },
            onBubbleClick: item => {
                if (item._theme?.Theme && window.showThemeDetails) window.showThemeDetails(item._theme.Theme);
            },
            coveragePill: { covered: mlWithTheme.length, total: allGames.length, label: 'with theme data' },
        });
    } catch (err) {
        console.error('[MARKET-LANDSCAPE] FAILED:', err);
    }
}
