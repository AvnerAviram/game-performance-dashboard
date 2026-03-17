/**
 * Idea Generator - Data-driven game ideas for designers
 * Surfaces theme+mechanic combos with performance scores and competition level
 */
import { gameData } from '../lib/data.js';

/** Get theme+mechanic combos from allGames */
function getThemeMechanicCombos() {
    const games = gameData.allGames || [];
    const combos = {};

    games.forEach(g => {
        const theme = g.theme_consolidated || g.Theme || 'Unknown';
        const mechanic = g.mechanic_primary || g.Mechanic || 'Unknown';
        const key = `${theme}|${mechanic}`;
        const theo = g.performance_theo_win ?? g['Avg Theo Win Index'] ?? g.theo_win_index ?? 0;

        if (!combos[key]) {
            combos[key] = { theme, mechanic, count: 0, totalTheo: 0, games: [] };
        }
        combos[key].count++;
        combos[key].totalTheo += theo;
        combos[key].games.push(g.name);
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

/** Get top 5 suggested game ideas (high opportunity, actionable) */
export function getSuggestedIdeas() {
    const combos = getThemeMechanicCombos();
    return combos
        .filter(c => c.count >= 2 && c.count <= 25) // Not too niche, not saturated
        .filter(c => c.avgTheo > 3.0) // Quality threshold
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, 5);
}

/** Get top theme+mechanic combos by performance (for combo explorer) */
export function getTopCombos(limit = 10) {
    const combos = getThemeMechanicCombos();
    return combos
        .sort((a, b) => b.avgTheo - a.avgTheo)
        .slice(0, limit);
}

/** Get underperforming combos (avoid) - 5+ games, below median */
export function getAvoidCombos(limit = 5) {
    const combos = getThemeMechanicCombos();
    const medianTheo = getMedian(combos.map(c => c.avgTheo));
    return combos
        .filter(c => c.count >= 5 && c.avgTheo < medianTheo)
        .sort((a, b) => a.avgTheo - b.avgTheo)
        .slice(0, limit);
}

/** Get watch-list combos - 2-4 games, below median (small sample, monitor) */
export function getWatchListCombos(limit = 5) {
    const combos = getThemeMechanicCombos();
    const medianTheo = getMedian(combos.map(c => c.avgTheo));
    return combos
        .filter(c => c.count >= 2 && c.count <= 4 && c.avgTheo < medianTheo)
        .sort((a, b) => a.avgTheo - b.avgTheo)
        .slice(0, limit);
}

function getMedian(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Heatmap data: top themes × top mechanics, cell = avgTheo */
export function getHeatmapData(topThemes = 10, topMechanics = 10) {
    const combos = getThemeMechanicCombos();
    const comboMap = {};
    combos.forEach(c => { comboMap[`${c.theme}|${c.mechanic}`] = c; });

    const themes = (gameData.themes || [])
        .sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0))
        .slice(0, topThemes)
        .map(t => t.Theme || t.theme);
    const mechanics = (gameData.mechanics || [])
        .sort((a, b) => (b['Game Count'] || 0) - (a['Game Count'] || 0))
        .slice(0, topMechanics)
        .map(m => m.Mechanic || m.mechanic);

    const matrix = themes.map(t => mechanics.map(m => {
        const c = comboMap[`${t}|${m}`];
        return c ? { avgTheo: c.avgTheo, count: c.count } : null;
    }));
    const allTheos = matrix.flat().filter(Boolean).map(x => x.avgTheo);
    const minTheo = allTheos.length ? Math.min(...allTheos) : 0;
    const maxTheo = allTheos.length ? Math.max(...allTheos) : 1;
    return { themes, mechanics, matrix, minTheo, maxTheo };
}
