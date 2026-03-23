import { describe, it, expect, beforeEach } from 'vitest';
import { getFilteredThemes, getFilteredMechanics, resetFilterState } from '../../src/lib/filters.js';

const mockThemes = [
    { Theme: 'Fantasy', 'Game Count': 60, 'Avg Theo Win Index': 2.0, 'Smart Index': 4.5, 'Market Share %': 8 },
    { Theme: 'Egypt', 'Game Count': 40, 'Avg Theo Win Index': 2.5, 'Smart Index': 5.0, 'Market Share %': 6 },
    { Theme: 'Asian', 'Game Count': 30, 'Avg Theo Win Index': 1.8, 'Smart Index': 3.0, 'Market Share %': 4 },
    { Theme: 'Niche', 'Game Count': 8, 'Avg Theo Win Index': 3.5, 'Smart Index': 4.0, 'Market Share %': 1 },
    { Theme: 'Tiny', 'Game Count': 3, 'Avg Theo Win Index': 1.0, 'Smart Index': 0.5, 'Market Share %': 0.2 },
    { Theme: 'Micro', 'Game Count': 2, 'Avg Theo Win Index': 0.5, 'Smart Index': 0.2, 'Market Share %': 0.1 },
];

const mockMechanics = [
    { Mechanic: 'Free Spins', 'Game Count': 100, 'Avg Theo Win Index': 1.5, 'Smart Index': 6.0 },
    { Mechanic: 'Hold & Win', 'Game Count': 50, 'Avg Theo Win Index': 2.0, 'Smart Index': 5.0 },
    { Mechanic: 'Megaways', 'Game Count': 20, 'Avg Theo Win Index': 1.2, 'Smart Index': 2.0 },
    { Mechanic: 'Cascading', 'Game Count': 15, 'Avg Theo Win Index': 1.8, 'Smart Index': 3.0 },
    { Mechanic: 'Pick', 'Game Count': 5, 'Avg Theo Win Index': 0.8, 'Smart Index': 0.5 },
];

describe('getFilteredThemes', () => {
    beforeEach(() => {
        window.gameData = { themes: [...mockThemes] };
    });

    it('returns all themes sorted by Smart Index for "all" view', () => {
        const result = getFilteredThemes('all');
        expect(result.length).toBe(mockThemes.length);
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1]['Smart Index']).toBeGreaterThanOrEqual(result[i]['Smart Index']);
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

    it('filters premium (top 25% by Smart Index)', () => {
        const result = getFilteredThemes('premium');
        expect(result.length).toBeGreaterThan(0);
        const allSorted = [...mockThemes].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
        const threshold = allSorted[Math.floor(allSorted.length * 0.25)]?.['Smart Index'] || 0;
        result.forEach(t => {
            expect(t['Smart Index']).toBeGreaterThanOrEqual(threshold);
        });
    });

    it('premium results are sorted by Smart Index descending', () => {
        const result = getFilteredThemes('premium');
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1]['Smart Index']).toBeGreaterThanOrEqual(result[i]['Smart Index']);
        }
    });
});

describe('getFilteredMechanics', () => {
    beforeEach(() => {
        window.gameData = { mechanics: [...mockMechanics] };
    });

    it('returns all mechanics sorted for "all" view', () => {
        const result = getFilteredMechanics('all');
        expect(result.length).toBe(mockMechanics.length);
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1]['Smart Index']).toBeGreaterThanOrEqual(result[i]['Smart Index']);
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

    it('filters highPerforming (top 30% by Smart Index)', () => {
        const result = getFilteredMechanics('highPerforming');
        expect(result.length).toBeGreaterThan(0);
        const allSorted = [...mockMechanics].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
        const threshold = allSorted[Math.floor(allSorted.length * 0.3)]?.['Smart Index'] || 0;
        result.forEach(m => {
            expect(m['Smart Index']).toBeGreaterThanOrEqual(threshold);
        });
    });
});

describe('resetFilterState provider view', () => {
    it('resets provider view to all', () => {
        resetFilterState('providers');
    });
});
