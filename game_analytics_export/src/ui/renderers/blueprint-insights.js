/**
 * Blueprint advisor — Insights tab UI (feature pills, synergy, recipes, layout).
 */
import { escapeHtml, escapeAttr } from '../../lib/sanitize.js';
import { parseFeatures as parseFeatsLocal } from '../../lib/parse-features.js';
import { getReelGridCorrelation } from '../../lib/game-analytics-engine.js';
import { SHORT_FEATURE_LABELS } from '../../lib/features.js';
import { F } from '../../lib/game-fields.js';

const shortF = SHORT_FEATURE_LABELS;

export function renderFeaturePills(els, featScores, selectedFeatures) {
    els.featContainer.innerHTML = featScores
        .map(f => {
            const isSelected = selectedFeatures.has(f.feat);
            const hasData = f.lift !== null;
            const arrow = hasData ? (f.lift >= 0 ? '↑' : '↓') : '';
            const liftLabel = hasData ? `${arrow}${Math.abs(f.lift).toFixed(0)}%` : 'new';
            const cls = isSelected
                ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 shadow-sm'
                : !hasData
                  ? 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                  : f.lift >= 10
                    ? 'bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                    : f.lift >= 0
                      ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                      : 'bg-white dark:bg-gray-800 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20';
            return `<button class="bp-feat-pill inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150 cursor-pointer ${cls}" data-feat="${escapeAttr(f.feat)}">${isSelected ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ' : ''}${escapeHtml(shortF[f.feat] || f.feat)} <span class="text-xs opacity-75">${liftLabel}</span></button>`;
        })
        .join('');

    if (selectedFeatures.size > 0) {
        els.featCountBadge.textContent = `${selectedFeatures.size} selected`;
        els.featCountBadge.classList.remove('hidden');
    } else {
        els.featCountBadge.classList.add('hidden');
    }
}

export function renderSynergyPanel(container, themeGames, selectedFeatures, themeAvg, gameFeatSets) {
    let html = '';
    if (selectedFeatures.size >= 2) {
        const feats = [...selectedFeatures];
        const pairs = [];
        for (let i = 0; i < feats.length; i++) {
            for (let j = i + 1; j < feats.length; j++) {
                const bothGames = themeGames.filter(g => {
                    const fs = gameFeatSets?.get(g);
                    return fs
                        ? fs.has(feats[i]) && fs.has(feats[j])
                        : parseFeatsLocal(g.features).includes(feats[i]) &&
                              parseFeatsLocal(g.features).includes(feats[j]);
                });
                if (bothGames.length >= 2) {
                    const pairAvg = bothGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / bothGames.length;
                    const syn = themeAvg > 0 ? ((pairAvg - themeAvg) / themeAvg) * 100 : 0;
                    pairs.push({ a: feats[i], b: feats[j], syn });
                }
            }
        }
        if (pairs.length > 0) {
            html = pairs
                .map(p => {
                    const color =
                        p.syn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                    return `<div class="flex items-center gap-2 text-xs py-0.5">
                    <span class="text-gray-600 dark:text-gray-300">${escapeHtml(shortF[p.a] || p.a)} + ${escapeHtml(shortF[p.b] || p.b)}</span>
                    <span class="font-bold ${color}">${p.syn >= 0 ? '+' : ''}${p.syn.toFixed(0)}%</span>
                </div>`;
                })
                .join('');
        }
    }
    container.innerHTML = html;
}

export function renderInsightsTab(container, ctx) {
    const {
        themeGames,
        themeGamesUnfiltered,
        selectedFeatures,
        globalAvg,
        themeAvg,
        liftVsMarket,
        bestVol,
        avgRtp,
        FEATS,
        featureColors,
        selectedCategories,
        renderBlueprint,
        wouldImproveScore,
        currentScore,
        gameFeatSets,
        featOf,
    } = ctx;
    const _gfs = f => g => {
        const s = gameFeatSets?.get(g);
        return s ? s.has(f) : parseFeatsLocal(g.features).includes(f);
    };
    const _gfSet = g => gameFeatSets?.get(g) || new Set(parseFeatsLocal(g.features));
    let suggestPanelOpen = ctx.suggestPanelOpen || false;

    let predHtml = '';
    if (selectedFeatures.size > 0) {
        const selArr = [...selectedFeatures];
        const matchingGames = themeGames.filter(g => {
            const fs = _gfSet(g);
            return selArr.some(f => fs.has(f));
        });
        if (matchingGames.length >= 2) {
            const theos = matchingGames.map(g => g.performance_theo_win || 0).sort((a, b) => a - b);
            const p25 = theos[Math.floor(theos.length * 0.25)] || 0;
            const p75 = theos[Math.floor(theos.length * 0.75)] || 0;
            const barLeft = globalAvg > 0 ? Math.min(100, Math.max(0, (p25 / (globalAvg * 2)) * 100)) : 0;
            const barRight = globalAvg > 0 ? Math.min(100, Math.max(barLeft + 5, (p75 / (globalAvg * 2)) * 100)) : 50;
            const avgLine = globalAvg > 0 ? Math.min(100, (globalAvg / (globalAvg * 2)) * 100) : 50;
            const midpoint = (p25 + p75) / 2;
            const vsMkt = midpoint - globalAvg;
            const vsMktAbs = Math.abs(vsMkt).toFixed(1);
            const vsMktColor = vsMkt >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
            const vsMktLabel = vsMkt >= 0 ? `+${vsMktAbs} above market avg` : `${vsMktAbs} below market avg`;
            predHtml = `<div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 mb-5">
                <div class="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">Predicted Performance <span class="relative group"><button class="w-3.5 h-3.5 rounded-full bg-indigo-200 dark:bg-indigo-700 text-indigo-500 dark:text-indigo-300 flex items-center justify-center text-[8px] font-bold leading-none">?</button><span class="hidden group-hover:block absolute left-0 top-full mt-1 w-56 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed font-normal">25th–75th percentile of Theo Win for games matching your theme + selected features.</span></span></div>
                <div class="flex items-baseline gap-2 mb-1">
                    <span class="text-2xl font-bold text-gray-900 dark:text-white">${p25.toFixed(1)} – ${p75.toFixed(1)}</span>
                    <span class="text-sm text-gray-500">Theo Win</span>
                </div>
                <div class="text-base font-bold ${vsMktColor} mb-2">${vsMktLabel}</div>
                <div class="relative h-3 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mb-1.5">
                    <div class="absolute h-full bg-indigo-400/60 dark:bg-indigo-500/60 rounded-full" style="left:${barLeft}%;width:${barRight - barLeft}%"></div>
                    <div class="absolute top-0 bottom-0 w-0.5 bg-gray-500 dark:bg-gray-300" style="left:${avgLine}%"></div>
                </div>
                <div class="text-xs text-gray-500">Market avg: ${globalAvg.toFixed(1)} · Based on ${matchingGames.length} games</div>
            </div>`;
        }
    }

    // Build improvement suggestions — only features that would raise the composite score
    const improvementData = [];
    {
        const unselected = FEATS.filter(f => !selectedFeatures.has(f));
        for (const f of unselected) {
            const withF = themeGames.filter(_gfs(f));
            if (withF.length < 3) continue;
            const avgWithF = withF.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withF.length;
            const lift = themeAvg > 0 ? ((avgWithF - themeAvg) / themeAvg) * 100 : 0;
            if (lift > 0 && (!wouldImproveScore || wouldImproveScore(f))) {
                improvementData.push({ feat: f, lift, count: withF.length, avg: avgWithF });
            }
        }
        improvementData.sort((a, b) => b.lift - a.lift);
    }

    const hasImprovements = improvementData.length > 0;
    let suggestBtnHtml = '';
    if (hasImprovements) {
        const topImprovements = improvementData.slice(0, 3);
        const suggestRows = topImprovements
            .map((imp, i) => {
                const color = featureColors[imp.feat] || 'bg-gray-100 text-gray-700';
                return `<div class="flex items-center gap-2 py-2 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-700' : ''}">
                <span class="text-emerald-500 text-sm font-bold">+</span>
                <span class="px-2 py-0.5 rounded text-xs font-medium ${color}">${escapeHtml(shortF[imp.feat] || imp.feat)}</span>
                <span class="text-xs text-emerald-600 dark:text-emerald-400 font-bold">+${imp.lift.toFixed(0)}% lift</span>
                <span class="text-[10px] text-gray-400">${imp.count} games</span>
                <button class="bp-apply-suggestion ml-auto px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" data-feat="${escapeAttr(imp.feat)}">Apply</button>
            </div>`;
            })
            .join('');

        const panelHiddenClass = suggestPanelOpen ? '' : 'hidden';
        const btnLabel = suggestPanelOpen ? '<span>✕</span> Hide Suggestions' : '<span>💡</span> Suggest Improvements';

        suggestBtnHtml = `<div class="mb-5">
            <button type="button" class="bp-improve-btn w-full py-2.5 px-4 rounded-lg text-sm font-semibold border-2 border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all flex items-center justify-center gap-2">
                ${btnLabel}
            </button>
            <div class="bp-improve-panel ${panelHiddenClass} mt-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                <div class="flex items-center justify-between mb-2">
                    <div class="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Top ${Math.min(3, topImprovements.length)} Improvements</div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-gray-400">${selectedFeatures.size > 0 ? 'Best features to add' : 'Top features for this theme'}</span>
                        <button class="bp-apply-all px-3 py-1 rounded-md text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">Apply All</button>
                    </div>
                </div>
                ${suggestRows}
            </div>
        </div>`;
    }

    let recipeSection = '';
    try {
        const tGames = themeGames.map(g => ({
            feats: (featOf ? featOf(g) : parseFeatsLocal(g.features)).slice().sort(),
            theo: g.performance_theo_win || 0,
            g,
        }));
        const combos = [];
        for (let size = 2; size <= 4; size++) {
            const indices = [];
            const gen = start => {
                if (indices.length === size) {
                    const combo = indices.map(i => FEATS[i]);
                    const matching = tGames.filter(tg => combo.every(f => tg.feats.includes(f)));
                    if (matching.length >= 3) {
                        const avg = matching.reduce((s, tg) => s + tg.theo, 0) / matching.length;
                        const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg) * 100 : 0;
                        const layouts = {},
                            vols = {},
                            rtps = [],
                            providers = {},
                            bets = [];
                        let topGame = null,
                            topTheo = -1;
                        matching.forEach(tg => {
                            const g = tg.g;
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
                            if (tg.theo > topTheo) {
                                topTheo = tg.theo;
                                topGame = g;
                            }
                        });
                        const lk = Object.keys(layouts);
                        const domLayout = lk.length ? lk.reduce((a, b) => (layouts[a] >= layouts[b] ? a : b)) : '';
                        const vk = Object.keys(vols);
                        const domVol = vk.length ? vk.reduce((a, b) => (vols[a] >= vols[b] ? a : b)) : '';
                        const avgRTP = rtps.length >= 2 ? rtps.reduce((s, v) => s + v, 0) / rtps.length : null;
                        const pk = Object.keys(providers);
                        const domProvider = pk.length
                            ? pk.reduce((a, b) => (providers[a] >= providers[b] ? a : b))
                            : '';
                        const minBet = bets.length ? Math.min(...bets) : null;
                        combos.push({
                            feats: combo,
                            count: matching.length,
                            avg,
                            lift,
                            domLayout,
                            domVol,
                            avgRTP,
                            domProvider,
                            minBet,
                            topGame,
                        });
                    }
                    return;
                }
                for (let i = start; i < FEATS.length; i++) {
                    indices.push(i);
                    gen(i + 1);
                    indices.pop();
                }
            };
            gen(0);
        }
        combos.sort((a, b) => b.avg - a.avg);
        const topCombos = combos.slice(0, 5);
        if (topCombos.length > 0) {
            recipeSection = `<div class="mb-5">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">Best Feature Recipes <span class="relative group"><button class="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 flex items-center justify-center text-[8px] font-bold leading-none">?</button><span class="hidden group-hover:block absolute left-0 top-full mt-1 w-56 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed font-normal">Top 2-4 feature combos by avg Theo Win within this theme. Min 3 games per combo. Lift % is vs theme average.</span></span></div>
                ${topCombos
                    .map((c, i) => {
                        const hasSelected = selectedFeatures.size > 0 && c.feats.some(f => selectedFeatures.has(f));
                        const chips = c.feats
                            .map(
                                f =>
                                    `<span class="px-2 py-0.5 rounded text-xs font-medium ${featureColors[f] || 'bg-gray-100 text-gray-700'}">${escapeHtml(shortF[f] || f)}</span>`
                            )
                            .join('<span class="text-gray-400 text-[10px]">+</span>');
                        const liftColor = c.lift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500';
                        const specBadges = [
                            c.domLayout
                                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">📐 Layout ${escapeHtml(c.domLayout)}</span>`
                                : '',
                            c.domVol
                                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">⚡ Vol: ${escapeHtml(c.domVol)}</span>`
                                : '',
                            c.avgRTP != null
                                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">RTP ${c.avgRTP.toFixed(1)}%</span>`
                                : '',
                            c.minBet != null
                                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Min $${c.minBet.toFixed(2)}+</span>`
                                : '',
                            c.domProvider
                                ? `<span class="text-[8px] px-1 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">🏢 ${escapeHtml(c.domProvider)}</span>`
                                : '',
                        ]
                            .filter(Boolean)
                            .join('');
                        return `<div class="py-2 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-700' : ''} ${hasSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/10 rounded px-1' : ''}">
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-400 w-3">${i + 1}</span>
                            <div class="flex flex-wrap items-center gap-1 flex-1">${chips}</div>
                            <span class="text-xs text-gray-400">${c.count}</span>
                            <span class="text-sm font-bold ${liftColor} w-14 text-right">${c.lift >= 0 ? '+' : ''}${c.lift.toFixed(0)}%</span>
                        </div>
                        ${specBadges ? `<div class="flex flex-wrap gap-1 mt-1 ml-5">${specBadges}${c.topGame ? `<span class="text-[8px] text-gray-400 truncate max-w-[120px]">e.g. ${escapeHtml(c.topGame.name || '')}</span>` : ''}</div>` : ''}
                    </div>`;
                    })
                    .join('')}
            </div>`;
        }
    } catch {
        /* skip */
    }

    const mechMap = {};
    themeGames.forEach(g => {
        const m = g.mechanic_primary || g.mechanic || '';
        if (m) {
            if (!mechMap[m]) mechMap[m] = { count: 0, sum: 0 };
            mechMap[m].count++;
            mechMap[m].sum += g.performance_theo_win || 0;
        }
    });
    const topMechanics = Object.entries(mechMap)
        .map(([n, d]) => ({ name: n, count: d.count, avg: d.sum / d.count }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5);
    const studioGameCounts = {};
    themeGames.forEach(g => {
        const p = F.provider(g);
        if (p && p !== 'Unknown') studioGameCounts[p] = (studioGameCounts[p] || 0) + 1;
    });
    const topProvs = Object.entries(studioGameCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const themesLabel = [...selectedCategories].join(' & ');
    const featsLabel = [...selectedFeatures].map(f => shortF[f] || f);
    const topMech = topMechanics.length > 0 ? topMechanics[0].name : '';
    const topProv = topProvs.length > 0 ? topProvs[0][0] : '';
    const perfWord = liftVsMarket >= 10 ? 'strong' : liftVsMarket >= 0 ? 'solid' : 'competitive';
    const volWord = bestVol ? bestVol.name.toLowerCase() : 'mixed';
    let conceptText = `A <strong>${escapeHtml(themesLabel)}</strong>-themed slot`;
    if (featsLabel.length > 0)
        conceptText += ` featuring <strong>${featsLabel.map(f => escapeHtml(f)).join('</strong>, <strong>')}</strong>`;
    conceptText += `. The ${escapeHtml(themesLabel)} category has ${themeGames.length} games in market with ${perfWord} performance`;
    if (liftVsMarket !== 0) conceptText += ` (${liftVsMarket >= 0 ? '+' : ''}${liftVsMarket.toFixed(0)}% vs avg)`;
    conceptText += ` and ${volWord} volatility.`;
    if (topMech) conceptText += ` Top mechanic: <strong>${escapeHtml(topMech)}</strong>.`;
    if (topProv) conceptText += ` Market leader: ${escapeHtml(topProv)}.`;

    container.innerHTML = `
        <div class="mb-5 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/40">
            <div class="flex items-start gap-2"><span class="text-lg mt-0.5">💡</span><div>
                <div class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">Game Concept</div>
                <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${conceptText}</div>
            </div></div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-gray-900 dark:text-white">${themeGames.length}</div><div class="text-xs text-gray-500">Games</div></div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">${themeAvg.toFixed(1)}</div><div class="text-xs text-gray-500">Avg Theo</div></div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold ${liftVsMarket >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}">${liftVsMarket >= 0 ? '+' : ''}${liftVsMarket.toFixed(0)}%</div><div class="text-xs text-gray-500">vs Market</div></div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-gray-900 dark:text-white">${bestVol ? escapeHtml(bestVol.name) : '—'}</div><div class="text-xs text-gray-500">Volatility${avgRtp ? ` · ${avgRtp.toFixed(1)}%` : ''}</div></div>
        </div>
        ${predHtml}
        ${suggestBtnHtml}
        ${recipeSection}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div><div class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Top Mechanics</div><div class="space-y-1.5">${topMechanics.map((m, i) => `<div class="flex items-center gap-2 text-sm"><span class="w-4 text-gray-400">${i + 1}</span><span class="flex-1 text-gray-800 dark:text-gray-200 truncate">${escapeHtml(m.name)}</span><span class="text-gray-400 text-xs">${m.count}</span><span class="text-emerald-600 dark:text-emerald-400 font-semibold w-10 text-right">${m.avg.toFixed(1)}</span></div>`).join('') || '<span class="text-sm text-gray-400">No data</span>'}</div></div>
            <div><div class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Active Providers</div><div class="flex flex-wrap gap-1.5">${topProvs.map(([p, c]) => `<span class="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">${escapeHtml(p)} (${c})</span>`).join('')}</div></div>
        </div>
        ${renderRecommendedLayoutSection(themeGamesUnfiltered || themeGames)}`;

    // Wire up the Suggest Improvements button
    const improveBtn = container.querySelector('.bp-improve-btn');
    const improvePanel = container.querySelector('.bp-improve-panel');
    if (improveBtn && improvePanel) {
        improveBtn.addEventListener('click', () => {
            ctx.suggestPanelOpen = !ctx.suggestPanelOpen;
            if (ctx.suggestPanelOpen) {
                improvePanel.classList.remove('hidden');
                improveBtn.innerHTML = '<span>✕</span> Hide Suggestions';
            } else {
                improvePanel.classList.add('hidden');
                improveBtn.innerHTML = '<span>💡</span> Suggest Improvements';
            }
        });
        container.querySelectorAll('.bp-apply-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                const feat = btn.dataset.feat;
                if (feat && !selectedFeatures.has(feat)) {
                    selectedFeatures.add(feat);
                    ctx.suggestPanelOpen = true;
                    renderBlueprint();
                }
            });
        });
        const applyAllBtn = container.querySelector('.bp-apply-all');
        if (applyAllBtn) {
            applyAllBtn.addEventListener('click', () => {
                const topFeats = improvementData.slice(0, 3);
                topFeats.forEach(imp => {
                    if (!selectedFeatures.has(imp.feat)) selectedFeatures.add(imp.feat);
                });
                ctx.suggestPanelOpen = true;
                renderBlueprint();
            });
        }
    }
}

/** Theme-scoped layout distribution + summary (uses same engine as global correlation). */
export function renderRecommendedLayoutSection(themeGames) {
    const totalTheme = themeGames.length;
    if (totalTheme === 0) return '';

    const { layouts } = getReelGridCorrelation(themeGames);
    if (!layouts.length) {
        return `<div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                <span>📐</span> Recommended Layout
            </h4>
            <p class="text-[11px] text-gray-500 dark:text-gray-400">No reel grid specs for games in this theme selection.</p>
        </div>`;
    }

    const mostCommon = layouts[0];
    const pctCommon = Math.round((mostCommon.count / totalTheme) * 1000) / 10;
    const bestPerforming = [...layouts].sort((a, b) => b.avgTheo - a.avgTheo || b.count - a.count)[0];

    const summaryLine = `Most common: <strong>${escapeHtml(mostCommon.layout)}</strong> (used in ${pctCommon}% of theme games) | Best performing: <strong>${escapeHtml(bestPerforming.layout)}</strong> (avg theo ${bestPerforming.avgTheo.toFixed(2)})`;

    const bars = layouts
        .slice(0, 8)
        .map(l => {
            const pct = Math.round((l.count / totalTheme) * 1000) / 10;
            const barW = Math.min(100, pct);
            return `<div class="flex items-center gap-2">
            <span class="text-[11px] font-medium text-gray-800 dark:text-gray-200 w-12">${escapeHtml(l.layout)}</span>
            <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-indigo-400 dark:bg-indigo-500 rounded-full" style="width:${barW}%"></div>
            </div>
            <span class="text-[10px] text-gray-500 w-20 text-right tabular-nums">${pct}% · ${l.avgTheo.toFixed(2)}</span>
        </div>`;
        })
        .join('');

    return `<div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
            <span>📐</span> Recommended Layout
        </h4>
        <p class="text-[10px] text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">${summaryLine}</p>
        <div class="space-y-1.5">${bars}</div>
    </div>`;
}
