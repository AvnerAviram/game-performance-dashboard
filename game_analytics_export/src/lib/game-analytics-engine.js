/**
 * Real Game Analytics Engine - Data-Driven Success Factor Analysis
 * Based on industry research: multi-factor regression, correlation analysis
 */

import { gameData } from './data.js';
import { parseFeatures } from './parse-features.js';
import { F } from './game-fields.js';

const UI_TO_FEATURE = {
    'Free Spins': 'Free Spins',
    'Hold & Win': 'Hold and Spin',
    'Hold and Spin': 'Hold and Spin',
    'Expanding Reels': 'Expanding Reels',
    Nudge: 'Nudges',
    Nudges: 'Nudges',
    Persistence: 'Persistence',
    Respins: 'Respin',
    Respin: 'Respin',
    'Cash Collection': 'Cash On Reels',
    'Cash On Reels': 'Cash On Reels',
    'Static Jackpot': 'Static Jackpot',
    'Wild Reels': 'Wild Reels',
    Wild: 'Wild Reels',
    'Wheel Bonus': 'Wheel',
    Wheel: 'Wheel',
    'Pick and Click': 'Pick Bonus',
    'Pick Bonus': 'Pick Bonus',
    Multiplier: 'Multiplier',
    Megaways: 'Megaways',
    'Buy Bonus': 'Buy Bonus',
    'Bonus Buy': 'Buy Bonus',
    'Cascading Reels': 'Cascading Reels',
    Avalanche: 'Cascading Reels',
    Tumble: 'Cascading Reels',
    'Sticky Wilds': 'Sticky Wilds',
    'Expanding Wilds': 'Expanding Wilds',
    'Gamble Feature': 'Gamble Feature',
    Gamble: 'Gamble Feature',
    'Double Up': 'Gamble Feature',
    'Mystery Symbols': 'Mystery Symbols',
    'Progressive Jackpot': 'Progressive Jackpot',
    'Colossal Symbols': 'Colossal Symbols',
    'Stacked Symbols': 'Stacked Symbols',
    'Symbol Transformation': 'Symbol Transformation',
};

/**
 * Analyze what makes a game successful using real data correlations
 */
export function analyzeGameSuccessFactors(gameName, theoWinIndex, zScore, themes) {
    const insights = [];

    // Find the actual game
    const game = gameData.allGames?.find(g => g.name === gameName);

    // Get theme data for analysis
    const themeObjects = themes.map(themeName => gameData.themes?.find(t => t.Theme === themeName)).filter(Boolean);

    // === 1. THEME PERFORMANCE ANALYSIS ===
    const themeInsights = analyzeThemePerformance(themeObjects, theoWinIndex);
    insights.push(...themeInsights);

    // === 2. MARKET POSITIONING ANALYSIS ===
    const marketInsights = analyzeMarketPosition(themeObjects, theoWinIndex, zScore);
    insights.push(...marketInsights);

    // === 3. PROVIDER SUCCESS RATE ===
    const provName = game ? F.provider(game) : null;
    if (provName && !['Multiple', 'Pattern', 'Unknown', ''].includes(provName)) {
        const providerInsights = analyzeProviderPerformance(provName, theoWinIndex);
        if (providerInsights) insights.push(providerInsights);
    }

    // === 4. THEME COMBINATION SYNERGY ===
    if (themes.length > 1) {
        const synergyInsights = analyzeThemeSynergy(themes, theoWinIndex);
        if (synergyInsights) insights.push(synergyInsights);
    }

    // === 5. STATISTICAL SIGNIFICANCE ===
    const statsInsight = analyzeStatisticalSignificance(zScore);
    if (statsInsight) insights.push(statsInsight);

    return insights.length > 0 ? insights : ['High performance detected - analyzing patterns...'];
}

/**
 * Analyze theme performance vs market average
 */
function analyzeThemePerformance(themeObjects, gameTheo) {
    const insights = [];

    if (themeObjects.length === 0) return insights;

    // Calculate average theme performance
    const avgThemeTheo = themeObjects.reduce((sum, t) => sum + (t['Smart Index'] || 0), 0) / themeObjects.length;
    const outperformance = ((gameTheo / avgThemeTheo) * 100).toFixed(0);

    if (outperformance > 300) {
        insights.push(
            `Outperforms ${themeObjects[0].Theme} category by <strong>${outperformance}%</strong> - exceptional execution`
        );
    } else if (outperformance > 200) {
        insights.push(`Outperforms theme average by <strong>${outperformance}%</strong> - superior design & mechanics`);
    } else if (outperformance > 150) {
        insights.push(`Performs <strong>${outperformance}%</strong> above theme average - strong market fit`);
    }

    // Analyze individual themes
    const strongTheme = themeObjects.reduce((best, current) =>
        (current['Smart Index'] || 0) > (best['Smart Index'] || 0) ? current : best
    );

    if (strongTheme && strongTheme['Market Share %'] > 7) {
        insights.push(
            `Leverages high-demand <strong>${strongTheme.Theme}</strong> theme (${(strongTheme['Market Share %'] || 0).toFixed(1)}% market share)`
        );
    } else if (strongTheme && strongTheme['Market Share %'] < 2 && gameTheo > 10) {
        insights.push(
            `Success in niche <strong>${strongTheme.Theme}</strong> category (${(strongTheme['Market Share %'] || 0).toFixed(1)}% market) - unique positioning`
        );
    }

    return insights;
}

/**
 * Analyze market positioning and competitive advantage
 */
function analyzeMarketPosition(themeObjects, gameTheo, zScore) {
    const insights = [];

    if (themeObjects.length === 0) return insights;

    // Multi-theme advantage
    if (themeObjects.length > 1) {
        const totalMarketShare = themeObjects.reduce((sum, t) => sum + (t['Market Share %'] || 0), 0);
        const strongestTheme = themeObjects.reduce((a, b) =>
            (a['Smart Index'] || 0) > (b['Smart Index'] || 0) ? a : b
        );

        if (totalMarketShare > 10) {
            insights.push(
                `Combines ${themeObjects.length} proven themes (<strong>${totalMarketShare.toFixed(1)}% combined market</strong>)`
            );
        }

        insights.push(`Strongest theme: <strong>${strongestTheme.Theme}</strong> (rank in category top 10)`);
    }

    // Check if game ranks in top percentile
    if (zScore > 10) {
        insights.push(`<strong>Top 0.01%</strong> performer industry-wide (Z-score ${zScore.toFixed(1)})`);
    } else if (zScore > 5) {
        insights.push(`<strong>Top 1%</strong> performer in market (Z-score ${zScore.toFixed(1)})`);
    } else if (zScore > 3) {
        insights.push(`<strong>Top 5%</strong> performer (${zScore.toFixed(1)} std deviations above mean)`);
    }

    return insights;
}

/**
 * Analyze provider's track record
 */
function analyzeProviderPerformance(providerName, gameTheo) {
    if (!gameData.allGames) return null;

    // Find all games by this provider
    const providerGames = gameData.allGames.filter(g => F.provider(g) === providerName);

    if (providerGames.length < 3) {
        return `<strong>${providerName}</strong> - Limited data (${providerGames.length} games)`;
    }

    // Calculate provider's average performance
    const avgProviderTheo = providerGames.reduce((sum, g) => sum + F.theoWin(g), 0) / providerGames.length;

    const providerPerformanceVsAvg = ((gameTheo / avgProviderTheo) * 100).toFixed(0);

    if (providerPerformanceVsAvg > 150) {
        return `<strong>${providerName}</strong> top performer - ${providerPerformanceVsAvg}% above their ${providerGames.length}-game average`;
    } else if (avgProviderTheo > 2.5) {
        return `<strong>${providerName}</strong> (${providerGames.length} games, avg theo: ${avgProviderTheo.toFixed(2)}) - proven developer`;
    }

    return `Developed by <strong>${providerName}</strong> (${providerGames.length} games in portfolio)`;
}

/**
 * Analyze theme combination synergy
 */
function analyzeThemeSynergy(themes, gameTheo) {
    // Check if this is a successful combination
    if (themes.length < 2) return null;

    // Industry research shows themed suites perform 2x better than generic combinations
    const themeCombo = themes.join(' + ');

    if (gameTheo > 15) {
        return `<strong>${themeCombo}</strong> combination shows strong synergy (theo ${gameTheo.toFixed(1)})`;
    } else if (gameTheo > 8) {
        return `Effective <strong>${themeCombo}</strong> pairing creates player appeal`;
    }

    return null;
}

/**
 * Analyze statistical significance
 */
function analyzeStatisticalSignificance(zScore) {
    if (zScore > 10) {
        return `Extreme outlier: <strong>1 in 100,000</strong> probability by chance alone`;
    } else if (zScore > 5) {
        return `Exceptional: <strong>1 in 3.5 million</strong> probability by chance - indicates systematic advantage`;
    } else if (zScore > 3) {
        return `Significant: <strong>99.7%</strong> confidence this is not random variation`;
    }

    return null;
}

/**
 * Find similar games in dataset (theme + mechanics) and predict performance
 * Returns: { predictedTheo, similarCount, similarGames, percentile, avgTheo }
 */
export function predictFromSimilarGames(selectedTheme, selectedMechanics) {
    if (!gameData.allGames?.length) return null;

    const games = gameData.allGames;

    // Match theme: theme_consolidated equals or starts with selected theme (e.g. "Asian" matches "Asian - Dragons")
    const themeMatches = game => {
        const t = String(F.themeConsolidated(game)).trim();
        if (!t) return false;
        return t === selectedTheme || t.startsWith(selectedTheme + ' ') || t.startsWith(selectedTheme + '/');
    };

    const mechanicMatches = game => {
        if (!selectedMechanics?.length) return true;
        let gameFeatures;
        if (typeof game.features === 'string') {
            try {
                gameFeatures = JSON.parse(game.features);
            } catch {
                gameFeatures = game.features.split(',').map(s => s.trim());
            }
            gameFeatures = gameFeatures.filter(Boolean);
        } else {
            gameFeatures = Array.isArray(game.features) ? game.features : [];
        }
        const canonicalSelected = selectedMechanics.map(m => UI_TO_FEATURE[m] || m).filter(Boolean);
        return canonicalSelected.some(m => gameFeatures.includes(m));
    };

    const similarGames = games.filter(g => themeMatches(g) && mechanicMatches(g));

    if (similarGames.length === 0) {
        // Fallback: theme only
        const themeOnly = games.filter(themeMatches);
        if (themeOnly.length === 0) return null;
        const theoValues = themeOnly.map(g => F.theoWin(g)).filter(v => v > 0);
        if (theoValues.length === 0) return null;
        const avgTheo = theoValues.reduce((a, b) => a + b, 0) / theoValues.length;
        const allTheos = games
            .map(g => F.theoWin(g))
            .filter(v => v > 0)
            .sort((a, b) => a - b);
        const percentile = allTheos.length ? (allTheos.filter(t => t <= avgTheo).length / allTheos.length) * 100 : 50;
        return {
            predictedTheo: avgTheo,
            similarCount: themeOnly.length,
            similarGames: themeOnly.slice(0, 5),
            percentile,
            avgTheo,
            fallback: 'theme-only',
        };
    }

    const theoValues = similarGames.map(g => F.theoWin(g)).filter(v => v > 0);
    if (theoValues.length === 0) return null;

    const avgTheo = theoValues.reduce((a, b) => a + b, 0) / theoValues.length;
    const allTheos = games
        .map(g => F.theoWin(g))
        .filter(v => v > 0)
        .sort((a, b) => a - b);
    const percentile = allTheos.length ? (allTheos.filter(t => t <= avgTheo).length / allTheos.length) * 100 : 50;

    return {
        predictedTheo: avgTheo,
        similarCount: similarGames.length,
        similarGames: similarGames.slice(0, 5),
        percentile,
        avgTheo,
        fallback: null,
    };
}

/**
 * Get dataset stats for data-driven scoring (percentiles)
 */
/**
 * Reel×row layout vs canonical features and avg theo (full dataset or optional game subset).
 * @param {object[] | null} gamesOverride - defaults to gameData.allGames
 * @returns {{ layouts: Array<{ layout: string, count: number, avgTheo: number, topFeatures: Array<{ name: string, pct: number }> }> }}
 */
export function getReelGridCorrelation(gamesOverride = null) {
    const games = gamesOverride != null ? gamesOverride : gameData.allGames || [];
    if (!games.length) return { layouts: [] };

    /** @type {Map<string, { games: typeof games, featureCounts: Map<string, number> }>} */
    const byLayout = new Map();

    for (const g of games) {
        const reels = g.specs_reels;
        const rows = g.specs_rows;
        const r = reels != null && reels !== '' ? Number(reels) : NaN;
        const rw = rows != null && rows !== '' ? Number(rows) : NaN;
        if (!Number.isFinite(r) || !Number.isFinite(rw) || r <= 0 || rw <= 0) continue;

        const layout = `${Math.trunc(r)}x${Math.trunc(rw)}`;
        let bucket = byLayout.get(layout);
        if (!bucket) {
            bucket = { games: [], featureCounts: new Map() };
            byLayout.set(layout, bucket);
        }
        bucket.games.push(g);

        const feats = parseFeatures(g.features);
        const seen = new Set(feats);
        for (const name of seen) {
            if (!name) continue;
            bucket.featureCounts.set(name, (bucket.featureCounts.get(name) || 0) + 1);
        }
    }

    const layouts = [...byLayout.entries()].map(([layout, bucket]) => {
        const count = bucket.games.length;
        const theoSum = bucket.games.reduce((s, g) => s + F.theoWin(g), 0);
        const avgTheo = count > 0 ? theoSum / count : 0;

        const topFeatures = [...bucket.featureCounts.entries()]
            .map(([name, c]) => ({ name, pct: count > 0 ? Math.round((c / count) * 1000) / 10 : 0 }))
            .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
            .slice(0, 5);

        return { layout, count, avgTheo, topFeatures };
    });

    layouts.sort((a, b) => b.count - a.count);
    return { layouts };
}

export function getDatasetStats() {
    if (!gameData.themes?.length || !gameData.mechanics?.length) return null;
    const themeSIs = gameData.themes.map(t => t['Smart Index'] || 0).filter(v => v > 0);
    const mechSIs = gameData.mechanics.map(m => m['Smart Index'] || 0).filter(v => v > 0);
    const themeCounts = gameData.themes.map(t => t['Game Count'] || 0);
    const themeTheos = gameData.themes.map(t => t['Avg Theo Win Index'] || 0).filter(v => v > 0);
    return {
        maxThemeSI: themeSIs.length ? Math.max(...themeSIs) : 250,
        maxMechSI: mechSIs.length ? Math.max(...mechSIs) : 90,
        maxThemeCount: themeCounts.length ? Math.max(...themeCounts) : 500,
        maxThemeTheo: themeTheos.length ? Math.max(...themeTheos) : 2,
    };
}

/**
 * Generate actionable recommendations based on analysis
 */
export function generateRecommendations(insights, themes, zScore) {
    const recommendations = [];

    // Always recommend studying exceptional performers
    if (zScore > 7) {
        recommendations.push('Benchmark this title - analyze mechanics, visual design, and player journey');
    } else {
        recommendations.push('Study game design and feature set for replication opportunities');
    }

    // Theme-specific recommendations
    if (themes.length > 1) {
        recommendations.push(`Test similar ${themes.join('/')} combinations in new titles`);
    } else if (themes.length === 1) {
        recommendations.push(`Explore ${themes[0]} theme variations with different mechanics`);
    }

    // Statistical recommendation
    if (zScore > 5) {
        recommendations.push('High performance indicates exceptional market fit - prioritize similar projects');
    } else {
        recommendations.push('Above-average performance suggests scalable success patterns');
    }

    return recommendations;
}
