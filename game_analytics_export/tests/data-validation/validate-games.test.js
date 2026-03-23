import { describe, test, expect, beforeAll } from 'vitest';

/**
 * DATA VALIDATION TESTS: Game Data Integrity
 * Validates the games_dashboard.json data file (flat schema)
 */

describe('Game Data Validation', () => {
    let games;

    beforeAll(async () => {
        const module = await import('../../data/games_dashboard.json', {
            assert: { type: 'json' },
        });
        const data = module.default;
        games = Array.isArray(data) ? data : data.games || [];
    });

    test('games_dashboard.json should load successfully', () => {
        expect(games).toBeDefined();
        expect(Array.isArray(games)).toBe(true);
    });

    test('should have expected number of games', () => {
        expect(games.length).toBeGreaterThanOrEqual(100);
        expect(games.length).toBeLessThanOrEqual(10000);
        console.log(`✓ Loaded ${games.length} games`);
    });

    test('all games should have required fields', () => {
        const missingFields = [];

        games.forEach((game, index) => {
            if (!game.name) missingFields.push({ index, game: game.name, field: 'name' });
            if (!game.theme_primary) missingFields.push({ index, game: game.name, field: 'theme_primary' });
            if (!game.provider && !game.studio)
                missingFields.push({ index, game: game.name, field: 'provider/studio' });
        });

        if (missingFields.length > 0) {
            console.warn(`⚠ ${missingFields.length} games with missing fields:`, missingFields.slice(0, 5));
        }

        expect(missingFields.length).toBeLessThan(Math.ceil(games.length * 0.25));
    });

    test('theo_win should be valid numbers', () => {
        const invalidGames = [];

        games.forEach((game, index) => {
            const tw = game.theo_win;

            if (typeof tw !== 'number' || isNaN(tw) || tw < 0 || tw > 200) {
                invalidGames.push({ index, name: game.name, theo_win: tw });
            }
        });

        if (invalidGames.length > 0) {
            console.error('Games with invalid theo_win:', invalidGames.slice(0, 10));
        }

        expect(invalidGames.length).toBeLessThan(Math.ceil(games.length * 0.25));
    });

    test('game names should be non-empty strings', () => {
        const invalidNames = [];

        games.forEach((game, index) => {
            if (!game.name || typeof game.name !== 'string' || game.name.trim() === '') {
                invalidNames.push({ index, name: game.name });
            }
        });

        expect(invalidNames).toHaveLength(0);
    });

    test('no duplicate game names', () => {
        const gameNames = games.map(g => g.name);
        const uniqueNames = new Set(gameNames);

        const duplicateCount = gameNames.length - uniqueNames.size;

        if (duplicateCount > 0) {
            const duplicates = gameNames.filter((name, index) => gameNames.indexOf(name) !== index);
            console.error('Duplicate games found:', [...new Set(duplicates)].slice(0, 10));
        }

        expect(uniqueNames.size).toBe(gameNames.length);
    });

    test('themes should be valid strings', () => {
        const invalidThemes = [];
        const themeSet = new Set();

        games.forEach((game, index) => {
            const theme = game.theme_primary;

            if (!theme || typeof theme !== 'string') {
                invalidThemes.push({ index, game: game.name, theme, issue: 'missing or not a string' });
            } else {
                themeSet.add(theme);
            }
        });

        if (invalidThemes.length > 0) {
            console.warn(`⚠ ${invalidThemes.length} games have invalid themes:`, invalidThemes.slice(0, 5));
        }

        expect(invalidThemes.length).toBeLessThan(Math.ceil(games.length * 0.1));
        expect(themeSet.size).toBeGreaterThan(5);
        expect(themeSet.size).toBeLessThan(300);

        console.log(`✓ Found ${themeSet.size} unique themes`);
    });

    test('providers should be present', () => {
        const invalidProviders = [];
        const providerSet = new Set();

        games.forEach((game, index) => {
            const providerName =
                typeof game.provider === 'string' ? game.provider : game.provider?.studio || game.studio;

            if (!providerName) {
                invalidProviders.push({ index, game: game.name, provider: game.provider });
            } else {
                providerSet.add(providerName);
            }
        });

        expect(invalidProviders).toHaveLength(0);
        console.log(`✓ Found ${providerSet.size} unique providers`);
    });

    test('theo_win distribution should be reasonable', () => {
        const theoWinValues = games.map(g => g.theo_win).filter(v => typeof v === 'number');

        const sum = theoWinValues.reduce((acc, v) => acc + v, 0);
        const mean = sum / theoWinValues.length;
        const min = Math.min(...theoWinValues);
        const max = Math.max(...theoWinValues);

        expect(mean).toBeGreaterThan(0.5);
        expect(mean).toBeLessThan(100);
        expect(min).toBeGreaterThan(0);
        expect(max).toBeLessThan(200);

        console.log(`✓ TheoWin stats: mean=${mean.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}`);
    });

    test('data structure should match flat schema', () => {
        const sampleGame = games[0];

        expect(typeof sampleGame.name).toBe('string');
        expect(typeof sampleGame.theme_primary).toBe('string');
        expect(typeof sampleGame.theo_win).toBe('number');
        expect(sampleGame.provider || sampleGame.studio).toBeDefined();
    });
});

describe('Game Data Statistics', () => {
    let games;

    beforeAll(async () => {
        const module = await import('../../data/games_dashboard.json', {
            assert: { type: 'json' },
        });
        const data = module.default;
        games = Array.isArray(data) ? data : data.games || [];
    });

    test('show theme distribution', () => {
        const themeCounts = games.reduce((acc, game) => {
            const theme = game.theme_primary || 'Unknown';
            acc[theme] = (acc[theme] || 0) + 1;
            return acc;
        }, {});

        const sortedThemes = Object.entries(themeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        console.log('Top 5 themes by game count:', sortedThemes);
        expect(sortedThemes.length).toBeGreaterThan(0);
    });

    test('show provider distribution', () => {
        const providerCounts = games.reduce((acc, game) => {
            const provider = game.provider || game.studio || 'Unknown';
            acc[provider] = (acc[provider] || 0) + 1;
            return acc;
        }, {});

        const sortedProviders = Object.entries(providerCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        console.log('Top 5 providers by game count:', sortedProviders);
        expect(sortedProviders.length).toBeGreaterThan(0);
    });
});
