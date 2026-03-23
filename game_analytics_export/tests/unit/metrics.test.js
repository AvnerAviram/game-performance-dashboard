import { describe, it, expect } from 'vitest';
import {
    getProviderMetrics,
    getProvidersPerTheme,
    getThemeMetrics,
    getGamesByTheme,
    getFeatureMetrics,
    getFeatureLift,
    getVolatilityMetrics,
    getDominantVolatility,
    getFeatureRecipes,
    getFeatureCombos,
    getRtpBandMetrics,
    RTP_BANDS,
    calculateSmartIndex,
    addSmartIndex,
    getGlobalAvgTheo,
    getDominantLayout,
    getDominantProvider,
    getAvgRtp,
} from '../../src/lib/metrics.js';

const mockGames = [
    {
        name: 'Game A',
        provider_studio: 'NetEnt',
        theme_consolidated: 'Egypt',
        performance_theo_win: 40,
        performance_market_share_percent: 2,
        features: ['Free Spins', 'Multiplier'],
        specs_volatility: 'High',
        specs_rtp: 96.5,
        specs_reels: 5,
        specs_rows: 3,
    },
    {
        name: 'Game B',
        provider_studio: 'NetEnt',
        theme_consolidated: 'Egypt',
        performance_theo_win: 50,
        performance_market_share_percent: 3,
        features: ['Free Spins', 'Wild Reels'],
        specs_volatility: 'High',
        specs_rtp: 95.0,
        specs_reels: 5,
        specs_rows: 3,
    },
    {
        name: 'Game C',
        provider_studio: 'NetEnt',
        theme_consolidated: 'Fantasy',
        performance_theo_win: 30,
        performance_market_share_percent: 1,
        features: ['Multiplier'],
        specs_volatility: 'Medium',
        specs_rtp: 94.0,
        specs_reels: 3,
        specs_rows: 3,
    },
    {
        name: 'Game D',
        provider_studio: 'Pragmatic Play',
        theme_consolidated: 'Fantasy',
        performance_theo_win: 60,
        performance_market_share_percent: 4,
        features: ['Free Spins', 'Multiplier', 'Hold and Spin'],
        specs_volatility: 'Very High',
        specs_rtp: 96.0,
        specs_reels: 5,
        specs_rows: 3,
    },
    {
        name: 'Game E',
        provider_studio: 'Pragmatic Play',
        theme_consolidated: 'Egypt',
        performance_theo_win: 20,
        performance_market_share_percent: 0.5,
        features: ['Free Spins'],
        specs_volatility: 'Low',
        specs_rtp: 97.5,
        specs_reels: 5,
        specs_rows: 4,
    },
    {
        name: 'Game F',
        provider_studio: 'Pragmatic Play',
        theme_consolidated: 'Egypt',
        performance_theo_win: 35,
        performance_market_share_percent: 1.5,
        features: ['Multiplier', 'Wild Reels'],
        specs_volatility: 'Medium',
        specs_rtp: 95.5,
        specs_reels: 3,
        specs_rows: 3,
    },
];

describe('getProviderMetrics', () => {
    it('aggregates by provider with correct counts and averages', () => {
        const result = getProviderMetrics(mockGames);
        expect(result.length).toBe(2);
        const netent = result.find(p => p.name === 'NetEnt');
        const prag = result.find(p => p.name === 'Pragmatic Play');
        expect(netent.count).toBe(3);
        expect(netent.avgTheo).toBeCloseTo(40, 1);
        expect(netent.totalMkt).toBe(6);
        expect(prag.count).toBe(3);
        expect(prag.avgTheo).toBeCloseTo(38.33, 1);
    });

    it('sorts by ggrShare descending', () => {
        const result = getProviderMetrics(mockGames);
        expect(result[0].ggrShare).toBeGreaterThanOrEqual(result[1].ggrShare);
    });

    it('respects minGames filter', () => {
        const result = getProviderMetrics(mockGames, { minGames: 4 });
        expect(result.length).toBe(0);
    });

    it('returns empty for empty input', () => {
        expect(getProviderMetrics([])).toEqual([]);
    });
});

describe('getProvidersPerTheme', () => {
    it('returns map of theme → provider set', () => {
        const result = getProvidersPerTheme(mockGames);
        expect(result.get('Egypt').size).toBe(2);
        expect(result.get('Fantasy').size).toBe(2);
    });
});

describe('getThemeMetrics', () => {
    it('aggregates by theme', () => {
        const result = getThemeMetrics(mockGames);
        expect(result.length).toBe(2);
        const egypt = result.find(t => t.theme === 'Egypt');
        expect(egypt.count).toBe(4);
        expect(egypt.avgTheo).toBeCloseTo(36.25, 1);
    });

    it('sorted by count descending', () => {
        const result = getThemeMetrics(mockGames);
        expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
    });
});

describe('getGamesByTheme', () => {
    it('groups games into theme buckets', () => {
        const result = getGamesByTheme(mockGames);
        expect(result.get('Egypt').length).toBe(4);
        expect(result.get('Fantasy').length).toBe(2);
    });
});

describe('getFeatureMetrics', () => {
    it('counts feature occurrences across games', () => {
        const result = getFeatureMetrics(mockGames);
        const fs = result.find(f => f.feature === 'Free Spins');
        expect(fs.count).toBe(4);
        const mult = result.find(f => f.feature === 'Multiplier');
        expect(mult.count).toBe(4);
    });

    it('calculates avgTheo per feature', () => {
        const result = getFeatureMetrics(mockGames);
        const fs = result.find(f => f.feature === 'Free Spins');
        expect(fs.avgTheo).toBeCloseTo((40 + 50 + 60 + 20) / 4, 1);
    });
});

describe('getFeatureLift', () => {
    it('returns lift percentage for each feature', () => {
        const result = getFeatureLift(mockGames);
        expect(result.length).toBeGreaterThan(0);
        for (const f of result) {
            expect(typeof f.lift).toBe('number');
            expect(typeof f.avgWith).toBe('number');
            expect(typeof f.avgWithout).toBe('number');
        }
    });
});

describe('getVolatilityMetrics', () => {
    it('groups by volatility in VOLATILITY_ORDER', () => {
        const result = getVolatilityMetrics(mockGames);
        const labels = result.map(v => v.volatility);
        expect(labels[0]).toBe('Very High');
        expect(labels[labels.length - 1]).toBe('Low');
    });

    it('calculates correct counts', () => {
        const result = getVolatilityMetrics(mockGames);
        const high = result.find(v => v.volatility === 'High');
        expect(high.count).toBe(2);
    });
});

describe('getDominantVolatility', () => {
    it('returns most common volatility', () => {
        const games = [{ specs_volatility: 'High' }, { specs_volatility: 'High' }, { specs_volatility: 'Low' }];
        expect(getDominantVolatility(games)).toBe('High');
    });

    it('returns empty string for no data', () => {
        expect(getDominantVolatility([])).toBe('');
    });
});

describe('getFeatureRecipes', () => {
    it('builds multi-feature recipe combos', () => {
        const result = getFeatureRecipes(mockGames, { minGames: 1 });
        expect(result.length).toBeGreaterThan(0);
        for (const r of result) {
            expect(r.features.length).toBeGreaterThanOrEqual(2);
            expect(r.count).toBeGreaterThanOrEqual(1);
        }
    });

    it('calculates lift vs global average', () => {
        const result = getFeatureRecipes(mockGames, { minGames: 1 });
        for (const r of result) {
            expect(typeof r.lift).toBe('number');
        }
    });

    it('filters by minGames default (2)', () => {
        const strict = getFeatureRecipes(mockGames);
        const loose = getFeatureRecipes(mockGames, { minGames: 1 });
        expect(loose.length).toBeGreaterThanOrEqual(strict.length);
    });
});

describe('getFeatureCombos', () => {
    it('generates pairs within a theme slice', () => {
        const egyptGames = mockGames.filter(g => g.theme_consolidated === 'Egypt');
        const result = getFeatureCombos(egyptGames, { comboSize: 2, minGames: 1 });
        expect(result.length).toBeGreaterThan(0);
        for (const c of result) {
            expect(c.features.length).toBe(2);
        }
    });
});

describe('getRtpBandMetrics', () => {
    it('buckets games into RTP bands', () => {
        const result = getRtpBandMetrics(mockGames);
        expect(result.length).toBeGreaterThan(0);
        const total = result.reduce((s, b) => s + b.count, 0);
        expect(total).toBeGreaterThan(0);
    });

    it('RTP_BANDS covers full range', () => {
        expect(RTP_BANDS[0].min).toBe(97);
        expect(RTP_BANDS[RTP_BANDS.length - 1].max).toBe(93);
    });
});

describe('calculateSmartIndex', () => {
    it('computes (avgTheo * sqrt(count)) / globalAvg', () => {
        const si = calculateSmartIndex(40, 100, 35);
        expect(si).toBeCloseTo((40 * Math.sqrt(100)) / 35, 5);
    });

    it('returns 0 when globalAvg is 0', () => {
        expect(calculateSmartIndex(40, 100, 0)).toBe(0);
    });
});

describe('addSmartIndex', () => {
    it('adds smartIndex to dimension rows', () => {
        const rows = [
            { theme: 'A', avg_theo_win: 40, game_count: 100 },
            { theme: 'B', avg_theo_win: 30, game_count: 50 },
        ];
        const result = addSmartIndex(rows);
        expect(result[0].smartIndex).toBeDefined();
        expect(result[0].smartIndex).toBeGreaterThan(result[1].smartIndex);
    });

    it('returns empty for empty input', () => {
        expect(addSmartIndex([])).toEqual([]);
    });
});

describe('getGlobalAvgTheo', () => {
    it('returns correct average', () => {
        const avg = getGlobalAvgTheo(mockGames);
        const expected = (40 + 50 + 30 + 60 + 20 + 35) / 6;
        expect(avg).toBeCloseTo(expected, 5);
    });

    it('returns 0 for empty', () => {
        expect(getGlobalAvgTheo([])).toBe(0);
    });
});

describe('getDominantLayout', () => {
    it('returns most common reel×row combo', () => {
        expect(getDominantLayout(mockGames)).toBe('5×3');
    });
});

describe('getDominantProvider', () => {
    it('returns most common provider', () => {
        expect(['NetEnt', 'Pragmatic Play']).toContain(getDominantProvider(mockGames));
    });
});

describe('getAvgRtp', () => {
    it('averages non-zero RTPs', () => {
        const avg = getAvgRtp(mockGames);
        expect(avg).toBeCloseTo((96.5 + 95 + 94 + 96 + 97.5 + 95.5) / 6, 1);
    });

    it('returns 0 for empty', () => {
        expect(getAvgRtp([])).toBe(0);
    });
});
