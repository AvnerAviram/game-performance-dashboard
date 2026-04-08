/**
 * Blueprint advisor — Art Direction tab.
 * Shows art characterization breakdown for selected theme games:
 * settings, moods, characters, visual elements, narrative, and performance correlation.
 */
import { escapeHtml } from '../../lib/sanitize.js';
import { F } from '../../lib/game-fields.js';

function tally(games, fn) {
    const map = {};
    games.forEach(g => {
        const v = fn(g);
        if (Array.isArray(v))
            v.forEach(x => x && x !== 'No Characters (symbol-only game)' && (map[x] = (map[x] || 0) + 1));
        else if (v) map[v] = (map[v] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function tallyWithTheo(games, fn) {
    const map = {};
    games.forEach(g => {
        const v = fn(g);
        const theo = F.theoWin(g) || 0;
        const vals = Array.isArray(v) ? v.filter(x => x && x !== 'No Characters (symbol-only game)') : v ? [v] : [];
        vals.forEach(x => {
            if (!map[x]) map[x] = { count: 0, totalTheo: 0 };
            map[x].count++;
            map[x].totalTheo += theo;
        });
    });
    return Object.entries(map)
        .map(([name, d]) => ({ name, count: d.count, avg: d.totalTheo / d.count }))
        .sort((a, b) => b.count - a.count);
}

export function renderArtTab(container, ctx) {
    const { themeGames, themeAvg, selectedCategories } = ctx;
    const artGames = themeGames.filter(g => F.artSetting(g));

    if (artGames.length < 3) {
        container.innerHTML = `<div class="text-center py-12">
            <div class="text-4xl mb-3 opacity-40">🎨</div>
            <div class="text-sm text-gray-500 dark:text-gray-400">Not enough art data for this theme</div>
            <div class="text-xs text-gray-400 mt-1">${artGames.length} of ${themeGames.length} games have art characterization</div>
        </div>`;
        return;
    }

    const themeName = [...(selectedCategories || [])].join(' / ') || 'Selected Theme';
    const coverage = ((artGames.length / themeGames.length) * 100).toFixed(0);

    const settings = tallyWithTheo(artGames, g => F.artSetting(g));
    const moods = tallyWithTheo(artGames, g => F.artMood(g));
    const characters = tallyWithTheo(artGames, g => F.artCharacters(g));
    const elements = tallyWithTheo(artGames, g => F.artElements(g));
    const narratives = tallyWithTheo(artGames, g => F.artNarrative(g));

    const artAvg = artGames.reduce((s, g) => s + (F.theoWin(g) || 0), 0) / artGames.length;

    const barSection = (title, items, max, accentBg, accentText, accentBorder) => {
        if (!items.length) return '';
        const shown = items.slice(0, max);
        const topCount = shown[0]?.count || 1;
        return `<div class="mb-6">
            <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">${title}</h4>
            <div class="space-y-2">
                ${shown
                    .map(item => {
                        const pct = ((item.count / artGames.length) * 100).toFixed(0);
                        const barW = Math.max(4, (item.count / topCount) * 100);
                        const liftPct = themeAvg > 0 ? ((item.avg - themeAvg) / themeAvg) * 100 : 0;
                        const liftColor =
                            liftPct >= 5
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : liftPct <= -5
                                  ? 'text-red-500 dark:text-red-400'
                                  : 'text-gray-400';
                        const liftLabel = liftPct >= 0 ? `+${liftPct.toFixed(0)}%` : `${liftPct.toFixed(0)}%`;
                        return `<div>
                            <div class="flex items-center justify-between mb-0.5">
                                <span class="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">${escapeHtml(item.name)}</span>
                                <div class="flex items-center gap-3 shrink-0 ml-2">
                                    <span class="text-xs text-gray-500">${item.count} games (${pct}%)</span>
                                    <span class="text-xs font-semibold ${liftColor} w-12 text-right" title="Performance vs theme avg">${liftLabel}</span>
                                </div>
                            </div>
                            <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full ${accentBg} rounded-full" style="width:${barW}%"></div>
                            </div>
                        </div>`;
                    })
                    .join('')}
            </div>
        </div>`;
    };

    const topArtGame = [...artGames].sort((a, b) => (F.theoWin(b) || 0) - (F.theoWin(a) || 0))[0];
    const topSetting = settings[0];
    const topMood = moods[0];

    let recommendationHtml = '';
    if (topSetting && topMood) {
        const highPerf = artGames.filter(g => (F.theoWin(g) || 0) > themeAvg);
        const hpSettings = tally(highPerf, g => F.artSetting(g));
        const hpMoods = tally(highPerf, g => F.artMood(g));
        const bestSetting = hpSettings[0]?.[0] || topSetting.name;
        const bestMood = hpMoods[0]?.[0] || topMood.name;

        recommendationHtml = `<div class="mb-6 p-4 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800">
            <div class="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">💡 Art Recommendation</div>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                For a <strong>${escapeHtml(themeName)}</strong> game, consider a
                <strong>${escapeHtml(bestSetting)}</strong> environment with a
                <strong>${escapeHtml(bestMood)}</strong> mood.
                ${highPerf.length > 3 ? `Top-performing games in this theme (${highPerf.length} above avg) gravitate toward this art direction.` : ''}
            </p>
            ${topArtGame ? `<div class="mt-2 text-xs text-gray-500">Top performer: <span class="font-semibold text-gray-700 dark:text-gray-300">${escapeHtml(F.name(topArtGame))}</span> — ${escapeHtml(F.artSetting(topArtGame) || '?')} / ${escapeHtml(F.artMood(topArtGame) || '?')} (${(F.theoWin(topArtGame) || 0).toFixed(2)} theo)</div>` : ''}
        </div>`;
    }

    container.innerHTML = `
        <div class="mb-5">
            <div class="flex items-center justify-between mb-1">
                <h3 class="text-base font-bold text-gray-900 dark:text-white">Art Direction for ${escapeHtml(themeName)}</h3>
                <span class="text-xs px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">${artGames.length} games · ${coverage}% coverage</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">Visual DNA of ${escapeHtml(themeName)} games — what art styles perform best.</p>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-purple-600 dark:text-purple-400">${settings.length}</div><div class="text-xs text-gray-500">Environments</div></div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-pink-600 dark:text-pink-400">${moods.length}</div><div class="text-xs text-gray-500">Moods</div></div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">${characters.length}</div><div class="text-xs text-gray-500">Characters</div></div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-amber-600 dark:text-amber-400">${elements.length}</div><div class="text-xs text-gray-500">Elements</div></div>
        </div>
        ${recommendationHtml}
        ${barSection('Environments', settings, 8, 'bg-purple-400 dark:bg-purple-500', 'text-purple-700', 'border-purple-200')}
        ${barSection('Mood / Tone', moods, 6, 'bg-pink-400 dark:bg-pink-500', 'text-pink-700', 'border-pink-200')}
        ${barSection('Characters', characters, 8, 'bg-indigo-400 dark:bg-indigo-500', 'text-indigo-700', 'border-indigo-200')}
        ${barSection('Visual Elements', elements, 10, 'bg-amber-400 dark:bg-amber-500', 'text-amber-700', 'border-amber-200')}
        ${barSection('Narrative Theme', narratives, 5, 'bg-teal-400 dark:bg-teal-500', 'text-teal-700', 'border-teal-200')}
    `;
}
