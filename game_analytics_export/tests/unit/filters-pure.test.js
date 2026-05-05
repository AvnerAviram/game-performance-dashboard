import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/ui/renderers/themes-renderer.js', () => ({
    renderThemes: vi.fn(),
}));

import { renderThemes } from '../../src/ui/renderers/themes-renderer.js';
import { getFilteredThemes, getFilteredMechanics, resetFilterState } from '../../src/lib/filters.js';
import { gameData } from '../../src/lib/data.js';
import { filterThemes } from '../../src/ui/filter-dropdowns.js';

const mockThemes = [
    { Theme: 'Fantasy', 'Game Count': 60, 'Avg Theo Win Index': 2.0, 'Smart Index': 4.5, 'Market Share %': 8 },
    { Theme: 'Egypt', 'Game Count': 40, 'Avg Theo Win Index': 2.5, 'Smart Index': 5.0, 'Market Share %': 6 },
    { Theme: 'Asian', 'Game Count': 30, 'Avg Theo Win Index': 1.8, 'Smart Index': 3.0, 'Market Share %': 4 },
    { Theme: 'Niche', 'Game Count': 8, 'Avg Theo Win Index': 3.5, 'Smart Index': 4.0, 'Market Share %': 1 },
    { Theme: 'Tiny', 'Game Count': 3, 'Avg Theo Win Index': 1.0, 'Smart Index': 0.5, 'Market Share %': 0.2 },
    { Theme: 'Micro', 'Game Count': 2, 'Avg Theo Win Index': 0.5, 'Smart Index': 0.2, 'Market Share %': 0.1 },
];

const mockMechanics = [
    { Mechanic: 'Free Spins', 'Game Count': 100, 'Avg Theo Win Index': 1.5, 'Smart Index': 6.0, 'Market Share %': 15 },
    { Mechanic: 'Hold & Win', 'Game Count': 50, 'Avg Theo Win Index': 2.0, 'Smart Index': 5.0, 'Market Share %': 10 },
    { Mechanic: 'Megaways', 'Game Count': 20, 'Avg Theo Win Index': 1.2, 'Smart Index': 2.0, 'Market Share %': 4 },
    { Mechanic: 'Cascading', 'Game Count': 15, 'Avg Theo Win Index': 1.8, 'Smart Index': 3.0, 'Market Share %': 3 },
    { Mechanic: 'Pick', 'Game Count': 5, 'Avg Theo Win Index': 0.8, 'Smart Index': 0.5, 'Market Share %': 1 },
];

describe('getFilteredThemes', () => {
    beforeEach(() => {
        window.gameData = { themes: [...mockThemes] };
    });

    it('returns all themes sorted by Market Share % for "all" view (default grossing)', () => {
        const result = getFilteredThemes('all');
        expect(result.length).toBe(mockThemes.length);
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1]['Market Share %'] || 0).toBeGreaterThanOrEqual(result[i]['Market Share %'] || 0);
        }
    });

    it('returns all themes sorted for default/unknown view', () => {
        const result = getFilteredThemes('unknown_view');
        expect(result.length).toBe(mockThemes.length);
    });

    it('returns empty array when no themes', () => {
        window.gameData = { themes: [] };
        expect(getFilteredThemes('all')).toEqual([]);
    });

    it('returns empty array when gameData is undefined', () => {
        window.gameData = undefined;
        expect(getFilteredThemes('all')).toEqual([]);
    });

    it('filters leaders (top 20% by game count)', () => {
        const result = getFilteredThemes('leaders');
        expect(result.length).toBeGreaterThan(0);
        result.forEach(t => {
            expect(t['Game Count']).toBeGreaterThanOrEqual(8);
        });
    });

    it('filters opportunities (high perf, low market share, min 5 games)', () => {
        const result = getFilteredThemes('opportunities');
        result.forEach(t => {
            expect(t['Game Count']).toBeGreaterThanOrEqual(5);
            expect(t['Market Share %']).toBeLessThan(5);
        });
    });

    it('filters premium (top 25% by Avg Theo Win Index)', () => {
        const result = getFilteredThemes('premium');
        expect(result.length).toBeGreaterThan(0);
        const allSorted = [...mockThemes].sort(
            (a, b) => (b['Avg Theo Win Index'] || 0) - (a['Avg Theo Win Index'] || 0)
        );
        const threshold = allSorted[Math.floor(allSorted.length * 0.25)]?.['Avg Theo Win Index'] || 0;
        result.forEach(t => {
            expect(t['Avg Theo Win Index']).toBeGreaterThanOrEqual(threshold);
        });
    });

    it('premium results are sorted by Avg Theo Win Index descending', () => {
        const result = getFilteredThemes('premium');
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1]['Avg Theo Win Index'] || 0).toBeGreaterThanOrEqual(
                result[i]['Avg Theo Win Index'] || 0
            );
        }
    });
});

describe('getFilteredMechanics', () => {
    beforeEach(() => {
        window.gameData = { mechanics: [...mockMechanics] };
    });

    it('returns all mechanics sorted by Market Share % for "all" view (default grossing)', () => {
        const result = getFilteredMechanics('all');
        expect(result.length).toBe(mockMechanics.length);
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1]['Market Share %'] || 0).toBeGreaterThanOrEqual(result[i]['Market Share %'] || 0);
        }
    });

    it('returns all mechanics for default/unknown view', () => {
        expect(getFilteredMechanics('whatever').length).toBe(mockMechanics.length);
    });

    it('returns empty when no mechanics', () => {
        window.gameData = { mechanics: [] };
        expect(getFilteredMechanics('all')).toEqual([]);
    });

    it('returns empty when gameData is undefined', () => {
        window.gameData = undefined;
        expect(getFilteredMechanics('all')).toEqual([]);
    });

    it('filters popular (top 20% by game count)', () => {
        const result = getFilteredMechanics('popular');
        expect(result.length).toBeGreaterThan(0);
    });

    it('filters highPerforming (top 30% by Avg Theo Win Index)', () => {
        const result = getFilteredMechanics('highPerforming');
        expect(result.length).toBeGreaterThan(0);
        const allSorted = [...mockMechanics].sort(
            (a, b) => (b['Avg Theo Win Index'] || 0) - (a['Avg Theo Win Index'] || 0)
        );
        const threshold = allSorted[Math.floor(allSorted.length * 0.3)]?.['Avg Theo Win Index'] || 0;
        result.forEach(m => {
            expect(m['Avg Theo Win Index']).toBeGreaterThanOrEqual(threshold);
        });
    });
});

describe('resetFilterState provider view', () => {
    it('resets provider view to all', () => {
        resetFilterState('providers');
    });
});

describe('filterThemes(view) composition', () => {
    /** @returns {HTMLElement & { value: string }} */
    function optionEl(val) {
        const el = document.createElement('div');
        el.value = val;
        return /** @type {any} */ (el);
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(document, 'getElementById').mockImplementation(id => {
            if (id === 'themes-filter-provider') return optionEl('');
            if (id === 'themes-filter-mechanic') return optionEl('');
            if (id === 'themes-category-filter') return optionEl('');
            if (id === 'themes-count') {
                const s = document.createElement('span');
                return s;
            }
            return null;
        });

        /** @param {{ theme: string, theo?: number }}[] rows */
        const gamesFrom = rows =>
            rows.flatMap(({ theme, theo }) =>
                [...Array(theme.count)].map((_, i) => ({
                    name: `${theme}_${i}_${Math.random()}`,
                    provider_studio: 'Prov',
                    category: 'Slot',
                    theme_consolidated: theme.theme,
                    features: [],
                    performance_theo_win: theo ?? 10,
                }))
            );

        const defs = [
            { theme: { theme: 'Alpha', count: 60 }, theo: 20 },
            { theme: { theme: 'Beta', count: 40 }, theo: 15 },
            { theme: { theme: 'Gamma', count: 30 }, theo: 12 },
            { theme: { theme: 'Delta', count: 8 }, theo: 18 },
            { theme: { theme: 'Epsilon', count: 3 }, theo: 5 },
        ];
        gameData.allGames = gamesFrom(defs);
        gameData.viewGames = null;
    });

    it('accepts an optional view parameter: leaders applies top 20% game-count threshold over full rebuilt set', () => {
        filterThemes('leaders');
        expect(renderThemes).toHaveBeenCalled();
        const arg = renderThemes.mock.calls.at(-1)[0];
        expect(Array.isArray(arg)).toBe(true);
        // Known fixture: counts 60,40,30,8,3 → percentile index 1 → threshold 40 → Alpha + Beta only
        expect(arg.map(t => t.Theme).sort()).toEqual(['Alpha', 'Beta']);
    });

    it('accepts optional view=premium (Avg Theo Win Index cutoff from rebuilt rows, descending)', () => {
        filterThemes('premium');
        const arg = renderThemes.mock.calls.at(-1)[0];
        expect(arg.length).toBeGreaterThan(0);
        for (let i = 1; i < arg.length; i++) {
            expect(arg[i - 1]['Avg Theo Win Index'] || 0).toBeGreaterThanOrEqual(arg[i]['Avg Theo Win Index'] || 0);
        }
    });

    it('with no dropdowns and no view delegates to renderThemes() without curated list', () => {
        filterThemes(undefined);
        const lastCall = renderThemes.mock.calls.at(-1);
        expect(lastCall.length).toBe(0);
    });
});
