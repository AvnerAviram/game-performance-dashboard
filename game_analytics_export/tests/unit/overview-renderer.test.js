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

            expect(statTotalGames.textContent).toBe(gameData.total_games.toLocaleString());
            expect(statTotalThemes.textContent).toBe(gameData.theme_count.toLocaleString());
            expect(statTotalMechanics.textContent).toBe(String(gameData.mechanic_count));
            expect(headerSummary.textContent).toContain(gameData.total_games.toLocaleString());
            expect(headerSummary.textContent).toContain(gameData.theme_count.toLocaleString());
            expect(headerSummary.textContent).toContain(String(gameData.mechanic_count));
        });

        it('handles zero values gracefully', () => {
            const orig = {
                total_games: gameData.total_games,
                theme_count: gameData.theme_count,
                mechanic_count: gameData.mechanic_count,
            };
            gameData.total_games = 0;
            gameData.theme_count = 0;
            gameData.mechanic_count = 0;

            updateHeaderStats();

            expect(document.getElementById('stat-total-games').textContent).toBe('0');
            expect(document.getElementById('stat-total-themes').textContent).toBe('0');
            expect(document.getElementById('stat-total-mechanics').textContent).toBe('0');

            gameData.total_games = orig.total_games;
            gameData.theme_count = orig.theme_count;
            gameData.mechanic_count = orig.mechanic_count;
        });

        it('formats large numbers with locale string', () => {
            const orig = {
                total_games: gameData.total_games,
                theme_count: gameData.theme_count,
                mechanic_count: gameData.mechanic_count,
            };
            gameData.total_games = 12345;
            gameData.theme_count = 67;
            gameData.mechanic_count = 12;

            updateHeaderStats();

            expect(document.getElementById('stat-total-games').textContent).toBe('12,345');
            expect(document.getElementById('stat-total-themes').textContent).toBe('67');
            expect(document.getElementById('stat-total-mechanics').textContent).toBe('12');

            Object.assign(gameData, orig);
        });
    });
});
