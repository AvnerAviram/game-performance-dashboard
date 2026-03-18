/**
 * Idea Generator - Data-driven game ideas for designers
 * Surfaces theme+feature combos with performance scores and competition level
 */
import { gameData } from '../lib/data.js';

/** 11 canonical features (from PHASE1_TRUTH_MASTER) */
const CANONICAL_FEATURES = [
    'Cash On Reels', 'Expanding Reels', 'Free Spins', 'Hold and Spin',
    'Nudges', 'Persistence', 'Pick Bonus', 'Respin', 'Static Jackpot',
    'Wheel', 'Wild Reels'
];

function parseFeatures(val) {
    if (Array.isArray(val)) return val;
    if (!val) return [];
    const s = String(val).trim();
    if (!s || s === 'null' || s === 'NULL') return [];
    try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr : []; }
    catch { return []; }
}

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

/** Get top 5 suggested game ideas (high opportunity, actionable) */
export function getSuggestedIdeas() {
    const combos = getThemeMechanicCombos();
    return combos
        .filter(c => c.count >= 2 && c.count <= 25) // Not too niche, not saturated
        .filter(c => c.avgTheo > 3.0) // Quality threshold
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, 5);
}

/** Get top theme+feature combos by performance (for combo explorer) */
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

/** Heatmap data: top themes × all 11 canonical features, cell = avgTheo */
export function getHeatmapData(topThemes = 10) {
    const combos = getThemeMechanicCombos();
    const comboMap = {};
    combos.forEach(c => { comboMap[`${c.theme}|${c.feature}`] = c; });

    // Derive themes from combos directly (more robust than gameData.themes)
    const themeStats = {};
    combos.forEach(c => {
        if (!themeStats[c.theme]) themeStats[c.theme] = { count: 0, totalTheo: 0 };
        themeStats[c.theme].count += c.count;
        themeStats[c.theme].totalTheo += c.avgTheo * c.count;
    });

    let themes;
    const gdThemes = (gameData.themes || []).filter(t => (t.Theme || t.theme));
    if (gdThemes.length > 0) {
        themes = [...gdThemes]
            .sort((a, b) => (b['Smart Index'] || b.game_count || 0) - (a['Smart Index'] || a.game_count || 0))
            .slice(0, topThemes)
            .map(t => t.Theme || t.theme);
    } else {
        themes = Object.entries(themeStats)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, topThemes)
            .map(([name]) => name);
    }

    const features = [...CANONICAL_FEATURES];

    const matrix = themes.map(t => features.map(f => {
        const c = comboMap[`${t}|${f}`];
        return c ? { avgTheo: c.avgTheo, count: c.count } : null;
    }));
    const allTheos = matrix.flat().filter(Boolean).map(x => x.avgTheo);
    const minTheo = allTheos.length ? Math.min(...allTheos) : 0;
    const maxTheo = allTheos.length ? Math.max(...allTheos) : 1;
    return { themes, mechanics: features, matrix, minTheo, maxTheo };
}
