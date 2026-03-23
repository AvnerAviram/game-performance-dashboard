/**
 * Blueprint advisor — Symbols tab UI.
 */
import { escapeHtml } from '../../lib/sanitize.js';
import {
    SYMBOL_CAT_COLORS,
    categorizeSymbol,
    parseSymbols,
    aggregateSymbolStats,
    normalizeSymbolName,
} from '../../lib/symbol-utils.js';

export function renderSymbolsTab(container, ctx) {
    const { themeGames: symGames, selectedFeatures, themeAvg } = ctx;
    if (symGames.length < 3) {
        container.innerHTML =
            '<div class="text-center text-gray-400 text-sm py-8">Not enough symbol data for this theme</div>';
        return;
    }

    const sorted = [...symGames].sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
    const top25 = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.25)));
    const { catStats } = aggregateSymbolStats(symGames);

    function buildPkg(games) {
        const sf = {},
            cf = {};
        games.forEach(g => {
            const syms = parseSymbols(g.symbols);
            const sc = new Set();
            syms.forEach(s => {
                const str = normalizeSymbolName(String(s));
                if (!str) return;
                const cat = categorizeSymbol(str);
                sf[str] = (sf[str] || 0) + 1;
                if (!sc.has(cat)) {
                    cf[cat] = (cf[cat] || 0) + 1;
                    sc.add(cat);
                }
            });
        });
        return {
            topSym: Object.entries(sf)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, count]) => ({ name, count, cat: categorizeSymbol(name) })),
            catBreak: Object.entries(cf)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => ({ cat, pct: ((count / games.length) * 100).toFixed(0) })),
            avgTheo: games.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / games.length,
            gameCount: games.length,
        };
    }

    const highPerf = buildPkg(top25);
    const standard = buildPkg(symGames);
    const outlierGames = top25.filter(g => {
        const syms = parseSymbols(g.symbols)
            .map(s => normalizeSymbolName(String(s)))
            .filter(Boolean);
        const cats = new Set(syms.map(s => categorizeSymbol(s)));
        return [...cats].filter(c => (catStats[c]?.gameCount || 0) / symGames.length < 0.4).length >= 2;
    });
    const innovation = buildPkg(outlierGames.length >= 3 ? outlierGames : top25.slice(0, Math.ceil(top25.length / 2)));

    const ratingStars = avg => {
        const norm = themeAvg > 0 ? avg / themeAvg : 1;
        const stars = Math.min(5, Math.max(1, Math.round(norm * 3)));
        return (
            '<span class="text-amber-400">' +
            '★'.repeat(stars) +
            '</span><span class="text-gray-300 dark:text-gray-600">' +
            '★'.repeat(5 - stars) +
            '</span>'
        );
    };

    function renderPkgCard(pkg, title, icon, borderColor) {
        const symChips = pkg.topSym
            .map(s => {
                const col = SYMBOL_CAT_COLORS[s.cat];
                return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ring-1 ${col.cls} ${col.ring}">${escapeHtml(s.name)}</span>`;
            })
            .join('');
        const catMini = pkg.catBreak
            .slice(0, 5)
            .map(c => {
                const col = SYMBOL_CAT_COLORS[c.cat];
                return `<span class="text-xs flex items-center gap-1"><span class="w-2 h-2 rounded-full ${col?.bar || 'bg-gray-400'}"></span>${c.cat} ${c.pct}%</span>`;
            })
            .join('');
        return `<div class="border ${borderColor} rounded-xl p-5 bg-white dark:bg-gray-800">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><span class="text-2xl">${icon}</span><span class="text-base font-bold text-gray-800 dark:text-gray-200">${title}</span></div>
                <div class="flex items-center gap-2"><span class="text-base">${ratingStars(pkg.avgTheo)}</span><span class="text-base font-bold text-gray-600 dark:text-gray-400">${pkg.avgTheo.toFixed(1)}</span></div>
            </div>
            <div class="flex flex-wrap gap-2 mb-3">${symChips}</div>
            <div class="flex flex-wrap gap-2.5 text-gray-400">${catMini}</div>
            <div class="text-xs text-gray-400 mt-2.5">Based on ${pkg.gameCount} games</div>
        </div>`;
    }

    container.innerHTML = `
        <div class="flex items-center gap-2 mb-5"><span class="text-2xl">🍒</span><div>
            <div class="text-lg font-bold text-gray-900 dark:text-white">Symbol Package Suggestions</div>
            <div class="text-xs text-gray-500">${symGames.length} games analyzed${selectedFeatures.size > 0 ? ', filtered by your features' : ''}</div>
        </div></div>
        <div class="space-y-4">
            ${renderPkgCard(highPerf, 'High Performance', '🏆', 'border-emerald-200 dark:border-emerald-800')}
            ${renderPkgCard(standard, 'Market Standard', '📊', 'border-blue-200 dark:border-blue-800')}
            ${renderPkgCard(innovation, 'Innovation Pick', '💡', 'border-violet-200 dark:border-violet-800')}
        </div>`;
}
