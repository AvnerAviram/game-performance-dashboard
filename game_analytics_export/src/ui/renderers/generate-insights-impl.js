/**
 * Insights orchestrator — wires up heatmaps, recipes, strategic cards,
 * combo explorer, outliers, and delegates to blueprint-advisor.js.
 */
import { gameData } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { log, warn } from '../../lib/env.js';
import { parseFeatsLocal } from './overview-renderer.js';
import { getBuildNextCombos, getAvoidCombos } from '../../features/idea-generator.js';
import { createMarketLandscapeChart } from '../charts-modern.js';
import { CANONICAL_FEATURES, SHORT_FEATURE_LABELS } from '../../lib/features.js';
import { initBlueprint } from './blueprint-advisor.js';

const shortF = SHORT_FEATURE_LABELS;

export function generateInsights() {
    log('💡 generateInsights() called');

    const heatmapDiv = document.getElementById('heatmap-container');
    const comboDiv = document.getElementById('combo-explorer');
    const buildNextDiv = document.getElementById('insight-build-next');
    const avoidDiv = document.getElementById('insight-avoid');
    const watchDiv = document.getElementById('insight-watch');

    log('  - Generating insights from', gameData.themes?.length || 0, 'themes...');

    renderRecipeLeaderboard();
    renderFeatureHeatmap(heatmapDiv);
    renderFeatureStacking();

    // Game Blueprint (Game Lab page only)
    const isGameLabPage = !!heatmapDiv;
    if (isGameLabPage || document.getElementById('blueprint-advisor-wrapper')) {
        try { initBlueprint(); log('  ✅ Blueprint advisor initialized'); } catch (e) { warn('Blueprint init:', e); }
    }

    renderComboExplorer(comboDiv);
    renderStrategicCards(buildNextDiv, avoidDiv, watchDiv);

    if (document.getElementById('market-landscape-chart')) {
        try { createMarketLandscapeChart(); log('  ✅ Market Landscape chart created'); } catch (e) { warn('Market Landscape chart:', e); }
    }
    if (document.getElementById('provider-theme-matrix')) {
        generateProviderThemeMatrix();
        log('  ✅ Provider theme matrix generated');
    }

    renderPerformanceOutliers();

    log('💡 All insights generated successfully');
}

// ---------------------------------------------------------------------------
// Recipe Leaderboard
// ---------------------------------------------------------------------------

function renderRecipeLeaderboard() {
    const leaderboardEl = document.getElementById('feature-leaderboard');
    if (!leaderboardEl) return;

    const allGames = gameData.allGames || [];
    const globalAvg = allGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / (allGames.length || 1);

    const recipeMap = {};
    allGames.forEach(g => {
        const feats = parseFeatsLocal(g.features);
        if (feats.length < 2) return;
        const key = [...feats].sort().join(' + ');
        if (!recipeMap[key]) recipeMap[key] = { features: [...feats].sort(), games: [], totalTheo: 0 };
        recipeMap[key].games.push(g);
        recipeMap[key].totalTheo += (g.performance_theo_win || 0);
    });

    const recipes = Object.values(recipeMap)
        .filter(r => r.games.length >= 3)
        .map(r => {
            const avgTheo = r.totalTheo / r.games.length;
            const vsMarket = globalAvg > 0 ? ((avgTheo - globalAvg) / globalAvg * 100) : 0;
            const topGame = r.games.sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))[0];
            const themes = {};
            r.games.forEach(g => { const t = g.theme_consolidated || 'Unknown'; themes[t] = (themes[t] || 0) + 1; });
            const topTheme = Object.entries(themes).sort((a, b) => b[1] - a[1])[0];
            return { ...r, avgTheo, vsMarket, topGame, topTheme: topTheme?.[0] || '', featureCount: r.features.length };
        })
        .sort((a, b) => b.avgTheo - a.avgTheo);

    const topRecipes = recipes.slice(0, 20);
    const INITIAL_SHOW = 5;
    const medals = ['🥇', '🥈', '🥉'];

    function renderRecipeRow(r, i) {
        const barWidth = topRecipes[0].avgTheo > 0 ? (r.avgTheo / topRecipes[0].avgTheo * 100) : 0;
        const vsColor = r.vsMarket >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
        const vsBg = r.vsMarket >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20';
        const vsIcon = r.vsMarket >= 0 ? '▲' : '▼';
        const barColor = i < 3 ? 'from-amber-400 to-orange-500' : r.vsMarket >= 0 ? 'from-emerald-400 to-teal-500' : 'from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-500';
        const rank = i < 3 ? medals[i] : `<span class="text-[10px] font-bold text-gray-400">${i + 1}</span>`;
        const chips = r.features.map(f => `<span class="inline-block px-1 py-0.5 text-[9px] rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">${escapeHtml(shortF[f] || f)}</span>`).join('');
        return `
        <div class="recipe-row flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-all ${i >= INITIAL_SHOW ? 'hidden' : ''} ${i < 3 ? 'bg-gradient-to-r from-amber-50/30 to-transparent dark:from-amber-900/10' : ''}">
            <div class="w-5 text-center shrink-0 text-xs">${rank}</div>
            <div class="flex flex-wrap gap-0.5 min-w-0 flex-1">${chips}</div>
            <div class="flex items-center gap-1.5 shrink-0">
                <div class="w-16 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r ${barColor}" style="width:${barWidth}%"></div>
                </div>
                <span class="text-xs font-bold text-gray-900 dark:text-white tabular-nums w-8 text-right">${r.avgTheo.toFixed(1)}</span>
                <span class="inline-flex px-1 py-0.5 rounded text-[9px] font-semibold ${vsColor} ${vsBg}">${vsIcon}${Math.abs(r.vsMarket).toFixed(0)}%</span>
                <span class="text-[9px] text-gray-400 w-8 text-right">${r.games.length}g</span>
            </div>
        </div>`;
    }

    leaderboardEl.innerHTML = topRecipes.length > 0 ? `
    <div class="space-y-0.5" id="recipe-list">
        ${topRecipes.map((r, i) => renderRecipeRow(r, i)).join('')}
    </div>
    ${topRecipes.length > INITIAL_SHOW ? `<button id="recipe-toggle" class="w-full mt-2 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors" onclick="const rows=document.querySelectorAll('.recipe-row.hidden');const btn=this;if(rows.length){rows.forEach(r=>r.classList.remove('hidden'));btn.textContent='Show less';}else{document.querySelectorAll('.recipe-row').forEach((r,i)=>{if(i>=${INITIAL_SHOW})r.classList.add('hidden');});btn.textContent='Show all ${topRecipes.length} recipes';}">Show all ${topRecipes.length} recipes</button>` : ''}
    <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-[9px] text-gray-400 dark:text-gray-500">
        ${recipes.length} combos · avg: ${globalAvg.toFixed(1)} · ${recipes.filter(r => r.vsMarket >= 0).length} beat market
    </div>` : '<p class="text-xs text-gray-400 p-2">Not enough games with multi-feature data</p>';
}

// ---------------------------------------------------------------------------
// Feature Impact Heatmap
// ---------------------------------------------------------------------------

function renderFeatureHeatmap(heatmapDiv) {
    if (!heatmapDiv) return;
    try {
        const allG = gameData.allGames || [];
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

        const topThemeNames = (gameData.themes || [])
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
                return { avgTheo: avg, count: withFeat.length, lift, themeAvg, names: withFeat.sort((a,b) => b.theo - a.theo).slice(0,4).map(g => g.name) };
            });
        });

        const allLifts = matrix.flat().filter(Boolean).map(x => x.lift);
        const maxLift = Math.max(...allLifts.map(Math.abs), 1);

        heatmapDiv.innerHTML = `
            <div class="relative">
            <div id="heatmap-tooltip" class="fixed z-[9999] pointer-events-none opacity-0 transition-opacity duration-150" style="display:none"></div>
            <table class="heatmap-table text-[11px] border-collapse w-full">
                <thead><tr>
                    <th class="p-2 text-left font-medium text-gray-600 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10 min-w-[90px]"></th>
                    ${FEATS.map(f => `<th class="pb-2 pt-0 px-1 text-center font-medium text-gray-600 dark:text-gray-400" title="${escapeAttr(f)}"><div style="writing-mode:vertical-lr;transform:rotate(180deg);white-space:nowrap;font-size:9px;max-height:90px;overflow:hidden;text-overflow:ellipsis;margin:0 auto">${escapeHtml(shortF[f]||f)}</div></th>`).join('')}
                </tr></thead>
                <tbody>
                    ${topThemeNames.map((t, i) => `
                        <tr>
                            <td class="p-2 font-medium text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 z-10 whitespace-nowrap text-[10px]">${escapeHtml(t)}</td>
                            ${matrix[i].map((cell, j) => {
                                if (!cell) return '<td class="p-1 min-w-[44px] h-8 bg-gray-50 dark:bg-gray-700/30 rounded text-center text-[9px] text-gray-300 dark:text-gray-600">·</td>';
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
                                const oppMarker = isOpportunity ? '<span class="text-amber-500 text-[8px] ml-0.5" title="Opportunity: high lift, few games">◆</span>' : '';
                                return `<td class="hm-cell p-1 min-w-[44px] h-8 text-center align-middle rounded cursor-pointer transition-all duration-150 hover:scale-110 hover:z-20 hover:shadow-lg hover:ring-2 hover:ring-white/60 text-[10px] font-semibold" style="background:${bg};color:${textCol}" data-theme="${escapeAttr(t)}" data-feat="${escapeAttr(FEATS[j])}" data-theo="${cell.avgTheo.toFixed(2)}" data-count="${count}" data-lift="${lift.toFixed(1)}" data-tavg="${cell.themeAvg.toFixed(2)}" data-names="${escapeAttr(cell.names.join('|'))}" onclick="if(window.useOpportunityCombo){${safeOnclick('window.useOpportunityCombo', t, FEATS[j])}}">${display}${oppMarker}</td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
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
    } catch { /* graceful degradation — show fallback message */
        heatmapDiv.innerHTML = '<p class="text-sm text-gray-500">Heatmap data unavailable</p>';
    }
}

function wireHeatmapTooltip(heatmapDiv) {
    const tooltip = document.getElementById('heatmap-tooltip');
    if (!tooltip) return;

    heatmapDiv.addEventListener('mouseover', (e) => {
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
        const perfLabel = lift >= 20 ? '🔥 Strong boost' : lift >= 5 ? '✅ Positive impact' : lift >= -5 ? '➡️ Neutral' : lift >= -20 ? '⚠️ Negative impact' : '❌ Strong drag';
        tooltip.innerHTML = `
            <div class="bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700 px-4 py-3 min-w-[220px] max-w-[300px]">
                <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">${escapeHtml(theme)}</div>
                <div class="text-xs text-gray-300 mb-2">+ ${escapeHtml(feat)}</div>
                <div class="flex items-baseline gap-2 mb-1.5">
                    <span class="text-lg font-bold ${liftColor}">${isPositive ? '+' : ''}${lift.toFixed(1)}%</span>
                    <span class="text-[10px] text-gray-400">lift vs theme avg</span>
                </div>
                <div class="flex items-center justify-between text-[11px] mb-1">
                    <span class="text-gray-400">With feature: <span class="text-white font-medium">${theo.toFixed(2)}</span> avg theo</span>
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
        requestAnimationFrame(() => tooltip.style.opacity = '1');
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

    heatmapDiv.addEventListener('mouseout', (e) => {
        const td = e.target.closest('.hm-cell');
        if (!td) return;
        const related = e.relatedTarget;
        if (related && (related.closest('.hm-cell') || related.closest('#heatmap-tooltip'))) return;
        tooltip.style.opacity = '0';
        setTimeout(() => { if (tooltip.style.opacity === '0') tooltip.style.display = 'none'; }, 150);
    });
}

// ---------------------------------------------------------------------------
// Feature Stacking Analysis
// ---------------------------------------------------------------------------

function renderFeatureStacking() {
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
        synergyWrapper.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div class="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🧬</span>
                    <div>
                        <h3 class="text-sm font-bold text-gray-900 dark:text-white leading-none">Feature Stacking — How many features should you use?</h3>
                        <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Performance by feature count and which features add the most value when stacked</p>
                    </div>
                </div>
            </div>
            <div id="synergy-container" class="p-4"></div>
        </div>`;
    }
    const synergyDiv = document.getElementById('synergy-container');
    if (!synergyDiv) return;

    try {
        const allG = gameData.allGames || [];
        const FEATS = CANONICAL_FEATURES;
        const globalAvg = allG.length > 0 ? allG.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allG.length : 0;

        const byCount = {};
        allG.forEach(g => {
            const feats = parseFeatsLocal(g.features);
            const n = feats.length;
            if (!byCount[n]) byCount[n] = { games: [], totalTheo: 0 };
            byCount[n].games.push(g);
            byCount[n].totalTheo += (g.performance_theo_win || 0);
        });
        const countStats = Object.entries(byCount)
            .map(([n, d]) => ({ count: parseInt(n), gameCount: d.games.length, avgTheo: d.totalTheo / d.games.length }))
            .sort((a, b) => a.count - b.count);
        const maxAvg = Math.max(...countStats.map(c => c.avgTheo), 1);

        const featureAddValue = {};
        FEATS.forEach(feat => {
            const withFeat = allG.filter(g => parseFeatsLocal(g.features).includes(feat));
            const withoutFeat = allG.filter(g => !parseFeatsLocal(g.features).includes(feat));
            if (withFeat.length < 3 || withoutFeat.length < 3) return;
            const avgWith = withFeat.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withFeat.length;
            const avgWithout = withoutFeat.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withoutFeat.length;
            const lift = avgWithout > 0 ? ((avgWith - avgWithout) / avgWithout * 100) : 0;
            featureAddValue[feat] = { avgWith, avgWithout, lift, count: withFeat.length };
        });
        const sortedFeatures = Object.entries(featureAddValue)
            .map(([f, d]) => ({ feature: f, ...d }))
            .sort((a, b) => b.lift - a.lift);
        const maxLift = Math.max(...sortedFeatures.map(f => Math.abs(f.lift)), 1);

        synergyDiv.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Performance by Feature Count</h4>
                    <div class="space-y-2">
                        ${countStats.map(c => {
                            const barW = maxAvg > 0 ? (c.avgTheo / maxAvg * 100) : 0;
                            const vsColor = c.avgTheo >= globalAvg ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';
                            const barColor = c.avgTheo >= globalAvg ? 'bg-emerald-400' : 'bg-amber-400';
                            const label = c.count === 0 ? 'No features' : c.count === 1 ? '1 feature' : `${c.count} features`;
                            return `
                            <div class="flex items-center gap-3">
                                <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-24 shrink-0">${label}</span>
                                <div class="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full ${barColor} rounded-full" style="width:${barW}%"></div>
                                </div>
                                <span class="text-xs font-bold ${vsColor} tabular-nums w-12 text-right shrink-0">${c.avgTheo.toFixed(1)}</span>
                                <span class="text-[10px] text-gray-400 w-16 text-right shrink-0">${c.gameCount} games</span>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="mt-2 text-[10px] text-gray-400 dark:text-gray-500">Market avg: ${globalAvg.toFixed(1)} · More features generally = higher performance</div>
                </div>
                <div>
                    <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">Feature Lift — impact when added to a game</h4>
                    <div class="space-y-1.5">
                        ${sortedFeatures.map(f => {
                            const barW = maxLift > 0 ? (Math.abs(f.lift) / maxLift * 100) : 0;
                            const isPos = f.lift >= 0;
                            const liftColor = isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                            const barColor = isPos ? 'bg-emerald-400' : 'bg-red-400';
                            return `
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] font-medium text-gray-700 dark:text-gray-300 w-24 shrink-0 truncate">${escapeHtml(shortF[f.feature] || f.feature)}</span>
                                <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full ${barColor} rounded-full" style="width:${barW}%"></div>
                                </div>
                                <span class="text-[11px] font-bold ${liftColor} tabular-nums w-14 text-right shrink-0">${isPos ? '+' : ''}${f.lift.toFixed(1)}%</span>
                                <span class="text-[9px] text-gray-400 w-14 text-right shrink-0">${f.count} games</span>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="mt-2 text-[10px] text-gray-400 dark:text-gray-500">Lift = avg performance of games with feature vs games without</div>
                </div>
            </div>
            </div>
            <div class="flex items-center justify-center gap-4 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 text-[9px] text-gray-400">
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:rgba(16,185,129,0.5)"></span> Synergy boost (pair outperforms solo)</span>
                <span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:rgba(239,68,68,0.5)"></span> Anti-synergy (pair underperforms)</span>
                <span>Min 3 games per pair</span>
            </div>
        `;
    } catch { /* graceful degradation — show fallback message */
        synergyDiv.innerHTML = '<p class="text-sm text-gray-500">Feature synergy data unavailable</p>';
    }
}

// ---------------------------------------------------------------------------
// Combo Explorer
// ---------------------------------------------------------------------------

function renderComboExplorer(comboDiv) {
    if (!comboDiv) return;
    try {
        const allG = gameData.allGames || [];
        const FEATS = CANONICAL_FEATURES;
        const featureColors = {
            'Cash On Reels': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
            'Expanding Reels': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
            'Free Spins': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
            'Hold and Spin': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
            'Nudges': 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
            'Persistence': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
            'Pick Bonus': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
            'Respin': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
            'Static Jackpot': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
            'Wheel': 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
            'Wild Reels': 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
        };

        const themeMap = {};
        allG.forEach(g => {
            const theme = g.theme_consolidated || '';
            if (!theme || /^unknown$/i.test(theme)) return;
            if (!themeMap[theme]) themeMap[theme] = [];
            themeMap[theme].push({ feats: parseFeatsLocal(g.features).sort(), theo: g.performance_theo_win || 0 });
        });

        const allCombos = [];
        for (const [theme, games] of Object.entries(themeMap)) {
            if (games.length < 5) continue;
            const themeAvg = games.reduce((s, g) => s + g.theo, 0) / games.length;
            const combos = {};
            games.forEach(g => {
                const f = g.feats.filter(x => FEATS.includes(x));
                for (let i = 0; i < f.length; i++) for (let j = i+1; j < f.length; j++) {
                    const k = `${f[i]}|${f[j]}`;
                    if (!combos[k]) combos[k] = { feats: [f[i], f[j]], count: 0, total: 0 };
                    combos[k].count++; combos[k].total += g.theo;
                }
                for (let i = 0; i < f.length; i++) for (let j = i+1; j < f.length; j++) for (let k = j+1; k < f.length; k++) {
                    const key = `${f[i]}|${f[j]}|${f[k]}`;
                    if (!combos[key]) combos[key] = { feats: [f[i], f[j], f[k]], count: 0, total: 0 };
                    combos[key].count++; combos[key].total += g.theo;
                }
                for (let i = 0; i < f.length; i++) for (let j = i+1; j < f.length; j++) for (let k = j+1; k < f.length; k++) for (let l = k+1; l < f.length; l++) {
                    const key = `${f[i]}|${f[j]}|${f[k]}|${f[l]}`;
                    if (!combos[key]) combos[key] = { feats: [f[i], f[j], f[k], f[l]], count: 0, total: 0 };
                    combos[key].count++; combos[key].total += g.theo;
                }
            });
            Object.values(combos).forEach(c => {
                if (c.count >= 3) {
                    const avg = c.total / c.count;
                    const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg * 100) : 0;
                    allCombos.push({ theme, feats: c.feats, count: c.count, avg, lift, themeAvg });
                }
            });
        }

        allCombos.sort((a, b) => b.avg - a.avg);
        const topCombos = allCombos.slice(0, 20);
        const maxComboAvg = topCombos.length > 0 ? topCombos[0].avg : 1;

        if (topCombos.length > 0) {
            comboDiv.innerHTML = `<div class="space-y-1.5">
                ${topCombos.map((c, i) => {
                    const barW = Math.max(8, (c.avg / maxComboAvg) * 100);
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span class="text-[9px] text-gray-400 w-5 text-center">${i+1}</span>`;
                    const liftColor = c.lift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                    const sizeLabel = c.feats.length === 2 ? '2F' : c.feats.length === 3 ? '3F' : '4F';
                    const sizeBg = c.feats.length === 2 ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : c.feats.length === 3 ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
                    return `
                    <div class="group flex items-start gap-2 p-2 rounded-lg hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all">
                        <span class="shrink-0 mt-0.5 w-5 text-center">${medal}</span>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1.5 mb-1">
                                <span class="text-[10px] font-bold text-gray-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showThemeDetails', c.theme)}">${escapeHtml(c.theme)}</span>
                                <span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full ${sizeBg}">${sizeLabel}</span>
                            </div>
                            <div class="flex flex-wrap gap-1 mb-1">
                                ${c.feats.map(f => `<span class="px-1.5 py-0.5 text-[9px] font-semibold rounded-full ${featureColors[f] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'} whitespace-nowrap">${escapeHtml(shortF[f]||f)}</span>`).join('')}
                            </div>
                            <div class="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400" style="width:${barW}%"></div>
                            </div>
                        </div>
                        <div class="shrink-0 text-right">
                            <div class="text-xs font-bold text-gray-900 dark:text-white tabular-nums">${c.avg.toFixed(1)}</div>
                            <div class="text-[9px] ${liftColor} font-medium tabular-nums">${c.lift >= 0 ? '+' : ''}${c.lift.toFixed(0)}%</div>
                            <div class="text-[9px] text-gray-400">${c.count} games</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
        } else {
            comboDiv.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">No combo data available</p>';
        }
    } catch { /* graceful degradation — show fallback message */
        comboDiv.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">Combo data unavailable</p>';
    }
}

// ---------------------------------------------------------------------------
// Strategic Cards (Build Next / Avoid / Watch)
// ---------------------------------------------------------------------------

function renderStrategicCards(buildNextDiv, avoidDiv, watchDiv) {
    if (buildNextDiv) {
        const buildNext = getBuildNextCombos(5);
        buildNextDiv.innerHTML = buildNext.length > 0 ? buildNext.map(c => `
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0"><div class="text-xs font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(c.theme)} + ${escapeHtml(c.feature)}</div></div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">${c.count} games</span>
                    <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">${c.avgTheo.toFixed(1)} avg theo</span>
                </div>
            </div>
        `).join('') : '<p class="text-xs text-gray-400">No opportunities detected</p>';
        log('  ✅ Build Next generated');
    }
    if (avoidDiv) {
        const avoid = getAvoidCombos(5);
        avoidDiv.innerHTML = avoid.length > 0 ? avoid.map(c => `
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0"><div class="text-xs font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(c.theme)} + ${escapeHtml(c.feature)}</div></div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">${c.count} games</span>
                    <span class="text-[10px] font-bold text-red-600 dark:text-red-400">${c.avgTheo.toFixed(1)} avg theo</span>
                </div>
            </div>
        `).join('') : '<p class="text-xs text-gray-400">No underperformers</p>';
        log('  ✅ Avoid generated');
    }
    if (watchDiv) {
        const themes = (gameData.themes || []).filter(t => {
            const gc = t['Game Count'] || 0;
            return gc >= 2 && gc <= 10;
        });
        const avgTheos = themes.map(t => t['Avg Theo Win Index'] || 0).filter(x => x > 0);
        const medianTheo = avgTheos.length ? ([...avgTheos].sort((a,b)=>a-b)[Math.floor(avgTheos.length/2)]) : 3;
        const watchThemes = themes
            .filter(t => (t['Avg Theo Win Index'] || 0) >= medianTheo)
            .sort((a, b) => (b['Avg Theo Win Index'] || 0) - (a['Avg Theo Win Index'] || 0))
            .slice(0, 5);
        watchDiv.innerHTML = watchThemes.length > 0 ? watchThemes.map(t => `
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0"><div class="text-xs font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(t.Theme)}</div></div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">${t['Game Count']} games</span>
                    <span class="text-[10px] font-bold text-amber-600 dark:text-amber-400">${(t['Avg Theo Win Index'] || 0).toFixed(1)} avg theo</span>
                </div>
            </div>
        `).join('') : '<p class="text-xs text-gray-400">No themes to watch</p>';
        log('  ✅ Watch generated');
    }
}

// ---------------------------------------------------------------------------
// Performance Outliers
// ---------------------------------------------------------------------------

function renderPerformanceOutliers() {
    const topOutliersDiv = document.getElementById('top-outliers');
    const bottomOutliersDiv = document.getElementById('bottom-outliers');
    if (!topOutliersDiv || !bottomOutliersDiv) return;

    const top10 = (gameData.top_anomalies || []).slice(0, 10);
    const bottom10 = (gameData.bottom_anomalies || []).slice(0, 10);
    const renderOutlierCard = (a, type) => {
        const isTop = type === 'top';
        const colorClass = isTop ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
        const gameObj = (gameData.allGames || []).find(g => g.name === a.game);
        const provider = gameObj?.provider_studio || gameObj?.provider || '';
        return `
        <div class="flex items-center justify-between gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-sm transition-shadow cursor-pointer" onclick="${safeOnclick('window.showGameDetails', a.game || '')}">
            <div class="min-w-0 flex-1">
                <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(a.game)}</div>
                ${provider ? `<div class="text-[10px] text-gray-400 truncate">${escapeHtml(provider)}</div>` : ''}
            </div>
            <div class="shrink-0 text-right">
                <span class="text-sm font-bold ${colorClass}">${(a.theo_win_index || 0).toFixed(2)}</span>
                <div class="text-[9px] text-gray-400">${a.themes?.length ? escapeHtml(a.themes[0]) : ''}</div>
            </div>
        </div>`;
    };
    topOutliersDiv.innerHTML = top10.length > 0 ? top10.map(a => renderOutlierCard(a, 'top')).join('') : '<p class="text-xs text-gray-400">No data</p>';
    bottomOutliersDiv.innerHTML = bottom10.length > 0 ? bottom10.map(a => renderOutlierCard(a, 'bottom')).join('') : '<p class="text-xs text-gray-400">No data</p>';
    log('  ✅ Performance outliers generated');
}

// ---------------------------------------------------------------------------
// Provider Theme Matrix
// ---------------------------------------------------------------------------

function generateProviderThemeMatrix() {
    const container = document.getElementById('provider-theme-matrix');
    if (!container) return;

    const allGames = gameData.allGames || [];
    if (!allGames.length) { container.innerHTML = '<p class="text-sm text-gray-500">No data</p>'; return; }

    const providerMap = {};
    allGames.forEach(g => {
        const prov = g.provider_studio || g.provider || '';
        const theme = g.theme_consolidated || g.theme_primary || '';
        const theo = g.performance_theo_win || 0;
        if (!prov || !theme) return;
        if (!providerMap[prov]) providerMap[prov] = { total: 0, totalTheo: 0, themes: {} };
        providerMap[prov].total++;
        providerMap[prov].totalTheo += theo;
        if (!providerMap[prov].themes[theme]) providerMap[prov].themes[theme] = { count: 0, totalTheo: 0 };
        providerMap[prov].themes[theme].count++;
        providerMap[prov].themes[theme].totalTheo += theo;
    });

    const topProviders = Object.entries(providerMap)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);

    let html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">';
    topProviders.forEach(([prov, data]) => {
        const avgTheo = data.totalTheo / data.total;
        const bestTheme = Object.entries(data.themes)
            .sort((a, b) => {
                const aAvg = a[1].totalTheo / a[1].count;
                const bAvg = b[1].totalTheo / b[1].count;
                if (b[1].count !== a[1].count && Math.min(a[1].count, b[1].count) < 2) return b[1].count - a[1].count;
                return bAvg - aAvg;
            })[0];
        const bestThemeName = bestTheme ? bestTheme[0] : 'N/A';
        const bestTheoAvg = bestTheme ? (bestTheme[1].totalTheo / bestTheme[1].count) : 0;
        const bestThemeCount = bestTheme ? bestTheme[1].count : 0;
        const themeCount = Object.keys(data.themes).length;
        const topThemes = Object.entries(data.themes)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 3)
            .map(([t, d]) => `${t} (${d.count})`);

        html += `
            <div class="p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-sm transition-shadow">
                <div class="text-xs font-bold text-gray-900 dark:text-white truncate mb-1" title="${escapeAttr(prov)}">${escapeHtml(prov)}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400 mb-2">${data.total} games · ${themeCount} themes · ${avgTheo.toFixed(1)} avg</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Best performing:</div>
                <div class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate" title="${escapeAttr(bestThemeName)}">${escapeHtml(bestThemeName)}</div>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">${bestTheoAvg.toFixed(1)} avg</span>
                    <span class="text-[10px] text-gray-400">${bestThemeCount} games</span>
                </div>
                <div class="text-[9px] text-gray-400 dark:text-gray-500 mt-1.5 truncate" title="${escapeAttr(topThemes.join(', '))}">Top: ${escapeHtml(topThemes.join(', '))}</div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}
