/**
 * Strategic insight cards: Build next, Avoid, Watch.
 */
import { getActiveGames, getActiveThemes } from '../../lib/data.js';
import { escapeHtml, safeOnclick } from '../../lib/sanitize.js';
import { log } from '../../lib/env.js';
import { getBuildNextCombos, getAvoidCombos } from '../../features/idea-generator.js';
import { F } from '../../lib/game-fields.js';

export function renderStrategicCards(buildNextDiv, avoidDiv, watchDiv) {
    if (buildNextDiv) {
        const buildNext = getBuildNextCombos(5);
        buildNextDiv.innerHTML =
            buildNext.length > 0
                ? buildNext
                      .map(
                          c => `
            <div class="space-y-0.5">
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0"><div class="text-xs font-semibold text-gray-900 dark:text-white truncate"><span class="text-emerald-700 dark:text-emerald-400 cursor-pointer hover:underline" onclick="${safeOnclick('window.showThemeDetails', c.theme)}">${escapeHtml(c.theme)}</span> <span class="text-[8px] text-gray-400 font-normal">theme</span> + <span class="text-indigo-700 dark:text-indigo-400">${escapeHtml(c.feature)}</span> <span class="text-[8px] text-gray-400 font-normal">feature</span></div></div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">${c.count} games</span>
                    <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">${c.avgTheo.toFixed(1)} avg theo</span>
                </div>
            </div>
            <div class="flex flex-wrap gap-1 mt-1">
                ${c.dominantLayout ? `<span class="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">📐 Layout ${escapeHtml(c.dominantLayout)}</span>` : ''}
                ${c.dominantVolatility ? `<span class="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">⚡ Vol: ${escapeHtml(c.dominantVolatility)}</span>` : ''}
                ${c.avgRTP != null ? `<span class="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">RTP ${c.avgRTP.toFixed(1)}%</span>` : ''}
                ${c.dominantProvider ? `<span class="text-[9px] px-1 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">🏢 ${escapeHtml(c.dominantProvider)}</span>` : ''}
            </div>
            ${c.topGameName ? `<div class="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">e.g. ${escapeHtml(c.topGameName)}</div>` : ''}
            </div>
        `
                      )
                      .join('')
                : '<p class="text-xs text-gray-400">No opportunities detected</p>';
        log('  ✅ Build Next generated');
    }
    if (avoidDiv) {
        const avoid = getAvoidCombos(5);
        avoidDiv.innerHTML =
            avoid.length > 0
                ? avoid
                      .map(
                          c => `
            <div class="space-y-0.5">
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0"><div class="text-xs font-semibold text-gray-900 dark:text-white truncate"><span class="text-emerald-700 dark:text-emerald-400 cursor-pointer hover:underline" onclick="${safeOnclick('window.showThemeDetails', c.theme)}">${escapeHtml(c.theme)}</span> <span class="text-[8px] text-gray-400 font-normal">theme</span> + <span class="text-indigo-700 dark:text-indigo-400">${escapeHtml(c.feature)}</span> <span class="text-[8px] text-gray-400 font-normal">feature</span></div></div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">${c.count} games</span>
                    <span class="text-[10px] font-bold text-red-600 dark:text-red-400">${c.avgTheo.toFixed(1)} avg theo</span>
                </div>
            </div>
            <div class="flex flex-wrap gap-1 mt-1">
                ${c.dominantLayout ? `<span class="text-[9px] px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">📐 Layout ${escapeHtml(c.dominantLayout)}</span>` : ''}
                ${c.dominantVolatility ? `<span class="text-[9px] px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">⚡ Vol: ${escapeHtml(c.dominantVolatility)}</span>` : ''}
                ${c.avgRTP != null ? `<span class="text-[9px] px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">RTP ${c.avgRTP.toFixed(1)}%</span>` : ''}
                ${c.dominantProvider ? `<span class="text-[9px] px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">🏢 ${escapeHtml(c.dominantProvider)}</span>` : ''}
            </div>
            ${c.topGameName ? `<div class="text-[9px] text-red-400/80 dark:text-red-500/80 mt-0.5 truncate">e.g. ${escapeHtml(c.topGameName)}</div>` : ''}
            </div>
        `
                      )
                      .join('')
                : '<p class="text-xs text-gray-400">No underperformers</p>';
        log('  ✅ Avoid generated');
    }
    if (watchDiv) {
        const allGWatch = getActiveGames();
        const allThemes = getActiveThemes().filter(
            t => !/^unknown$/i.test(t.Theme || '') && (t['Game Count'] || 0) >= 2
        );
        const globalAvgTheo =
            allGWatch.length > 0
                ? allGWatch.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allGWatch.length
                : 1;

        const scored = allThemes
            .map(t => {
                const themeGames = allGWatch.filter(g => (g.theme_consolidated || g.Theme || '') === t.Theme);
                const gc = t['Game Count'] || 0;
                const avgTheo = t['Avg Theo Win Index'] || 0;
                const reasons = [];
                let score = 0;

                const recent = themeGames.filter(g => (F.originalReleaseYear(g) || 0) >= 2022);
                const older = themeGames.filter(
                    g => (F.originalReleaseYear(g) || 0) > 0 && (F.originalReleaseYear(g) || 0) < 2022
                );
                if (recent.length >= 2 && older.length >= 1) {
                    const recentAvg = recent.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / recent.length;
                    const olderAvg = older.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / older.length;
                    if (olderAvg > 0) {
                        const growth = ((recentAvg - olderAvg) / olderAvg) * 100;
                        if (growth > 10) {
                            score += Math.min(growth / 10, 5);
                            reasons.push(`📈 Rising: recent games +${growth.toFixed(0)}% vs older`);
                        }
                    }
                }

                const provSet = new Set(themeGames.map(g => F.provider(g)).filter(Boolean));
                if (avgTheo > globalAvgTheo && provSet.size <= 3 && gc <= 15) {
                    score += 3;
                    reasons.push(
                        `🔓 Underserved: only ${provSet.size} provider${provSet.size !== 1 ? 's' : ''}, high performance`
                    );
                }

                if (gc >= 2 && gc <= 10 && avgTheo > globalAvgTheo * 1.2) {
                    score += 2;
                    reasons.push(
                        `⭐ Niche opportunity: ${gc} games, ${((avgTheo / globalAvgTheo - 1) * 100).toFixed(0)}% above market avg`
                    );
                }

                if (avgTheo > globalAvgTheo * 1.5 && gc >= 3) {
                    score += 1.5;
                    reasons.push(`🏆 Top-quartile performance: ${avgTheo.toFixed(1)} avg theo`);
                }

                const vols = {},
                    layouts = {},
                    rtps = [],
                    providers = {};
                themeGames.forEach(g => {
                    const v = g.specs_volatility || g.volatility || '';
                    if (v) vols[v] = (vols[v] || 0) + 1;
                    const r = g.specs_reels,
                        ro = g.specs_rows;
                    if (r && ro) {
                        const l = `${r}x${ro}`;
                        layouts[l] = (layouts[l] || 0) + 1;
                    }
                    const rtp = parseFloat(g.specs_rtp || g.rtp || 0);
                    if (rtp > 0) rtps.push(rtp);
                    const p = F.provider(g);
                    if (p) providers[p] = (providers[p] || 0) + 1;
                });

                return { theme: t, score, reasons, gc, avgTheo, vols, layouts, rtps, providers, themeGames };
            })
            .filter(s => s.score > 0 && s.reasons.length > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        watchDiv.innerHTML =
            scored.length > 0
                ? scored
                      .map(s => {
                          const { theme: t, reasons, gc, avgTheo, vols, layouts, rtps, providers, themeGames } = s;
                          const volKeys = Object.keys(vols);
                          const dominantVol = volKeys.length
                              ? volKeys.reduce((a, b) => (vols[a] >= vols[b] ? a : b))
                              : '';
                          const layoutKeys = Object.keys(layouts);
                          const dominantLayout = layoutKeys.length
                              ? layoutKeys.reduce((a, b) => (layouts[a] >= layouts[b] ? a : b))
                              : '';
                          const avgRTP = rtps.length >= 2 ? rtps.reduce((sv, v) => sv + v, 0) / rtps.length : null;
                          const topGame = [...themeGames].sort(
                              (a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0)
                          )[0];
                          return `
            <div class="space-y-0.5">
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0"><div class="text-xs font-semibold text-gray-900 dark:text-white truncate cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 transition-colors" onclick="${safeOnclick('window.showThemeDetails', t.Theme)}">${escapeHtml(t.Theme)}</div></div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">${gc} games</span>
                    <span class="text-[10px] font-bold text-amber-600 dark:text-amber-400">${avgTheo.toFixed(1)} avg theo</span>
                </div>
            </div>
            <div class="text-[9px] text-amber-700 dark:text-amber-300 mt-0.5 leading-snug">${reasons[0]}</div>
            <div class="flex flex-wrap gap-1 mt-1">
                ${dominantLayout ? `<span class="text-[9px] px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">📐 ${escapeHtml(dominantLayout)}</span>` : ''}
                ${dominantVol ? `<span class="text-[9px] px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">⚡ ${escapeHtml(dominantVol)}</span>` : ''}
                ${avgRTP != null ? `<span class="text-[9px] px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">RTP ${avgRTP.toFixed(1)}%</span>` : ''}
            </div>
            ${topGame ? `<div class="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">Top: ${escapeHtml(topGame.name || '')}</div>` : ''}
            </div>`;
                      })
                      .join('')
                : '<p class="text-xs text-gray-400">No themes to watch</p>';
        log('  ✅ Watch generated');
    }
}
