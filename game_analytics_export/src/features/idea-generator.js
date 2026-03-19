/**
 * Idea Generator - Data-driven game ideas for designers
 * Surfaces theme+feature combos with performance scores and competition level
 */
import { gameData } from '../lib/data.js';
import { parseFeatures } from '../lib/parse-features.js';

/** Get theme+feature combos from allGames (each game contributes per feature) */
function getThemeMechanicCombos() {
    const games = gameData.allGames || [];
    const combos = {};

    games.forEach(g => {
        const theme = g.theme_consolidated || g.Theme || 'Unknown';
        const features = parseFeatures(g.features);
        const theo = g.performance_theo_win ?? g['Avg Theo Win Index'] ?? g.theo_win_index ?? 0;

        for (const feat of features) {
            if (!feat || typeof feat !== 'string') continue;
            const key = `${theme}|${feat}`;
            if (!combos[key]) {
                combos[key] = { theme, feature: feat, count: 0, totalTheo: 0, games: [] };
            }
            combos[key].count++;
            combos[key].totalTheo += theo;
            combos[key].games.push(g.name);
        }
    });

    return Object.values(combos)
        .map(c => ({
            ...c,
            avgTheo: c.count > 0 ? c.totalTheo / c.count : 0,
            // Opportunity score: high quality + low competition (fewer games = more opportunity)
            opportunityScore: c.count > 0
                ? (c.totalTheo / c.count) / Math.sqrt(c.count + 1)
                : 0
        }))
        .filter(c => c.count >= 2); // At least 2 games for signal
}

/** Get underperforming combos (avoid) - 3+ games, below median performance */
export function getAvoidCombos(limit = 5) {
    const combos = getThemeMechanicCombos();
    const medianTheo = getMedian(combos.map(c => c.avgTheo));
    return combos
        .filter(c => c.count >= 3 && c.avgTheo < medianTheo * 0.95)
        .sort((a, b) => a.avgTheo - b.avgTheo)
        .slice(0, limit);
}

/** Get Build Next combos: above-average theo, not oversaturated. Opportunity = quality / competition */
export function getBuildNextCombos(limit = 5) {
    const combos = getThemeMechanicCombos();
    if (!combos.length) return [];
    const avgTheos = combos.map(c => c.avgTheo).filter(x => x > 0);
    const counts = combos.map(c => c.count);
    const medianTheo = getMedian(avgTheos);
    const p75Count = getPercentile(counts, 75);
    return combos
        .filter(c => c.avgTheo >= medianTheo * 0.9 && c.count <= p75Count)
        .map(c => ({ ...c, score: c.avgTheo / Math.sqrt(c.count + 1) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

function getMedian(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getPercentile(arr, pct) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((pct / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

