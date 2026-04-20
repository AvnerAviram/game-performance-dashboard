/**
 * Blueprint advisor — Competition tab UI.
 */
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { parseFeatures as parseFeatsLocal } from '../../lib/parse-features.js';
import { SHORT_FEATURE_LABELS } from '../../lib/features.js';
import { F } from '../../lib/game-fields.js';

const shortF = SHORT_FEATURE_LABELS;

export function renderCompetitionTab(container, ctx) {
    const { themeGames, selectedFeatures, FEATS, featureColors, gameFeatSets, featOf } = ctx;
    const _fs = g => gameFeatSets?.get(g) || new Set(parseFeatsLocal(g.features));
    const _fa = g => (featOf ? featOf(g) : parseFeatsLocal(g.features));
    const selArr = [...selectedFeatures];
    let compGames;
    if (selArr.length > 0) {
        compGames = themeGames
            .map(g => {
                const gf = _fa(g);
                const gfSet = _fs(g);
                const featOverlap = selArr.filter(f => gfSet.has(f)).length;
                const featTotal = new Set([...selectedFeatures, ...gf.filter(f => FEATS.includes(f))]).size;
                const jaccard = featTotal > 0 ? featOverlap / featTotal : 0;
                return { ...g, jaccard, gf };
            })
            .filter(g => g.jaccard > 0)
            .sort((a, b) => b.jaccard - a.jaccard || (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
            .slice(0, 8);
    } else {
        compGames = [...themeGames]
            .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
            .slice(0, 8)
            .map(g => ({ ...g, gf: _fa(g) }));
    }

    const exactMatches =
        selArr.length > 0
            ? themeGames.filter(g => {
                  const fs = _fs(g);
                  return selArr.every(f => fs.has(f));
              })
            : [];
    const exactCount = exactMatches.length;
    const blueOcean = selectedFeatures.size >= 2 && exactCount === 0;

    const densityLabel =
        exactCount === 0 ? 'Blue Ocean' : exactCount <= 3 ? 'Low' : exactCount <= 8 ? 'Moderate' : 'High';
    const densityColor =
        exactCount === 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : exactCount <= 3
              ? 'text-blue-600 dark:text-blue-400'
              : exactCount <= 8
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-500';
    const nudgeHint =
        selectedFeatures.size === 0
            ? `<div class="mb-5 px-4 py-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-sm text-gray-500 dark:text-gray-400 text-center">Select features in the left panel to see competitor analysis</div>`
            : '';

    // ── Market Saturation ──
    let saturationSection = '';
    if (selectedFeatures.size > 0) {
        const exactProviderSet = new Set(exactMatches.map(g => F.provider(g)).filter(p => p && p !== 'Unknown'));
        const exactPct = exactCount / (themeGames.length || 1);
        const densityScore = Math.min(75, exactPct * 120);
        const providerBonus = Math.min(25, exactProviderSet.size * 2.5);
        const satScore = Math.round(Math.min(100, densityScore + providerBonus));

        const satColor =
            satScore < 25
                ? 'text-emerald-600 dark:text-emerald-400'
                : satScore < 50
                  ? 'text-blue-600 dark:text-blue-400'
                  : satScore < 75
                    ? 'text-amber-500'
                    : 'text-red-500';
        const satBg =
            satScore < 25
                ? 'bg-emerald-500'
                : satScore < 50
                  ? 'bg-blue-500'
                  : satScore < 75
                    ? 'bg-amber-500'
                    : 'bg-red-500';
        const satLabel = satScore < 25 ? 'Low' : satScore < 50 ? 'Moderate' : satScore < 75 ? 'High' : 'Very High';

        const topCompetitor = [...exactMatches].sort((a, b) => (F.theoWin(b) || 0) - (F.theoWin(a) || 0))[0];

        const featFreq = {};
        exactMatches.forEach(g => {
            _fa(g)
                .filter(f => FEATS.includes(f))
                .forEach(f => {
                    featFreq[f] = (featFreq[f] || 0) + 1;
                });
        });
        const n = exactCount || 1;
        const differentiated = [...selectedFeatures].filter(f => (featFreq[f] || 0) / n < 0.3);
        const tableStakes = [...selectedFeatures].filter(f => (featFreq[f] || 0) / n >= 0.6);

        let narrative;
        if (satScore < 25) narrative = 'Wide open — strong first-mover opportunity.';
        else if (satScore < 50)
            narrative = `Some existing games, but room to compete${exactProviderSet.size <= 3 ? ' — few providers have tried this' : ''}.`;
        else if (satScore < 75)
            narrative = `Competitive niche — ${exactCount} games across ${exactProviderSet.size} providers already here.`;
        else
            narrative = `Saturated — ${(exactPct * 100).toFixed(0)}% of ${escapeHtml(ctx.themeName || 'this theme')} already uses this exact combination.`;

        saturationSection = `
        <div class="mb-5 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <div class="flex items-center gap-2 mb-3">
                <span class="text-sm font-bold text-gray-900 dark:text-white">Market Saturation</span>
                <span class="text-xs font-bold ${satColor}">${satLabel} (${satScore}/100)</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3 overflow-hidden">
                <div class="${satBg} h-full rounded-full transition-all" style="width:${satScore}%"></div>
            </div>
            <div class="grid grid-cols-3 gap-3 mb-3">
                <div class="text-center">
                    <div class="text-lg font-bold text-gray-900 dark:text-white">${exactCount}</div>
                    <div class="text-[9px] text-gray-400 uppercase">Exact Matches</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-gray-900 dark:text-white">${exactProviderSet.size}</div>
                    <div class="text-[9px] text-gray-400 uppercase">Providers</div>
                </div>
                <div class="text-center">
                    <div class="text-lg font-bold text-gray-900 dark:text-white">${(exactPct * 100).toFixed(0)}%</div>
                    <div class="text-[9px] text-gray-400 uppercase">of Theme</div>
                </div>
            </div>
            ${
                topCompetitor
                    ? `<div class="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
                Top rival: <span class="font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(topCompetitor.name)}</span>
                <span class="text-gray-400">(${(F.theoWin(topCompetitor) || 0).toFixed(1)} theo)</span>
            </div>`
                    : ''
            }
            <div class="text-[11px] text-gray-600 dark:text-gray-300 mb-3">${narrative}</div>
            ${
                differentiated.length || tableStakes.length
                    ? `<div class="space-y-1">
                ${
                    differentiated.length
                        ? `<div class="flex items-start gap-1.5 text-[11px]">
                    <span class="text-emerald-500 mt-0.5 shrink-0">✅</span>
                    <span class="text-gray-600 dark:text-gray-300">Differentiators: <strong>${differentiated.map(f => escapeHtml(shortF[f] || f)).join(', ')}</strong> <span class="text-gray-400">(rare among exact rivals)</span></span>
                </div>`
                        : ''
                }
                ${
                    tableStakes.length
                        ? `<div class="flex items-start gap-1.5 text-[11px]">
                    <span class="text-amber-500 mt-0.5 shrink-0">⚠️</span>
                    <span class="text-gray-600 dark:text-gray-300">Table stakes: <strong>${tableStakes.map(f => escapeHtml(shortF[f] || f)).join(', ')}</strong> <span class="text-gray-400">(60%+ of rivals have this)</span></span>
                </div>`
                        : ''
                }
            </div>`
                    : ''
            }
        </div>`;
    }

    container.innerHTML = `
        ${nudgeHint}
        ${
            selectedFeatures.size > 0
                ? `<div class="flex items-center gap-4 mb-5 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
            <div class="text-center"><div class="text-3xl font-bold ${densityColor}">${exactCount}</div><div class="text-xs text-gray-500 uppercase">Direct Rivals</div></div>
            <div class="w-px h-10 bg-gray-200 dark:bg-gray-600 shrink-0"></div>
            <div class="text-sm text-gray-600 dark:text-gray-300">Competition density: <span class="font-bold ${densityColor}">${densityLabel}</span></div>
        </div>`
                : ''
        }
        ${blueOcean ? `<div class="mb-5 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2"><span>💎</span> Blue Ocean — no existing game combines ${[...selectedFeatures].map(f => shortF[f] || f).join(' + ')} in this theme</div>` : ''}
        ${saturationSection}
        <hr class="border-gray-200 dark:border-gray-700 mb-4">
        <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">${selectedFeatures.size > 0 ? 'Closest Competitors' : 'Top Performers'}</div>
        <div class="space-y-2.5">
            ${compGames
                .map((g, idx) => {
                    const theo = (g.performance_theo_win || 0).toFixed(1);
                    const featPills = (g.gf || [])
                        .filter(f => FEATS.includes(f))
                        .slice(0, 5)
                        .map(f => {
                            const isShared = selectedFeatures.has(f);
                            const cls = isShared
                                ? featureColors[f] || 'bg-gray-100 text-gray-700'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
                            return `<span class="px-2 py-0.5 rounded text-xs font-medium ${cls}">${escapeHtml(shortF[f] || f)}</span>`;
                        })
                        .join('');
                    const provider = F.provider(g);
                    return `<div class="flex items-center gap-3 py-3 px-4 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/20 hover:bg-white dark:hover:bg-gray-700/40 hover:shadow-sm transition-all cursor-pointer" data-xray='${escapeAttr(JSON.stringify({ game: g.name, field: 'name' }))}' onclick="${safeOnclick('window.showGameDetails', g.name)}">
                    <span class="text-sm text-gray-400 font-bold w-5 shrink-0">${idx + 1}</span>
                    <div class="flex-1 min-w-0">
                        <div class="text-base font-semibold text-gray-800 dark:text-gray-200 truncate">${escapeHtml(g.name || 'Unknown')}</div>
                        ${provider ? `<div class="text-xs text-gray-400 truncate">${escapeHtml(provider)}</div>` : ''}
                        <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">${featPills}</div>
                    </div>
                    <div class="text-right shrink-0 w-14"><div class="text-base font-bold text-indigo-600 dark:text-indigo-400">${theo}</div><div class="text-xs text-gray-400">theo</div></div>
                </div>`;
                })
                .join('')}
        </div>`;
}
