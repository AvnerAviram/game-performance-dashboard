// Test setup file
import { beforeAll, afterEach, vi } from 'vitest';

// Mock data.js (loadGameData) to use test loader - DuckDB is browser-only
vi.mock('../src/lib/data.js', async () => {
    const { loadTestData, gameData } = await import('./utils/load-test-data.js');
    return {
        loadGameData: loadTestData,
        gameData,
        getActiveGames: () => gameData.viewGames ?? gameData.allGames ?? [],
        getActiveThemes: () => gameData.viewThemes ?? gameData.themes ?? [],
        getActiveMechanics: () => gameData.viewMechanics ?? gameData.mechanics ?? [],
    };
});

// Mock fetch globally
beforeAll(() => {
    global.fetch = async url => {
        const urlStr = typeof url === 'string' ? url : url?.url || '';

        if (
            urlStr.includes('/api/data/games') ||
            urlStr.includes('game_data_master.json') ||
            urlStr.includes('/data/game_data_master.json')
        ) {
            const data = await import('../data/game_data_master.json', { assert: { type: 'json' } });
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => data.default,
            };
        }
        if (urlStr.includes('games_master.json') || urlStr.includes('games_complete.json')) {
            const data = await import('../data/game_data_master.json', { assert: { type: 'json' } });
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => data.default,
            };
        }
        return { ok: false, status: 404, statusText: 'Not Found' };
    };
});

// Clean up DOM after each test (skip in node environment)
afterEach(() => {
    if (typeof document !== 'undefined') {
        document.body.innerHTML = '';
    }
});
