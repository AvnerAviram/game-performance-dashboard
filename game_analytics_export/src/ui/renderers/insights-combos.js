/**
 * Theme × feature combo explorer (pair/triple/quadruple within themes).
 */
import { getActiveGames } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { parseFeatsLocal } from './overview-renderer.js';
import { CANONICAL_FEATURES, SHORT_FEATURE_LABELS } from '../../lib/features.js';

const shortF = SHORT_FEATURE_LABELS;

export function renderComboExplorer(comboDiv) {
    if (!comboDiv) return;
    try {
        const allG = getActiveGames();
        const FEATS = CANONICAL_FEATURES;
        const featureColors = {
            'Buy Bonus': 'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300',
            'Cascading Reels': 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
            'Cash On Reels': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
            'Colossal Symbols': 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
            'Expanding Reels': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
            'Expanding Wilds': 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
            'Free Spins': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
            'Gamble Feature': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
            'Hold and Spin': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
            Megaways: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
            Multiplier: 'bg-stone-100 text-stone-800 dark:bg-stone-900/40 dark:text-stone-300',
            'Mystery Symbols': 'bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300',
            Nudges: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
            Persistence: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
            'Pick Bonus': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
            'Progressive Jackpot': 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300',
            Respin: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
            'Stacked Symbols': 'bg-neutral-100 text-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300',
            'Static Jackpot': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
            'Sticky Wilds': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
            'Symbol Transformation': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            Wheel: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
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
            if (games.length < 3) continue;
            const themeAvg = games.reduce((s, g) => s + g.theo, 0) / games.length;
            const combos = {};
            games.forEach(g => {
                const f = g.feats.filter(x => FEATS.includes(x));
                for (let i = 0; i < f.length; i++)
                    for (let j = i + 1; j < f.length; j++) {
                        const k = `${f[i]}|${f[j]}`;
                        if (!combos[k]) combos[k] = { feats: [f[i], f[j]], count: 0, total: 0 };
                        combos[k].count++;
                        combos[k].total += g.theo;
                    }
                for (let i = 0; i < f.length; i++)
                    for (let j = i + 1; j < f.length; j++)
                        for (let k = j + 1; k < f.length; k++) {
                            const key = `${f[i]}|${f[j]}|${f[k]}`;
                            if (!combos[key]) combos[key] = { feats: [f[i], f[j], f[k]], count: 0, total: 0 };
                            combos[key].count++;
                            combos[key].total += g.theo;
                        }
                for (let i = 0; i < f.length; i++)
                    for (let j = i + 1; j < f.length; j++)
                        for (let k = j + 1; k < f.length; k++)
                            for (let l = k + 1; l < f.length; l++) {
                                const key = `${f[i]}|${f[j]}|${f[k]}|${f[l]}`;
                                if (!combos[key]) combos[key] = { feats: [f[i], f[j], f[k], f[l]], count: 0, total: 0 };
                                combos[key].count++;
                                combos[key].total += g.theo;
                            }
            });
            Object.values(combos).forEach(c => {
                if (c.count >= 2) {
                    const avg = c.total / c.count;
                    const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg) * 100 : 0;
                    allCombos.push({ theme, feats: c.feats, count: c.count, avg, lift, themeAvg });
                }
            });
        }

        // Ensure theme diversity: pick top combos per theme, then interleave
        allCombos.sort((a, b) => b.avg - a.avg);
        const perTheme = {};
        allCombos.forEach(c => {
            if (!perTheme[c.theme]) perTheme[c.theme] = [];
            perTheme[c.theme].push(c);
        });
        const MAX_PER_THEME = 3;
        const diverseCombos = [];
        const themeKeys = Object.keys(perTheme).sort((a, b) => {
            const bestA = perTheme[a][0]?.avg || 0;
            const bestB = perTheme[b][0]?.avg || 0;
            return bestB - bestA;
        });
        for (let slot = 0; slot < MAX_PER_THEME && diverseCombos.length < 20; slot++) {
            for (const tk of themeKeys) {
                if (perTheme[tk][slot] && diverseCombos.length < 20) {
                    diverseCombos.push(perTheme[tk][slot]);
                }
            }
        }
        diverseCombos.sort((a, b) => b.avg - a.avg);
        const topCombos = diverseCombos.slice(0, 20);
        const maxComboAvg = topCombos.length > 0 ? topCombos[0].avg : 1;

        if (topCombos.length > 0) {
            comboDiv.innerHTML = `<div class="space-y-1.5">
                ${topCombos
                    .map((c, i) => {
                        const barW = Math.max(8, (c.avg / maxComboAvg) * 100);
                        const medal =
                            i === 0
                                ? '🥇'
                                : i === 1
                                  ? '🥈'
                                  : i === 2
                                    ? '🥉'
                                    : `<span class="text-[9px] text-gray-400 w-5 text-center">${i + 1}</span>`;
                        const liftColor =
                            c.lift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                        const sizeLabel = c.feats.length === 2 ? '2F' : c.feats.length === 3 ? '3F' : '4F';
                        const sizeBg =
                            c.feats.length === 2
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                : c.feats.length === 3
                                  ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                  : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
                        const themeName = c.theme;
                        return `
                    <div class="group flex items-start gap-2 p-2 rounded-lg hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all" data-xray='${escapeAttr(JSON.stringify({ dimension: 'theme', value: themeName }))}'>
                        <span class="shrink-0 mt-0.5 w-5 text-center">${medal}</span>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1.5 mb-1">
                                <span class="text-[10px] font-bold text-gray-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showThemeDetails', themeName)}">${escapeHtml(themeName)}</span>
                                <span class="text-[8px] font-bold px-1.5 py-0.5 rounded-full ${sizeBg}">${sizeLabel}</span>
                            </div>
                            <div class="flex flex-wrap gap-1 mb-1">
                                ${c.feats.map(f => `<span class="px-1.5 py-0.5 text-[9px] font-semibold rounded-full ${featureColors[f] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'} whitespace-nowrap">${escapeHtml(shortF[f] || f)}</span>`).join('')}
                            </div>
                            <div class="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400" style="width:${barW}%"></div>
                            </div>
                        </div>
                        <div class="shrink-0 text-right min-w-[80px]">
                            <div class="flex items-baseline justify-end gap-1">
                                <span class="text-xs font-bold text-gray-900 dark:text-white tabular-nums">${c.avg.toFixed(1)}</span>
                                <span class="text-[9px] font-normal text-gray-400 whitespace-nowrap">Avg Theo</span>
                            </div>
                            <div class="flex items-baseline justify-end gap-1">
                                <span class="text-[9px] ${liftColor} font-medium tabular-nums">${c.lift >= 0 ? '+' : ''}${c.lift.toFixed(0)}%</span>
                                <span class="text-[9px] ${liftColor} font-normal opacity-70">lift</span>
                            </div>
                            <div class="text-[9px] text-gray-400">${c.count} games</div>
                        </div>
                    </div>`;
                    })
                    .join('')}
            </div>`;
        } else {
            comboDiv.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">No combo data available</p>';
        }
    } catch {
        /* graceful degradation — show fallback message */
        comboDiv.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">Combo data unavailable</p>';
    }
}
