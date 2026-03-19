/**
 * Tests for symbol categorization and utilities.
 */
import { describe, it, expect } from 'vitest';
import {
    categorizeSymbol,
    parseSymbols,
    normalizeSymbolName,
    aggregateSymbolStats,
    SYMBOL_CATEGORIES,
} from '../../src/lib/symbol-utils.js';

describe('categorizeSymbol', () => {
    it('should categorize Wild symbols', () => {
        expect(categorizeSymbol('Wild')).toBe('Wild');
        expect(categorizeSymbol('Wild (Golden Dragon)')).toBe('Wild');
    });

    it('should categorize Scatter/Bonus symbols', () => {
        expect(categorizeSymbol('Scatter')).toBe('Scatter/Bonus');
        expect(categorizeSymbol('Free Spins')).toBe('Scatter/Bonus');
    });

    it('should categorize Gems/Crystals symbols', () => {
        expect(categorizeSymbol('Diamond')).toBe('Gems/Crystals');
    });

    it('should categorize Cash/Collect symbols', () => {
        expect(categorizeSymbol('Cash Prize')).toBe('Cash/Collect');
    });

    it('should categorize 7s/BARs symbols', () => {
        expect(categorizeSymbol('7')).toBe('7s/BARs');
    });

    it('should categorize Mythical symbols', () => {
        expect(categorizeSymbol('Dragon')).toBe('Mythical');
    });

    it('should categorize Card symbols', () => {
        expect(categorizeSymbol('A')).toBe('Card');
        expect(categorizeSymbol('King')).toBe('Card');
    });

    it('should categorize random strings as Themed', () => {
        expect(categorizeSymbol('RandomGameSymbol')).toBe('Themed');
        expect(categorizeSymbol('SomeUniqueName')).toBe('Themed');
    });
});

describe('parseSymbols', () => {
    it('should parse JSON array string', () => {
        expect(parseSymbols('["Wild","Scatter"]')).toEqual(['Wild', 'Scatter']);
    });

    it('should return array as-is when already an array', () => {
        expect(parseSymbols(['Wild'])).toEqual(['Wild']);
    });

    it('should return empty array for null and undefined', () => {
        expect(parseSymbols(null)).toEqual([]);
        expect(parseSymbols(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
        expect(parseSymbols('')).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
        expect(parseSymbols('not json')).toEqual([]);
        expect(parseSymbols('{"key": "value"}')).toEqual([]);
    });
});

describe('normalizeSymbolName', () => {
    it('should strip parenthetical suffix', () => {
        expect(normalizeSymbolName('Wild (Golden Dragon)')).toBe(null); // "Wild" is a mechanic symbol → filtered out
        expect(normalizeSymbolName('Cleopatra (Wild)')).toBe('Cleopatra');
    });

    it('should return null for numeric strings', () => {
        expect(normalizeSymbolName('123')).toBe(null);
    });

    it('should return null for empty string', () => {
        expect(normalizeSymbolName('')).toBe(null);
    });

    it('should return null for null input', () => {
        expect(normalizeSymbolName(null)).toBe(null);
    });

    it('should return null for single character', () => {
        expect(normalizeSymbolName('A')).toBe(null);
    });

    it('should return valid names unchanged (aside from paren stripping)', () => {
        expect(normalizeSymbolName('Diamond')).toBe('Diamond');
        expect(normalizeSymbolName('  Dragon  ')).toBe('Dragon');
    });
});

describe('aggregateSymbolStats', () => {
    it('should return catStats and topSymbols for a mock array of games', () => {
        const games = [
            { symbols: '["Wild","Scatter","Diamond"]', performance_theo_win: 96.5 },
            { symbols: '["Wild","Dragon","7"]', performance_theo_win: 94.2 },
            { symbols: ['Wild', 'Diamond', 'King'], performance_theo_win: 95.0 },
        ];

        const result = aggregateSymbolStats(games);

        expect(result).toHaveProperty('catStats');
        expect(result).toHaveProperty('topSymbols');

        expect(SYMBOL_CATEGORIES).toContain('Wild');
        expect(result.catStats['Wild']).toBeDefined();
        expect(result.catStats['Wild']).toHaveProperty('count');
        expect(result.catStats['Wild']).toHaveProperty('gameCount');
        expect(result.catStats['Wild']).toHaveProperty('totalTheo');
        expect(result.catStats['Wild']).toHaveProperty('symbols');

        expect(result.topSymbols).toBeInstanceOf(Array);
        expect(result.topSymbols.length).toBeGreaterThan(0);
        expect(result.topSymbols.length).toBeLessThanOrEqual(20);

        result.topSymbols.forEach((item) => {
            expect(item).toHaveProperty('name');
            expect(item).toHaveProperty('count');
            expect(item).toHaveProperty('cat');
        });
    });

    it('should handle games with empty symbols', () => {
        const games = [
            { symbols: [], performance_theo_win: 96 },
            { symbols: '[]', performance_theo_win: 94 },
        ];

        const result = aggregateSymbolStats(games);
        const totalCount = Object.values(result.catStats).reduce((sum, s) => sum + s.count, 0);
        expect(totalCount).toBe(0);
        expect(result.topSymbols).toEqual([]);
    });

    it('should aggregate counts across games', () => {
        const games = [
            { symbols: '["Wild Tiger","Diamond"]', performance_theo_win: 96 },
            { symbols: '["Wild Tiger","Diamond"]', performance_theo_win: 95 },
        ];

        const result = aggregateSymbolStats(games);
        expect(result.catStats['Wild'].count).toBe(2);
        expect(result.catStats['Gems/Crystals'].count).toBe(2);
        expect(result.topSymbols.some((s) => s.name === 'Wild Tiger')).toBe(true);
        expect(result.topSymbols.some((s) => s.name === 'Diamond')).toBe(true);
    });
});
