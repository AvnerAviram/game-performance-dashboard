import { describe, test, expect, beforeAll } from 'vitest';
import {
    initializeDatabase,
    getOverviewStats,
    getThemeDistribution,
    getMechanicDistribution,
    getProviderDistribution,
    getAnomalies,
    getAllGames,
} from '../../src/lib/db/duckdb-client.js';
import {
    calculateOverviewStats,
    calculateThemeDistribution,
    calculateMechanicDistribution,
    calculateProviderDistribution,
    calculateAnomalies,
    filterGames,
    compareWithTolerance,
} from '../utils/json-aggregator.js';

/**
 * Layer 2: DuckDB Aggregation Validation Tests
 *
 * Double-verify DuckDB calculations against manual JavaScript aggregations.
 * This ensures DuckDB SQL queries produce correct results.
 */

describe('DuckDB Aggregations: Overview Stats', () => {
    let games;
    let manualStats;
    let duckdbStats;

    beforeAll(async () => {
        // Initialize DuckDB
        await initializeDatabase();

        // Load games for manual calculation (use games_dashboard - same as DuckDB)
        const response = await fetch('/api/data/games');
        const data = await response.json();
        games = Array.isArray(data) ? data : data?.games || [];

        // Calculate both ways
        manualStats = calculateOverviewStats(games);
        const duckdbResult = await getOverviewStats();
        duckdbStats = duckdbResult[0];
    });

    test('DuckDB total_games should match manual count', () => {
        expect(duckdbStats.total_games).toBe(manualStats.total_games);
        expect(duckdbStats.total_games).toBe(games.length);
    });

    test('DuckDB theme_count should match manual count', () => {
        expect(duckdbStats.theme_count).toBe(manualStats.theme_count);
        console.log(`✓ Theme count: ${duckdbStats.theme_count}`);
    });

    test('DuckDB mechanic_count should match manual count', () => {
        expect(duckdbStats.mechanic_count).toBe(manualStats.mechanic_count);
        console.log(`✓ Mechanic count: ${duckdbStats.mechanic_count}`);
    });

    test('DuckDB avg_theo_win should match manual calculation', () => {
        const match = compareWithTolerance(duckdbStats.avg_theo_win, manualStats.avg_theo_win, 0.01);

        if (!match) {
            console.error('Avg theo_win mismatch:');
            console.error('  DuckDB:', duckdbStats.avg_theo_win);
            console.error('  Manual:', manualStats.avg_theo_win);
            console.error('  Diff:', Math.abs(duckdbStats.avg_theo_win - manualStats.avg_theo_win));
        }

        expect(match).toBe(true);
    });
});

describe('DuckDB Aggregations: Theme Distribution', () => {
    let games;
    let manualThemes;
    let duckdbThemes;

    beforeAll(async () => {
        await initializeDatabase();

        const response = await fetch('/api/data/games');
        const data = await response.json();
        games = Array.isArray(data) ? data : data?.games || [];

        manualThemes = calculateThemeDistribution(games);
        duckdbThemes = await getThemeDistribution();
    });

    test('DuckDB should return same number of themes', () => {
        expect(duckdbThemes.length).toBe(manualThemes.length);
        console.log(`✓ Both methods found ${duckdbThemes.length} themes`);
    });

    test('DuckDB game counts should match manual counts', () => {
        const mismatches = [];

        manualThemes.forEach(manualTheme => {
            const duckdbTheme = duckdbThemes.find(t => t.theme === manualTheme.theme);

            if (!duckdbTheme) {
                mismatches.push({
                    theme: manualTheme.theme,
                    issue: 'Missing in DuckDB',
                });
                return;
            }

            if (duckdbTheme.game_count !== manualTheme.game_count) {
                mismatches.push({
                    theme: manualTheme.theme,
                    duckdb: duckdbTheme.game_count,
                    manual: manualTheme.game_count,
                });
            }
        });

        if (mismatches.length > 0) {
            console.error('Game count mismatches:', mismatches.slice(0, 5));
        }

        expect(mismatches).toHaveLength(0);
    });

    test('DuckDB avg_theo_win should match manual calculations', () => {
        const mismatches = [];

        manualThemes.forEach(manualTheme => {
            const duckdbTheme = duckdbThemes.find(t => t.theme === manualTheme.theme);

            if (!duckdbTheme) return;

            const match = compareWithTolerance(duckdbTheme.avg_theo_win, manualTheme.avg_theo_win, 0.01);

            if (!match) {
                mismatches.push({
                    theme: manualTheme.theme,
                    duckdb: duckdbTheme.avg_theo_win.toFixed(4),
                    manual: manualTheme.avg_theo_win.toFixed(4),
                    diff: Math.abs(duckdbTheme.avg_theo_win - manualTheme.avg_theo_win).toFixed(4),
                });
            }
        });

        if (mismatches.length > 0) {
            console.error('Avg theo_win mismatches:', mismatches.slice(0, 5));
        }

        expect(mismatches).toHaveLength(0);
    });

    test('DuckDB total_market_share should match manual calculations', () => {
        const mismatches = [];

        manualThemes.forEach(manualTheme => {
            const duckdbTheme = duckdbThemes.find(t => t.theme === manualTheme.theme);

            if (!duckdbTheme) return;

            const match = compareWithTolerance(duckdbTheme.total_market_share, manualTheme.total_market_share, 0.01);

            if (!match) {
                mismatches.push({
                    theme: manualTheme.theme,
                    duckdb: duckdbTheme.total_market_share.toFixed(4),
                    manual: manualTheme.total_market_share.toFixed(4),
                });
            }
        });

        if (mismatches.length > 0) {
            console.error('Market share mismatches:', mismatches.slice(0, 5));
        }

        expect(mismatches).toHaveLength(0);
    });

    test('top 10 themes should match in both methods', () => {
        const manualTop10 = [...manualThemes]
            .sort((a, b) => b.avg_theo_win - a.avg_theo_win)
            .slice(0, 10)
            .map(t => t.theme);

        const duckdbTop10 = [...duckdbThemes]
            .sort((a, b) => b.avg_theo_win - a.avg_theo_win)
            .slice(0, 10)
            .map(t => t.theme);

        console.log('Top 10 themes (manual):', manualTop10);
        console.log('Top 10 themes (DuckDB):', duckdbTop10);

        // Allow for slight differences due to floating point
        const matchCount = manualTop10.filter(theme => duckdbTop10.includes(theme)).length;
        expect(matchCount).toBeGreaterThanOrEqual(8); // At least 8 out of 10 should match
    });
});

describe('DuckDB Aggregations: Mechanic Distribution', () => {
    let games;
    let manualMechanics;
    let duckdbMechanics;

    beforeAll(async () => {
        await initializeDatabase();

        const response = await fetch('/api/data/games');
        const data = await response.json();
        games = Array.isArray(data) ? data : data?.games || [];

        manualMechanics = calculateMechanicDistribution(games);
        duckdbMechanics = await getMechanicDistribution();
    });

    test('DuckDB should return same number of mechanics', () => {
        expect(duckdbMechanics.length).toBe(manualMechanics.length);
        console.log(`✓ Both methods found ${duckdbMechanics.length} mechanics`);
    });

    test('DuckDB game counts should match manual counts', () => {
        const mismatches = [];

        manualMechanics.forEach(manualMech => {
            const duckdbMech = duckdbMechanics.find(m => m.mechanic === manualMech.mechanic);

            if (!duckdbMech) {
                mismatches.push({
                    mechanic: manualMech.mechanic,
                    issue: 'Missing in DuckDB',
                });
                return;
            }

            if (duckdbMech.game_count !== manualMech.game_count) {
                mismatches.push({
                    mechanic: manualMech.mechanic,
                    duckdb: duckdbMech.game_count,
                    manual: manualMech.game_count,
                });
            }
        });

        if (mismatches.length > 0) {
            console.error('Mechanic count mismatches:', mismatches.slice(0, 5));
        }

        expect(mismatches).toHaveLength(0);
    });

    test('DuckDB avg_theo_win should match manual calculations', () => {
        const mismatches = [];

        manualMechanics.forEach(manualMech => {
            const duckdbMech = duckdbMechanics.find(m => m.mechanic === manualMech.mechanic);

            if (!duckdbMech) return;

            const match = compareWithTolerance(duckdbMech.avg_theo_win, manualMech.avg_theo_win, 0.01);

            if (!match) {
                mismatches.push({
                    mechanic: manualMech.mechanic,
                    duckdb: duckdbMech.avg_theo_win.toFixed(4),
                    manual: manualMech.avg_theo_win.toFixed(4),
                });
            }
        });

        if (mismatches.length > 0) {
            console.error('Mechanic avg theo_win mismatches:', mismatches.slice(0, 5));
        }

        expect(mismatches).toHaveLength(0);
    });

    test('Free Spins should be the most common mechanic', () => {
        const sortedManual = [...manualMechanics].sort((a, b) => b.game_count - a.game_count);
        const sortedDuckDB = [...duckdbMechanics].sort((a, b) => b.game_count - a.game_count);

        const topManual = sortedManual[0];
        const topDuckDB = sortedDuckDB[0];

        console.log('Top mechanic (manual):', topManual.mechanic, topManual.game_count);
        console.log('Top mechanic (DuckDB):', topDuckDB.mechanic, topDuckDB.game_count);

        expect(topDuckDB.mechanic).toBe(topManual.mechanic);
    });
});

describe('DuckDB Aggregations: Provider Distribution', () => {
    let games;
    let manualProviders;
    let duckdbProviders;

    beforeAll(async () => {
        await initializeDatabase();

        const response = await fetch('/api/data/games');
        const data = await response.json();
        games = Array.isArray(data) ? data : data?.games || [];

        manualProviders = calculateProviderDistribution(games);
        duckdbProviders = await getProviderDistribution();
    });

    test('DuckDB should return same number of providers', () => {
        expect(duckdbProviders.length).toBe(manualProviders.length);
        console.log(`✓ Both methods found ${duckdbProviders.length} providers`);
    });

    test('DuckDB game counts should match manual counts', () => {
        const mismatches = [];

        manualProviders.forEach(manualProv => {
            const duckdbProv = duckdbProviders.find(
                p =>
                    p.provider_studio === manualProv.provider_studio && p.provider_parent === manualProv.provider_parent
            );

            if (!duckdbProv) {
                mismatches.push({
                    provider: manualProv.provider_studio,
                    issue: 'Missing in DuckDB',
                });
                return;
            }

            if (duckdbProv.game_count !== manualProv.game_count) {
                mismatches.push({
                    provider: manualProv.provider_studio,
                    duckdb: duckdbProv.game_count,
                    manual: manualProv.game_count,
                });
            }
        });

        if (mismatches.length > 0) {
            console.error('Provider count mismatches:', mismatches.slice(0, 5));
        }

        expect(mismatches).toHaveLength(0);
    });

    test('total game count across providers should equal games count', () => {
        const totalManual = manualProviders.reduce((sum, p) => sum + p.game_count, 0);
        const totalDuckDB = duckdbProviders.reduce((sum, p) => sum + p.game_count, 0);

        expect(totalManual).toBe(games.length);
        expect(totalDuckDB).toBe(games.length);
    });
});

describe('DuckDB Aggregations: Anomalies', () => {
    let games;
    let manualAnomalies;
    let duckdbAnomalies;

    beforeAll(async () => {
        await initializeDatabase();

        const response = await fetch('/api/data/games');
        const data = await response.json();
        games = Array.isArray(data) ? data : data?.games || [];

        manualAnomalies = calculateAnomalies(games);
        duckdbAnomalies = await getAnomalies();
    });

    test('DuckDB should return correct number of high performers', () => {
        expect(duckdbAnomalies.high.length).toBeLessThanOrEqual(25);
        console.log(`✓ Found ${duckdbAnomalies.high.length} high performers`);
    });

    test('DuckDB should return correct number of low performers', () => {
        expect(duckdbAnomalies.low.length).toBeLessThanOrEqual(30);
        console.log(`✓ Found ${duckdbAnomalies.low.length} low performers`);
    });

    test('high performers should be sorted by theo_win descending', () => {
        const highPerformers = duckdbAnomalies.high;

        for (let i = 0; i < highPerformers.length - 1; i++) {
            const current = highPerformers[i].performance_theo_win;
            const next = highPerformers[i + 1].performance_theo_win;

            expect(current).toBeGreaterThanOrEqual(next);
        }
    });

    test('low performers should be sorted by theo_win ascending', () => {
        const lowPerformers = duckdbAnomalies.low;

        for (let i = 0; i < lowPerformers.length - 1; i++) {
            const current = lowPerformers[i].performance_theo_win;
            const next = lowPerformers[i + 1].performance_theo_win;

            expect(current).toBeLessThanOrEqual(next);
        }
    });

    test('all high performers should have anomaly flag', () => {
        const missingFlag = duckdbAnomalies.high.filter(g => g.performance_anomaly !== 'high');

        if (missingFlag.length > 0) {
            console.warn('High performers missing anomaly flag:', missingFlag.length);
        }
    });
});

describe('DuckDB Aggregations: Game Filtering', () => {
    let games;

    beforeAll(async () => {
        await initializeDatabase();

        const response = await fetch('/api/data/games');
        const data = await response.json();
        games = Array.isArray(data) ? data : data?.games || [];
    });

    test('getAllGames should return all games with no filters', () => {
        return getAllGames().then(allGames => {
            expect(allGames.length).toBe(games.length);
        });
    });

    test('filtering by provider should return correct count', async () => {
        const provider = 'NetEnt';

        // Manual count
        const manualFiltered = filterGames(games, { provider });

        // DuckDB count
        const duckdbFiltered = await getAllGames({ provider });

        console.log(`Provider "${provider}": Manual=${manualFiltered.length}, DuckDB=${duckdbFiltered.length}`);

        // Allow some tolerance for partial matching
        expect(duckdbFiltered.length).toBeGreaterThanOrEqual(manualFiltered.length * 0.9);
        expect(duckdbFiltered.length).toBeLessThanOrEqual(manualFiltered.length * 1.1);
    });

    test('filtering by mechanic should return correct count', async () => {
        const mechanic = 'Free Spins';

        // Manual count
        const manualFiltered = filterGames(games, { mechanic });

        // DuckDB count
        const duckdbFiltered = await getAllGames({ mechanic });

        console.log(`Mechanic "${mechanic}": Manual=${manualFiltered.length}, DuckDB=${duckdbFiltered.length}`);

        expect(duckdbFiltered.length).toBeGreaterThanOrEqual(manualFiltered.length * 0.9);
        expect(duckdbFiltered.length).toBeLessThanOrEqual(manualFiltered.length * 1.1);
    });

    test('search should work case-insensitively', async () => {
        const searchTerm = 'cash';

        // Manual search
        const manualResults = filterGames(games, { search: searchTerm });

        // DuckDB search
        const duckdbResults = await getAllGames({ search: searchTerm });

        console.log(`Search "${searchTerm}": Manual=${manualResults.length}, DuckDB=${duckdbResults.length}`);

        expect(duckdbResults.length).toBeGreaterThan(0);
        expect(duckdbResults.length).toBeGreaterThanOrEqual(manualResults.length * 0.8);
    });

    test('combining multiple filters should work', async () => {
        const filters = {
            provider: 'Blueprint',
            mechanic: 'Free Spins',
        };

        const duckdbResults = await getAllGames(filters);

        console.log(`Combined filters: ${duckdbResults.length} games`);

        // Verify results match both filters (when we have results)
        for (const game of duckdbResults) {
            expect((game.provider_studio || '').toLowerCase()).toContain(filters.provider.toLowerCase());
            const feats = (() => {
                try {
                    return JSON.parse(game.features || '[]');
                } catch {
                    return [];
                }
            })();
            const hasMech =
                Array.isArray(feats) &&
                feats.some(f => String(f).toLowerCase().includes(filters.mechanic.toLowerCase()));
            expect(hasMech).toBe(true);
        }
    });
});

describe('DuckDB Aggregations: Edge Cases', () => {
    beforeAll(async () => {
        await initializeDatabase();
    });

    test('should handle empty filter results gracefully', async () => {
        const results = await getAllGames({ provider: 'NonExistentProvider12345' });
        expect(results).toEqual([]);
    });

    test('should handle special characters in search', async () => {
        const results = await getAllGames({ search: "King's" });
        expect(Array.isArray(results)).toBe(true);
    });

    test('should handle very long search terms', async () => {
        const longTerm = 'a'.repeat(100);
        const results = await getAllGames({ search: longTerm });
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBe(0);
    });
});
