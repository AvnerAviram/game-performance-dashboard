// Overview Insights - Slot Game Comparison Analytics
// Calculates best/worst performers across themes, mechanics, providers, games
import { getTheme, getProvider, getPerformance, getSpecs } from './compat.js';

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
        let feats = game.features;
        if (typeof feats === 'string') { try { feats = JSON.parse(feats); } catch(e) { feats = []; } }
        if (!Array.isArray(feats) || feats.length === 0) return;
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
            <div class="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg shadow-sm border-2 border-amber-200 dark:border-amber-800 p-4 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
                 onclick="window.showThemeDetails('${(performers.bestTheme.name || '').replace(/'/g, "\\'")}')">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-10 h-10 bg-gradient-to-br from-slate-200/90 to-slate-300/80 dark:from-slate-700/50 dark:to-slate-600/50 rounded-lg flex items-center justify-center text-xl">
                        🥇
                    </div>
                    <div>
                        <div class="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Best Theme</div>
                        <div class="text-xs text-amber-600 dark:text-amber-500">Highest Performance Index</div>
                    </div>
                </div>
                <div class="mb-2">
                    <div class="text-lg font-bold text-gray-900 dark:text-white mb-1">${performers.bestTheme.name}</div>
                    <div class="text-2xl font-black bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                        ${performers.bestTheme.smartIndex}
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                    <div>
                        <div class="text-xs text-amber-700 dark:text-amber-400 uppercase mb-1">Avg Theo Win</div>
                        <div class="text-sm font-bold text-gray-900 dark:text-white">${performers.bestTheme.avgRTP}</div>
                    </div>
                    <div>
                        <div class="text-xs text-amber-700 dark:text-amber-400 uppercase mb-1">Games</div>
                        <div class="text-sm font-bold text-gray-900 dark:text-white">${performers.bestTheme.gameCount}</div>
                    </div>
                </div>
            </div>
        `);
    }
    
    // Card 2: Best Feature
    if (performers.bestMechanic) {
        cards.push(`
            <div class="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg shadow-sm border-2 border-purple-200 dark:border-purple-800 p-4 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
                 onclick="window.showMechanicDetails('${(performers.bestMechanic.name || '').replace(/'/g, "\\'")}')">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-10 h-10 bg-gradient-to-br from-slate-200/90 to-slate-300/80 dark:from-slate-700/50 dark:to-slate-600/50 rounded-lg flex items-center justify-center text-xl">
                        ⚙️
                    </div>
                    <div>
                        <div class="text-xs font-bold uppercase tracking-wide text-purple-700 dark:text-purple-400">Best Feature</div>
                        <div class="text-xs text-purple-600 dark:text-purple-500">Highest Avg Theo Win</div>
                    </div>
                </div>
                <div class="mb-2">
                    <div class="text-lg font-bold text-gray-900 dark:text-white mb-1">${performers.bestMechanic.name}</div>
                    <div class="text-2xl font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                        ${performers.bestMechanic.avgTheoWin}
                    </div>
                </div>
                <div class="pt-2 border-t border-purple-200 dark:border-purple-800">
                    <div class="text-xs text-purple-700 dark:text-purple-400 uppercase mb-1">Used in</div>
                    <div class="text-sm font-bold text-gray-900 dark:text-white">${performers.bestMechanic.gameCount} games</div>
                </div>
            </div>
        `);
    }
    
    // Card 3: Best Provider
    if (performers.bestProvider) {
        cards.push(`
            <div class="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-lg shadow-sm border-2 border-emerald-200 dark:border-emerald-800 p-4 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
                 onclick="window.showProviderDetails('${(performers.bestProvider.name || '').replace(/'/g, "\\'")}')">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-10 h-10 bg-gradient-to-br from-slate-200/90 to-slate-300/80 dark:from-slate-700/50 dark:to-slate-600/50 rounded-lg flex items-center justify-center text-xl">
                        🏢
                    </div>
                    <div>
                        <div class="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Best Provider</div>
                        <div class="text-xs text-emerald-600 dark:text-emerald-500">Highest Quality</div>
                    </div>
                </div>
                <div class="mb-2">
                    <div class="text-lg font-bold text-gray-900 dark:text-white mb-1">${performers.bestProvider.name}</div>
                    <div class="text-2xl font-black bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                        ${performers.bestProvider.avgTheoWin}
                    </div>
                </div>
                <div class="pt-2 border-t border-emerald-200 dark:border-emerald-800">
                    <div class="text-xs text-emerald-700 dark:text-emerald-400 uppercase mb-1">Portfolio</div>
                    <div class="text-sm font-bold text-gray-900 dark:text-white">${performers.bestProvider.gameCount} games</div>
                </div>
            </div>
        `);
    }
    
    // Card 4: Worst Theme (Needs Attention)
    if (performers.worstTheme) {
        cards.push(`
            <div class="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 rounded-lg shadow-sm border-2 border-red-200 dark:border-red-800 p-4 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
                 onclick="window.showThemeDetails('${(performers.worstTheme.name || '').replace(/'/g, "\\'")}')">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-10 h-10 bg-gradient-to-br from-slate-200/90 to-slate-300/80 dark:from-slate-700/50 dark:to-slate-600/50 rounded-lg flex items-center justify-center text-xl">
                        🔻
                    </div>
                    <div>
                        <div class="text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Needs Attention</div>
                        <div class="text-xs text-red-600 dark:text-red-500">Lowest Performance Index</div>
                    </div>
                </div>
                <div class="mb-2">
                    <div class="text-lg font-bold text-gray-900 dark:text-white mb-1">${performers.worstTheme.name}</div>
                    <div class="text-2xl font-black bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent">
                        ${performers.worstTheme.smartIndex}
                    </div>
                </div>
                <div class="pt-2 border-t border-red-200 dark:border-red-800">
                    <div class="text-xs text-red-700 dark:text-red-400 uppercase mb-1">Only</div>
                    <div class="text-sm font-bold text-gray-900 dark:text-white">${performers.worstTheme.gameCount} games</div>
                </div>
            </div>
        `);
    }
    
    // Card 5: Most Common Feature
    if (performers.mostCommonMechanic) {
        cards.push(`
            <div class="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-lg shadow-sm border-2 border-cyan-200 dark:border-cyan-800 p-4 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
                 onclick="window.showMechanicDetails('${(performers.mostCommonMechanic.name || '').replace(/'/g, "\\'")}')">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-10 h-10 bg-gradient-to-br from-slate-200/90 to-slate-300/80 dark:from-slate-700/50 dark:to-slate-600/50 rounded-lg flex items-center justify-center text-xl">
                        📦
                    </div>
                    <div>
                        <div class="text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">Most Popular</div>
                        <div class="text-xs text-cyan-600 dark:text-cyan-500">Most Used Feature</div>
                    </div>
                </div>
                <div class="mb-2">
                    <div class="text-lg font-bold text-gray-900 dark:text-white mb-1">${performers.mostCommonMechanic.name}</div>
                    <div class="text-2xl font-black bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
                        ${performers.mostCommonMechanic.gameCount}
                    </div>
                </div>
                <div class="pt-2 border-t border-cyan-200 dark:border-cyan-800">
                    <div class="text-xs text-cyan-700 dark:text-cyan-400 uppercase mb-1">Avg Theo Win</div>
                    <div class="text-sm font-bold text-gray-900 dark:text-white">${performers.mostCommonMechanic.avgTheoWin}</div>
                </div>
            </div>
        `);
    }
    
    // Card 6: Highest Theo Win Game
    if (performers.highestRTPGame) {
        cards.push(`
            <div class="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-lg shadow-sm border-2 border-indigo-200 dark:border-indigo-800 p-4 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
                 onclick="window.showGameDetails('${(performers.highestRTPGame.name || '').replace(/'/g, "\\'")}')">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-10 h-10 bg-gradient-to-br from-slate-200/90 to-slate-300/80 dark:from-slate-700/50 dark:to-slate-600/50 rounded-lg flex items-center justify-center text-xl">
                        💎
                    </div>
                    <div>
                        <div class="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">Highest Theo Win</div>
                        <div class="text-xs text-indigo-600 dark:text-indigo-500">Top Performer</div>
                    </div>
                </div>
                <div class="mb-2">
                    <div class="text-base font-bold text-gray-900 dark:text-white mb-1 truncate" title="${performers.highestRTPGame.name}">${performers.highestRTPGame.name}</div>
                    <div class="text-2xl font-black bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                        ${performers.highestRTPGame.theoWin}
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-200 dark:border-indigo-800">
                    <div>
                        <div class="text-xs text-indigo-700 dark:text-indigo-400 uppercase mb-1">Theme</div>
                        <div class="text-xs font-bold text-gray-900 dark:text-white truncate">${performers.highestRTPGame.theme}</div>
                    </div>
                    <div>
                        <div class="text-xs text-indigo-700 dark:text-indigo-400 uppercase mb-1">Provider</div>
                        <div class="text-xs font-bold text-gray-900 dark:text-white truncate">${performers.highestRTPGame.provider}</div>
                    </div>
                </div>
            </div>
        `);
    }
    
    return `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            ${cards.join('')}
        </div>
    `;
}

// No additional functions needed - renderComparisonCards handles all 6 cards
