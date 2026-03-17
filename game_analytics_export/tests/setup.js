// Test setup file
import { beforeAll, afterEach, vi } from 'vitest';

// Mock data.js (loadGameData) to use test loader - DuckDB is browser-only
vi.mock('../src/lib/data.js', async () => {
  const { loadTestData, gameData } = await import('./utils/load-test-data.js');
  return {
    loadGameData: loadTestData,
    gameData
  };
});

// Mock fetch globally
beforeAll(() => {
  global.fetch = async (url) => {
    if (url.includes('games_master.json') || url.includes('/data/games_master.json')) {
      const data = await import('../data/games_master.json', { assert: { type: 'json' } });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => data.default
      };
    }
    if (url.includes('games_complete.json')) {
      const data = await import('../data/games_master.json', { assert: { type: 'json' } });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => data.default
      };
    }
    return { ok: false, status: 404, statusText: 'Not Found' };
  };
});

// Clean up DOM after each test
afterEach(() => {
  document.body.innerHTML = '';
});
