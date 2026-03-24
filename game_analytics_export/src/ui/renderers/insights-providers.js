/**
 * Provider × theme matrix.
 */
import { gameData } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { log } from '../../lib/env.js';
import { parseFeatsLocal } from './overview-renderer.js';
import { getProviderMetrics } from '../../lib/metrics.js';
import { F } from '../../lib/game-fields.js';

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
