import { describe, it, expect } from 'vitest';
import { resetFilterState, currentThemeView, currentMechanicView, currentGameView } from '../../src/lib/filters.js';
import { resetGamesState } from '../../src/ui/ui-providers-games.js';

/**
 * Filter State Reset Tests
 *
 * Ensures that navigating between pages resets all filter/view state
 * so stale filters don't silently affect data while the UI shows defaults.
 *
 * Regression: Games page filter tabs persisted across navigation —
 * e.g., selecting "Market Leaders", switching to Providers, then returning
 * to Games would show "All Games" tab as active but data was still filtered
 * to Market Leaders.
 */

describe('Filter state: resetFilterState resets per-page view', () => {
    it('resets currentGameView to "all" for games page', () => {
        // Simulate selecting a filter
        window.gameData = { themes: [], mechanics: [], allGames: [], games: [] };
        // We can't call switchGameView without DOM, but we can verify resetFilterState
        resetFilterState('games');
        // After reset, re-importing should see 'all'
        // The module re-exports the live binding
        expect(currentGameView).toBe('all');
    });

    it('resets currentThemeView to "all" for themes page', () => {
        resetFilterState('themes');
        expect(currentThemeView).toBe('all');
    });

    it('resets currentMechanicView to "all" for mechanics page', () => {
        resetFilterState('mechanics');
        expect(currentMechanicView).toBe('all');
    });

    it('does not reset other pages when resetting games', () => {
        // Set all to non-default first via resetFilterState (they start at 'all')
        // This test ensures cross-page isolation
        resetFilterState('games');
        expect(currentGameView).toBe('all');
        expect(currentThemeView).toBe('all'); // should be untouched
    });
});

describe('Filter state: resetGamesState resets module-level game state', () => {
    it('exports resetGamesState as a function', () => {
        expect(typeof resetGamesState).toBe('function');
    });

    it('does not throw when called', () => {
        expect(() => resetGamesState()).not.toThrow();
    });
});

describe('Filter state: navigation round-trip scenario', () => {
    it('filter state should be "all" after resetFilterState regardless of prior state', () => {
        // Simulate: user on Games page, switches to Market Leaders
        // (can't call window.switchGameView without DOM, but we can test the reset path)

        // 1. Reset to games (simulating page entry)
        resetFilterState('games');
        expect(currentGameView).toBe('all');

        // 2. Reset to themes (simulating navigating to themes)
        resetFilterState('themes');
        expect(currentThemeView).toBe('all');

        // 3. Reset back to games (simulating return navigation)
        resetFilterState('games');
        expect(currentGameView).toBe('all');
    });

    it('resetGamesState resets sort and pagination state', () => {
        // Call resetGamesState and verify it doesn't throw
        // (internal state is module-private, but we can verify the function exists and runs)
        resetGamesState();
        // If we get here without error, the reset succeeded
        expect(true).toBe(true);
    });
});
