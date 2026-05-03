import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/db/duckdb-client.js', () => ({
    query: vi.fn(),
    RELIABLE_GAME: '(1=1)',
}));

import { query } from '../../src/lib/db/duckdb-client.js';

import {
    getArtThemeMetrics,
    getArtCharacterMetrics,
    getArtElementMetrics,
    getArtColorToneMetrics,
    getArtNarrativeMetrics,
    getArtComboMetrics,
    getArtRecipeMetrics,
} from '../../src/lib/metrics.js';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getArtThemeMetrics', () => {
    it('returns theme aggregations sorted by count', async () => {
        query.mockResolvedValueOnce([
            { theme: 'Classic Slots', count: 50, totalTheo: 500, avgTheo: 10, totalMkt: 25 },
            { theme: 'Asian Temple', count: 30, totalTheo: 240, avgTheo: 8, totalMkt: 12 },
        ]);
        const result = await getArtThemeMetrics();
        expect(result.length).toBe(2);
        expect(result[0]).toHaveProperty('theme');
        expect(result[0]).toHaveProperty('count');
        expect(result[0]).toHaveProperty('totalTheo');
        expect(result[0]).toHaveProperty('avgTheo');
        expect(result[0]).toHaveProperty('totalMkt');
    });

    it('passes category filter', async () => {
        query.mockResolvedValueOnce([]);
        await getArtThemeMetrics('Slots');
        expect(query).toHaveBeenCalledWith(expect.stringContaining("game_category = 'Slots'"));
    });
});

describe('getArtCharacterMetrics', () => {
    it('returns character aggregations via UNNEST', async () => {
        query.mockResolvedValueOnce([
            { character: 'Dragon', count: 20, totalTheo: 800, avgTheo: 40 },
            { character: 'Warrior', count: 15, totalTheo: 450, avgTheo: 30 },
        ]);
        const result = await getArtCharacterMetrics();
        expect(result.length).toBe(2);
        expect(result[0]).toHaveProperty('character');
        expect(result[0]).toHaveProperty('count');
        expect(result[0]).toHaveProperty('avgTheo');
    });
});

describe('getArtElementMetrics', () => {
    it('returns element aggregations via UNNEST', async () => {
        query.mockResolvedValueOnce([
            { element: 'Fire', count: 25, totalTheo: 1000, avgTheo: 40 },
            { element: 'Water', count: 10, totalTheo: 300, avgTheo: 30 },
        ]);
        const result = await getArtElementMetrics();
        expect(result.length).toBe(2);
        expect(result[0]).toHaveProperty('element');
    });

    it('applies ELEMENT_CONSOLIDATION after SQL (merge Fire/Flames/Lava into Fire/Flames)', async () => {
        query.mockResolvedValueOnce([
            { element: 'Fire/Flames', count: 10, totalTheo: 100, avgTheo: 10 },
            { element: 'Fire/Flames/Lava', count: 5, totalTheo: 45, avgTheo: 9 },
        ]);
        const result = await getArtElementMetrics();
        expect(result).toHaveLength(1);
        expect(result[0].element).toBe('Fire/Flames');
        expect(result[0].count).toBe(15);
        expect(result[0].avgTheo).toBeCloseTo((10 * 10 + 5 * 9) / 15, 8);
    });
});

describe('getArtColorToneMetrics', () => {
    it('returns colorTone aggregations via UNNEST', async () => {
        query.mockResolvedValueOnce([
            { colorTone: 'Gold/Amber', count: 30, totalTheo: 900, avgTheo: 30 },
            { colorTone: 'Red/Crimson', count: 20, totalTheo: 800, avgTheo: 40 },
        ]);
        const result = await getArtColorToneMetrics();
        expect(result.length).toBe(2);
        expect(result[0]).toHaveProperty('colorTone');
    });

    it('handles lowercase colortone alias from DuckDB', async () => {
        query.mockResolvedValueOnce([{ colortone: 'Blue', count: 5, totalTheo: 100, avgTheo: 20 }]);
        const result = await getArtColorToneMetrics();
        expect(result[0].colorTone).toBe('Blue');
    });
});

describe('getArtNarrativeMetrics', () => {
    it('returns narrative aggregations sorted by avgTheo', async () => {
        query.mockResolvedValueOnce([
            { narrative: 'Hero Journey', count: 15, totalTheo: 600, avgTheo: 40 },
            { narrative: 'Treasure Hunt', count: 10, totalTheo: 300, avgTheo: 30 },
        ]);
        const result = await getArtNarrativeMetrics();
        expect(result.length).toBe(2);
        expect(result[0]).toHaveProperty('narrative');
    });
});

describe('getArtComboMetrics', () => {
    it('returns cross-dimensional combos', async () => {
        query.mockResolvedValueOnce([
            { dimA: 'Classic Slots', dimB: 'Fire', count: 5, totalTheo: 250, avgTheo: 50, mktShare: 10 },
            { dimA: 'Asian Temple', dimB: 'Gold Coins', count: 3, totalTheo: 120, avgTheo: 40, mktShare: 8 },
        ]);
        const result = await getArtComboMetrics();
        expect(result.length).toBe(2);
        expect(result[0]).toHaveProperty('dimA');
        expect(result[0]).toHaveProperty('dimB');
        expect(result[0]).toHaveProperty('avgTheo');
        expect(result[0]).toHaveProperty('mktShare');
    });

    it('generates correct SQL for scalar × array', async () => {
        query.mockResolvedValueOnce([]);
        await getArtComboMetrics(null, { dimA: 'theme', dimB: 'elements' });
        expect(query).toHaveBeenCalledWith(expect.stringContaining('UNNEST'));
        expect(query).toHaveBeenCalledWith(expect.stringContaining('art_theme AS dimA'));
    });

    it('generates correct SQL for array × array', async () => {
        query.mockResolvedValueOnce([]);
        await getArtComboMetrics(null, { dimA: 'characters', dimB: 'elements' });
        const sql = query.mock.calls[0][0];
        expect(sql).toContain('UNNEST(games.art_characters)');
        expect(sql).toContain('UNNEST(games.art_elements)');
    });

    it('generates correct SQL for scalar × scalar', async () => {
        query.mockResolvedValueOnce([]);
        await getArtComboMetrics(null, { dimA: 'theme', dimB: 'narrative' });
        const sql = query.mock.calls[0][0];
        expect(sql).not.toContain('UNNEST');
        expect(sql).toContain('art_theme AS dimA');
        expect(sql).toContain('art_narrative AS dimB');
    });
});

describe('getArtRecipeMetrics', () => {
    it('builds enriched recipes with frequency maps', async () => {
        query.mockResolvedValueOnce([
            {
                theme: 'Classic Slots',
                theo: 40,
                mkt: 2,
                art_characters: ['Joker', 'Lady'],
                art_elements: ['Gems', 'Fire'],
                art_color_tone: ['Red/Crimson'],
                art_narrative: 'Treasure Hunt',
            },
            {
                theme: 'Classic Slots',
                theo: 50,
                mkt: 3,
                art_characters: ['Joker'],
                art_elements: ['Gems'],
                art_color_tone: ['Gold/Amber'],
                art_narrative: 'Treasure Hunt',
            },
            {
                theme: 'Classic Slots',
                theo: 30,
                mkt: 1,
                art_characters: ['Lady'],
                art_elements: ['Fire'],
                art_color_tone: ['Red/Crimson'],
                art_narrative: 'Hero Journey',
            },
        ]);
        const result = await getArtRecipeMetrics();
        expect(result.length).toBe(1);
        const recipe = result[0];
        expect(recipe.theme).toBe('Classic Slots');
        expect(recipe.count).toBe(3);
        expect(recipe.avgTheo).toBeCloseTo(40, 1);
        expect(recipe.topCharacters).toContain('Joker');
        expect(recipe.topElements).toContain('Gems');
        expect(recipe.topColors).toContain('Red/Crimson');
        expect(recipe.narrative).toBe('Treasure Hunt');
    });

    it('filters by minGames', async () => {
        query.mockResolvedValueOnce([
            {
                theme: 'Rare',
                theo: 40,
                mkt: 2,
                art_characters: [],
                art_elements: [],
                art_color_tone: [],
                art_narrative: null,
            },
        ]);
        const result = await getArtRecipeMetrics(null, { minGames: 3 });
        expect(result.length).toBe(0);
    });
});
