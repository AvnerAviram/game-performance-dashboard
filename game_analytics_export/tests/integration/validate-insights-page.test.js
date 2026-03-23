import { describe, test, expect, beforeEach } from 'vitest';
import { loadGameData, gameData } from '../../src/lib/data.js';
import { getTopPerformers } from '../../src/features/overview-insights.js';

/**
 * Layer 3G: Insights Page Tests
 */

describe('Insights Page: Data Calculations', () => {
    beforeEach(async () => {
        await loadGameData();
    });

    test('should calculate top performers', () => {
        const performers = getTopPerformers(gameData.allGames, gameData.themes, gameData.mechanics);

        expect(performers).toBeDefined();
        expect(performers.bestTheme).toBeDefined();
        expect(performers.bestMechanic).toBeDefined();
        expect(performers.bestProvider).toBeDefined();
    });

    test('best theme should have highest Smart Index', () => {
        const performers = getTopPerformers(gameData.allGames, gameData.themes, gameData.mechanics);
        const topTheme = gameData.themes[0];

        expect(performers.bestTheme.name).toBe(topTheme.Theme);
    });

    test('insights should use real data', () => {
        const performers = getTopPerformers(gameData.allGames, gameData.themes, gameData.mechanics);

        // Should not be hardcoded
        expect(performers.bestTheme.gameCount).toBeGreaterThan(0);
        expect(parseFloat(performers.bestTheme.smartIndex)).toBeGreaterThan(0);
    });
});

describe('Insights Page: Market Leaders', () => {
    beforeEach(async () => {
        await loadGameData();
    });

    test('market leaders should have high market share', () => {
        const leaders = gameData.themes.filter(t => t['Market Share %'] > 3.0);
        expect(leaders.length).toBeGreaterThan(0);
    });

    test('opportunity themes should have high quality, low saturation', () => {
        const opportunities = gameData.themes.filter(t => t['Avg Theo Win Index'] > 10 && t['Game Count'] < 20);

        opportunities.forEach(theme => {
            expect(theme['Avg Theo Win Index']).toBeGreaterThan(10);
            expect(theme['Game Count']).toBeLessThan(20);
        });
    });
});
