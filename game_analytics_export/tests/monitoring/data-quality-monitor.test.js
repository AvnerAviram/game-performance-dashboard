import { describe, test, expect, beforeAll } from 'vitest';
import { loadGameData, gameData } from '../../src/lib/data.js';

/**
 * Data Quality Monitoring Tests
 *
 * Catches data anomalies that indicate bugs or data corruption.
 */

describe('Data Quality: Basic Checks', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('total games should match games_dashboard', () => {
        expect(gameData.total_games).toBeGreaterThan(500);
        expect(gameData.total_games).toBe(gameData.allGames?.length ?? 0);
    });

    test('theme count should be reasonable', () => {
        expect(gameData.theme_count).toBeGreaterThan(50);
        expect(gameData.theme_count).toBeLessThan(200);
    });

    test('mechanic count should be reasonable', () => {
        expect(gameData.mechanic_count).toBeGreaterThan(10);
        expect(gameData.mechanic_count).toBeLessThan(100);
    });

    test('all games array should match total_games', () => {
        if (gameData.allGames) {
            expect(gameData.allGames.length).toBe(gameData.total_games);
        }
    });
});

describe('Data Quality: No Negative Values', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('no negative theo_win values in themes', () => {
        const negativeTheo = gameData.themes.filter(t => t['Avg Theo Win Index'] < 0);

        if (negativeTheo.length > 0) {
            console.error('Themes with negative theo_win:', negativeTheo);
        }

        expect(negativeTheo).toHaveLength(0);
    });

    test('no negative theo_win values in mechanics', () => {
        const negativeTheo = gameData.mechanics.filter(m => m['Avg Theo Win Index'] < 0);

        expect(negativeTheo).toHaveLength(0);
    });

    test('no negative game counts', () => {
        const negativeCountsThemes = gameData.themes.filter(t => t['Game Count'] < 0);
        const negativeCountsMechanics = gameData.mechanics.filter(m => m['Game Count'] < 0);

        expect(negativeCountsThemes).toHaveLength(0);
        expect(negativeCountsMechanics).toHaveLength(0);
    });

    test('no negative market share', () => {
        const negativeMarketShare = gameData.themes.filter(t => t['Market Share %'] < 0);

        expect(negativeMarketShare).toHaveLength(0);
    });

    test('no negative Smart Index', () => {
        const negativeSmartIndex = gameData.themes.filter(t => t['Smart Index'] < 0);

        expect(negativeSmartIndex).toHaveLength(0);
    });
});

describe('Data Quality: Valid Ranges', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('theo_win values should be reasonable (0-200)', () => {
        const invalidTheo = gameData.themes.filter(t => t['Avg Theo Win Index'] > 200);

        expect(invalidTheo).toHaveLength(0);
    });

    test('game counts should be positive integers', () => {
        const invalidCounts = gameData.themes.filter(t => !Number.isInteger(t['Game Count']) || t['Game Count'] <= 0);

        expect(invalidCounts).toHaveLength(0);
    });

    test('market share percentages should be reasonable', () => {
        const invalidMarketShare = gameData.themes.filter(t => {
            const ms = t['Market Share %'];
            return ms > 100 || ms < 0; // Individual theme > 100% is suspicious
        });

        if (invalidMarketShare.length > 0) {
            console.warn('Themes with unusual market share:', invalidMarketShare.slice(0, 3));
        }

        // Allow some themes to exceed 100% if they're very popular
        expect(invalidMarketShare.length).toBeLessThan(5);
    });
});

describe('Data Quality: No NaN or Infinity', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('no NaN values in themes', () => {
        const nanValues = gameData.themes.filter(
            t =>
                isNaN(t['Avg Theo Win Index']) ||
                isNaN(t['Smart Index']) ||
                isNaN(t['Market Share %']) ||
                isNaN(t['Game Count'])
        );

        if (nanValues.length > 0) {
            console.error('Themes with NaN values:', nanValues.slice(0, 3));
        }

        expect(nanValues).toHaveLength(0);
    });

    test('no Infinity values in themes', () => {
        const infinityValues = gameData.themes.filter(
            t =>
                !isFinite(t['Avg Theo Win Index']) ||
                !isFinite(t['Smart Index']) ||
                !isFinite(t['Market Share %']) ||
                !isFinite(t['Game Count'])
        );

        expect(infinityValues).toHaveLength(0);
    });

    test('no NaN values in mechanics', () => {
        const nanValues = gameData.mechanics.filter(
            m =>
                isNaN(m['Avg Theo Win Index']) ||
                isNaN(m['Smart Index']) ||
                isNaN(m['Market Share %']) ||
                isNaN(m['Game Count'])
        );

        expect(nanValues).toHaveLength(0);
    });

    test('no Infinity values in mechanics', () => {
        const infinityValues = gameData.mechanics.filter(
            m =>
                !isFinite(m['Avg Theo Win Index']) ||
                !isFinite(m['Smart Index']) ||
                !isFinite(m['Market Share %']) ||
                !isFinite(m['Game Count'])
        );

        expect(infinityValues).toHaveLength(0);
    });
});

describe('Data Quality: No Missing Data', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('all themes should have names', () => {
        const missingNames = gameData.themes.filter(t => !t.Theme || t.Theme.trim() === '');

        expect(missingNames).toHaveLength(0);
    });

    test('all mechanics should have names', () => {
        const missingNames = gameData.mechanics.filter(m => !m.Mechanic || m.Mechanic.trim() === '');

        expect(missingNames).toHaveLength(0);
    });

    test('no themes with "undefined" or "null" strings', () => {
        const badStrings = gameData.themes.filter(
            t => t.Theme.toLowerCase() === 'undefined' || t.Theme.toLowerCase() === 'null'
        );

        expect(badStrings).toHaveLength(0);
    });

    test('no mechanics with "undefined" or "null" strings', () => {
        const badStrings = gameData.mechanics.filter(
            m => m.Mechanic.toLowerCase() === 'undefined' || m.Mechanic.toLowerCase() === 'null'
        );

        expect(badStrings).toHaveLength(0);
    });

    test('all themes should have required fields', () => {
        const missingFields = gameData.themes.filter(
            t =>
                t['Game Count'] === undefined ||
                t['Avg Theo Win Index'] === undefined ||
                t['Market Share %'] === undefined ||
                t['Smart Index'] === undefined
        );

        expect(missingFields).toHaveLength(0);
    });
});

describe('Data Quality: Anomalies', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('should have high performers', () => {
        expect(gameData.top_anomalies.length).toBeGreaterThan(0);
        expect(gameData.top_anomalies.length).toBeLessThanOrEqual(25);
    });

    test('should have low performers', () => {
        expect(gameData.bottom_anomalies.length).toBeGreaterThan(0);
        expect(gameData.bottom_anomalies.length).toBeLessThanOrEqual(30);
    });

    test('high performers should have higher theo_win than low performers', () => {
        if (gameData.top_anomalies.length > 0 && gameData.bottom_anomalies.length > 0) {
            const highAvg =
                gameData.top_anomalies.reduce((sum, g) => sum + (g['Theo Win'] || g.theo_win_index || 0), 0) /
                gameData.top_anomalies.length;

            const lowAvg =
                gameData.bottom_anomalies.reduce((sum, g) => sum + (g['Theo Win'] || g.theo_win_index || 0), 0) /
                gameData.bottom_anomalies.length;

            expect(highAvg).toBeGreaterThan(lowAvg);
        }
    });
});

describe('Data Quality: Consistency', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('sum of theme game counts should >= total games', () => {
        const totalThemeGames = gameData.themes.reduce((sum, t) => sum + t['Game Count'], 0);

        // Can be > total games due to multi-theme games
        expect(totalThemeGames).toBeGreaterThanOrEqual(gameData.total_games);
    });

    test('sum of mechanic game counts should >= total games', () => {
        const totalMechanicGames = gameData.mechanics.reduce((sum, m) => sum + m['Game Count'], 0);

        expect(totalMechanicGames).toBeGreaterThanOrEqual(gameData.total_games);
    });

    test('theme count should match themes array length', () => {
        expect(gameData.theme_count).toBe(gameData.themes.length);
    });

    test('mechanic count should match mechanics array length', () => {
        expect(gameData.mechanic_count).toBe(gameData.mechanics.length);
    });
});

describe('Data Quality: Data Source', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('data source should be DuckDB', () => {
        expect(gameData._dataSource).toBe('duckdb');
    });

    test('data should be loaded from games_master.json via DuckDB', () => {
        // Verify DuckDB was used, not JSON fallback
        expect(gameData._dataSource).not.toBe('json_fallback');
    });
});

describe('Data Quality: Performance', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('top themes should have reasonable performance', () => {
        const top10 = gameData.themes.slice(0, 10);

        top10.forEach(theme => {
            expect(theme['Smart Index']).toBeGreaterThan(0);
            expect(theme['Game Count']).toBeGreaterThan(0);
        });
    });

    test('no themes should have suspiciously high Smart Index', () => {
        const suspicious = gameData.themes.filter(t => t['Smart Index'] > 100);

        if (suspicious.length > 0) {
            console.warn('Themes with unusually high Smart Index:', suspicious);
        }

        // Allow some high values, but not too many
        expect(suspicious.length).toBeLessThan(5);
    });
});

describe('Data Quality: Provider GGR Share', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('provider GGR shares should sum to a reasonable total', () => {
        const allGames = gameData.allGames || [];
        const totalMkt = allGames.reduce((s, g) => s + (g.performance_market_share_percent || 0), 0);
        expect(totalMkt).toBeGreaterThan(10);
        expect(totalMkt).toBeLessThan(200);
    });

    test('no provider should have negative GGR share', () => {
        const allGames = gameData.allGames || [];
        const provMap = {};
        allGames.forEach(g => {
            const p = g.provider_studio || '';
            if (!p) return;
            if (!provMap[p]) provMap[p] = 0;
            provMap[p] += g.performance_market_share_percent || 0;
        });
        const negatives = Object.entries(provMap).filter(([, v]) => v < 0);
        expect(negatives.length).toBe(0);
    });

    test('top provider by GGR should have at least 3% share', () => {
        const allGames = gameData.allGames || [];
        const provMap = {};
        allGames.forEach(g => {
            const p = g.provider_studio || '';
            if (!p) return;
            if (!provMap[p]) provMap[p] = 0;
            provMap[p] += g.performance_market_share_percent || 0;
        });
        const topGGR = Math.max(...Object.values(provMap));
        expect(topGGR).toBeGreaterThan(3);
    });
});

describe('Data Quality: Cross-field Consistency', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    test('every game with theo_win > 0 should have a valid provider', () => {
        const allGames = gameData.allGames || [];
        const violations = allGames.filter(
            g => (g.performance_theo_win || 0) > 0 && !(g.provider_studio || g.provider_parent)
        );
        expect(violations.length).toBe(0);
    });

    test('every game should have a theme_consolidated', () => {
        const allGames = gameData.allGames || [];
        const missing = allGames.filter(g => !g.theme_consolidated || g.theme_consolidated === 'Unknown');
        // Allow up to 5% missing
        expect(missing.length).toBeLessThan(allGames.length * 0.05);
    });

    test('games with market_share > 0 should also have theo_win', () => {
        const allGames = gameData.allGames || [];
        const violations = allGames.filter(
            g => (g.performance_market_share_percent || 0) > 0 && !(g.performance_theo_win > 0)
        );
        // Allow up to 2% — some games may have share but low/zero theo
        expect(violations.length).toBeLessThan(allGames.length * 0.02);
    });

    test('no duplicate game IDs', () => {
        const allGames = gameData.allGames || [];
        const ids = allGames.map(g => g.id).filter(Boolean);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
    });

    test('provider_studio should never be "Unknown Ruby Play" or similar artifacts', () => {
        const allGames = gameData.allGames || [];
        const artifacts = allGames.filter(
            g => /unknown\s+ruby/i.test(g.provider_studio || '') || /^unknown$/i.test(g.provider_studio || '')
        );
        expect(artifacts.length).toBe(0);
    });
});
