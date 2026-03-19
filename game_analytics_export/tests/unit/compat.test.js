/**
 * Tests for compat.js — flat/nested field helpers.
 */
import { describe, it, expect } from 'vitest';
import { getTheme, getProvider, getPerformance } from '../../src/features/compat.js';

describe('compat helpers', () => {
    describe('getTheme', () => {
        it('should read flat fields', () => {
            const game = { theme_primary: 'Egyptian', theme_secondary: 'Gold', theme_consolidated: 'Egyptian' };
            const result = getTheme(game);
            expect(result.primary).toBe('Egyptian');
            expect(result.secondary).toBe('Gold');
            expect(result.consolidated).toBe('Egyptian');
        });

        it('should default to Unknown for missing fields', () => {
            const result = getTheme({});
            expect(result.primary).toBe('Unknown');
            expect(result.consolidated).toBe('Unknown');
            expect(result.secondary).toBe('');
        });
    });

    describe('getProvider', () => {
        it('should read flat fields', () => {
            const game = { provider_studio: 'Pragmatic', provider_parent: 'Pragmatic Play' };
            const result = getProvider(game);
            expect(result.studio).toBe('Pragmatic');
            expect(result.parent).toBe('Pragmatic Play');
        });

        it('should default to Unknown for missing fields', () => {
            const result = getProvider({});
            expect(result.studio).toBe('Unknown');
            expect(result.parent).toBe('Unknown');
        });
    });

    describe('getPerformance', () => {
        it('should read flat fields', () => {
            const game = { performance_theo_win: 1.23, performance_rank: 5, performance_market_share_percent: 0.5 };
            const result = getPerformance(game);
            expect(result.theo_win).toBe(1.23);
            expect(result.rank).toBe(5);
            expect(result.market_share_percent).toBe(0.5);
        });

        it('should default to safe values for missing fields', () => {
            const result = getPerformance({});
            expect(result.theo_win).toBe(0);
            expect(result.rank).toBe(999);
            expect(result.market_share_percent).toBe(0);
        });
    });

    it('should not export getSpecs (removed)', async () => {
        const mod = await import('../../src/features/compat.js');
        expect(mod.getSpecs).toBeUndefined();
    });
});
