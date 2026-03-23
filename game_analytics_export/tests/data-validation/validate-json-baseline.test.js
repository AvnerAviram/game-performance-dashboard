import { describe, test, expect, beforeAll } from 'vitest';
import {
    calculateOverviewStats,
    calculateThemeDistribution,
    calculateMechanicDistribution,
    calculateProviderDistribution,
    validateGameStructure,
} from '../utils/json-aggregator.js';

/**
 * Layer 1: JSON Baseline Validation Tests
 *
 * Validates games_dashboard.json contains valid, complete, and accurate data.
 * This establishes the "source of truth" for all subsequent tests.
 */

describe('JSON Baseline: Schema Validation', () => {
    let games;

    beforeAll(async () => {
        const response = await fetch('/data/games_dashboard.json');
        const data = await response.json();
        games = Array.isArray(data) ? data : data.games || [];
    });

    test('games_dashboard.json should load successfully', () => {
        expect(games).toBeDefined();
        expect(Array.isArray(games)).toBe(true);
    });

    test('should have expected number of games', () => {
        expect(games.length).toBeGreaterThanOrEqual(100);
        expect(games.length).toBeLessThanOrEqual(10000);
    });

    test('all games should have required fields', () => {
        const gamesWithMissingFields = [];

        games.forEach((game, index) => {
            const errors = validateGameStructure(game);
            if (errors.length > 0) {
                gamesWithMissingFields.push({
                    index,
                    id: game.id,
                    name: game.name,
                    errors,
                });
            }
        });

        if (gamesWithMissingFields.length > 0) {
            console.error('Games with missing fields:', gamesWithMissingFields.slice(0, 10));
        }

        expect(gamesWithMissingFields).toHaveLength(0);
    });

    test('all game IDs should be unique', () => {
        const ids = games.map(g => g.id);
        const uniqueIds = new Set(ids);

        expect(uniqueIds.size).toBe(games.length);
    });

    test('all game names should be unique', () => {
        const names = games.map(g => g.name);
        const uniqueNames = new Set(names);

        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

        if (uniqueNames.size !== games.length) {
            console.error('Duplicate names found:', [...new Set(duplicates)].slice(0, 10));
        }

        expect(uniqueNames.size).toBe(games.length);
    });
});

describe('JSON Baseline: Data Types', () => {
    let games;

    beforeAll(async () => {
        const response = await fetch('/data/games_dashboard.json');
        const data = await response.json();
        games = Array.isArray(data) ? data : data.games || [];
    });

    test('all IDs should be strings', () => {
        const invalidIds = games.filter(g => typeof g.id !== 'string' || !g.id);
        expect(invalidIds).toHaveLength(0);
    });

    test('all names should be non-empty strings', () => {
        const invalidNames = games.filter(g => typeof g.name !== 'string' || g.name.trim() === '');
        expect(invalidNames).toHaveLength(0);
    });

    test('all themes should be valid strings', () => {
        const invalidThemes = games.filter(g => {
            const theme = g.theme_primary ?? g.theme?.consolidated;
            return !theme || typeof theme !== 'string';
        });

        if (invalidThemes.length > 0) {
            console.error('Games with invalid themes:', invalidThemes.slice(0, 5));
        }

        expect(invalidThemes).toHaveLength(0);
    });

    test('all mechanics should have a primary field', () => {
        const invalidMechanics = games.filter(g => {
            const mech = g.mechanic_primary ?? g.mechanic?.primary;
            return !mech || typeof mech !== 'string';
        });

        if (invalidMechanics.length > 0) {
            console.error('Games with invalid mechanics:', invalidMechanics.slice(0, 5));
        }

        expect(invalidMechanics).toHaveLength(0);
    });

    test('all providers should be valid', () => {
        const invalidProviders = games.filter(g => {
            const prov = g.provider ?? g.studio ?? g.provider?.studio;
            return !prov || typeof prov !== 'string';
        });

        if (invalidProviders.length > 0) {
            console.error('Games with invalid providers:', invalidProviders.slice(0, 5));
        }

        expect(invalidProviders).toHaveLength(0);
    });

    test('all games should have numeric RTP', () => {
        const invalidRtp = games.filter(g => {
            const rtp = g.rtp ?? g.specs?.rtp;
            return typeof rtp !== 'number';
        });

        if (invalidRtp.length > 0) {
            console.error('Games with invalid RTP:', invalidRtp.slice(0, 5));
        }

        expect(invalidRtp).toHaveLength(0);
    });

    test('all games should have numeric theo_win', () => {
        const invalidPerformance = games.filter(g => {
            const tw = g.theo_win ?? g.performance?.theo_win;
            return typeof tw !== 'number';
        });

        if (invalidPerformance.length > 0) {
            console.error('Games with invalid performance:', invalidPerformance.slice(0, 5));
        }

        expect(invalidPerformance).toHaveLength(0);
    });
});

describe('JSON Baseline: Value Ranges', () => {
    let games;

    beforeAll(async () => {
        const response = await fetch('/data/games_dashboard.json');
        const data = await response.json();
        games = Array.isArray(data) ? data : data.games || [];
    });

    test('RTP values should be between 0 and 100', () => {
        const invalidRTP = games.filter(g => {
            const rtp = g.rtp ?? g.specs?.rtp;
            return typeof rtp === 'number' && (rtp < 0 || rtp > 100);
        });

        if (invalidRTP.length > 0) {
            console.error('Games with invalid RTP:', invalidRTP.slice(0, 5));
        }

        expect(invalidRTP).toHaveLength(0);
    });

    test('theo_win values should be between 0 and 200', () => {
        const invalidTheoWin = games.filter(g => {
            const theoWin = g.theo_win ?? g.performance?.theo_win;
            return typeof theoWin === 'number' && (theoWin < 0 || theoWin > 200);
        });

        if (invalidTheoWin.length > 0) {
            console.error('Games with invalid theo_win:', invalidTheoWin.slice(0, 5));
        }

        expect(invalidTheoWin).toHaveLength(0);
    });

    test('market_share should be non-negative', () => {
        const invalidMarketShare = games.filter(g => {
            const ms = g.market_share_pct ?? g.performance?.market_share_percent;
            return typeof ms === 'number' && ms < 0;
        });

        expect(invalidMarketShare).toHaveLength(0);
    });

    test('volatility should be valid value', () => {
        const validVolatilities = [
            'low',
            'medium',
            'high',
            'very high',
            'very low',
            'medium-high',
            'medium-low',
            'low-medium',
        ];
        const invalidVolatility = games.filter(g => {
            const vol = g.volatility ?? g.specs?.volatility;
            return vol && !validVolatilities.includes(vol.toLowerCase());
        });

        if (invalidVolatility.length > 0) {
            console.error(
                'Games with invalid volatility:',
                invalidVolatility.map(g => ({ name: g.name, vol: g.volatility ?? g.specs?.volatility })).slice(0, 5)
            );
        }

        expect(invalidVolatility).toHaveLength(0);
    });

    test('reels should be between 1 and 10', () => {
        const invalidReels = games.filter(g => {
            const reels = g.reels ?? g.specs?.reels;
            return typeof reels === 'number' && (reels < 1 || reels > 10);
        });

        expect(invalidReels).toHaveLength(0);
    });

    test('rows should be between 1 and 10', () => {
        const invalidRows = games.filter(g => {
            const rows = g.rows ?? g.specs?.rows;
            return typeof rows === 'number' && (rows < 1 || rows > 10);
        });

        expect(invalidRows).toHaveLength(0);
    });
});

describe('JSON Baseline: Data Quality', () => {
    let games;

    beforeAll(async () => {
        const response = await fetch('/data/games_dashboard.json');
        const data = await response.json();
        games = Array.isArray(data) ? data : data.games || [];
    });

    test('no NaN values in numeric fields', () => {
        const gamesWithNaN = games.filter(g => {
            const rtp = g.rtp ?? g.specs?.rtp;
            const tw = g.theo_win ?? g.performance?.theo_win;
            return isNaN(rtp) || isNaN(tw);
        });

        expect(gamesWithNaN).toHaveLength(0);
    });

    test('no Infinity values in numeric fields', () => {
        const gamesWithInfinity = games.filter(g => {
            const rtp = g.rtp ?? g.specs?.rtp;
            const tw = g.theo_win ?? g.performance?.theo_win;
            return !isFinite(rtp) || !isFinite(tw);
        });

        expect(gamesWithInfinity).toHaveLength(0);
    });

    test('no "undefined" or "null" string values', () => {
        const gamesWithBadStrings = games.filter(g => {
            const str = JSON.stringify(g).toLowerCase();
            return str.includes('"undefined"') || str.includes('"null"');
        });

        if (gamesWithBadStrings.length > 0) {
            console.error('Games with "undefined" or "null" strings:', gamesWithBadStrings.slice(0, 3));
        }

        expect(gamesWithBadStrings).toHaveLength(0);
    });

    test('theme names should not be empty or "Unknown"', () => {
        const invalidThemes = games.filter(g => {
            const theme = g.theme_primary ?? g.theme?.consolidated;
            return !theme || theme.toLowerCase() === 'unknown' || theme.trim() === '';
        });

        if (invalidThemes.length > 0) {
            console.warn(`Warning: ${invalidThemes.length} games have unknown/empty themes`);
        }

        expect(invalidThemes.length).toBeLessThan(10);
    });

    test('provider names should not be empty', () => {
        const invalidProviders = games.filter(g => {
            const provider = g.provider ?? g.studio ?? g.provider?.studio;
            return !provider || provider.trim() === '';
        });

        expect(invalidProviders).toHaveLength(0);
    });
});

describe('JSON Baseline: Statistics', () => {
    let games;
    let stats;

    beforeAll(async () => {
        const response = await fetch('/data/games_dashboard.json');
        const data = await response.json();
        games = Array.isArray(data) ? data : data.games || [];
        stats = calculateOverviewStats(games);
    });

    test('should calculate correct overview stats', () => {
        expect(stats.total_games).toBeGreaterThanOrEqual(100);
        expect(stats.theme_count).toBeGreaterThan(5);
        expect(stats.theme_count).toBeLessThan(300);
        expect(stats.mechanic_count).toBeGreaterThan(5);
        expect(stats.mechanic_count).toBeLessThan(100);

        console.log('Overview stats:', stats);
    });

    test('unique themes count should match manual count', () => {
        const uniqueThemes = new Set(games.map(g => g.theme_primary ?? g.theme?.consolidated).filter(Boolean));
        expect(stats.theme_count).toBe(uniqueThemes.size);
    });

    test('unique mechanics count should match manual count', () => {
        const uniqueMechanics = new Set(games.map(g => g.mechanic_primary ?? g.mechanic?.primary).filter(Boolean));
        expect(stats.mechanic_count).toBe(uniqueMechanics.size);
    });

    test('average theo_win should be reasonable', () => {
        expect(stats.avg_theo_win).toBeGreaterThan(0);
        expect(stats.avg_theo_win).toBeLessThan(50);

        console.log('Average theo_win:', stats.avg_theo_win.toFixed(2));
    });

    test('total market share should be reasonable', () => {
        expect(stats.total_market_share).toBeGreaterThan(50);
        expect(stats.total_market_share).toBeLessThan(300);

        console.log('Total market share:', stats.total_market_share.toFixed(2), '%');
    });
});

describe('JSON Baseline: Distributions', () => {
    let games;
    let themes;
    let mechanics;
    let providers;

    beforeAll(async () => {
        const response = await fetch('/data/games_dashboard.json');
        const data = await response.json();
        games = Array.isArray(data) ? data : data.games || [];
        themes = calculateThemeDistribution(games);
        mechanics = calculateMechanicDistribution(games);
        providers = calculateProviderDistribution(games);
    });

    test('theme distribution should be calculated correctly', () => {
        expect(themes.length).toBeGreaterThan(5);

        const totalGames = themes.reduce((sum, t) => sum + t.game_count, 0);
        expect(totalGames).toBeGreaterThanOrEqual(games.length);

        console.log(`Calculated ${themes.length} themes from ${games.length} games`);
    });

    test('mechanic distribution should be calculated correctly', () => {
        expect(mechanics.length).toBeGreaterThan(5);

        const totalGames = mechanics.reduce((sum, m) => sum + m.game_count, 0);
        expect(totalGames).toBeGreaterThanOrEqual(games.length);

        console.log(`Calculated ${mechanics.length} mechanics`);
    });

    test('provider distribution should be calculated correctly', () => {
        expect(providers.length).toBeGreaterThan(5);

        const totalGames = providers.reduce((sum, p) => sum + p.game_count, 0);
        expect(totalGames).toBe(games.length);

        console.log(`Calculated ${providers.length} providers`);
    });

    test('top themes should have reasonable game counts', () => {
        const sortedByCount = [...themes].sort((a, b) => b.game_count - a.game_count);
        const topTheme = sortedByCount[0];

        expect(topTheme.game_count).toBeGreaterThan(5);
        expect(topTheme.game_count).toBeLessThan(500);

        console.log(`Top theme: ${topTheme.theme} with ${topTheme.game_count} games`);
    });

    test('all themes should have valid averages', () => {
        const invalidAvgs = themes.filter(t => isNaN(t.avg_theo_win) || t.avg_theo_win < 0 || t.avg_theo_win > 100);

        expect(invalidAvgs).toHaveLength(0);
    });

    test('all mechanics should have valid averages', () => {
        const invalidAvgs = mechanics.filter(m => isNaN(m.avg_theo_win) || m.avg_theo_win < 0 || m.avg_theo_win > 100);

        expect(invalidAvgs).toHaveLength(0);
    });
});
