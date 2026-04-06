import { describe, test, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';

describe('Count consistency across views', () => {
    beforeAll(async () => {
        await loadTestData();
    });

    test('allGames.length equals total_games', () => {
        expect(gameData.allGames.length).toBe(gameData.total_games);
    });

    test('theme_count matches themes array length', () => {
        expect(gameData.theme_count).toBe(gameData.themes.length);
    });

    test('mechanic_count matches mechanics array length', () => {
        expect(gameData.mechanic_count).toBe(gameData.mechanics.length);
    });

    test('sum of per-provider game counts covers all games with providers', () => {
        const providerCounts = {};
        for (const g of gameData.allGames) {
            const p = g.provider || g.studio || 'Unknown';
            providerCounts[p] = (providerCounts[p] || 0) + 1;
        }
        const sumProviders = Object.values(providerCounts).reduce((a, b) => a + b, 0);
        expect(sumProviders).toBe(gameData.allGames.length);
    });

    test('sum of per-category counts equals total valid games', () => {
        const catCounts = {};
        for (const g of gameData.allGames) {
            const cat = g.game_category || 'Unknown';
            catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
        const total = Object.values(catCounts).reduce((a, b) => a + b, 0);
        expect(total).toBe(gameData.allGames.length);
    });

    test('no theme has more games than total games', () => {
        for (const t of gameData.themes) {
            const count = t.game_count || t['Game Count'];
            expect(count).toBeLessThanOrEqual(gameData.allGames.length);
        }
    });

    test('no mechanic has more games than total games', () => {
        for (const m of gameData.mechanics) {
            const count = m.game_count || m['Game Count'];
            expect(count).toBeLessThanOrEqual(gameData.allGames.length);
        }
    });

    test('every theme has at least 1 game', () => {
        for (const t of gameData.themes) {
            const count = t.game_count || t['Game Count'];
            expect(count).toBeGreaterThanOrEqual(1);
        }
    });

    test('every mechanic has at least 1 game', () => {
        for (const m of gameData.mechanics) {
            const count = m.game_count || m['Game Count'];
            expect(count).toBeGreaterThanOrEqual(1);
        }
    });

    test('anomaly counts do not exceed total games', () => {
        expect(gameData.top_anomalies.length).toBeLessThanOrEqual(gameData.allGames.length);
        expect(gameData.bottom_anomalies.length).toBeLessThanOrEqual(gameData.allGames.length);
    });
});
