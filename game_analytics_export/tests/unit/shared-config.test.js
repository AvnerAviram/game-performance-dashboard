import { describe, it, expect } from 'vitest';
import {
    PROVIDER_NORMALIZATION_MAP,
    MECHANIC_NORMALIZE,
    VOLATILITY_ORDER,
    VOLATILITY_SQL_RANK,
    VOL_COLORS,
    VOL_BADGE_CLASSES,
    MIN_PROVIDER_GAMES,
    MIN_FEATURE_GAMES,
    MIN_SAMPLE_SIZE,
    MARKET_LEADER_THRESHOLD,
    INITIAL_SHOW,
    DEFAULT_PAGE_SIZE,
    normalizeProvider,
    normalizeMechanic,
    normalizeVolatility,
} from '../../src/lib/shared-config.js';

describe('shared-config exports', () => {
    it('PROVIDER_NORMALIZATION_MAP has all string keys and values', () => {
        for (const [key, val] of Object.entries(PROVIDER_NORMALIZATION_MAP)) {
            expect(typeof key).toBe('string');
            expect(typeof val).toBe('string');
            expect(key.length).toBeGreaterThan(0);
            expect(val.length).toBeGreaterThan(0);
        }
    });

    it('PROVIDER_NORMALIZATION_MAP contains known mappings', () => {
        expect(PROVIDER_NORMALIZATION_MAP['Igt']).toBe('IGT');
        expect(PROVIDER_NORMALIZATION_MAP['Bally']).toBe('Light & Wonder');
        expect(PROVIDER_NORMALIZATION_MAP['Blueprint']).toBe('Blueprint Gaming');
        expect(PROVIDER_NORMALIZATION_MAP['Play N Go']).toBe("Play'n GO");
        expect(PROVIDER_NORMALIZATION_MAP['Dsg']).toBe('Design Works Gaming');
    });

    it('MECHANIC_NORMALIZE maps Hold & Win', () => {
        expect(MECHANIC_NORMALIZE['Hold & Win']).toBe('Hold and Win');
    });
});

describe('volatility constants', () => {
    it('VOLATILITY_ORDER is sorted highest to lowest', () => {
        expect(VOLATILITY_ORDER[0]).toBe('Very High');
        expect(VOLATILITY_ORDER[VOLATILITY_ORDER.length - 1]).toBe('Low');
        expect(VOLATILITY_ORDER.length).toBe(7);
    });

    it('VOLATILITY_SQL_RANK covers the base DuckDB levels', () => {
        expect(VOLATILITY_SQL_RANK['low']).toBe(1);
        expect(VOLATILITY_SQL_RANK['medium']).toBe(2);
        expect(VOLATILITY_SQL_RANK['high']).toBe(3);
        expect(VOLATILITY_SQL_RANK['very high']).toBe(4);
    });

    it('VOL_COLORS has a hex color for every VOLATILITY_ORDER entry', () => {
        for (const vol of VOLATILITY_ORDER) {
            expect(VOL_COLORS[vol]).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('VOL_BADGE_CLASSES has Tailwind classes for each standard level', () => {
        const levels = ['Low', 'Low-Medium', 'Medium', 'Medium-High', 'High', 'Very High'];
        for (const lev of levels) {
            expect(typeof VOL_BADGE_CLASSES[lev]).toBe('string');
            expect(VOL_BADGE_CLASSES[lev]).toContain('bg-');
            expect(VOL_BADGE_CLASSES[lev]).toContain('text-');
        }
    });
});

describe('threshold constants', () => {
    it('MIN_PROVIDER_GAMES is 3', () => {
        expect(MIN_PROVIDER_GAMES).toBe(3);
    });

    it('MIN_FEATURE_GAMES is 5', () => {
        expect(MIN_FEATURE_GAMES).toBe(5);
    });

    it('MIN_SAMPLE_SIZE is 2', () => {
        expect(MIN_SAMPLE_SIZE).toBe(2);
    });

    it('MARKET_LEADER_THRESHOLD is 0.1', () => {
        expect(MARKET_LEADER_THRESHOLD).toBe(0.1);
    });

    it('INITIAL_SHOW is 5', () => {
        expect(INITIAL_SHOW).toBe(5);
    });

    it('DEFAULT_PAGE_SIZE is 50', () => {
        expect(DEFAULT_PAGE_SIZE).toBe(50);
    });
});

describe('helper functions', () => {
    it('normalizeProvider maps known aliases', () => {
        expect(normalizeProvider('Igt')).toBe('IGT');
        expect(normalizeProvider('WMS')).toBe('Light & Wonder');
        expect(normalizeProvider('Blueprint')).toBe('Blueprint Gaming');
    });

    it('normalizeProvider consolidates White Hat Studios subsidiaries to Blueprint Gaming', () => {
        expect(normalizeProvider('White Hat Studios')).toBe('Blueprint Gaming');
        expect(normalizeProvider('Lucksome')).toBe('Blueprint Gaming');
        expect(normalizeProvider('Atomic Slot Lab')).toBe('Blueprint Gaming');
    });

    it('normalizeProvider returns input for unknown providers', () => {
        expect(normalizeProvider('NetEnt')).toBe('NetEnt');
        expect(normalizeProvider('Pragmatic Play')).toBe('Pragmatic Play');
    });

    it('normalizeProvider returns Unknown for falsy input', () => {
        expect(normalizeProvider('')).toBe('Unknown');
        expect(normalizeProvider(null)).toBe('Unknown');
        expect(normalizeProvider(undefined)).toBe('Unknown');
    });

    it('normalizeMechanic maps Hold & Win', () => {
        expect(normalizeMechanic('Hold & Win')).toBe('Hold and Win');
    });

    it('normalizeMechanic returns Slot for falsy input', () => {
        expect(normalizeMechanic('')).toBe('Slot');
        expect(normalizeMechanic(null)).toBe('Slot');
    });

    it('normalizeMechanic passes through unknown mechanics', () => {
        expect(normalizeMechanic('Free Spins')).toBe('Free Spins');
    });

    it('normalizeVolatility title-cases strings preserving separator', () => {
        expect(normalizeVolatility('very high')).toBe('Very High');
        expect(normalizeVolatility('medium-high')).toBe('Medium-High');
        expect(normalizeVolatility('medium')).toBe('Medium');
        expect(normalizeVolatility('low')).toBe('Low');
    });

    it('normalizeVolatility returns Unknown for falsy input', () => {
        expect(normalizeVolatility('')).toBe('Unknown');
        expect(normalizeVolatility(null)).toBe('Unknown');
    });
});
