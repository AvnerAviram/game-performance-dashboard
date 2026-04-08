// Trends Module - Year-over-year analysis (Chart.js)
import { Chart } from '../ui/chart-setup.js';
import { gameData } from '../lib/data.js';
import { log, warn } from '../lib/env.js';
import { parseFeatures } from '../lib/parse-features.js';
import { safeOnclick } from '../lib/sanitize.js';
import { F } from '../lib/game-fields.js';
import { getProviderMetrics } from '../lib/metrics.js';

function getTheoWin(game) {
    return game.performance_theo_win ?? game.theo_win ?? 0;
}

/**
 * Compute trends data: year -> { avg, games }
 * Only includes years that have games.
 */
export function computeTrendsData() {
    const games = gameData?.allGames ?? [];
    if (games.length === 0) return {};

    const byYear = {};
    for (const g of games) {
        const y = F.originalReleaseYear(g);
        if (!y) continue;
        const yearKey = String(y);
        if (!byYear[yearKey]) byYear[yearKey] = { sum: 0, count: 0 };
        byYear[yearKey].sum += getTheoWin(g);
        byYear[yearKey].count += 1;
    }

    const result = {};
    for (const [year, { sum, count }] of Object.entries(byYear)) {
        result[year] = { avg: count ? sum / count : 0, games: count };
    }
    return result;
}

/**
 * Compute themes trends: top 10 themes by game count, avg theo_win per year.
 * Returns { "ThemeName": [val2021, val2022, ...], ... }
 */
export function computeThemesTrends() {
    const games = gameData?.allGames ?? [];
    if (games.length === 0) return {};

    const themeCounts = {};
    for (const g of games) {
        const t = g.theme_consolidated || 'Unknown';
        themeCounts[t] = (themeCounts[t] ?? 0) + 1;
    }

    const top10 = Object.entries(themeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([t]) => t);

    const years = [...new Set(games.map(g => F.originalReleaseYear(g)).filter(y => y))]
        .sort((a, b) => a - b)
        .map(String);

    const result = {};
    for (const theme of top10) {
        const byYear = {};
        for (const g of games) {
            if ((g.theme_consolidated || 'Unknown') !== theme) continue;
            const y = String(F.originalReleaseYear(g) || '');
            if (!years.includes(y)) continue;
            if (!byYear[y]) byYear[y] = { sum: 0, count: 0 };
            byYear[y].sum += getTheoWin(g);
            byYear[y].count += 1;
        }
        result[theme] = years.map(y => {
            const d = byYear[y];
            return d && d.count > 0 ? d.sum / d.count : 0;
        });
    }
    return result;
}

/**
 * Compute feature trends: top 10 features by adoption count, avg theo_win per year.
 * Returns { "FeatureName": [val2021, val2022, ...], ... }
 */
export function computeFeatureTrends() {
    const games = gameData?.allGames ?? [];
    if (games.length === 0) return {};

    const featureCounts = {};
    for (const g of games) {
        const feats = parseFeatures(g.features);
        for (const f of feats) {
            featureCounts[f] = (featureCounts[f] ?? 0) + 1;
        }
    }

    const top10 = Object.entries(featureCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([f]) => f);

    const years = [...new Set(games.map(g => F.originalReleaseYear(g)).filter(y => y))]
        .sort((a, b) => a - b)
        .map(String);

    const result = {};
    for (const feature of top10) {
        const byYear = {};
        for (const g of games) {
            const feats = parseFeatures(g.features);
            if (!feats.includes(feature)) continue;
            const y = String(F.originalReleaseYear(g) || '');
            if (!years.includes(y)) continue;
            if (!byYear[y]) byYear[y] = { sum: 0, count: 0 };
            byYear[y].sum += getTheoWin(g);
            byYear[y].count += 1;
        }
        result[feature] = years.map(y => {
            const d = byYear[y];
            return d && d.count > 0 ? d.sum / d.count : 0;
        });
    }
    return result;
}

/**
 * Compute provider trends: top 10 providers ranked by GGR Share
 * (same ranking as Providers page and Overview), avg Theo Win per calendar year.
 * Returns { "ProviderName": { "2021": avg, "2022": avg, ... }, ... }
 */
export function computeProviderTrends() {
    const games = gameData?.allGames ?? [];
    if (games.length === 0) return {};

    const ranked = getProviderMetrics(games);
    const top10 = ranked.slice(0, 10).map(p => p.name);

    const result = {};
    for (const prov of top10) {
        const byYear = {};
        for (const g of games) {
            if (F.provider(g) !== prov) continue;
            const y = F.originalReleaseYear(g);
            if (!y) continue;
            const yearKey = String(y);
            if (!byYear[yearKey]) byYear[yearKey] = { sum: 0, count: 0 };
            byYear[yearKey].sum += getTheoWin(g);
            byYear[yearKey].count += 1;
        }
        const yearAvgs = {};
        for (const [year, { sum, count }] of Object.entries(byYear)) {
            yearAvgs[year] = count > 0 ? sum / count : 0;
        }
        result[prov] = yearAvgs;
    }
    return result;
}

/**
 * Get sorted years array from computed trends data.
 */
export function getTrendsYears() {
    const td = computeTrendsData();
    // Only include years with at least 5 games (skip sparse outlier years)
    return Object.keys(td)
        .filter(y => td[y].games >= 5)
        .sort((a, b) => Number(a) - Number(b));
}

const trendChartInstances = {};

// Per-chart state: range filter + optional single-year drill-down
const chartState = {
    overall: { range: 'all', drillYear: null },
    theme: { range: 'all', drillYear: null },
    mechanic: { range: 'all', drillYear: null },
    provider: { range: 'all', drillYear: null },
};

const parseFeaturesSafe = parseFeatures;

const ACT =
    'px-2.5 py-1 rounded-md text-xs font-medium transition-all bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300';
const INACT =
    'px-2.5 py-1 rounded-md text-xs font-medium transition-all bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600';
const _DRILL_ACT =
    'px-2 py-1 rounded-md text-xs font-medium transition-all bg-sky-200 text-sky-800 dark:bg-sky-800 dark:text-sky-200 ring-1 ring-sky-400';
const _DRILL_INACT =
    'px-2 py-1 rounded-md text-xs font-medium transition-all bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50';

function buildZoomButtons(allYears, chartKey, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const st = chartState[chartKey];

    const ranges = [{ key: 'all', label: 'All' }];
    for (let i = 0; i < allYears.length - 1; i += 2) {
        const end = allYears[Math.min(i + 2, allYears.length - 1)];
        ranges.push({ key: `${allYears[i]}-${end}`, label: `${allYears[i]}–${end}` });
    }

    const rangeBtns = ranges
        .map(
            r =>
                `<button onclick="${safeOnclick('window.setChartRange', chartKey, r.key)}" class="${st.range === r.key && !st.drillYear ? ACT : INACT}">${r.label}</button>`
        )
        .join('');

    const backBtn = st.drillYear
        ? `<button onclick="window.drillChartYear('${chartKey}',null)" class="px-2 py-1 rounded-md text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">← Timeline</button>`
        : '';

    const yearOptions = allYears
        .map(y => `<option value="${y}" ${st.drillYear === y ? 'selected' : ''}>${y}</option>`)
        .join('');

    const dropdown = `<select onchange="window.drillChartYear('${chartKey}', this.value || null)" class="px-2 py-1 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer focus:ring-1 focus:ring-sky-400 focus:outline-none"><option value="">Zoom into year…</option>${yearOptions}</select>`;

    container.innerHTML =
        backBtn + rangeBtns + `<span class="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5"></span>` + dropdown;
}

function filterYearsByRange(allYears, range) {
    if (range === 'all') return allYears;
    const [start, end] = range.split('-').map(Number);
    return allYears.filter(y => {
        const n = Number(y);
        return n >= start && n <= end;
    });
}

window.setChartRange = function (chartKey, range) {
    chartState[chartKey].range = range;
    chartState[chartKey].drillYear = null;
    renderTrends();
};

window.drillChartYear = function (chartKey, year) {
    chartState[chartKey].drillYear = year;
    renderTrends();
};

// Build a bar chart for a single-year drill-down on a specific canvas
function renderDrillDownBar(canvasId, year, type, colors, lineColors) {
    const games = gameData?.allGames ?? [];
    const yearGames = games.filter(g => String(F.originalReleaseYear(g)) === String(year));
    if (!yearGames.length) return;

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (trendChartInstances[canvasId]) {
        trendChartInstances[canvasId].destroy();
        trendChartInstances[canvasId] = null;
    }

    let labels, values, barColors, _tooltipTitle;
    if (type === 'overall') {
        // Show top providers by avg theo in this year
        const provMap = {};
        yearGames.forEach(g => {
            const p = F.provider(g);
            if (!provMap[p]) provMap[p] = { sum: 0, count: 0 };
            provMap[p].sum += getTheoWin(g);
            provMap[p].count++;
        });
        const top = Object.entries(provMap)
            .map(([n, d]) => ({ name: n, avg: d.sum / d.count, count: d.count }))
            .filter(p => p.count >= 2)
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 10);
        labels = top.map(t => t.name);
        values = top.map(t => t.avg);
        barColors = lineColors.slice(0, top.length);
        _tooltipTitle = `📈 ${year} — Top Providers`;
    } else if (type === 'theme') {
        const themeMap = {};
        yearGames.forEach(g => {
            const t = g.theme_consolidated || 'Unknown';
            if (!themeMap[t]) themeMap[t] = { sum: 0, count: 0 };
            themeMap[t].sum += getTheoWin(g);
            themeMap[t].count++;
        });
        const top = Object.entries(themeMap)
            .map(([n, d]) => ({ name: n, avg: d.sum / d.count, count: d.count }))
            .filter(t => t.count >= 2)
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 10);
        labels = top.map(t => t.name);
        values = top.map(t => t.avg);
        barColors = lineColors.slice(0, top.length);
        _tooltipTitle = `🎨 ${year} — Theme Performance`;
    } else if (type === 'feature') {
        const featMap = {};
        yearGames.forEach(g => {
            for (const f of parseFeaturesSafe(g.features)) {
                if (!featMap[f]) featMap[f] = { sum: 0, count: 0 };
                featMap[f].sum += getTheoWin(g);
                featMap[f].count++;
            }
        });
        const top = Object.entries(featMap)
            .map(([n, d]) => ({ name: n, avg: d.sum / d.count, count: d.count }))
            .filter(f => f.count >= 2)
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 10);
        labels = top.map(t => t.name);
        values = top.map(t => t.avg);
        barColors = lineColors.slice(0, top.length);
        _tooltipTitle = `⚙️ ${year} — Mechanic Performance`;
    } else if (type === 'provider') {
        const topProviderNames = Object.keys(computeProviderTrends());
        const provMap = {};
        yearGames.forEach(g => {
            const p = F.provider(g);
            if (p === 'Unknown' || !topProviderNames.includes(p)) return;
            if (!provMap[p]) provMap[p] = { sum: 0, count: 0 };
            provMap[p].sum += getTheoWin(g);
            provMap[p].count++;
        });
        const top = Object.entries(provMap)
            .map(([n, d]) => ({ name: n, avg: d.sum / d.count, count: d.count }))
            .filter(p => p.count >= 2)
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 10);
        labels = top.map(t => t.name);
        values = top.map(t => t.avg);
        barColors = lineColors.slice(0, top.length);
        _tooltipTitle = `🏢 ${year} — Provider Performance`;
    }

    if (!labels.length) return;

    const ctx = canvas.getContext('2d');
    trendChartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: `Avg Performance Index (${year})`,
                    data: values,
                    backgroundColor: barColors,
                    borderRadius: 6,
                    borderSkipped: false,
                    barPercentage: 0.7,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: `${year} — Avg Performance Index by ${type === 'theme' ? 'Theme' : type === 'mechanic' ? 'Mechanic' : 'Provider'}`,
                    color: colors.text,
                    font: { size: 13, weight: 'bold' },
                },
                tooltip: {
                    backgroundColor: colors.bg,
                    titleColor: colors.text,
                    bodyColor: colors.text,
                    callbacks: {
                        label: item => `Avg Performance Index: ${item.parsed.x.toFixed(2)}`,
                    },
                },
            },
            scales: {
                x: { grid: { color: colors.grid }, ticks: { color: colors.text, font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { color: colors.text, font: { size: 10 }, autoSkip: false } },
            },
        },
    });
}

function trendLegendConfig(colors) {
    return {
        position: 'bottom',
        labels: { color: colors.text, boxWidth: 12, padding: 16 },
        onClick: (evt, legendItem, legend) => soloDataset(legend.chart, legendItem.datasetIndex),
        onHover: (evt, legendItem, legend) => {
            evt.native.target.style.cursor = 'pointer';
            highlightDataset(legend.chart, legendItem.datasetIndex);
        },
        onLeave: (evt, legendItem, legend) => {
            evt.native.target.style.cursor = 'default';
            highlightDataset(legend.chart, -1);
        },
    };
}

function highlightDataset(chart, activeIdx) {
    chart.data.datasets.forEach((ds, i) => {
        if (activeIdx < 0) {
            ds.borderWidth = ds._origWidth || 2;
            ds.borderColor = ds._origColor || ds.borderColor;
        } else if (i === activeIdx) {
            ds.borderWidth = 4;
        } else {
            ds.borderWidth = 1;
            const c = ds._origColor || ds.borderColor;
            ds.borderColor = typeof c === 'string' && c.startsWith('#') ? c + '40' : c.replace(/[\d.]+\)$/, '0.15)');
        }
    });
    chart.update('none');
    // Restore original colors on unhover
    if (activeIdx < 0) {
        chart.data.datasets.forEach(ds => {
            if (ds._origColor) ds.borderColor = ds._origColor;
        });
        chart.update('none');
    }
}

function soloDataset(chart, idx) {
    const allHidden = chart.data.datasets.every((ds, i) => (i === idx ? !ds.hidden : ds.hidden));
    chart.data.datasets.forEach((ds, i) => {
        if (allHidden) {
            ds.hidden = false;
            ds.borderWidth = ds._origWidth || 2;
            if (ds._origColor) ds.borderColor = ds._origColor;
        } else {
            if (!ds._origColor) {
                ds._origColor = ds.borderColor;
                ds._origWidth = ds.borderWidth;
            }
            ds.hidden = i !== idx;
            if (i === idx) {
                ds.borderWidth = 3;
                ds.borderColor = ds._origColor || ds.borderColor;
            }
        }
    });
    chart.update();
}

function resetDatasets(chart) {
    chart.data.datasets.forEach(ds => {
        ds.hidden = false;
        ds.borderWidth = ds._origWidth || 2;
        if (ds._origColor) ds.borderColor = ds._origColor;
    });
    chart.update();
}

function getThemeColors() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        text: isDark ? '#e2e8f0' : '#1e293b',
        grid: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)',
        bg: isDark ? 'transparent' : '#ffffff',
    };
}

function getLineColors() {
    return [
        '#6366f1',
        '#10b981',
        '#f59e0b',
        '#ef4444',
        '#8b5cf6',
        '#06b6d4',
        '#f97316',
        '#ec4899',
        '#14b8a6',
        '#a855f7',
    ];
}

export function renderTrends() {
    const el = document.getElementById('overall-trend-chart');
    if (!el || el.offsetParent === null || el.offsetWidth === 0) {
        setTimeout(renderTrends, 100);
        return;
    }

    const trendsData = computeTrendsData();
    const allYears = getTrendsYears();

    if (allYears.length === 0) {
        log('No trend data available (gameData.allGames empty or not loaded)');
        return;
    }

    // Build zoom + drill buttons on each chart card (from actual data years)
    buildZoomButtons(allYears, 'overall', 'overall-zoom-btns');
    buildZoomButtons(allYears, 'theme', 'theme-zoom-btns');
    buildZoomButtons(allYears, 'mechanic', 'mechanic-zoom-btns');
    buildZoomButtons(allYears, 'provider', 'provider-trend-zoom');

    const overallYears = filterYearsByRange(allYears, chartState.overall.range);
    const themeYears = filterYearsByRange(allYears, chartState.theme.range);
    const mechanicYears = filterYearsByRange(allYears, chartState.mechanic.range);
    const providerYears = filterYearsByRange(allYears, chartState.provider.range);

    // Hide old detail card if it exists
    const detailCard = document.getElementById('year-detail-card');
    if (detailCard) detailCard.classList.add('hidden');

    // Update overall subtitle & finding
    const subtitle = document.getElementById('overall-trend-subtitle');
    if (subtitle && overallYears.length > 0)
        subtitle.textContent = `${overallYears[0]}–${overallYears[overallYears.length - 1]} average performance index`;

    if (overallYears.length >= 2) {
        const lastY = overallYears[overallYears.length - 1];
        const prevY = overallYears[overallYears.length - 2];
        const lastAvg = trendsData[lastY]?.avg ?? 0;
        const prevAvg = trendsData[prevY]?.avg ?? 0;
        const change = prevAvg > 0 ? ((lastAvg - prevAvg) / prevAvg) * 100 : 0;
        const findingEl = document.getElementById('overall-trend-finding');
        if (findingEl) {
            if (change >= 0) {
                findingEl.innerHTML = `<strong class="text-teal-800 dark:text-teal-200">Major Finding:</strong> <span class="text-teal-700 dark:text-teal-300">${lastY} shows <span class="bg-teal-200 dark:bg-teal-700 px-1.5 py-0.5 rounded font-semibold text-teal-900 dark:text-teal-100">${change.toFixed(0)}% performance increase</span> vs ${prevY}.</span>`;
            } else {
                findingEl.innerHTML = `<strong class="text-amber-800 dark:text-amber-200">Trend Note:</strong> <span class="text-amber-700 dark:text-amber-300">${lastY} shows a <span class="bg-amber-200 dark:bg-amber-700 px-1.5 py-0.5 rounded font-semibold text-amber-900 dark:text-amber-100">${Math.abs(change).toFixed(0)}% decrease</span> vs ${prevY}.</span>`;
            }
        }
    }

    const themesTrends = computeThemesTrends();
    const mechanicsTrends = computeFeatureTrends();
    const providerTrends = computeProviderTrends();
    const colors = getThemeColors();
    const lineColors = getLineColors();

    // Destroy existing charts
    ['overall-trend-chart', 'theme-trend-chart', 'mechanic-trend-chart', 'provider-trend-chart'].forEach(id => {
        if (trendChartInstances[id]) {
            trendChartInstances[id].destroy();
            trendChartInstances[id] = null;
        }
    });

    // 1. Overall performance trend (uses overallYears)
    const overallCanvas = document.getElementById('overall-trend-chart');
    if (overallCanvas && overallYears.length > 0) {
        if (chartState.overall.drillYear) {
            renderDrillDownBar('overall-trend-chart', chartState.overall.drillYear, 'overall', colors, lineColors);
        } else {
            const avgPerf = overallYears.map(y => trendsData[y]?.avg ?? 0);
            const ctx = overallCanvas.getContext('2d');
            trendChartInstances['overall-trend-chart'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: overallYears,
                    datasets: [
                        {
                            label: 'Avg Performance Index',
                            data: avgPerf,
                            borderColor: '#6366f1',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.2,
                            pointRadius: 6,
                            pointHoverRadius: 10,
                        },
                    ],
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
                            borderWidth: 1,
                        },
                    },
                    scales: {
                        x: { grid: { color: colors.grid }, ticks: { color: colors.text, maxRotation: 0 } },
                        y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.text } },
                    },
                },
            });
        }
    }

    // 2. Theme trends (uses themeYears)
    const themeCanvas = document.getElementById('theme-trend-chart');
    if (themeCanvas && themeYears.length > 0) {
        if (chartState.theme.drillYear) {
            renderDrillDownBar('theme-trend-chart', chartState.theme.drillYear, 'theme', colors, lineColors);
        } else if (Object.keys(themesTrends).length > 0) {
            const themeYearIndices = themeYears.map(y => allYears.indexOf(y)).filter(i => i >= 0);
            const themeTraces = Object.entries(themesTrends).map(([name, values], i) => ({
                label: name,
                data: themeYearIndices.map(idx => values[idx] ?? 0),
                borderColor: lineColors[i % lineColors.length],
                _origColor: lineColors[i % lineColors.length],
                _origWidth: 2,
                backgroundColor: 'transparent',
                borderWidth: 2,
                fill: false,
                tension: 0.2,
                pointRadius: 4,
                pointHoverRadius: 8,
            }));

            const ctx = themeCanvas.getContext('2d');
            trendChartInstances['theme-trend-chart'] = new Chart(ctx, {
                type: 'line',
                data: { labels: themeYears, datasets: themeTraces },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 16, right: 24, bottom: 72, left: 56 } },
                    interaction: { mode: 'nearest', intersect: true },
                    onHover: (evt, elements, chart) =>
                        highlightDataset(chart, elements.length ? elements[0].datasetIndex : -1),
                    onClick: (evt, elements, chart) => {
                        if (!elements.length) {
                            resetDatasets(chart);
                            return;
                        }
                        soloDataset(chart, elements[0].datasetIndex);
                    },
                    plugins: {
                        legend: trendLegendConfig(colors),
                        tooltip: {
                            mode: 'nearest',
                            intersect: true,
                            backgroundColor: colors.bg,
                            titleColor: colors.text,
                            bodyColor: colors.text,
                        },
                    },
                    scales: {
                        x: { grid: { color: colors.grid }, ticks: { color: colors.text, maxRotation: 0 } },
                        y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.text } },
                    },
                },
            });
        }
    }

    // 3. Mechanic/feature trends (uses mechanicYears)
    const mechanicCanvas = document.getElementById('mechanic-trend-chart');
    if (mechanicCanvas && mechanicYears.length > 0) {
        if (chartState.mechanic.drillYear) {
            renderDrillDownBar('mechanic-trend-chart', chartState.mechanic.drillYear, 'mechanic', colors, lineColors);
        } else if (Object.keys(mechanicsTrends).length > 0) {
            const mechYearIndices = mechanicYears.map(y => allYears.indexOf(y)).filter(i => i >= 0);
            const mechanicTraces = Object.entries(mechanicsTrends).map(([name, values], i) => ({
                label: name,
                data: mechYearIndices.map(idx => values[idx] ?? 0),
                borderColor: lineColors[i % lineColors.length],
                _origColor: lineColors[i % lineColors.length],
                _origWidth: 2,
                backgroundColor: 'transparent',
                borderWidth: 2,
                fill: false,
                tension: 0.2,
                pointRadius: 4,
                pointHoverRadius: 8,
            }));

            const ctx = mechanicCanvas.getContext('2d');
            trendChartInstances['mechanic-trend-chart'] = new Chart(ctx, {
                type: 'line',
                data: { labels: mechanicYears, datasets: mechanicTraces },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 16, right: 24, bottom: 72, left: 56 } },
                    interaction: { mode: 'nearest', intersect: true },
                    onHover: (evt, elements, chart) =>
                        highlightDataset(chart, elements.length ? elements[0].datasetIndex : -1),
                    onClick: (evt, elements, chart) => {
                        if (!elements.length) {
                            resetDatasets(chart);
                            return;
                        }
                        soloDataset(chart, elements[0].datasetIndex);
                    },
                    plugins: {
                        legend: trendLegendConfig(colors),
                        tooltip: {
                            mode: 'nearest',
                            intersect: true,
                            backgroundColor: colors.bg,
                            titleColor: colors.text,
                            bodyColor: colors.text,
                        },
                    },
                    scales: {
                        x: { grid: { color: colors.grid }, ticks: { color: colors.text, maxRotation: 0 } },
                        y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.text } },
                    },
                },
            });
        }
    }

    // 4. Provider trends (uses providerYears)
    const providerCanvas = document.getElementById('provider-trend-chart');
    if (providerCanvas && providerYears.length > 0) {
        if (chartState.provider.drillYear) {
            renderDrillDownBar('provider-trend-chart', chartState.provider.drillYear, 'provider', colors, lineColors);
        } else if (Object.keys(providerTrends).length > 0) {
            const providerTraces = Object.entries(providerTrends).map(([name, yearMap], i) => ({
                label: name,
                data: providerYears.map(y => yearMap[y] ?? 0),
                borderColor: lineColors[i % lineColors.length],
                _origColor: lineColors[i % lineColors.length],
                _origWidth: 2,
                backgroundColor: 'transparent',
                borderWidth: 2,
                fill: false,
                tension: 0.2,
                pointRadius: 4,
                pointHoverRadius: 8,
            }));

            const ctx = providerCanvas.getContext('2d');
            trendChartInstances['provider-trend-chart'] = new Chart(ctx, {
                type: 'line',
                data: { labels: providerYears, datasets: providerTraces },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 16, right: 24, bottom: 72, left: 56 } },
                    interaction: { mode: 'nearest', intersect: true },
                    onHover: (evt, elements, chart) =>
                        highlightDataset(chart, elements.length ? elements[0].datasetIndex : -1),
                    onClick: (evt, elements, chart) => {
                        if (!elements.length) {
                            resetDatasets(chart);
                            return;
                        }
                        soloDataset(chart, elements[0].datasetIndex);
                    },
                    plugins: {
                        legend: trendLegendConfig(colors),
                        tooltip: {
                            mode: 'nearest',
                            intersect: true,
                            backgroundColor: colors.bg,
                            titleColor: colors.text,
                            bodyColor: colors.text,
                        },
                    },
                    scales: {
                        x: { grid: { color: colors.grid }, ticks: { color: colors.text, maxRotation: 0 } },
                        y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.text } },
                    },
                },
            });
        }
    }

    // Force resize after layout settles (fixes charts in SPA when container had 0 width initially)
    setTimeout(() => {
        ['overall-trend-chart', 'theme-trend-chart', 'mechanic-trend-chart', 'provider-trend-chart'].forEach(id => {
            const inst = trendChartInstances[id];
            if (inst) inst.resize();
        });
    }, 100);

    log('✅ All trend charts rendered (Chart.js)');
}
