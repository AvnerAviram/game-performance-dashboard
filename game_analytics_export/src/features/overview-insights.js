// Overview Insights - Slot Game Comparison Analytics
// Calculates best/worst performers across themes, mechanics, providers, games
import { getTheme, getProvider, getPerformance } from '../lib/game-fields.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../lib/sanitize.js';
import { MIN_FEATURE_GAMES } from '../lib/shared-config.js';
import { getProviderMetrics, getFeatureMetrics } from '../lib/metrics.js';

export function getTopPerformers(allGames, themes, mechanics) {
    if (!allGames || !themes || !mechanics) {
        return {
            bestTheme: null,
            worstTheme: null,
            bestMechanic: null,
            mostCommonMechanic: null,
            bestProvider: null,
            highestRTPGame: null,
        };
    }

    // Best Theme (highest Smart Index) - exclude placeholder/unknown themes
    const isPlaceholderTheme = t => {
        const name = (t?.Theme || '').toUpperCase();
        return !name || name === 'UNKNOWN' || name.startsWith('UNKNOWN -') || name.includes('FLAGGED FOR RESEARCH');
    };
    const realThemes = themes.filter(t => !isPlaceholderTheme(t));
    const sortedThemes = [...realThemes].sort(
        (a, b) => parseFloat(b['Smart Index'] || 0) - parseFloat(a['Smart Index'] || 0)
    );
    const bestTheme = sortedThemes[0];
    const worstTheme = sortedThemes[sortedThemes.length - 1];

    // Best Feature (highest avg theo_win) — uses features array via metrics layer
    const featureArray = getFeatureMetrics(allGames)
        .filter(f => f.count >= MIN_FEATURE_GAMES && f.feature && !/^unknown$/i.test(f.feature))
        .map(f => ({
            name: f.feature,
            avgTheoWin: f.avgTheo,
            gameCount: f.count,
        }));
    const bestMechanic = featureArray[0] || null;
    const mostCommonMechanic = [...featureArray].sort((a, b) => b.gameCount - a.gameCount)[0] || null;

    const providerArray = getProviderMetrics(allGames).map(p => ({
        name: p.name,
        avgTheoWin: p.avgTheo,
        ggrShare: p.ggrShare,
        gameCount: p.count,
    }));

    const bestProvider = providerArray[0];

    // Top Game (highest theo_win)
    const sortedGames = [...allGames].sort((a, b) => {
        const perfA = getPerformance(a);
        const perfB = getPerformance(b);
        return perfB.theo_win - perfA.theo_win;
    });
    const topGame = sortedGames[0];

    return {
        bestTheme: bestTheme
            ? {
                  name: bestTheme.Theme,
                  smartIndex: parseFloat(bestTheme['Smart Index']).toFixed(2),
                  gameCount: bestTheme['Game Count'],
                  avgRTP: parseFloat(bestTheme['Avg Theo Win Index'] ?? bestTheme.avg_theo_win ?? 0).toFixed(2),
              }
            : null,
        worstTheme: worstTheme
            ? {
                  name: worstTheme.Theme,
                  smartIndex: parseFloat(worstTheme['Smart Index']).toFixed(2),
                  gameCount: worstTheme['Game Count'],
              }
            : null,
        bestMechanic: bestMechanic
            ? {
                  name: bestMechanic.name,
                  avgTheoWin: bestMechanic.avgTheoWin.toFixed(2),
                  gameCount: bestMechanic.gameCount,
              }
            : null,
        mostCommonMechanic: mostCommonMechanic
            ? {
                  name: mostCommonMechanic.name,
                  gameCount: mostCommonMechanic.gameCount,
                  avgTheoWin: mostCommonMechanic.avgTheoWin.toFixed(2),
              }
            : null,
        bestProvider: bestProvider
            ? {
                  name: bestProvider.name,
                  avgTheoWin: bestProvider.avgTheoWin.toFixed(2),
                  ggrShare: bestProvider.ggrShare.toFixed(2),
                  gameCount: bestProvider.gameCount,
              }
            : null,
        highestRTPGame: topGame
            ? {
                  name: topGame.name || topGame.game_name || 'Unknown',
                  theoWin: getPerformance(topGame).theo_win.toFixed(2),
                  theme: getTheme(topGame).consolidated,
                  provider: getProvider(topGame).studio,
              }
            : null,
    };
}

export function renderComparisonCards(performers) {
    if (!performers) return '';

    function tooltip(text) {
        return `<div class="relative group inline-block ml-auto">
            <button class="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 text-[9px] font-bold text-gray-500 dark:text-gray-300 leading-none flex items-center justify-center" onclick="event.stopPropagation()">?</button>
            <div class="hidden group-hover:block absolute z-50 bottom-full right-0 mb-1 w-48 p-2 rounded-lg bg-gray-900 text-white text-[10px] leading-snug shadow-lg pointer-events-none">${escapeHtml(text)}</div>
        </div>`;
    }

    const cards = [];

    // Card 1: Best Theme
    if (performers.bestTheme) {
        cards.push(`
            <div class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg shadow-sm border border-amber-200 dark:border-amber-800 p-3 hover:shadow-md transition-all cursor-pointer"
                 onclick="${safeOnclick('window.showThemeDetails', performers.bestTheme.name || '')}">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">🥇</span>
                    <div class="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Best Theme</div>
                    ${tooltip('Ranked by Smart Index: avg Theo Win weighted by game count. Rewards both strong performance and market presence.')}
                </div>
                <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">${escapeHtml(performers.bestTheme.name)}</div>
                <div class="text-xl font-black bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent mb-1">${performers.bestTheme.smartIndex}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400">${performers.bestTheme.gameCount} games · Avg ${performers.bestTheme.avgRTP}</div>
            </div>
        `);
    }

    // Card 2: Best Feature
    if (performers.bestMechanic) {
        cards.push(`
            <div class="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg shadow-sm border border-purple-200 dark:border-purple-800 p-3 hover:shadow-md transition-all cursor-pointer"
                 onclick="${safeOnclick('window.showMechanicDetails', performers.bestMechanic.name || '')}">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">⚙️</span>
                    <div class="text-[10px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400">Best Mechanic</div>
                    ${tooltip('Mechanic with the highest average Performance Index across games that include it (min ' + MIN_FEATURE_GAMES + ' games). Pure performance ranking, not weighted by popularity.')}
                </div>
                <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">${escapeHtml(performers.bestMechanic.name)}</div>
                <div class="text-xl font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-1">${performers.bestMechanic.avgTheoWin}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400">${performers.bestMechanic.gameCount} games</div>
            </div>
        `);
    }

    // Card 3: Best Provider
    if (performers.bestProvider) {
        cards.push(`
            <div class="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-lg shadow-sm border border-emerald-200 dark:border-emerald-800 p-3 hover:shadow-md transition-all cursor-pointer"
                 onclick="${safeOnclick('window.showProviderDetails', performers.bestProvider.name || '')}">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">🏢</span>
                    <div class="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Top Provider (Market Share %)</div>
                    ${tooltip('Provider with the highest GGR (Gross Gaming Revenue) share. Measures real-world market dominance across all tracked games.')}
                </div>
                <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">${escapeHtml(performers.bestProvider.name)}</div>
                <div class="text-xl font-black bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent mb-1">${performers.bestProvider.ggrShare}%</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400">${performers.bestProvider.gameCount} games · Avg PI ${performers.bestProvider.avgTheoWin}</div>
            </div>
        `);
    }

    // Card 4: Worst Theme
    if (performers.worstTheme) {
        cards.push(`
            <div class="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 rounded-lg shadow-sm border border-red-200 dark:border-red-800 p-3 hover:shadow-md transition-all cursor-pointer"
                 onclick="${safeOnclick('window.showThemeDetails', performers.worstTheme.name || '')}">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">🔻</span>
                    <div class="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Needs Attention</div>
                    ${tooltip('Theme with the lowest Smart Index. May indicate declining player interest or poor game design choices in this category.')}
                </div>
                <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">${escapeHtml(performers.worstTheme.name)}</div>
                <div class="text-xl font-black bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent mb-1">${performers.worstTheme.smartIndex}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400">${performers.worstTheme.gameCount} games</div>
            </div>
        `);
    }

    // Card 5: Most Common Feature
    if (performers.mostCommonMechanic) {
        cards.push(`
            <div class="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-lg shadow-sm border border-cyan-200 dark:border-cyan-800 p-3 hover:shadow-md transition-all cursor-pointer"
                 onclick="${safeOnclick('window.showMechanicDetails', performers.mostCommonMechanic.name || '')}">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">📦</span>
                    <div class="text-[10px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">Most Popular Mechanic</div>
                    ${tooltip('Mechanic appearing in the most games. High adoption signals industry-wide confidence in this mechanic.')}
                </div>
                <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">${escapeHtml(performers.mostCommonMechanic.name)}</div>
                <div class="text-xl font-black bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent mb-1">${performers.mostCommonMechanic.gameCount}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400">Avg PI: ${performers.mostCommonMechanic.avgTheoWin}</div>
            </div>
        `);
    }

    // Card 6: Highest Theo Win Game
    if (performers.highestRTPGame) {
        cards.push(`
            <div class="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-lg shadow-sm border border-indigo-200 dark:border-indigo-800 p-3 hover:shadow-md transition-all cursor-pointer"
                 onclick="${safeOnclick('window.showGameDetails', performers.highestRTPGame.name || '')}">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">💎</span>
                    <div class="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">Top Game</div>
                    ${tooltip('Game with the highest individual Theo Win (theoretical win index). Represents peak single-title performance in the dataset.')}
                </div>
                <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5 truncate" title="${escapeAttr(performers.highestRTPGame.name)}">${escapeHtml(performers.highestRTPGame.name)}</div>
                <div class="text-xl font-black bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent mb-1">${performers.highestRTPGame.theoWin}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400">${escapeHtml(performers.highestRTPGame.theme)} · ${escapeHtml(performers.highestRTPGame.provider)}</div>
            </div>
        `);
    }

    return `
        <div class="grid grid-cols-2 xl:grid-cols-3 gap-3">
            ${cards.join('')}
        </div>
    `;
}

// No additional functions needed - renderComparisonCards handles all 6 cards
