/**
 * Recipe leaderboard, feature heatmap, stacking, and layout correlation blocks.
 */
import { getActiveGames, getActiveThemes } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { parseFeatsLocal } from './overview-renderer.js';
import { CANONICAL_FEATURES, SHORT_FEATURE_LABELS } from '../../lib/features.js';
import { getReelGridCorrelation } from '../../lib/game-analytics-engine.js';
import { F } from '../../lib/game-fields.js';

const shortF = SHORT_FEATURE_LABELS;

function buildThemeOptions() {
    const allG = getActiveGames();
    const themeCounts = {};
    allG.forEach(g => {
        const t = g.theme_consolidated || g.theme_primary || '';
        if (t && !/^unknown$/i.test(t)) themeCounts[t] = (themeCounts[t] || 0) + 1;
    });
    return Object.entries(themeCounts)
        .filter(([, c]) => c >= 5)
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `<option value="${escapeAttr(t)}">${escapeHtml(t)} (${c})</option>`)
        .join('');
}

export function renderRecipeLeaderboard() {
    const leaderboardEl = document.getElementById('feature-leaderboard');
    if (!leaderboardEl) return;

    const allGames = getActiveGames();
    const globalAvg = allGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / (allGames.length || 1);

    const recipeMap = {};
    allGames.forEach(g => {
        const feats = parseFeatsLocal(g.features);
        if (feats.length < 2) return;
        const key = [...feats].sort().join(' + ');
        if (!recipeMap[key]) recipeMap[key] = { features: [...feats].sort(), games: [], totalTheo: 0 };
        recipeMap[key].games.push(g);
        recipeMap[key].totalTheo += g.performance_theo_win || 0;
    });

    const recipes = Object.values(recipeMap)
        .filter(r => r.games.length >= 3)
        .map(r => {
            const avgTheo = r.totalTheo / r.games.length;
            const vsMarket = globalAvg > 0 ? ((avgTheo - globalAvg) / globalAvg) * 100 : 0;
            const topGame = r.games.sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))[0];
            const themes = {};
            const layouts = {};
            const vols = {};
            const rtps = [];
            const providers = {};
            const bets = [];
            r.games.forEach(g => {
                const t = g.theme_consolidated || '';
                if (t && !/^unknown$/i.test(t)) themes[t] = (themes[t] || 0) + 1;
                const re = g.specs_reels || g.reels,
                    ro = g.specs_rows || g.rows;
                if (re && ro) {
                    const l = `${re}x${ro}`;
                    layouts[l] = (layouts[l] || 0) + 1;
                }
                const v = g.specs_volatility || g.volatility || '';
                if (v) vols[v] = (vols[v] || 0) + 1;
                const rtp = parseFloat(g.specs_rtp || g.rtp || 0);
                if (rtp > 0) rtps.push(rtp);
                const p = F.provider(g);
                if (p && p !== 'Unknown') providers[p] = (providers[p] || 0) + 1;
                const mb = parseFloat(g.min_bet || 0);
                if (mb > 0) bets.push(mb);
            });
            const topTheme = Object.entries(themes).sort((a, b) => b[1] - a[1])[0];
            const lk = Object.keys(layouts);
            const domLayout = lk.length ? lk.reduce((a, b) => (layouts[a] >= layouts[b] ? a : b)) : '';
            const vk = Object.keys(vols);
            const domVol = vk.length ? vk.reduce((a, b) => (vols[a] >= vols[b] ? a : b)) : '';
            const avgRTP = rtps.length >= 2 ? rtps.reduce((s, v) => s + v, 0) / rtps.length : null;
            const pk = Object.keys(providers);
            const domProvider = pk.length ? pk.reduce((a, b) => (providers[a] >= providers[b] ? a : b)) : '';
            const minBet = bets.length ? Math.min(...bets) : null;
            return {
                ...r,
                avgTheo,
                vsMarket,
                topGame,
                topTheme: topTheme?.[0] || '',
                featureCount: r.features.length,
                domLayout,
                domVol,
                avgRTP,
                domProvider,
                minBet,
            };
        })
        .sort((a, b) => b.avgTheo - a.avgTheo);

    const topRecipes = recipes.slice(0, 20);
    const medals = ['🥇', '🥈', '🥉'];

    function renderRecipeRow(r, i) {
        const barWidth = topRecipes[0].avgTheo > 0 ? (r.avgTheo / topRecipes[0].avgTheo) * 100 : 0;
        const vsColor = r.vsMarket >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
        const vsBg = r.vsMarket >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20';
        const vsIcon = r.vsMarket >= 0 ? '▲' : '▼';
        const barColor =
            i < 3
                ? 'from-amber-400 to-orange-500'
                : r.vsMarket >= 0
                  ? 'from-emerald-400 to-teal-500'
                  : 'from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-500';
        const rank = i < 3 ? medals[i] : `<span class="text-[10px] font-bold text-gray-400">${i + 1}</span>`;
        const recipeFeatureValue = r.features.join(' + ');
        const chips = r.features
            .map(
                f =>
                    `<span class="inline-block px-1 py-0.5 text-[9px] rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">${escapeHtml(shortF[f] || f)}</span>`
            )
            .join('');
        const specChips = [
            r.domLayout
                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">📐 Layout ${escapeHtml(r.domLayout)}</span>`
                : '',
            r.domVol
                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">⚡ Vol: ${escapeHtml(r.domVol)}</span>`
                : '',
            r.avgRTP != null
                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">RTP ${r.avgRTP.toFixed(1)}%</span>`
                : '',
            r.minBet != null
                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Min $${r.minBet.toFixed(2)}+</span>`
                : '',
            r.domProvider
                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">🏢 ${escapeHtml(r.domProvider)}</span>`
                : '',
        ]
            .filter(Boolean)
            .join('');
        return `
        <div class="recipe-row px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-all ${i < 3 ? 'bg-gradient-to-r from-amber-50/30 to-transparent dark:from-amber-900/10' : ''}" data-xray='${escapeAttr(JSON.stringify({ dimension: 'feature', value: recipeFeatureValue }))}'>
            <div class="flex items-center gap-2">
                <div class="w-5 text-center shrink-0 text-xs">${rank}</div>
                <div class="flex flex-wrap gap-0.5 min-w-0 flex-1">${chips}</div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <div class="w-16 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full rounded-full bg-gradient-to-r ${barColor}" style="width:${barWidth}%"></div>
                    </div>
                    <span class="text-xs font-bold text-gray-900 dark:text-white tabular-nums w-8 text-right">${r.avgTheo.toFixed(1)}</span>
                    <span class="inline-flex px-1 py-0.5 rounded text-[9px] font-semibold ${vsColor} ${vsBg}">${vsIcon}${Math.abs(r.vsMarket).toFixed(0)}%</span>
                    <span class="text-[9px] text-gray-400 text-right whitespace-nowrap">${r.games.length} games</span>
                </div>
            </div>
            ${specChips ? `<div class="flex flex-wrap gap-1 mt-1 ml-7">${specChips}${r.topGame ? `<span class="text-[8px] text-gray-400 dark:text-gray-500 truncate max-w-[140px]">e.g. ${escapeHtml(r.topGame.name || '')}</span>` : ''}</div>` : ''}
        </div>`;
    }

    leaderboardEl.innerHTML =
        topRecipes.length > 0
            ? `
    <div class="space-y-0.5" id="recipe-list">
        ${topRecipes.map((r, i) => renderRecipeRow(r, i)).join('')}
    </div>
    <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-[9px] text-gray-400 dark:text-gray-500">
        ${recipes.length} combos · avg: ${globalAvg.toFixed(1)} · ${recipes.filter(r => r.vsMarket >= 0).length} beat market
    </div>`
            : '<p class="text-xs text-gray-400 p-2">Not enough games with multi-mechanic data</p>';
}

export function renderFeatureHeatmap(heatmapDiv) {
    if (!heatmapDiv) return;
    try {
        const allG = getActiveGames();
        const FEATS = CANONICAL_FEATURES;

        const themeMap = {};
        allG.forEach(g => {
            const theme = g.theme_consolidated || '';
            if (!theme || /^unknown$/i.test(theme)) return;
            const feats = parseFeatsLocal(g.features);
            const theo = g.performance_theo_win || 0;
            if (!themeMap[theme]) themeMap[theme] = { games: [], totalTheo: 0 };
            themeMap[theme].games.push({ feats, theo, name: g.name || '' });
            themeMap[theme].totalTheo += theo;
        });

        const topThemeNames = getActiveThemes()
            .filter(t => t.Theme && (t['Game Count'] || 0) >= 5)
            .sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0))
            .slice(0, 12)
            .map(t => t.Theme);

        const matrix = topThemeNames.map(t => {
            const tg = themeMap[t]?.games || [];
            const themeAvg = tg.length > 0 ? tg.reduce((s, g) => s + g.theo, 0) / tg.length : 0;
            return FEATS.map(f => {
                const withFeat = tg.filter(g => g.feats.includes(f));
                if (withFeat.length < 2) return null;
                const avg = withFeat.reduce((s, g) => s + g.theo, 0) / withFeat.length;
                const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg) * 100 : 0;
                return {
                    avgTheo: avg,
                    count: withFeat.length,
                    lift,
                    themeAvg,
                    names: withFeat
                        .sort((a, b) => b.theo - a.theo)
                        .slice(0, 4)
                        .map(g => g.name),
                };
            });
        });

        const allLifts = matrix
            .flat()
            .filter(Boolean)
            .map(x => x.lift);
        const maxLift = Math.max(...allLifts.map(Math.abs), 1);

        heatmapDiv.innerHTML = `
            <div class="relative">
            <div id="heatmap-tooltip" class="fixed z-[9999] pointer-events-none opacity-0 transition-opacity duration-150" style="display:none"></div>
            <table class="heatmap-table text-[11px] border-collapse w-full">
                <thead><tr>
                    <th class="p-2 text-left font-medium text-gray-600 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10 min-w-[90px]"></th>
                    ${FEATS.map(f => `<th class="pb-2 pt-0 px-1 text-center font-medium text-gray-600 dark:text-gray-400" title="${escapeAttr(f)}"><div style="writing-mode:vertical-lr;transform:rotate(180deg);white-space:nowrap;font-size:9px;max-height:90px;overflow:hidden;text-overflow:ellipsis;margin:0 auto">${escapeHtml(shortF[f] || f)}</div></th>`).join('')}
                </tr></thead>
                <tbody>
                    ${topThemeNames
                        .map(
                            (t, i) => `
                        <tr>
                            <td class="p-2 font-medium text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 z-10 whitespace-nowrap text-[10px]">${escapeHtml(t)}</td>
                            ${matrix[i]
                                .map((cell, j) => {
                                    if (!cell)
                                        return '<td class="p-1 min-w-[44px] h-8 bg-gray-50 dark:bg-gray-700/30 rounded text-center text-[9px] text-gray-300 dark:text-gray-600">·</td>';
                                    const lift = cell.lift;
                                    const count = cell.count;
                                    const isOpportunity = lift > 10 && count < 5;
                                    const intensity = Math.min(Math.abs(lift) / maxLift, 1);
                                    let bg, textCol;
                                    if (lift >= 0) {
                                        const alpha = 0.15 + intensity * 0.55;
                                        bg = isOpportunity ? `rgba(245,158,11,0.4)` : `rgba(16,185,129,${alpha})`;
                                        textCol = intensity > 0.3 ? '#065f46' : '#6b7280';
                                    } else {
                                        const alpha = 0.15 + intensity * 0.55;
                                        bg = `rgba(239,68,68,${alpha})`;
                                        textCol = intensity > 0.3 ? '#991b1b' : '#6b7280';
                                    }
                                    const display = lift >= 0 ? `+${lift.toFixed(0)}%` : `${lift.toFixed(0)}%`;
                                    const featureName = FEATS[j];
                                    const oppMarker = isOpportunity
                                        ? '<span class="text-amber-500 text-[8px] ml-0.5" title="Opportunity: high lift, few games">◆</span>'
                                        : '';
                                    return `<td class="hm-cell p-1 min-w-[44px] h-8 text-center align-middle rounded cursor-pointer transition-all duration-150 hover:scale-110 hover:z-20 hover:shadow-lg hover:ring-2 hover:ring-white/60 text-[10px] font-semibold" style="background:${bg};color:${textCol}" data-xray='${escapeAttr(JSON.stringify({ dimension: 'feature', value: featureName }))}' data-theme="${escapeAttr(t)}" data-feat="${escapeAttr(featureName)}" data-theo="${cell.avgTheo.toFixed(2)}" data-count="${count}" data-lift="${lift.toFixed(1)}" data-tavg="${cell.themeAvg.toFixed(2)}" data-names="${escapeAttr(cell.names.join('|'))}" onclick="if(window.useOpportunityCombo){${safeOnclick('window.useOpportunityCombo', t, FEATS[j])}}">${display}${oppMarker}</td>`;
                                })
                                .join('')}
                        </tr>
                    `
                        )
                        .join('')}
                </tbody>
            </table>
            <div class="flex items-center justify-center gap-4 mt-3 text-[9px] text-gray-400 flex-wrap">
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:rgba(16,185,129,0.5)"></span> Improves theme</span>
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:rgba(239,68,68,0.5)"></span> Worsens theme</span>
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:rgba(245,158,11,0.5)"></span><span class="text-amber-500">◆</span> Opportunity (&gt;10% lift, &lt;5 games)</span>
                <span>· = insufficient data</span>
            </div>
            </div>
        `;
        wireHeatmapTooltip(heatmapDiv);
    } catch {
        /* graceful degradation — show fallback message */
        heatmapDiv.innerHTML = '<p class="text-sm text-gray-500">Heatmap data unavailable</p>';
    }
}

export function wireHeatmapTooltip(heatmapDiv) {
    const tooltip = document.getElementById('heatmap-tooltip');
    if (!tooltip) return;

    heatmapDiv.addEventListener('mouseover', e => {
        const td = e.target.closest('.hm-cell');
        if (!td) return;
        const theme = td.dataset.theme;
        const feat = td.dataset.feat;
        const theo = parseFloat(td.dataset.theo);
        const count = td.dataset.count;
        const lift = parseFloat(td.dataset.lift);
        const themeAvg = parseFloat(td.dataset.tavg || '0');
        const names = (td.dataset.names || '').split('|').filter(Boolean);
        const isPositive = lift >= 0;
        const liftColor = isPositive ? 'text-emerald-400' : 'text-red-400';
        const perfLabel =
            lift >= 20
                ? '🔥 Strong boost'
                : lift >= 5
                  ? '✅ Positive impact'
                  : lift >= -5
                    ? '➡️ Neutral'
                    : lift >= -20
                      ? '⚠️ Negative impact'
                      : '❌ Strong drag';
        tooltip.innerHTML = `
            <div class="bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700 px-4 py-3 min-w-[220px] max-w-[300px]">
                <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">${escapeHtml(theme)}</div>
                <div class="text-xs text-gray-300 mb-2">+ ${escapeHtml(feat)}</div>
                <div class="flex items-baseline gap-2 mb-1.5">
                    <span class="text-lg font-bold ${liftColor}">${isPositive ? '+' : ''}${lift.toFixed(1)}%</span>
                    <span class="text-[10px] text-gray-400">lift vs theme avg</span>
                </div>
                <div class="flex items-center justify-between text-[11px] mb-1">
                    <span class="text-gray-400">With mechanic: <span class="text-white font-medium">${theo.toFixed(2)}</span> avg theo</span>
                </div>
                <div class="flex items-center justify-between text-[11px] mb-1.5">
                    <span class="text-gray-400">Theme baseline: <span class="text-gray-300">${themeAvg.toFixed(2)}</span></span>
                    <span class="text-gray-400">${count} games</span>
                </div>
                ${names.length > 0 ? `<div class="border-t border-gray-700 pt-1.5 mt-1"><div class="text-[9px] text-gray-500 font-bold uppercase mb-1">Top games</div>${names.map(n => `<div class="text-[10px] text-gray-300 truncate">${escapeHtml(n)}</div>`).join('')}</div>` : ''}
                <div class="text-[9px] pt-1 text-gray-500">${perfLabel}</div>
            </div>
        `;
        tooltip.style.display = 'block';
        requestAnimationFrame(() => (tooltip.style.opacity = '1'));
        const rect = td.getBoundingClientRect();
        const ttRect = tooltip.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - ttRect.width / 2;
        let top = rect.top - ttRect.height - 8;
        if (top < 8) top = rect.bottom + 8;
        if (left < 8) left = 8;
        if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    });

    heatmapDiv.addEventListener('mouseout', e => {
        const td = e.target.closest('.hm-cell');
        if (!td) return;
        const related = e.relatedTarget;
        if (related && (related.closest('.hm-cell') || related.closest('#heatmap-tooltip'))) return;
        tooltip.style.opacity = '0';
        setTimeout(() => {
            if (tooltip.style.opacity === '0') tooltip.style.display = 'none';
        }, 150);
    });
}

export function renderFeatureStacking() {
    const isGameLabPage = !!document.getElementById('heatmap-container');
    let synergyWrapper = document.getElementById('synergy-explorer-wrapper');
    if (!synergyWrapper && isGameLabPage) {
        const providerSection = document.getElementById('provider-theme-matrix')?.closest('.bg-white');
        if (providerSection) {
            synergyWrapper = document.createElement('div');
            synergyWrapper.id = 'synergy-explorer-wrapper';
            synergyWrapper.className = 'mb-4';
            providerSection.parentNode.insertBefore(synergyWrapper, providerSection);
        }
    }
    if (synergyWrapper) {
        const themeOptions = buildThemeOptions();
        synergyWrapper.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div class="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">🧬</span>
                        <div>
                            <div class="flex items-center gap-1.5">
                                <h3 class="text-sm font-bold text-gray-900 dark:text-white leading-none">Mechanic Stacking — How many mechanics should you use?</h3>
                            </div>
                            <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Performance by mechanic count and which mechanics add the most value when stacked</p>
                        </div>
                    </div>
                    <select id="stacking-theme-filter" class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-w-[180px]">
                        <option value="">All themes</option>
                        ${themeOptions}
                    </select>
                </div>
            </div>
            <div id="synergy-container" class="p-4"></div>
        </div>`;
    }
    const synergyDiv = document.getElementById('synergy-container');
    if (!synergyDiv) return;

    function renderStackingContent(themeFilter) {
        const allGames = getActiveGames();
        const filteredG = themeFilter
            ? allGames.filter(g => (g.theme_consolidated || g.theme_primary || '') === themeFilter)
            : allGames;
        if (filteredG.length < 3) {
            synergyDiv.innerHTML =
                '<p class="text-sm text-gray-400 text-center py-8">Not enough games for this theme</p>';
            return;
        }
        const FEATS = CANONICAL_FEATURES;
        const baseAvg =
            filteredG.length > 0
                ? filteredG.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / filteredG.length
                : 0;
        const globalAvg =
            allGames.length > 0 ? allGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allGames.length : 0;
        const compareAvg = themeFilter ? baseAvg : globalAvg;

        const byCount = {};
        filteredG.forEach(g => {
            const feats = parseFeatsLocal(g.features);
            const n = feats.length;
            if (!byCount[n]) byCount[n] = { games: [], totalTheo: 0 };
            byCount[n].games.push(g);
            byCount[n].totalTheo += g.performance_theo_win || 0;
        });
        const countStats = Object.entries(byCount)
            .map(([n, d]) => ({ count: parseInt(n), gameCount: d.games.length, avgTheo: d.totalTheo / d.games.length }))
            .sort((a, b) => a.count - b.count);
        const maxAvg = Math.max(...countStats.map(c => c.avgTheo), 1);

        const featureAddValue = {};
        FEATS.forEach(feat => {
            const withFeat = filteredG.filter(g => parseFeatsLocal(g.features).includes(feat));
            const withoutFeat = filteredG.filter(g => !parseFeatsLocal(g.features).includes(feat));
            if (withFeat.length < 3 || withoutFeat.length < 3) return;
            const avgWith = withFeat.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withFeat.length;
            const avgWithout = withoutFeat.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withoutFeat.length;
            const lift = avgWithout > 0 ? ((avgWith - avgWithout) / avgWithout) * 100 : 0;
            featureAddValue[feat] = { avgWith, avgWithout, lift, count: withFeat.length };
        });
        const sortedFeatures = Object.entries(featureAddValue)
            .map(([f, d]) => ({ feature: f, ...d }))
            .sort((a, b) => b.lift - a.lift);
        const maxLift = Math.max(...sortedFeatures.map(f => Math.abs(f.lift)), 1);
        const avgLabel = themeFilter ? `Theme avg: ${compareAvg.toFixed(1)}` : `Market avg: ${compareAvg.toFixed(1)}`;
        const scopeLabel = themeFilter ? `within ${escapeHtml(themeFilter)}` : 'across all games';

        synergyDiv.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide flex items-center gap-1.5">Performance by Mechanic Count <span class="relative group"><button class="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center text-[8px] font-bold leading-none cursor-help">?</button><span class="hidden group-hover:block absolute left-0 top-full mt-1 w-56 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed font-normal normal-case">Average Theo Win for games grouped by how many mechanics they have. Green = above avg.</span></span></h4>
                    <div class="space-y-2">
                        ${countStats
                            .map(c => {
                                const barW = maxAvg > 0 ? (c.avgTheo / maxAvg) * 100 : 0;
                                const vsColor =
                                    c.avgTheo >= compareAvg
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-amber-600 dark:text-amber-400';
                                const barColor = c.avgTheo >= compareAvg ? 'bg-emerald-400' : 'bg-amber-400';
                                const label =
                                    c.count === 0 ? 'No features' : c.count === 1 ? '1 feature' : `${c.count} features`;
                                const avgStr = c.avgTheo.toFixed(1);
                                return `
                            <div class="flex items-center gap-3" data-xray='${escapeAttr(JSON.stringify({ metric: 'avg_theo_win', dimension: 'mechanic_count', value: String(c.count), displayValue: avgStr }))}'>
                                <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-24 shrink-0">${label}</span>
                                <div class="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full ${barColor} rounded-full stacking-bar" style="width:0%" data-target="${barW}"></div>
                                </div>
                                <span class="text-xs font-bold ${vsColor} tabular-nums w-12 text-right shrink-0">${avgStr}</span>
                                <span class="text-[10px] text-gray-400 w-16 text-right shrink-0">${c.gameCount} games</span>
                            </div>`;
                            })
                            .join('')}
                    </div>
                    <div class="mt-2 text-[10px] text-gray-400 dark:text-gray-500">${avgLabel} · ${filteredG.length} games ${scopeLabel}</div>
                </div>
                <div>
                    <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide flex items-center gap-1.5">Mechanic Lift — impact when added <span class="relative group"><button class="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center text-[8px] font-bold leading-none cursor-help">?</button><span class="hidden group-hover:block absolute left-0 top-full mt-1 w-56 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed font-normal normal-case">The % change in avg Theo Win when a mechanic is present vs absent ${scopeLabel}. Positive = adding this mechanic correlates with better performance.</span></span></h4>
                    <div class="space-y-1.5">
                        ${
                            sortedFeatures.length > 0
                                ? sortedFeatures
                                      .map(f => {
                                          const barW = maxLift > 0 ? (Math.abs(f.lift) / maxLift) * 100 : 0;
                                          const isPos = f.lift >= 0;
                                          const liftColor = isPos
                                              ? 'text-emerald-600 dark:text-emerald-400'
                                              : 'text-red-500 dark:text-red-400';
                                          const barColor = isPos ? 'bg-emerald-400' : 'bg-red-400';
                                          const featureName = f.feature;
                                          return `
                            <div class="flex items-center gap-2" data-xray='${escapeAttr(JSON.stringify({ dimension: 'feature', value: featureName }))}'>
                                <span class="text-[11px] font-medium text-gray-700 dark:text-gray-300 w-24 shrink-0 truncate">${escapeHtml(shortF[featureName] || featureName)}</span>
                                <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full ${barColor} rounded-full stacking-bar" style="width:0%" data-target="${barW}"></div>
                                </div>
                                <span class="text-[11px] font-bold ${liftColor} tabular-nums w-14 text-right shrink-0">${isPos ? '+' : ''}${f.lift.toFixed(1)}%</span>
                                <span class="text-[9px] text-gray-400 w-14 text-right shrink-0">${f.count} games</span>
                            </div>`;
                                      })
                                      .join('')
                                : '<p class="text-xs text-gray-400">Not enough data for this theme</p>'
                        }
                    </div>
                    <div class="mt-2 text-[10px] text-gray-400 dark:text-gray-500">Lift = avg performance with vs without feature ${scopeLabel}</div>
                </div>
            </div>
        `;
    }

    function animateStackingBars() {
        requestAnimationFrame(() => {
            synergyDiv.querySelectorAll('.stacking-bar').forEach(bar => {
                bar.style.transition = 'width 0.4s ease-out';
                bar.style.width = bar.dataset.target + '%';
            });
        });
    }

    try {
        renderStackingContent('');
        animateStackingBars();

        const themeSelect = document.getElementById('stacking-theme-filter');
        if (themeSelect) {
            themeSelect.addEventListener('change', () => {
                renderStackingContent(themeSelect.value);
                animateStackingBars();
            });
        }
    } catch {
        synergyDiv.innerHTML = '<p class="text-sm text-gray-500">Mechanic synergy data unavailable</p>';
    }
}

export function renderLayoutCorrelation() {
    const container = document.getElementById('layout-correlation');
    if (!container) return;

    try {
        const { layouts } = getReelGridCorrelation();
        if (!layouts.length) {
            container.innerHTML = '<p class="text-xs text-gray-400">No layout data available</p>';
            return;
        }

        const top = layouts.filter(l => l.count >= 3).slice(0, 8);
        if (!top.length) {
            container.innerHTML = '<p class="text-xs text-gray-400">Not enough games with reel/row data</p>';
            return;
        }
        const maxCount = top[0].count;
        const maxTheo = Math.max(...top.map(l => l.avgTheo), 1);

        container.innerHTML = `
            <div class="flex items-center gap-4 mb-3 text-[9px] text-gray-400 dark:text-gray-500">
                <span><strong class="text-gray-600 dark:text-gray-300">Grid</strong> = Reels × Rows</span>
                <span><strong class="text-gray-600 dark:text-gray-300">Theo</strong> = Avg Performance Index</span>
                <span><strong class="text-indigo-500">Tags</strong> = Most common mechanics for this layout</span>
            </div>
            <div class="space-y-3">
                ${top
                    .map((l, i) => {
                        const countW = Math.max(8, (l.count / maxCount) * 100);
                        const theoW = Math.max(8, (l.avgTheo / maxTheo) * 100);
                        const featsHtml = l.topFeatures
                            .slice(0, 4)
                            .map(
                                f =>
                                    `<span class="px-1 py-0.5 text-[9px] rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium" title="${escapeAttr(f.name)} — used in ${f.pct}% of games with this layout">${escapeHtml(shortF[f.name] || f.name)} ${f.pct}%</span>`
                            )
                            .join('');
                        const layoutString = l.layout;
                        const countStr = String(l.count);
                        return `
                    <div class="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-all ${i === 0 ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}" data-xray='${escapeAttr(JSON.stringify({ metric: 'game_count', dimension: 'layout', value: layoutString, displayValue: countStr }))}'>
                        <div class="w-14 shrink-0 text-center" title="Grid layout: ${escapeAttr(l.layout)} (reels × rows)">
                            <span class="text-sm font-bold text-gray-900 dark:text-white">${escapeHtml(l.layout)}</span>
                            <div class="text-[9px] text-gray-400">${l.count} games</div>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-[10px] text-gray-500 w-12 shrink-0" title="Average Performance Index for games with this layout">Theo</span>
                                <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style="width:${theoW}%"></div>
                                </div>
                                <span class="text-xs font-bold text-gray-900 dark:text-white tabular-nums w-10 text-right">${l.avgTheo.toFixed(1)}</span>
                            </div>
                            <div class="flex flex-wrap gap-1">${featsHtml}</div>
                        </div>
                    </div>`;
                    })
                    .join('')}
            </div>
            <div class="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 text-[9px] text-gray-400">
                ${layouts.length} layouts detected · showing top ${top.length} by game count (min 3 games)
            </div>`;
    } catch {
        container.innerHTML = '<p class="text-sm text-gray-500">Layout data unavailable</p>';
    }
}

export function renderRecipeDNA() {
    const container = document.getElementById('feature-opportunities');
    if (!container) return;

    const allGames = getActiveGames();
    if (allGames.length < 10) {
        container.innerHTML = '<p class="text-xs text-gray-400">Not enough data</p>';
        return;
    }
    const globalAvg = allGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allGames.length;

    const combos = {};
    allGames.forEach(g => {
        const re = g.specs_reels || g.reels,
            ro = g.specs_rows || g.rows;
        const vol = g.specs_volatility || g.volatility || '';
        if (!re || !ro || !vol) return;
        const layout = `${re}x${ro}`;
        const key = `${layout}|${vol}`;
        if (!combos[key]) combos[key] = { layout, vol, games: [], totalTheo: 0 };
        combos[key].games.push(g);
        combos[key].totalTheo += g.performance_theo_win || 0;
    });

    const comboStats = Object.values(combos)
        .filter(c => c.games.length >= 5)
        .map(c => ({
            ...c,
            avgTheo: c.totalTheo / c.games.length,
            lift: globalAvg > 0 ? ((c.totalTheo / c.games.length - globalAvg) / globalAvg) * 100 : 0,
        }))
        .sort((a, b) => b.avgTheo - a.avgTheo);

    if (comboStats.length < 2) {
        container.innerHTML = '<p class="text-xs text-gray-400">Not enough spec combo data</p>';
        return;
    }

    const maxTheo = Math.max(...comboStats.map(c => c.avgTheo), 1);
    const topCombos = comboStats.slice(0, 8);
    const totalGamesInCombos = allGames.filter(
        g => (g.specs_reels || g.reels) && (g.specs_volatility || g.volatility)
    ).length;

    let html = `<div class="space-y-4">
        <div>
            <h4 class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Layout + Volatility Performance</h4>
            <div class="flex items-center gap-2 mb-1 text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                <span class="w-28 shrink-0">Combo</span>
                <span class="flex-1"></span>
                <span class="w-14 text-right shrink-0">Avg Theo</span>
                <span class="w-12 text-right shrink-0">Lift %</span>
                <span class="w-10 text-right shrink-0">Games</span>
            </div>
            <div class="space-y-1.5">
                ${topCombos
                    .map((c, i) => {
                        const barW = maxTheo > 0 ? (c.avgTheo / maxTheo) * 100 : 0;
                        const isPos = c.lift >= 0;
                        const liftColor = isPos
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400';
                        const barColor = isPos ? 'bg-emerald-400' : 'bg-amber-400';
                        const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
                        return `<div class="flex items-center gap-2 py-1 ${i < 3 ? 'bg-gray-50/50 dark:bg-gray-700/30 rounded-lg px-1.5 -mx-1.5' : ''}">
                            <span class="text-[10px] font-medium text-gray-700 dark:text-gray-300 w-28 shrink-0 truncate">${medal}${escapeHtml(c.layout)} · ${escapeHtml(c.vol)}</span>
                            <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full ${barColor} rounded-full" style="width:${barW}%"></div>
                            </div>
                            <span class="text-[10px] font-bold tabular-nums text-gray-700 dark:text-gray-300 w-14 text-right shrink-0">${c.avgTheo.toFixed(1)}</span>
                            <span class="text-[10px] font-bold ${liftColor} tabular-nums w-12 text-right shrink-0">${isPos ? '+' : ''}${c.lift.toFixed(0)}%</span>
                            <span class="text-[9px] text-gray-400 w-10 text-right shrink-0">${c.games.length}</span>
                        </div>`;
                    })
                    .join('')}
            </div>
            <div class="mt-1.5 text-[9px] text-gray-400">Lift % = performance vs market avg Theo Win (${globalAvg.toFixed(2)})</div>
        </div>`;

    const volPerf = {};
    allGames.forEach(g => {
        const v = g.specs_volatility || g.volatility || '';
        if (!v) return;
        if (!volPerf[v]) volPerf[v] = { total: 0, count: 0 };
        volPerf[v].total += g.performance_theo_win || 0;
        volPerf[v].count++;
    });
    const volStats = Object.entries(volPerf)
        .filter(([, d]) => d.count >= 5)
        .map(([v, d]) => ({ vol: v, avg: d.total / d.count, count: d.count }))
        .sort((a, b) => b.avg - a.avg);

    if (volStats.length >= 2) {
        const maxVolTheo = Math.max(...volStats.map(v => v.avg), 1);
        html += `<div>
            <h4 class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">By Volatility</h4>
            <div class="flex items-center gap-2 mb-1 text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                <span class="w-20 shrink-0">Type</span>
                <span class="flex-1"></span>
                <span class="w-14 text-right shrink-0">Avg Theo</span>
                <span class="w-12 text-right shrink-0">Lift %</span>
                <span class="w-10 text-right shrink-0">Games</span>
            </div>
            <div class="space-y-1.5">
                ${volStats
                    .map(v => {
                        const barW = maxVolTheo > 0 ? (v.avg / maxVolTheo) * 100 : 0;
                        const lift = globalAvg > 0 ? ((v.avg - globalAvg) / globalAvg) * 100 : 0;
                        const isPos = lift >= 0;
                        const liftColor = isPos
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400';
                        return `<div class="flex items-center gap-2">
                            <span class="text-[10px] font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">${escapeHtml(v.vol)}</span>
                            <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full bg-indigo-400 rounded-full" style="width:${barW}%"></div>
                            </div>
                            <span class="text-[10px] font-bold tabular-nums text-gray-700 dark:text-gray-300 w-14 text-right shrink-0">${v.avg.toFixed(1)}</span>
                            <span class="text-[10px] font-bold ${liftColor} tabular-nums w-12 text-right shrink-0">${isPos ? '+' : ''}${lift.toFixed(0)}%</span>
                            <span class="text-[9px] text-gray-400 w-10 text-right shrink-0">${v.count}</span>
                        </div>`;
                    })
                    .join('')}
            </div>
        </div>`;
    }

    const layoutPerf = {};
    allGames.forEach(g => {
        const re = g.specs_reels || g.reels,
            ro = g.specs_rows || g.rows;
        if (!re || !ro) return;
        const l = `${re}x${ro}`;
        if (!layoutPerf[l]) layoutPerf[l] = { total: 0, count: 0 };
        layoutPerf[l].total += g.performance_theo_win || 0;
        layoutPerf[l].count++;
    });
    const layoutStats = Object.entries(layoutPerf)
        .filter(([, d]) => d.count >= 5)
        .map(([l, d]) => ({ layout: l, avg: d.total / d.count, count: d.count }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 6);

    if (layoutStats.length >= 2) {
        const maxLayTheo = Math.max(...layoutStats.map(l => l.avg), 1);
        html += `<div>
            <h4 class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">By Layout</h4>
            <div class="flex items-center gap-2 mb-1 text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                <span class="w-20 shrink-0">Grid</span>
                <span class="flex-1"></span>
                <span class="w-14 text-right shrink-0">Avg Theo</span>
                <span class="w-12 text-right shrink-0">Lift %</span>
                <span class="w-10 text-right shrink-0">Games</span>
            </div>
            <div class="space-y-1.5">
                ${layoutStats
                    .map(l => {
                        const barW = maxLayTheo > 0 ? (l.avg / maxLayTheo) * 100 : 0;
                        const lift = globalAvg > 0 ? ((l.avg - globalAvg) / globalAvg) * 100 : 0;
                        const isPos = lift >= 0;
                        const liftColor = isPos
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400';
                        return `<div class="flex items-center gap-2">
                            <span class="text-[10px] font-medium text-gray-700 dark:text-gray-300 w-20 shrink-0">${escapeHtml(l.layout)}</span>
                            <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full bg-violet-400 rounded-full" style="width:${barW}%"></div>
                            </div>
                            <span class="text-[10px] font-bold tabular-nums text-gray-700 dark:text-gray-300 w-14 text-right shrink-0">${l.avg.toFixed(1)}</span>
                            <span class="text-[10px] font-bold ${liftColor} tabular-nums w-12 text-right shrink-0">${isPos ? '+' : ''}${lift.toFixed(0)}%</span>
                            <span class="text-[9px] text-gray-400 w-10 text-right shrink-0">${l.count}</span>
                        </div>`;
                    })
                    .join('')}
            </div>
        </div>`;
    }

    html += `<div class="text-[9px] text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-700">
            ${totalGamesInCombos} games with spec data · min 5 games per group
        </div>
    </div>`;

    container.innerHTML = html;
}
