// Overview page renderer
import { gameData } from '../../lib/data.js';
import { getTopPerformers, renderComparisonCards } from '../../features/overview-insights.js';
import { escapeHtml, safeOnclick } from '../../lib/sanitize.js';
import { log } from '../../lib/env.js';
import { CANONICAL_FEATURES, SHORT_FEATURE_LABELS } from '../../lib/features.js';

import { parseFeatures as parseFeatsLocal } from '../../lib/parse-features.js';
import { F } from '../../lib/game-fields.js';
export { parseFeatsLocal };

export function updateHeaderStats() {
    const statTotalGames = document.getElementById('stat-total-games');
    const statTotalThemes = document.getElementById('stat-total-themes');
    const statTotalMechanics = document.getElementById('stat-total-mechanics');
    const statClassified = document.getElementById('stat-classified');
    const headerSummary = document.getElementById('header-summary');

    if (statTotalGames) {
        statTotalGames.textContent = gameData.total_games.toLocaleString();
    }
    if (statTotalThemes) {
        statTotalThemes.textContent = gameData.theme_count.toLocaleString();
    }
    if (statTotalMechanics) {
        statTotalMechanics.textContent = gameData.mechanic_count;
    }
    if (statClassified) {
        const allGames = gameData.allGames || [];
        const classified = allGames.filter(g => {
            const hasTheme =
                (g.theme_consolidated || g.theme_primary || '').trim() &&
                (g.theme_consolidated || g.theme_primary) !== 'Unknown';
            const hasFeatures = g.features && (Array.isArray(g.features) ? g.features.length > 0 : g.features.trim());
            return hasTheme && hasFeatures;
        }).length;
        const pct = allGames.length > 0 ? ((classified / allGames.length) * 100).toFixed(1) : '0';
        statClassified.textContent = `${pct}%`;
    }
    if (headerSummary) {
        headerSummary.textContent = `Comprehensive analysis of ${gameData.total_games.toLocaleString()} slot games across ${gameData.theme_count.toLocaleString()} themes and ${gameData.mechanic_count} mechanics`;
    }
}

export function renderOverview() {
    log('📊 renderOverview() called');
    log('  - gameData exists:', !!gameData);
    log('  - gameData.allGames length:', gameData?.allGames?.length || 0);

    const gamesEl = document.getElementById('overview-total-games');
    const themesEl = document.getElementById('overview-total-themes');
    const mechanicsEl = document.getElementById('overview-total-mechanics');

    log('  - overview-total-games element:', !!gamesEl);
    log('  - overview-total-themes element:', !!themesEl);
    log('  - overview-total-mechanics element:', !!mechanicsEl);

    if (!gamesEl) {
        console.error('❌ MISSING ELEMENT: overview-total-games');
        console.error(
            '  - All elements with id in page:',
            Array.from(document.querySelectorAll('[id]'))
                .map(el => el.id)
                .slice(0, 20)
                .join(', ')
        );
        throw new Error('Missing element: overview-total-games - HTML and JavaScript are out of sync!');
    }

    gamesEl.textContent = gameData.allGames.length;
    themesEl.textContent = gameData.themes.length;
    mechanicsEl.textContent = gameData.mechanics.length;

    const providersEl = document.getElementById('overview-total-providers');
    if (providersEl) {
        const uniqueProviders = new Set(gameData.allGames.map(g => F.provider(g)).filter(p => p && p !== 'Unknown'));
        providersEl.textContent = uniqueProviders.size;
    }

    log('  ✅ Stats updated:', {
        games: gameData.allGames.length,
        themes: gameData.themes.length,
        mechanics: gameData.mechanics.length,
    });

    const performers = getTopPerformers(gameData.allGames, gameData.themes, gameData.mechanics);
    const comparisonEl = document.getElementById('comparison-cards');
    if (comparisonEl) {
        comparisonEl.innerHTML = renderComparisonCards(performers);
    }

    log('  ✅ Comparison cards rendered:', {
        bestTheme: performers.bestTheme?.name || 'None',
        bestMechanic: performers.bestMechanic?.name || 'None',
        bestProvider: performers.bestProvider?.name || 'None',
    });

    renderTopThemesCards();

    try {
        renderThemeFeatureHeatmap();
    } catch (e) {
        console.error('Heatmap rendering failed:', e);
        const heatEl = document.getElementById('theme-feature-heatmap');
        if (heatEl) heatEl.innerHTML = '<p class="text-red-500">Heatmap rendering failed</p>';
    }

    try {
        renderGameFranchises();
    } catch (e) {
        console.error('Franchises rendering failed:', e);
    }
}

function renderTopThemesCards() {
    const container = document.getElementById('overview-themes-cards');
    if (!container) return;

    const themes = [...(gameData.themes || [])];
    if (!themes.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No theme data</p>';
        return;
    }

    const allGames = gameData.allGames || [];
    const currentYear = new Date().getFullYear();

    const yearData = {};
    allGames.forEach(g => {
        const t = g.theme_consolidated || '';
        if (!t) return;
        if (!yearData[t]) yearData[t] = { recent: 0, old: 0, total: 0 };
        yearData[t].total++;
        if (g.release_year >= currentYear - 2) yearData[t].recent++;
        if (g.release_year && g.release_year <= currentYear - 5) yearData[t].old++;
    });

    themes.forEach(t => {
        const name = t.Theme || t.theme;
        const yd = yearData[name] || { recent: 0, old: 0, total: 0 };
        t._recentPct = yd.total > 0 ? yd.recent / yd.total : 0;
        t._oldPct = yd.total > 0 ? yd.old / yd.total : 0;
        t._avgTheo = t.avg_theo_win || t['Avg Theo Win Index'] || 0;
        t._si = t['Smart Index'] || 0;
        t._gc = t['Game Count'] || t.game_count || 0;
        t._opportunity = t._gc > 0 ? t._avgTheo / Math.sqrt(t._gc + 1) : 0;
    });

    const bySmartIndex = [...themes].sort((a, b) => b._si - a._si);
    const best = bySmartIndex[0];
    const worst = bySmartIndex[bySmartIndex.length - 1];

    const opportunity =
        [...themes]
            .filter(t => t._gc <= 20 && t._avgTheo > 1.5 && t !== best)
            .sort((a, b) => b._opportunity - a._opportunity)[0] || bySmartIndex[1];

    const rising =
        [...themes]
            .filter(t => t._gc >= 3 && t !== best && t !== opportunity)
            .sort((a, b) => b._recentPct - a._recentPct)[0] || bySmartIndex[2];

    const saturated =
        [...themes].filter(t => t !== best && t !== worst).sort((a, b) => b._gc - a._gc)[0] || bySmartIndex[3];

    const declining =
        [...themes]
            .filter(t => t._gc >= 3 && t !== worst && t !== saturated)
            .sort((a, b) => b._oldPct - a._oldPct)[0] || bySmartIndex[bySmartIndex.length - 2];

    const cards = [
        {
            theme: best,
            emoji: '👑',
            label: 'Best Theme',
            sub: 'Highest Performance Index',
            tip: 'Theme with the highest Smart Index (Avg Theo Win × √Game Count, normalized). Represents the strongest overall market performer.',
            bg: 'from-amber-50 to-yellow-50',
            dbg: 'dark:from-amber-900/20 dark:to-yellow-900/20',
            border: 'border-amber-200 dark:border-amber-800',
            labelColor: 'text-amber-700 dark:text-amber-400',
            gradient: 'from-amber-600 to-yellow-600',
            value: best._si.toFixed(2),
        },
        {
            theme: opportunity,
            emoji: '💎',
            label: 'Best Opportunity',
            sub: 'High theo, low competition',
            tip: 'Theme with high Avg Theo Win but few games (≤20). Low competition + strong performance = best opportunity for new titles.',
            bg: 'from-emerald-50 to-teal-50',
            dbg: 'dark:from-emerald-900/20 dark:to-teal-900/20',
            border: 'border-emerald-200 dark:border-emerald-800',
            labelColor: 'text-emerald-700 dark:text-emerald-400',
            gradient: 'from-emerald-600 to-teal-600',
            value: opportunity._avgTheo.toFixed(2),
        },
        {
            theme: rising,
            emoji: '📈',
            label: 'Rising Theme',
            sub: `${Math.round(rising._recentPct * 100)}% games from last 2 yrs`,
            tip: 'Theme with the highest % of games released in the last 2 years. Indicates growing market interest and adoption.',
            bg: 'from-sky-50 to-blue-50',
            dbg: 'dark:from-sky-900/20 dark:to-blue-900/20',
            border: 'border-sky-200 dark:border-sky-800',
            labelColor: 'text-sky-700 dark:text-sky-400',
            gradient: 'from-sky-600 to-blue-600',
            value: rising._si.toFixed(2),
        },
        {
            theme: saturated,
            emoji: '📦',
            label: 'Most Saturated',
            sub: 'Highest number of games',
            tip: 'Theme with the most games in the dataset. High saturation means tough competition — harder to stand out with a new title.',
            bg: 'from-orange-50 to-amber-50',
            dbg: 'dark:from-orange-900/20 dark:to-amber-900/20',
            border: 'border-orange-200 dark:border-orange-800',
            labelColor: 'text-orange-700 dark:text-orange-400',
            gradient: 'from-orange-600 to-amber-600',
            value: saturated._gc.toString(),
        },
        {
            theme: worst,
            emoji: '🔻',
            label: 'Worst Theme',
            sub: 'Lowest Performance Index',
            tip: 'Theme with the lowest Smart Index. Weakest market performance — consider avoiding or innovating significantly.',
            bg: 'from-red-50 to-rose-50',
            dbg: 'dark:from-red-900/20 dark:to-rose-900/20',
            border: 'border-red-200 dark:border-red-800',
            labelColor: 'text-red-700 dark:text-red-400',
            gradient: 'from-red-600 to-rose-600',
            value: worst._si.toFixed(2),
        },
        {
            theme: declining,
            emoji: '📉',
            label: 'Declining Theme',
            sub: `${Math.round(declining._oldPct * 100)}% games 5+ yrs old`,
            tip: 'Theme with the highest % of games released 5+ years ago. Indicates a legacy theme losing momentum in new releases.',
            bg: 'from-slate-50 to-gray-50',
            dbg: 'dark:from-slate-900/20 dark:to-gray-900/20',
            border: 'border-slate-300 dark:border-slate-700',
            labelColor: 'text-slate-600 dark:text-slate-400',
            gradient: 'from-slate-500 to-gray-500',
            value: declining._si.toFixed(2),
        },
    ];

    let html = '<div class="grid grid-cols-2 xl:grid-cols-3 gap-3">';
    cards.forEach(c => {
        const name = c.theme.Theme || c.theme.theme;
        html += `
        <div class="bg-gradient-to-br ${c.bg} ${c.dbg} rounded-lg shadow-sm border ${c.border} p-3 hover:shadow-md transition-all cursor-pointer"
             onclick="${safeOnclick('window.showThemeDetails', name)}">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-lg">${c.emoji}</span>
                <div class="text-[10px] font-bold uppercase tracking-wide ${c.labelColor}">${c.label}</div>
                <div class="relative group ml-auto" onclick="event.stopPropagation()">
                    <button class="w-3.5 h-3.5 rounded-full bg-gray-200/70 dark:bg-gray-700/70 text-gray-400 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center text-[8px] font-bold leading-none cursor-help">?</button>
                    <div class="hidden group-hover:block absolute right-0 top-full mt-1 w-48 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed font-normal">${c.tip}</div>
                </div>
            </div>
            <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">${escapeHtml(name)}</div>
            <div class="text-xl font-black bg-gradient-to-r ${c.gradient} bg-clip-text text-transparent mb-1">${c.value}</div>
            <div class="text-[10px] text-gray-500 dark:text-gray-400">${c.theme._gc} games · Avg ${c.theme._avgTheo.toFixed(2)}</div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderThemeFeatureHeatmap() {
    const container = document.getElementById('theme-feature-heatmap');
    if (!container) return;

    const allGames = gameData.allGames || [];
    if (!allGames.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No game data</p>';
        return;
    }

    const themeGames = {};
    allGames.forEach(g => {
        const theme = g.theme_consolidated || '';
        if (!theme || /^unknown$/i.test(theme)) return;
        if (!themeGames[theme]) themeGames[theme] = [];
        const feats = parseFeatsLocal(g.features).sort();
        themeGames[theme].push({ name: g.name || 'Unknown', theo: g.performance_theo_win || 0, feats });
    });

    const recipes = [];
    for (const [theme, tg] of Object.entries(themeGames)) {
        if (tg.length < 5) continue;
        const combos = {};
        tg.forEach(g => {
            const f = g.feats;
            for (let i = 0; i < f.length; i++) {
                for (let j = i + 1; j < f.length; j++) {
                    const key2 = [f[i], f[j]].join('|');
                    if (!combos[key2]) combos[key2] = { feats: [f[i], f[j]], count: 0, total: 0 };
                    combos[key2].count++;
                    combos[key2].total += g.theo;
                    for (let k = j + 1; k < f.length; k++) {
                        const key3 = [f[i], f[j], f[k]].join('|');
                        if (!combos[key3]) combos[key3] = { feats: [f[i], f[j], f[k]], count: 0, total: 0 };
                        combos[key3].count++;
                        combos[key3].total += g.theo;
                    }
                }
            }
        });

        const ranked = Object.values(combos)
            .filter(c => c.count >= 3)
            .map(c => ({ ...c, avg: c.total / c.count }))
            .sort((a, b) => b.avg - a.avg);

        const worstRanked = [...ranked].sort((a, b) => a.avg - b.avg);
        const worst = worstRanked.find(c => c.count >= 3 && c.avg < ranked[0].avg * 0.6) || worstRanked[0] || null;

        if (ranked.length > 0) {
            recipes.push({
                theme,
                gameCount: tg.length,
                best: ranked[0],
                runner:
                    ranked.find(r => r !== ranked[0] && !ranked[0].feats.every(f => r.feats.includes(f))) ||
                    ranked[1] ||
                    null,
                worst: worst !== ranked[0] ? worst : null,
            });
        }
    }

    window._recipeThemeGames = themeGames;

    recipes.sort((a, b) => b.best.avg - a.best.avg);
    const top = recipes.slice(0, 10);

    if (!top.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">Insufficient data for recipes</p>';
        return;
    }

    const maxAvg = Math.max(...top.map(r => r.best.avg));

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
    const defaultPill = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

    function featurePill(feat, size = 'normal') {
        const cls = featureColors[feat] || defaultPill;
        const label = SHORT_FEATURE_LABELS[feat] || feat;
        const px = size === 'small' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';
        return `<span class="${px} font-semibold rounded-full ${cls} whitespace-nowrap">${escapeHtml(label)}</span>`;
    }

    const allThemeNames = Object.keys(themeGames).sort();
    const CANONICAL = CANONICAL_FEATURES;

    let html = '';

    const topCards = top.slice(0, 8);
    html += '<div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2">';

    html += `
    <div class="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/30 dark:to-violet-900/30 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 p-4 xl:col-span-2 xl:row-span-2 flex flex-col">
        <div class="flex items-center gap-2 mb-3">
            <span class="text-lg">🧪</span>
            <span class="text-sm font-bold text-indigo-700 dark:text-indigo-300">Recipe Explorer</span>
            <button type="button" onclick="window.clearRecipeFeatures()" class="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors font-medium">Clear</button>
        </div>
        <div class="flex-1 flex flex-col">
            <label class="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-1 block">Theme</label>
            <select id="recipe-explorer-theme" onchange="window.updateRecipeExplorer()" class="w-full px-3 py-2 text-sm rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-400 outline-none mb-3">
                ${allThemeNames.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
            </select>
            <label class="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-1.5 block">Features</label>
            <div class="flex flex-wrap gap-1.5 min-h-[60px]" id="recipe-explorer-features">
                ${CANONICAL.map(f => `<button type="button" data-feat="${escapeHtml(f)}" onclick="window.toggleRecipeFeature(this)" class="recipe-feat-btn shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-indigo-300"><span class="feat-arrow"></span>${escapeHtml(SHORT_FEATURE_LABELS[f] || f)}</button>`).join('')}
            </div>
            <div class="mt-2 text-[10px] text-indigo-400 dark:text-indigo-500 flex items-center gap-3">
                <span class="inline-flex items-center gap-0.5"><span class="text-emerald-500">▲</span> improves</span>
                <span class="inline-flex items-center gap-0.5"><span class="text-red-400">▼</span> worsens</span>
            </div>
            <div id="recipe-explorer-result" class="bg-white/70 dark:bg-gray-800/70 rounded-xl p-3 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center mt-3 flex-1 min-h-[100px]">
                <span class="text-xs text-indigo-400 dark:text-indigo-500">Click features to explore</span>
            </div>
        </div>
    </div>`;
    topCards.forEach((r, i) => {
        const barWidth = Math.round((r.best.avg / maxAvg) * 100);
        const isTop3 = i < 3;
        const medals = ['🥇', '🥈', '🥉'];
        const medal = isTop3 ? medals[i] : '';
        const lift = r.worst ? (((r.best.avg - r.worst.avg) / r.worst.avg) * 100).toFixed(0) : null;

        html += `
        <div class="bg-white dark:bg-gray-800 rounded-xl border ${isTop3 ? 'border-indigo-200/80 dark:border-indigo-700/60 shadow-sm' : 'border-slate-200 dark:border-slate-600'} p-3 hover:shadow-lg transition-all relative overflow-hidden group">
            <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${isTop3 ? 'from-indigo-500 to-violet-500' : 'from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500'}" style="opacity:${0.4 + (barWidth / 100) * 0.6}"></div>
            
            <div class="flex items-center gap-1.5 mb-2">
                ${medal ? `<span class="text-sm">${medal}</span>` : `<span class="text-[9px] font-bold text-gray-400 dark:text-gray-500 w-4 text-center">#${i + 1}</span>`}
                <span class="text-xs font-bold text-gray-900 dark:text-white cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate flex-1"
                      onclick="${safeOnclick('window.showThemeDetails', r.theme)}">${escapeHtml(r.theme)}</span>
                <span class="text-[9px] text-gray-400 dark:text-gray-500 shrink-0">${r.gameCount} games</span>
            </div>
            
            <div class="bg-emerald-50/60 dark:bg-emerald-900/15 rounded-lg p-2 mb-1.5">
                <div class="flex items-center gap-1 mb-1">
                    <span class="text-[8px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-bold">Best recipe</span>
                    ${lift ? `<span class="ml-auto text-[8px] font-bold text-emerald-600 dark:text-emerald-400">+${lift}%</span>` : ''}
                </div>
                <div class="flex flex-wrap gap-1 mb-1.5">
                    ${r.best.feats.map(f => featurePill(f, 'small')).join('<span class="text-emerald-300 dark:text-emerald-700 text-[9px] font-bold self-center">+</span>')}
                </div>
                <div class="flex items-baseline gap-1.5">
                    <span class="text-base font-black ${isTop3 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-800 dark:text-gray-200'}">${r.best.avg.toFixed(2)}</span>
                    <span class="text-[9px] text-gray-400">avg theo · ${r.best.count} games</span>
                </div>
                <div class="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-indigo-500" style="width:${barWidth}%"></div>
                </div>
            </div>
            
            ${
                r.worst
                    ? `
            <div class="flex items-center gap-1.5 px-1">
                <span class="text-[8px] text-red-400 dark:text-red-500 font-bold shrink-0">✗ Avoid:</span>
                <div class="flex flex-wrap items-center gap-0.5 flex-1 min-w-0">
                    ${r.worst.feats.map(f => `<span class="text-[8px] text-red-400 dark:text-red-500">${escapeHtml(SHORT_FEATURE_LABELS[f] || f)}</span>`).join('<span class="text-gray-300 dark:text-gray-600 text-[7px]">+</span>')}
                </div>
                <span class="text-[9px] font-semibold text-red-400 dark:text-red-500 shrink-0">${r.worst.avg.toFixed(1)}</span>
            </div>`
                    : ''
            }
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    let recipeTooltip = document.getElementById('recipe-feat-tooltip');
    if (!recipeTooltip) {
        recipeTooltip = document.createElement('div');
        recipeTooltip.id = 'recipe-feat-tooltip';
        recipeTooltip.className = 'fixed z-[9999] pointer-events-none opacity-0 transition-opacity duration-150';
        recipeTooltip.style.display = 'none';
        document.body.appendChild(recipeTooltip);
    }
    const featBtnsContainer = document.getElementById('recipe-explorer-features');
    if (featBtnsContainer) {
        featBtnsContainer.addEventListener(
            'mouseenter',
            e => {
                const btn = e.target.closest('.recipe-feat-btn');
                if (!btn) return;
                const feat = btn.dataset.feat;
                const theme = document.getElementById('recipe-explorer-theme')?.value;
                const tg = window._recipeThemeGames?.[theme] || [];
                const selected = [...(window._recipeSelectedFeatures || [])];
                const pool = selected.length > 0 ? tg.filter(g => selected.every(f => g.feats.includes(f))) : tg;
                const matching = pool.filter(g => g.feats.includes(feat)).sort((a, b) => b.theo - a.theo);
                if (!matching.length) {
                    recipeTooltip.style.display = 'none';
                    return;
                }
                const showMax = 8;
                const gameList = matching
                    .slice(0, showMax)
                    .map(
                        g =>
                            `<div class="flex items-center justify-between gap-3"><span class="truncate">${escapeHtml(g.name)}</span><span class="text-gray-400 shrink-0">${g.theo.toFixed(1)}</span></div>`
                    )
                    .join('');
                const more =
                    matching.length > showMax
                        ? `<div class="text-gray-500 text-center mt-1">+${matching.length - showMax} more</div>`
                        : '';
                recipeTooltip.innerHTML = `
                <div class="bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700 px-4 py-3 min-w-[200px] max-w-[300px]">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">${escapeHtml(feat)}</div>
                    <div class="text-[10px] text-gray-400 mb-2">${matching.length} games in ${escapeHtml(theme)}</div>
                    <div class="flex items-center justify-between text-[9px] text-gray-500 uppercase tracking-wider font-bold mb-1"><span>Game</span><span>Theo</span></div>
                    <div class="space-y-1 text-[11px]">${gameList}</div>
                    ${more}
                </div>
            `;
                recipeTooltip.style.display = 'block';
                requestAnimationFrame(() => (recipeTooltip.style.opacity = '1'));
                const rect = btn.getBoundingClientRect();
                const ttRect = recipeTooltip.getBoundingClientRect();
                let left = rect.left + rect.width / 2 - ttRect.width / 2;
                let top = rect.bottom + 8;
                if (top + ttRect.height > window.innerHeight - 8) top = rect.top - ttRect.height - 8;
                if (left < 8) left = 8;
                if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
                recipeTooltip.style.left = left + 'px';
                recipeTooltip.style.top = top + 'px';
            },
            true
        );
        featBtnsContainer.addEventListener(
            'mouseleave',
            e => {
                const btn = e.target.closest('.recipe-feat-btn');
                if (!btn) return;
                recipeTooltip.style.opacity = '0';
                setTimeout(() => {
                    if (recipeTooltip.style.opacity === '0') recipeTooltip.style.display = 'none';
                }, 150);
            },
            true
        );
    }

    window._recipeSelectedFeatures = new Set();

    window.clearRecipeFeatures = function () {
        window._recipeSelectedFeatures.clear();
        document.querySelectorAll('.recipe-feat-btn').forEach(btn => {
            btn.className =
                'recipe-feat-btn shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-indigo-300';
            btn.style.background = '';
            btn.title = '';
            const arrow = btn.querySelector('.feat-arrow');
            if (arrow) arrow.textContent = '';
        });
        const resultEl = document.getElementById('recipe-explorer-result');
        if (resultEl)
            resultEl.innerHTML =
                '<span class="text-xs text-indigo-400 dark:text-indigo-500">Click features to explore</span>';
    };

    window.toggleRecipeFeature = function (btn) {
        const feat = btn.dataset.feat;
        if (window._recipeSelectedFeatures.has(feat)) {
            window._recipeSelectedFeatures.delete(feat);
        } else {
            window._recipeSelectedFeatures.add(feat);
        }
        window.updateRecipeExplorer();
    };

    window.updateRecipeExplorer = function () {
        const resultDiv = document.getElementById('recipe-explorer-result');
        if (!resultDiv) return;

        const theme = document.getElementById('recipe-explorer-theme')?.value;
        const selected = [...window._recipeSelectedFeatures].sort();
        const tg = window._recipeThemeGames?.[theme] || [];
        const themeAvg = tg.length > 0 ? tg.reduce((s, g) => s + g.theo, 0) / tg.length : 0;

        let _currentAvg = null;
        let currentMatching;
        if (selected.length >= 1 && tg.length > 0) {
            currentMatching = tg.filter(g => selected.every(f => g.feats.includes(f)));
            if (currentMatching.length > 0) {
                _currentAvg = currentMatching.reduce((s, g) => s + g.theo, 0) / currentMatching.length;
            }
        }

        const allBtns = document.querySelectorAll('#recipe-explorer-features .recipe-feat-btn');
        allBtns.forEach(btn => {
            const feat = btn.dataset.feat;
            const isSelected = window._recipeSelectedFeatures.has(feat);
            const arrow = btn.querySelector('.feat-arrow');
            const neutralClass =
                'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-indigo-300';

            if (isSelected) {
                btn.className =
                    'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-indigo-500 dark:border-indigo-400 text-white bg-indigo-500 dark:bg-indigo-600 shadow-sm';
                btn.style.background = '';
                btn.title = 'Selected (click to remove)';
                if (arrow) arrow.textContent = '✓ ';
                return;
            }

            if (tg.length < 2) {
                btn.className = neutralClass;
                btn.style.background = '';
                btn.title = '';
                if (arrow) arrow.textContent = '';
                return;
            }

            const pool = selected.length > 0 ? tg.filter(g => selected.every(f => g.feats.includes(f))) : tg;
            const hasFeat = pool.filter(g => g.feats.includes(feat));
            const noFeat = pool.filter(g => !g.feats.includes(feat));

            if (hasFeat.length === 0 || noFeat.length === 0) {
                btn.className =
                    'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-gray-100 dark:border-gray-700 text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-900';
                btn.style.background = '';
                btn.title = hasFeat.length === 0 ? 'No games with this feature' : 'All games have this feature';
                if (arrow) arrow.textContent = '';
                return;
            }

            const avgWith = hasFeat.reduce((s, g) => s + g.theo, 0) / hasFeat.length;
            const avgWithout = noFeat.reduce((s, g) => s + g.theo, 0) / noFeat.length;
            const pctChange = avgWithout > 0 ? ((avgWith - avgWithout) / avgWithout) * 100 : 0;

            if (avgWith > avgWithout) {
                const intensity = Math.min(1, Math.abs(pctChange) / 40);
                btn.className =
                    'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-emerald-400 dark:border-emerald-500 text-emerald-800 dark:text-emerald-200 shadow-sm';
                btn.style.background = `rgba(16,185,129,${0.08 + intensity * 0.3})`;
                btn.title = `▲ +${pctChange.toFixed(0)}% better (${avgWith.toFixed(1)} vs ${avgWithout.toFixed(1)}, ${hasFeat.length} games)`;
                if (arrow) arrow.textContent = '▲ ';
            } else if (avgWith < avgWithout) {
                const intensity = Math.min(1, Math.abs(pctChange) / 40);
                btn.className =
                    'recipe-feat-btn px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-all cursor-pointer border-red-300 dark:border-red-500 text-red-700 dark:text-red-300 shadow-sm';
                btn.style.background = `rgba(239,68,68,${0.06 + intensity * 0.25})`;
                btn.title = `▼ ${pctChange.toFixed(0)}% worse (${avgWith.toFixed(1)} vs ${avgWithout.toFixed(1)}, ${hasFeat.length} games)`;
                if (arrow) arrow.textContent = '▼ ';
            } else {
                btn.className = neutralClass;
                btn.style.background = '';
                btn.title = `~same (${avgWith.toFixed(1)} avg, ${hasFeat.length} games)`;
                if (arrow) arrow.textContent = '';
            }
        });

        if (selected.length === 0) {
            resultDiv.innerHTML =
                '<span class="text-xs text-indigo-400 dark:text-indigo-500">Click features to start exploring</span>';
            return;
        }

        if (selected.length === 1) {
            const singleMatching = tg.filter(g => g.feats.includes(selected[0]));
            if (singleMatching.length === 0) {
                resultDiv.innerHTML = `<div class="text-center"><div class="text-[10px] text-gray-400">No ${escapeHtml(theme)} games with ${escapeHtml(selected[0])}</div><div class="text-[10px] text-indigo-400 mt-1">Add more features — green = improves, red = worsens</div></div>`;
            } else {
                const avg = singleMatching.reduce((s, g) => s + g.theo, 0) / singleMatching.length;
                resultDiv.innerHTML = `<div class="text-center"><div class="text-lg font-black text-gray-800 dark:text-gray-200">${avg.toFixed(2)}</div><div class="text-[10px] text-gray-400">${singleMatching.length} games · Pick more features</div><div class="text-[10px] text-indigo-400 mt-1">Green buttons = improves · Red = worsens</div></div>`;
            }
            return;
        }

        if (!tg.length) {
            resultDiv.innerHTML = '<span class="text-xs text-gray-400">No games for this theme</span>';
            return;
        }

        const matching = tg.filter(g => selected.every(f => g.feats.includes(f)));

        if (matching.length === 0) {
            resultDiv.innerHTML = `
                <div class="text-center">
                    <div class="text-2xl mb-1">🚫</div>
                    <div class="text-xs font-semibold text-gray-600 dark:text-gray-400">No games found</div>
                    <div class="text-[10px] text-gray-400 dark:text-gray-500">No ${escapeHtml(theme)} games have this combo</div>
                </div>`;
            return;
        }

        const avgTheo = matching.reduce((s, g) => s + g.theo, 0) / matching.length;
        const pct = themeAvg > 0 ? (avgTheo / themeAvg - 1) * 100 : 0;
        const isGood = avgTheo > themeAvg;
        const sortedMatching = [...matching].sort((a, b) => b.theo - a.theo);
        const showGames = sortedMatching.slice(0, 4);
        const moreCount = sortedMatching.length - showGames.length;

        resultDiv.innerHTML = `
            <div class="w-full">
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-2xl">${isGood ? '✅' : '⚠️'}</span>
                    <div>
                        <div class="text-xl font-black ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">${avgTheo.toFixed(2)}</div>
                        <div class="text-[10px] text-gray-500 dark:text-gray-400">${matching.length} games match</div>
                    </div>
                    <div class="ml-auto text-right">
                        <div class="text-base font-bold ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%</div>
                        <div class="text-[10px] text-gray-400">vs theme avg (${themeAvg.toFixed(2)})</div>
                    </div>
                </div>
                <div class="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div class="h-full rounded-full transition-all ${isGood ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-red-300 to-red-400'}" style="width:${Math.min(100, Math.max(5, (avgTheo / (themeAvg * 2)) * 100))}%"></div>
                </div>
                <div class="text-[10px] mt-1.5 ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} font-medium">${isGood ? '▲ Outperforms theme average — recommended combo' : '▼ Underperforms theme average — consider alternatives'}</div>
                <div class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1"><span>Games with this recipe</span><span>Theo</span></div>
                    ${showGames.map(g => `<div class="flex items-center justify-between text-[10px] py-0.5"><span class="truncate text-gray-700 dark:text-gray-300 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400" onclick="${safeOnclick('window.showGameDetails', g.name)}">${escapeHtml(g.name)}</span><span class="text-gray-400 shrink-0 ml-2">${g.theo.toFixed(1)}</span></div>`).join('')}
                    ${moreCount > 0 ? `<div class="text-[9px] text-gray-400 mt-0.5">+${moreCount} more games</div>` : ''}
                </div>
            </div>`;
    };
}

function renderGameFranchises() {
    const container = document.getElementById('game-franchises');
    if (!container) return;

    const games = gameData.allGames || [];

    const buckets = {};
    for (const g of games) {
        const fname = F.franchise(g);
        if (!fname) continue;
        if (!buckets[fname]) buckets[fname] = [];
        buckets[fname].push(g);
    }

    const multis = Object.entries(buckets)
        .filter(([, gs]) => gs.length >= 2)
        .map(([fname, gs]) => {
            const totalTheo = gs.reduce((s, g) => s + (g.performance_theo_win || g.theo_win || 0), 0);
            const avgTheo = totalTheo / gs.length;
            const totalShare = gs.reduce(
                (s, g) => s + (g.performance_market_share_percent || g.market_share_pct || 0),
                0
            );
            const providers = [...new Set(gs.map(g => F.provider(g)).filter(p => p && p !== 'Unknown'))];
            return { base: fname, games: gs, count: gs.length, avgTheo, totalShare, providers };
        })
        .sort((a, b) => b.totalShare - a.totalShare)
        .slice(0, 10);

    if (!multis.length) {
        container.innerHTML = '<p class="text-gray-400 dark:text-gray-500">No game brands detected</p>';
        return;
    }

    let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    multis.forEach((fam, i) => {
        const topGame = fam.games.sort(
            (a, b) => (b.performance_theo_win || b.theo_win || 0) - (a.performance_theo_win || a.theo_win || 0)
        )[0];
        const providerLabel = fam.providers.join(', ');
        html += `
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-600 p-4 hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between mb-2">
                <div>
                    <h4 class="font-bold text-gray-900 dark:text-white text-sm">${escapeHtml(fam.base)}</h4>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${fam.count} titles • ${fam.totalShare.toFixed(2)}% market share</p>
                </div>
                <span class="px-2 py-1 text-xs font-bold rounded-full ${i < 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}">#${i + 1}</span>
            </div>
            <div class="flex items-center gap-2 mb-1">
                ${fam.providers
                    .map(
                        p => `<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-800/60 transition-colors" onclick="${safeOnclick('window.showProviderDetails', p)}">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    ${escapeHtml(p)}
                </span>`
                    )
                    .join('')}
            </div>
            <div class="flex gap-3 text-xs">
                <span class="text-amber-600 dark:text-amber-400 font-semibold">Avg Theo: ${fam.avgTheo.toFixed(2)}</span>
                <span class="text-gray-400">|</span>
                <span class="text-gray-600 dark:text-gray-400">Best: ${escapeHtml(topGame.name)}</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                ${fam.games.map(g => `<span class="px-2 py-0.5 text-[10px] rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors" onclick="${safeOnclick('window.showGameDetails', g.name)}">${escapeHtml(g.name)}</span>`).join('')}
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}
