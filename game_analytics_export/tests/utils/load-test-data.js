/**
 * Test Data Loader - Loads game_data_master.json and populates gameData without DuckDB.
 * Use in Vitest integration/validation tests (DuckDB is browser-only).
 */

import {
    calculateThemeDistribution,
    calculateMechanicDistribution,
    calculateAnomalies,
    calculateSmartIndex,
} from './json-aggregator.js';

export const gameData = {
    total_games: 0,
    theme_count: 0,
    mechanic_count: 0,
    themes: [],
    mechanics: [],
    top_anomalies: [],
    bottom_anomalies: [],
    allGames: [],
    viewGames: null,
    viewThemes: null,
    viewMechanics: null,
    activeCategory: null,
};

export function getActiveGames() {
    return gameData.viewGames ?? gameData.allGames ?? [];
}

export function getActiveThemes() {
    return gameData.viewThemes ?? gameData.themes ?? [];
}

export function getActiveMechanics() {
    return gameData.viewMechanics ?? gameData.mechanics ?? [];
}

export async function loadTestData() {
    const module = await import('../../data/game_data_master.json', {
        assert: { type: 'json' },
    });
    const data = module.default;
    const games = Array.isArray(data) ? data : data.games || [];

    gameData.total_games = games.length;
    gameData.allGames = games;

    const themesRaw = calculateThemeDistribution(games);
    const mechanicsRaw = calculateMechanicDistribution(games);

    const avgTheoThemes =
        themesRaw.length > 0 ? themesRaw.reduce((s, t) => s + t.avg_theo_win, 0) / themesRaw.length : 1;
    const avgTheoMechanics =
        mechanicsRaw.length > 0 ? mechanicsRaw.reduce((s, m) => s + m.avg_theo_win, 0) / mechanicsRaw.length : 1;

    const totalMarketShare = themesRaw.reduce((s, t) => s + (t.total_market_share || 0), 0) || 1;

    gameData.themes = themesRaw.map(t => ({
        Theme: t.theme,
        theme: t.theme,
        'Game Count': t.game_count,
        game_count: t.game_count,
        'Avg Theo Win Index': t.avg_theo_win,
        avg_theo_win: t.avg_theo_win,
        'Market Share %': ((t.total_market_share || 0) / totalMarketShare) * 100,
        total_market_share: t.total_market_share,
    }));

    const mechanicsTotalMarketShare = mechanicsRaw.reduce((s, m) => s + (m.total_market_share || 0), 0) || 1;

    gameData.mechanics = mechanicsRaw.map(m => ({
        Mechanic: m.mechanic,
        mechanic: m.mechanic,
        'Game Count': m.game_count,
        game_count: m.game_count,
        'Avg Theo Win Index': m.avg_theo_win,
        avg_theo_win: m.avg_theo_win,
        'Market Share %': ((m.total_market_share || 0) / mechanicsTotalMarketShare) * 100,
        total_market_share: m.total_market_share,
    }));

    // Apply Smart Index (same logic as data.js)
    gameData.themes = gameData.themes.map(theme => {
        const weight = Math.sqrt(theme.game_count || theme['Game Count']);
        const theo = theme.avg_theo_win || theme['Avg Theo Win Index'];
        const smartIndex = (theo * weight) / avgTheoThemes;
        return { ...theme, 'Smart Index': smartIndex };
    });
    gameData.themes.sort((a, b) => b['Smart Index'] - a['Smart Index']);

    gameData.mechanics = gameData.mechanics.map(mechanic => {
        const weight = Math.sqrt(mechanic.game_count || mechanic['Game Count']);
        const theo = mechanic.avg_theo_win || mechanic['Avg Theo Win Index'];
        const smartIndex = (theo * weight) / avgTheoMechanics;
        return { ...mechanic, 'Smart Index': smartIndex };
    });
    gameData.mechanics.sort((a, b) => b['Smart Index'] - a['Smart Index']);

    const anomalies = calculateAnomalies(games);
    gameData.top_anomalies = (anomalies.high || []).map(g => ({
        game: g.name,
        themes: [g.theme_primary ?? g.theme?.consolidated ?? 'Unknown'],
        mechanics: Array.isArray(g.features) && g.features.length > 0 ? g.features : ['Unknown'],
        'Theo Win': g.theo_win ?? g.performance?.theo_win ?? 0,
        'Market Share %': g.market_share_pct ?? g.performance?.market_share_percent ?? 0,
        rank: g.performance_rank ?? g.performance?.rank ?? 999,
        theo_win_index: g.theo_win ?? g.performance?.theo_win ?? 0,
    }));
    gameData.bottom_anomalies = (anomalies.low || []).map(g => ({
        game: g.name,
        themes: [g.theme_primary ?? g.theme?.consolidated ?? 'Unknown'],
        mechanics: Array.isArray(g.features) && g.features.length > 0 ? g.features : ['Unknown'],
        'Theo Win': g.theo_win ?? g.performance?.theo_win ?? 0,
        'Market Share %': g.market_share_pct ?? g.performance?.market_share_percent ?? 0,
        rank: g.performance_rank ?? g.performance?.rank ?? 999,
        theo_win_index: g.theo_win ?? g.performance?.theo_win ?? 0,
    }));

    gameData.theme_count = gameData.themes.length;
    gameData.mechanic_count = gameData.mechanics.length;
    gameData._dataSource = 'test'; // For tests that check data source

    return gameData;
}
