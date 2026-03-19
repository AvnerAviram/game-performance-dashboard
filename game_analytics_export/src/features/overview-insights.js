// Overview Insights - Slot Game Comparison Analytics
// Calculates best/worst performers across themes, mechanics, providers, games
import { getTheme, getProvider, getPerformance } from './compat.js';
import { parseFeatures } from '../lib/parse-features.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../lib/sanitize.js';

export function getTopPerformers(allGames, themes, mechanics) {
    if (!allGames || !themes || !mechanics) {
        return {
            bestTheme: null,
            worstTheme: null,
            bestMechanic: null,
            mostCommonMechanic: null,
            bestProvider: null,
            highestRTPGame: null
        };
    }
    
    // Best Theme (highest Smart Index) - exclude placeholder/unknown themes
    const isPlaceholderTheme = (t) => {
        const name = (t?.Theme || '').toUpperCase();
        return !name || name === 'UNKNOWN' || name.startsWith('UNKNOWN -') || name.includes('FLAGGED FOR RESEARCH');
    };
    const realThemes = themes.filter(t => !isPlaceholderTheme(t));
    const sortedThemes = [...realThemes].sort((a, b) => 
        parseFloat(b['Smart Index'] || 0) - parseFloat(a['Smart Index'] || 0)
    );
    const bestTheme = sortedThemes[0];
    const worstTheme = sortedThemes[sortedThemes.length - 1];
    
    // Best Feature (highest avg theo_win) — uses features array, not legacy mechanic_primary
    const featureStats = {};
    allGames.forEach(game => {
        const feats = parseFeatures(game.features);
        if (feats.length === 0) return;
        const perf = getPerformance(game);
        
        feats.forEach(feat => {
            if (!feat || /^unknown$/i.test(feat)) return;
            if (!featureStats[feat]) {
                featureStats[feat] = { sum: 0, count: 0 };
            }
            featureStats[feat].sum += perf.theo_win;
            featureStats[feat].count++;
        });
    });
    
    const MIN_GAMES_FOR_BEST_FEATURE = 5;
    const featureArray = Object.entries(featureStats).map(([name, stats]) => ({
        name,
        avgTheoWin: stats.sum / stats.count,
        gameCount: stats.count
    })).filter(f => f.gameCount >= MIN_GAMES_FOR_BEST_FEATURE)
      .sort((a, b) => b.avgTheoWin - a.avgTheoWin);
    
    const bestMechanic = featureArray[0] || null;
    const mostCommonMechanic = [...featureArray].sort((a, b) => b.gameCount - a.gameCount)[0] || null;
    
    // Best Provider (highest avg theo_win)
    const providerStats = {};
    allGames.forEach(game => {
        const provider = getProvider(game);
        const perf = getPerformance(game);
        const prov = provider.studio || 'Unknown';
        
        if (!providerStats[prov]) {
            providerStats[prov] = { sum: 0, count: 0 };
        }
        providerStats[prov].sum += perf.theo_win;
        providerStats[prov].count++;
    });
    
    const MIN_GAMES_FOR_BEST = 5;
    const providerArray = Object.entries(providerStats).map(([name, stats]) => ({
        name,
        avgTheoWin: stats.sum / stats.count,
        gameCount: stats.count
    })).filter(p => p.gameCount >= MIN_GAMES_FOR_BEST)
      .sort((a, b) => b.avgTheoWin - a.avgTheoWin);
    
    const bestProvider = providerArray[0];
    
    // Highest theo_win Game
    const sortedGames = [...allGames].sort((a, b) => {
        const perfA = getPerformance(a);
        const perfB = getPerformance(b);
        return perfB.theo_win - perfA.theo_win;
    });
    const highestRTPGame = sortedGames[0];
    
    return {
        bestTheme: bestTheme ? {
            name: bestTheme.Theme,
            smartIndex: parseFloat(bestTheme['Smart Index']).toFixed(2),
            gameCount: bestTheme['Game Count'],
            avgRTP: parseFloat(bestTheme['Avg Theo Win Index'] ?? bestTheme.avg_theo_win ?? 0).toFixed(2)
        } : null,
        worstTheme: worstTheme ? {
            name: worstTheme.Theme,
            smartIndex: parseFloat(worstTheme['Smart Index']).toFixed(2),
            gameCount: worstTheme['Game Count']
        } : null,
        bestMechanic: bestMechanic ? {
            name: bestMechanic.name,
            avgTheoWin: bestMechanic.avgTheoWin.toFixed(2),
            gameCount: bestMechanic.gameCount
        } : null,
        mostCommonMechanic: mostCommonMechanic ? {
            name: mostCommonMechanic.name,
            gameCount: mostCommonMechanic.gameCount,
            avgTheoWin: mostCommonMechanic.avgTheoWin.toFixed(2)
        } : null,
        bestProvider: bestProvider ? {
            name: bestProvider.name,
            avgTheoWin: bestProvider.avgTheoWin.toFixed(2),
            gameCount: bestProvider.gameCount
        } : null,
        highestRTPGame: highestRTPGame ? {
            name: highestRTPGame.name || highestRTPGame.game_name || 'Unknown',
            theoWin: getPerformance(highestRTPGame).theo_win.toFixed(2),
            theme: getTheme(highestRTPGame).consolidated,
            provider: getProvider(highestRTPGame).studio
        } : null
    };
}

export function renderComparisonCards(performers) {
    if (!performers) return '';
    
    const cards = [];
    
    // Card 1: Best Theme
    if (performers.bestTheme) {
        cards.push(`
            <div class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg shadow-sm border border-amber-200 dark:border-amber-800 p-3 hover:shadow-md transition-all cursor-pointer"
                 onclick="${safeOnclick('window.showThemeDetails', performers.bestTheme.name || '')}">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">🥇</span>
                    <div class="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Best Theme</div>
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
                    <div class="text-[10px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400">Best Feature</div>
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
                    <div class="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Best Provider</div>
                </div>
                <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">${escapeHtml(performers.bestProvider.name)}</div>
                <div class="text-xl font-black bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent mb-1">${performers.bestProvider.avgTheoWin}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400">${performers.bestProvider.gameCount} games</div>
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
                    <div class="text-[10px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">Most Popular Feature</div>
                </div>
                <div class="text-sm font-bold text-gray-900 dark:text-white mb-0.5">${escapeHtml(performers.mostCommonMechanic.name)}</div>
                <div class="text-xl font-black bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent mb-1">${performers.mostCommonMechanic.gameCount}</div>
                <div class="text-[10px] text-gray-500 dark:text-gray-400">Avg Theo: ${performers.mostCommonMechanic.avgTheoWin}</div>
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
