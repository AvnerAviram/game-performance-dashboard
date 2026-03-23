import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGames = [
    {
        name: 'Game A',
        theme_consolidated: 'Egypt',
        features: 'Free Spins,Wild Reels',
        performance_theo_win: 5.0,
        specs_rtp: 96.0,
        specs_reels: 5,
        specs_rows: 3,
        specs_volatility: 'High',
        provider_studio: 'IGT',
    },
    {
        name: 'Game B',
        theme_consolidated: 'Egypt',
        features: 'Free Spins,Wild Reels',
        performance_theo_win: 4.0,
        specs_rtp: 95.5,
        specs_reels: 5,
        specs_rows: 3,
        specs_volatility: 'High',
        provider_studio: 'IGT',
    },
    {
        name: 'Game C',
        theme_consolidated: 'Egypt',
        features: 'Free Spins',
        performance_theo_win: 3.0,
        specs_rtp: 94.0,
        specs_reels: 5,
        specs_rows: 3,
        specs_volatility: 'Medium',
        provider_studio: 'NetEnt',
    },
    {
        name: 'Game D',
        theme_consolidated: 'Irish',
        features: 'Multiplier',
        performance_theo_win: 1.0,
        specs_rtp: 95.0,
        specs_reels: 5,
        specs_rows: 3,
        specs_volatility: 'Low',
        provider_studio: 'IGT',
    },
    {
        name: 'Game E',
        theme_consolidated: 'Irish',
        features: 'Multiplier',
        performance_theo_win: 0.5,
        specs_rtp: 93.0,
        specs_reels: 5,
        specs_rows: 3,
        specs_volatility: 'Low',
        provider_studio: 'NetEnt',
    },
    {
        name: 'Game F',
        theme_consolidated: 'Irish',
        features: 'Multiplier',
        performance_theo_win: 0.3,
        specs_rtp: 92.0,
        specs_reels: 3,
        specs_rows: 3,
        specs_volatility: 'Low',
        provider_studio: 'NetEnt',
    },
    {
        name: 'Game G',
        theme_consolidated: 'Fruit',
        features: 'Wild Reels',
        performance_theo_win: 6.0,
        specs_rtp: 96.5,
        specs_reels: 5,
        specs_rows: 3,
        specs_volatility: 'High',
        provider_studio: 'Pragmatic',
    },
    {
        name: 'Game H',
        theme_consolidated: 'Fruit',
        features: 'Wild Reels',
        performance_theo_win: 7.0,
        specs_rtp: 97.0,
        specs_reels: 5,
        specs_rows: 3,
        specs_volatility: 'Very High',
        provider_studio: 'Pragmatic',
    },
];

vi.mock('../../src/lib/data.js', () => ({
    gameData: { allGames: [] },
}));

vi.mock('../../src/lib/parse-features.js', () => ({
    parseFeatures: raw => {
        if (!raw || typeof raw !== 'string') return [];
        return raw
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
    },
}));

let gameDataRef;

beforeEach(async () => {
    const dataModule = await import('../../src/lib/data.js');
    gameDataRef = dataModule.gameData;
    gameDataRef.allGames = [...mockGames];
});

describe('Idea Generator', () => {
    let getAvoidCombos, getBuildNextCombos;

    beforeEach(async () => {
        const mod = await import('../../src/features/idea-generator.js');
        getAvoidCombos = mod.getAvoidCombos;
        getBuildNextCombos = mod.getBuildNextCombos;
    });

    describe('getBuildNextCombos', () => {
        it('returns an array of combo objects', () => {
            const results = getBuildNextCombos();
            expect(Array.isArray(results)).toBe(true);
            results.forEach(r => {
                expect(r).toHaveProperty('theme');
                expect(r).toHaveProperty('feature');
                expect(r).toHaveProperty('count');
                expect(r).toHaveProperty('avgTheo');
                expect(typeof r.count).toBe('number');
                expect(typeof r.avgTheo).toBe('number');
            });
        });

        it('respects the limit parameter', () => {
            const results = getBuildNextCombos(2);
            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('returns empty array when no games exist', () => {
            gameDataRef.allGames = [];
            expect(getBuildNextCombos()).toEqual([]);
        });
    });

    describe('getAvoidCombos', () => {
        it('only returns combos with 3+ games', () => {
            const results = getAvoidCombos(10);
            results.forEach(r => {
                expect(r.count).toBeGreaterThanOrEqual(3);
            });
        });

        it('returns combos sorted by ascending avgTheo (worst first)', () => {
            const results = getAvoidCombos(10);
            for (let i = 1; i < results.length; i++) {
                expect(results[i].avgTheo).toBeGreaterThanOrEqual(results[i - 1].avgTheo);
            }
        });

        it('respects the limit parameter', () => {
            const results = getAvoidCombos(1);
            expect(results.length).toBeLessThanOrEqual(1);
        });
    });
});
