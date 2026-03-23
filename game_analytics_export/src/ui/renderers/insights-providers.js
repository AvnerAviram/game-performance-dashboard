/**
 * Provider × theme matrix and performance outlier lists.
 */
import { gameData } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { log } from '../../lib/env.js';
import { parseFeatsLocal } from './overview-renderer.js';
import { getProviderMetrics } from '../../lib/metrics.js';
import { F } from '../../lib/game-fields.js';

export function renderPerformanceOutliers() {
    const container = document.getElementById('outliers-container');
    if (!container) return;

    const top = (gameData.top_anomalies || []).slice(0, 15);
    const bottom = (gameData.bottom_anomalies || []).slice(0, 15);
    const allGames = gameData.allGames || [];
    if (!top.length && !bottom.length) {
        container.innerHTML = '<p class="text-xs text-gray-400">No data</p>';
        return;
    }

    const resolve = a => allGames.find(g => g.name === a.game) || a;

    function analyzeGroup(group) {
        const games = group.map(resolve);
        const features = {};
        const themes = {};
        const layouts = {};
        const volatilities = {};
        const providers = {};
        const yearTheos = {};
        let totalTheo = 0;
        games.forEach(g => {
            totalTheo += F.theoWin(g);
            const t = F.themeConsolidated(g);
            if (t && t !== 'Unknown') themes[t] = (themes[t] || 0) + 1;
            const vol = F.volatility(g);
            if (vol) volatilities[vol] = (volatilities[vol] || 0) + 1;
            const r = g.specs_reels || g.reels;
            const rw = g.specs_rows || g.rows;
            if (r && rw) {
                const l = `${r}x${rw}`;
                layouts[l] = (layouts[l] || 0) + 1;
            }
            parseFeatsLocal(g.features).forEach(f => {
                features[f] = (features[f] || 0) + 1;
            });
            const p = F.provider(g);
            if (p) providers[p] = (providers[p] || 0) + 1;
            const yr = g.release_year || 0;
            if (yr > 2000) {
                if (!yearTheos[yr]) yearTheos[yr] = { sum: 0, count: 0 };
                yearTheos[yr].sum += F.theoWin(g);
                yearTheos[yr].count++;
            }
        });
        const n = games.length || 1;
        const sortedFeats = Object.entries(features)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        const sortedThemes = Object.entries(themes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
        const sortedLayouts = Object.entries(layouts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        const sortedVol = Object.entries(volatilities).sort((a, b) => b[1] - a[1]);
        const topVol = sortedVol[0];
        const sortedProviders = Object.entries(providers)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        const peakYear = Object.entries(yearTheos).sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count)[0];
        const themeConc = sortedThemes.length > 0 ? (sortedThemes[0][1] / n) * 100 : 0;
        return {
            n,
            avgTheo: totalTheo / n,
            sortedFeats,
            sortedThemes,
            sortedLayouts,
            topVol,
            sortedProviders,
            peakYear,
            themeConc,
        };
    }

    const topStats = analyzeGroup(top);
    const bottomStats = analyzeGroup(bottom);

    function patternBadge(label, pct, accent) {
        const w = Math.max(12, Math.min(100, pct));
        return `<div class="flex items-center gap-2 mb-1.5">
            <span class="text-xs text-gray-700 dark:text-gray-300 w-28 shrink-0 truncate font-medium">${escapeHtml(label)}</span>
            <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div class="h-full rounded-full ${accent}" style="width:${w}%"></div>
            </div>
            <span class="text-xs font-semibold text-gray-500 w-10 text-right">${Math.round(pct)}%</span>
        </div>`;
    }

    function patternSection(stats, label, accentBar, accentBorder) {
        let html = `<div class="space-y-3">
            <div class="flex items-center gap-2 mb-3">
                <div class="w-3 h-3 rounded-full ${accentBorder} ${accentBar}"></div>
                <span class="text-sm font-bold text-gray-900 dark:text-white">${label}</span>
                <span class="text-xs text-gray-400">${stats.n} games · ${stats.avgTheo.toFixed(1)} avg theo</span>
            </div>`;
        html += '<div class="pl-5 space-y-3">';
        if (stats.topVol) {
            const volPct = (stats.topVol[1] / stats.n) * 100;
            html += `<div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-3 mb-1.5">Volatility</div>`;
            html += patternBadge(stats.topVol[0], volPct, accentBar);
        }
        if (stats.sortedLayouts.length) {
            html += `<div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-3 mb-1.5">Dominant Layouts</div>`;
            stats.sortedLayouts.forEach(([l, c]) => {
                html += patternBadge(l, (c / stats.n) * 100, accentBar);
            });
        }
        if (stats.sortedThemes.length) {
            html += `<div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-3 mb-1.5">Theme Clusters${stats.themeConc >= 40 ? ` <span class="normal-case font-normal text-gray-400 dark:text-gray-500">(${Math.round(stats.themeConc)}% concentrated in ${escapeHtml(stats.sortedThemes[0][0])})</span>` : ''}</div>`;
            html += `<div class="flex flex-wrap gap-1.5">`;
            stats.sortedThemes.forEach(([t, c]) => {
                html += `<span class="px-2 py-1 text-[10px] rounded-full border ${accentBorder} text-gray-700 dark:text-gray-300 font-medium">${escapeHtml(t)} (${c})</span>`;
            });
            html += '</div>';
        }
        if (stats.sortedProviders && stats.sortedProviders.length) {
            html += `<div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-3 mb-1.5">Top Providers</div>`;
            stats.sortedProviders.forEach(([p, c]) => {
                html += patternBadge(p, (c / stats.n) * 100, accentBar);
            });
        }
        if (stats.peakYear) {
            const yr = stats.peakYear[0];
            const avg = (stats.peakYear[1].sum / stats.peakYear[1].count).toFixed(1);
            html += `<div class="mt-3 text-[10px] text-gray-500 dark:text-gray-400">Peak year: <strong class="text-gray-700 dark:text-gray-200">${yr}</strong> (${avg} avg theo, ${stats.peakYear[1].count} games)</div>`;
        }
        html += '</div></div>';
        return html;
    }

    let takeaways =
        '<div class="mt-5 p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700">';
    takeaways +=
        '<div class="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-2">Key Takeaways for Designers</div>';
    takeaways += '<ul class="space-y-2 text-xs text-gray-700 dark:text-gray-300">';
    if (topStats.topVol && bottomStats.topVol && topStats.topVol[0] !== bottomStats.topVol[0]) {
        takeaways += `<li class="flex items-start gap-1.5"><span class="text-indigo-500 mt-0.5 shrink-0">◆</span> Top performers favor <strong>${escapeHtml(topStats.topVol[0])}</strong> volatility vs <strong>${escapeHtml(bottomStats.topVol[0])}</strong> in underperformers</li>`;
    }
    const theoGap = topStats.avgTheo - bottomStats.avgTheo;
    takeaways += `<li class="flex items-start gap-1.5"><span class="text-indigo-500 mt-0.5 shrink-0">◆</span> Theo Win gap: <strong>${theoGap.toFixed(1)}</strong> between top and bottom performers</li>`;
    if (topStats.themeConc >= 40 && topStats.sortedThemes.length) {
        takeaways += `<li class="flex items-start gap-1.5"><span class="text-emerald-500 mt-0.5 shrink-0">▲</span> Theme concentration: <strong>${Math.round(topStats.themeConc)}%</strong> of top performers are in <strong>${escapeHtml(topStats.sortedThemes[0][0])}</strong></li>`;
    } else if (topStats.sortedThemes.length >= 3) {
        takeaways += `<li class="flex items-start gap-1.5"><span class="text-indigo-500 mt-0.5 shrink-0">◆</span> Top performers span diverse themes — no single theme dominates</li>`;
    }
    if (topStats.peakYear && bottomStats.peakYear && topStats.peakYear[0] !== bottomStats.peakYear[0]) {
        takeaways += `<li class="flex items-start gap-1.5"><span class="text-indigo-500 mt-0.5 shrink-0">◆</span> Top performers peak in <strong>${topStats.peakYear[0]}</strong> vs underperformers in <strong>${bottomStats.peakYear[0]}</strong></li>`;
    }
    takeaways += '</ul></div>';

    function renderGameList(group, type) {
        const isTop = type === 'top';
        const accentColor = isTop ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
        const label = isTop ? 'Top Performers' : 'Underperformers';
        const listId = `outlier-list-${type}`;
        return `
        <div class="mt-5">
            <button class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${accentColor} cursor-pointer hover:opacity-80 mb-2"
                    onclick="document.getElementById('${listId}').classList.toggle('hidden')">
                <svg class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                ${label} (${group.length} games)
            </button>
            <div id="${listId}" class="mt-2 grid grid-cols-1 gap-1.5">
                ${group
                    .map(a => {
                        const g = resolve(a);
                        const provider = F.provider(g);
                        const feats = parseFeatsLocal(g.features).slice(0, 3);
                        const vol = F.volatility(g);
                        const layout =
                            (g.specs_reels || g.reels) && (g.specs_rows || g.rows)
                                ? `${g.specs_reels || g.reels}x${g.specs_rows || g.rows}`
                                : '';
                        return `
                    <div class="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                         onclick="${safeOnclick('window.showGameDetails', a.game || '')}">
                        <div class="min-w-0 flex-1">
                            <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(a.game)}</div>
                            <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                                ${provider ? `<span class="text-[10px] text-gray-400">${escapeHtml(provider)}</span>` : ''}
                                ${layout ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"><span class="text-gray-400">Grid</span> ${layout}</span>` : ''}
                                ${vol ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"><span class="text-gray-400">Vol</span> ${escapeHtml(vol)}</span>` : ''}
                                ${feats.length ? `<span class="text-[10px] text-gray-400 ml-0.5">Features:</span>` : ''}
                                ${feats.map(f => `<span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 font-medium">${escapeHtml(f)}</span>`).join('')}
                            </div>
                        </div>
                        <span class="text-sm font-bold ${accentColor} shrink-0 text-right" title="Theo Win Index — market performance score">
                            ${(a.theo_win_index || 0).toFixed(1)}
                            <span class="block text-[8px] font-normal text-gray-400">Theo Win</span>
                        </span>
                    </div>`;
                    })
                    .join('')}
            </div>
        </div>`;
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${patternSection(topStats, 'Winner DNA', 'bg-emerald-500', 'border-emerald-300 dark:border-emerald-600')}
            ${patternSection(bottomStats, 'Underperformer DNA', 'bg-red-400', 'border-red-300 dark:border-red-600')}
        </div>
        ${takeaways}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${renderGameList(top, 'top')}
            ${renderGameList(bottom, 'bottom')}
        </div>`;
    log('  ✅ Performance outliers generated');
}

export function generateProviderThemeMatrix() {
    const container = document.getElementById('provider-theme-matrix');
    if (!container) return;

    const allGames = gameData.allGames || [];
    if (!allGames.length) {
        container.innerHTML = '<p class="text-sm text-gray-500">No data</p>';
        return;
    }

    const rankedProviders = getProviderMetrics(allGames).slice(0, 10);
    const topProviders = rankedProviders.map(p => {
        const themes = {};
        allGames
            .filter(g => F.provider(g) === p.name)
            .forEach(g => {
                const theme = g.theme_consolidated || g.theme_primary || '';
                if (!theme) return;
                if (!themes[theme]) themes[theme] = { count: 0, totalTheo: 0 };
                themes[theme].count++;
                themes[theme].totalTheo += g.performance_theo_win || 0;
            });
        return [p.name, { total: p.count, totalTheo: p.totalTheo, totalMkt: p.totalMkt, themes }];
    });

    const globalAvgTheo = allGames.reduce((s, g) => s + F.theoWin(g), 0) / (allGames.length || 1);
    const maxGames = Math.max(...rankedProviders.map(p => p.count), 1);

    let html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">';
    topProviders.forEach(([prov, data]) => {
        const avgTheo = data.totalTheo / data.total;
        const bestTheme = Object.entries(data.themes).sort((a, b) => {
            const aAvg = a[1].totalTheo / a[1].count;
            const bAvg = b[1].totalTheo / b[1].count;
            if (b[1].count !== a[1].count && Math.min(a[1].count, b[1].count) < 2) return b[1].count - a[1].count;
            return bAvg - aAvg;
        })[0];
        const bestThemeName = bestTheme ? bestTheme[0] : 'N/A';
        const bestTheoAvg = bestTheme ? bestTheme[1].totalTheo / bestTheme[1].count : 0;
        const bestThemeCount = bestTheme ? bestTheme[1].count : 0;
        const themeCount = Object.keys(data.themes).length;

        const provGames = allGames.filter(g => F.provider(g) === prov);
        let totalMarketShare = 0;
        let bestGameName = '';
        let bestGameTheo = -1;
        const featureSet = new Set();
        let recentTheo = 0;
        let recentCount = 0;
        let olderTheo = 0;
        let olderCount = 0;
        const years = provGames.map(g => g.release_year).filter(y => y != null && y > 1900);
        const maxY = years.length ? Math.max(...years) : new Date().getFullYear();
        const recentThresh = maxY - 2;
        const olderThresh = maxY - 5;

        const featureCounts = {};
        const layoutCounts = {};
        provGames.forEach(g => {
            totalMarketShare += g.performance_market_share_percent || 0;
            const theo = g.performance_theo_win || 0;
            if (theo > bestGameTheo) {
                bestGameTheo = theo;
                bestGameName = g.name || '';
            }
            parseFeatsLocal(g.features).forEach(f => {
                featureSet.add(f);
                featureCounts[f] = (featureCounts[f] || 0) + 1;
            });
            const r = g.specs_reels || g.reels;
            const rw = g.specs_rows || g.rows;
            if (r && rw) {
                const l = `${r}x${rw}`;
                layoutCounts[l] = (layoutCounts[l] || 0) + 1;
            }
            const y = g.release_year;
            if (y != null && y >= recentThresh) {
                recentTheo += theo;
                recentCount++;
            }
            if (y != null && y <= olderThresh) {
                olderTheo += theo;
                olderCount++;
            }
        });
        const topFeats = Object.entries(featureCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        const domLayout = Object.entries(layoutCounts).sort((a, b) => b[1] - a[1])[0];

        const avgRecent = recentCount ? recentTheo / recentCount : 0;
        const avgOlder = olderCount ? olderTheo / olderCount : 0;
        let trendIcon = '';
        let trendText = '';
        if (recentCount >= 5 && olderCount >= 5 && avgOlder > 0) {
            const pct = ((avgRecent - avgOlder) / avgOlder) * 100;
            if (Math.abs(pct) < 3) {
                trendIcon = '→';
                trendText = 'Flat';
            } else if (pct > 0) {
                trendIcon = '↑';
                trendText = `+${pct.toFixed(0)}%`;
            } else {
                trendIcon = '↓';
                trendText = `${pct.toFixed(0)}%`;
            }
        }

        const vsMarket = globalAvgTheo > 0 ? ((avgTheo - globalAvgTheo) / globalAvgTheo) * 100 : 0;
        const vsColor = vsMarket >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
        const vsArrow = vsMarket >= 0 ? '▲' : '▼';

        const sizeBarW = Math.round((data.total / maxGames) * 100);

        html += `
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all overflow-hidden cursor-pointer group"
                 onclick="${safeOnclick('window.showProviderDetails', prov)}">
                <div class="p-3 pb-2">
                    <div class="flex items-center justify-between mb-1.5">
                        <span class="text-xs font-bold text-gray-900 dark:text-white truncate" title="${escapeAttr(prov)}">${escapeHtml(prov)}</span>
                        <span class="text-[10px] font-bold ${vsColor}" title="${vsMarket >= 0 ? 'Above' : 'Below'} market average by ${Math.abs(vsMarket).toFixed(0)}% (provider avg theo: ${avgTheo.toFixed(2)}, market avg: ${globalAvgTheo.toFixed(2)})">${vsArrow} ${Math.abs(vsMarket).toFixed(0)}%</span>
                    </div>
                    <div class="flex items-baseline gap-2 mb-2">
                        <span class="text-lg font-black text-gray-900 dark:text-white">${avgTheo.toFixed(1)}</span>
                        <span class="text-[9px] text-gray-400">avg theo</span>
                        ${trendIcon ? `<span class="ml-auto text-[10px] font-semibold ${trendIcon === '↑' ? 'text-emerald-500' : trendIcon === '↓' ? 'text-red-400' : 'text-gray-400'}" title="Year-over-year trend: ${trendIcon === '↑' ? 'improving' : trendIcon === '↓' ? 'declining' : 'flat'} performance (recent vs older releases)">${trendIcon} ${trendText}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1.5 mb-2">
                        <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                            <div class="h-full rounded-full bg-indigo-400 dark:bg-indigo-500" style="width:${sizeBarW}%"></div>
                        </div>
                        <span class="text-[9px] text-gray-400 shrink-0">${data.total} games</span>
                    </div>
                </div>
                <div class="px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-700/50 space-y-1.5">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[9px] text-gray-400 w-14 shrink-0">Top game</span>
                        ${bestGameName ? `<span class="text-[10px] font-semibold text-gray-800 dark:text-gray-200 truncate">${escapeHtml(bestGameName)}</span><span class="text-[9px] text-emerald-600 dark:text-emerald-400 shrink-0 font-bold">${bestGameTheo.toFixed(1)}</span>` : '<span class="text-[9px] text-gray-400">—</span>'}
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="text-[9px] text-gray-400 w-14 shrink-0">Best in</span>
                        <span class="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 truncate cursor-pointer hover:underline" title="${escapeAttr(bestThemeName)}" onclick="event.stopPropagation(); ${safeOnclick('window.showThemeDetails', bestThemeName)}">${escapeHtml(bestThemeName)}</span>
                        <span class="text-[9px] text-gray-400 shrink-0">${bestThemeCount}g · ${bestTheoAvg.toFixed(1)}</span>
                    </div>
                    ${
                        domLayout
                            ? `<div class="flex items-center gap-1.5">
                        <span class="text-[9px] text-gray-400 w-14 shrink-0">Layout</span>
                        <span class="text-[10px] font-semibold text-gray-700 dark:text-gray-300">${escapeHtml(domLayout[0])}</span>
                        <span class="text-[9px] text-gray-400">${domLayout[1]} / ${data.total}</span>
                    </div>`
                            : ''
                    }
                    <div class="flex flex-wrap gap-1 pt-1">
                        ${topFeats.map(([f, c]) => `<span class="px-1.5 py-0.5 text-[8px] rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 font-medium">${escapeHtml(f)} <span class="text-indigo-400">${c}</span></span>`).join('')}
                    </div>
                </div>
                <div class="px-3 py-1.5 bg-gray-100/50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
                    <span class="text-[9px] text-gray-400">${themeCount} themes · ${featureSet.size} features</span>
                    <span class="text-[9px] text-gray-400">${totalMarketShare.toFixed(1)}% share</span>
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}
