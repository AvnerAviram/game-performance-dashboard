import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/data.js', () => ({
    gameData: { allGames: [], themes: [], mechanics: [] },
}));

vi.mock('../../src/lib/env.js', () => ({
    log: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('../../src/ui/renderers/themes-renderer.js', () => ({
    renderThemes: vi.fn(),
}));

vi.mock('../../src/ui/renderers/mechanics-renderer.js', () => ({
    renderMechanics: vi.fn(),
}));

describe('Filter Dropdowns Module', () => {
    it('exports populateThemesFilters and populateMechanicsFilters', async () => {
        const mod = await import('../../src/ui/filter-dropdowns.js');
        expect(typeof mod.populateThemesFilters).toBe('function');
        expect(typeof mod.populateMechanicsFilters).toBe('function');
    });

    it('exports populateProvidersFilters and populateGamesFilters', async () => {
        const mod = await import('../../src/ui/filter-dropdowns.js');
        expect(typeof mod.populateProvidersFilters).toBe('function');
        expect(typeof mod.populateGamesFilters).toBe('function');
    });

    describe('populateThemesFilters with no games', () => {
        it('does not throw when DOM elements are absent', async () => {
            const { gameData } = await import('../../src/lib/data.js');
            gameData.allGames = [];
            const { populateThemesFilters } = await import('../../src/ui/filter-dropdowns.js');
            expect(() => populateThemesFilters()).not.toThrow();
        });
    });

    describe('populateMechanicsFilters with no games', () => {
        it('does not throw when DOM elements are absent', async () => {
            const { gameData } = await import('../../src/lib/data.js');
            gameData.allGames = [];
            const { populateMechanicsFilters } = await import('../../src/ui/filter-dropdowns.js');
            expect(() => populateMechanicsFilters()).not.toThrow();
        });
    });
});
