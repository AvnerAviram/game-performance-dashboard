/**
 * Tests for the overview page renderer.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { updateHeaderStats } from '../../src/ui/renderers/overview-renderer.js';
import { gameData } from '../utils/load-test-data.js';

describe('Overview Renderer', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="stat-total-games"></div>
            <div id="stat-total-themes"></div>
            <div id="stat-total-mechanics"></div>
            <div id="stat-classified"></div>
            <div id="header-summary"></div>
        `;
    });

    describe('updateHeaderStats()', () => {
        it('updates DOM with correct counts from gameData', async () => {
            const { loadTestData } = await import('../utils/load-test-data.js');
            await loadTestData();

            updateHeaderStats();

            const statTotalGames = document.getElementById('stat-total-games');
            const statTotalThemes = document.getElementById('stat-total-themes');
            const statTotalMechanics = document.getElementById('stat-total-mechanics');
            const headerSummary = document.getElementById('header-summary');

            const gCount = (gameData.allGames || []).length;
            const tCount = (gameData.themes || []).length;
            const mCount = (gameData.mechanics || []).length;
            expect(statTotalGames.textContent).toBe(gCount.toLocaleString());
            expect(statTotalThemes.textContent).toBe(tCount.toLocaleString());
            expect(statTotalMechanics.textContent).toBe(String(mCount));
            expect(headerSummary.textContent).toContain(gCount.toLocaleString());
            expect(headerSummary.textContent).toContain(tCount.toLocaleString());
            expect(headerSummary.textContent).toContain(String(mCount));
        });

        it('handles zero values gracefully', () => {
            const origGames = gameData.allGames;
            const origThemes = gameData.themes;
            const origMechanics = gameData.mechanics;
            gameData.allGames = [];
            gameData.themes = [];
            gameData.mechanics = [];

            updateHeaderStats();

            expect(document.getElementById('stat-total-games').textContent).toBe('0');
            expect(document.getElementById('stat-total-themes').textContent).toBe('0');
            expect(document.getElementById('stat-total-mechanics').textContent).toBe('0');

            gameData.allGames = origGames;
            gameData.themes = origThemes;
            gameData.mechanics = origMechanics;
        });

        it('formats large numbers with locale string', () => {
            const origGames = gameData.allGames;
            const origThemes = gameData.themes;
            const origMechanics = gameData.mechanics;
            gameData.allGames = new Array(12345);
            gameData.themes = new Array(67);
            gameData.mechanics = new Array(12);

            updateHeaderStats();

            expect(document.getElementById('stat-total-games').textContent).toBe('12,345');
            expect(document.getElementById('stat-total-themes').textContent).toBe('67');
            expect(document.getElementById('stat-total-mechanics').textContent).toBe('12');

            gameData.allGames = origGames;
            gameData.themes = origThemes;
            gameData.mechanics = origMechanics;
        });
    });
});
