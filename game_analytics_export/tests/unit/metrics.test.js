import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/db/duckdb-client.js', () => ({
    query: vi.fn(),
    RELIABLE_GAME: '(1=1)',
}));

import { query } from '../../src/lib/db/duckdb-client.js';

import {
    getProviderMetrics,
    getThemeMetrics,
    getFeatureMetrics,
    getVolatilityMetrics,
    getDominantVolatility,
    getRtpBandMetrics,
    RTP_BANDS,
    calculateSmartIndex,
    addSmartIndex,
    getGlobalAvgTheo,
    getDominantLayout,
    getAvgRtp,
} from '../../src/lib/metrics.js';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getProviderMetrics', () => {
    it('aggregates by provider with smartIndex', async () => {
        query.mockResolvedValueOnce([
            { name: 'NetEnt', count: 3, totalTheo: 120, avgTheo: 40, totalMkt: 6 },
            { name: 'Pragmatic Play', count: 3, totalTheo: 115, avgTheo: 38.33, totalMkt: 6 },
        ]);
        const result = await getProviderMetrics();
        expect(result.length).toBe(2);
        expect(result[0]).toHaveProperty('smartIndex');
        expect(result[0]).toHaveProperty('ggrShare');
    });

    it('sorts by Smart Index descending', async () => {
        query.mockResolvedValueOnce([
            { name: 'A', count: 10, totalTheo: 500, avgTheo: 50, totalMkt: 25 },
            { name: 'B', count: 5, totalTheo: 100, avgTheo: 20, totalMkt: 10 },
        ]);
        const result = await getProviderMetrics();
        expect(result[0].smartIndex).toBeGreaterThanOrEqual(result[1].smartIndex);
    });

    it('returns empty for empty SQL result', async () => {
        query.mockResolvedValueOnce([]);
        expect(await getProviderMetrics()).toEqual([]);
    });
});

describe('getThemeMetrics', () => {
    it('aggregates by theme with smartIndex', async () => {
        query.mockResolvedValueOnce([
            { theme: 'Classic Slots', count: 5, totalTheo: 50, avgTheo: 10, totalMkt: 25 },
            { theme: 'Asian Temple', count: 3, totalTheo: 24, avgTheo: 8, totalMkt: 12 },
        ]);
        const result = await getThemeMetrics();
        expect(result.length).toBe(2);
        expect(result[0]).toHaveProperty('smartIndex');
    });

    it('passes category filter to SQL', async () => {
        query.mockResolvedValueOnce([]);
        await getThemeMetrics('Slots');
        expect(query).toHaveBeenCalledWith(expect.stringContaining("game_category = 'Slots'"));
    });
});

describe('getFeatureMetrics', () => {
    it('returns features with smartIndex via UNNEST', async () => {
        query.mockResolvedValueOnce([
            { feature: 'Free Spins', count: 10, totalTheo: 400, avgTheo: 40 },
            { feature: 'Wild Reels', count: 5, totalTheo: 150, avgTheo: 30 },
        ]);
        const result = await getFeatureMetrics();
        expect(result.length).toBe(2);
        expect(result[0]).toHaveProperty('smartIndex');
        expect(result[0]).toHaveProperty('feature');
    });
});

describe('getVolatilityMetrics', () => {
    it('sorts by VOLATILITY_ORDER', async () => {
        query.mockResolvedValueOnce([
            { volatility: 'Low', count: 2, totalTheo: 40, avgTheo: 20 },
            { volatility: 'High', count: 5, totalTheo: 250, avgTheo: 50 },
            { volatility: 'Very High', count: 3, totalTheo: 180, avgTheo: 60 },
        ]);
        const result = await getVolatilityMetrics();
        const labels = result.map(v => v.volatility);
        expect(labels.indexOf('Very High')).toBeLessThan(labels.indexOf('High'));
        expect(labels.indexOf('High')).toBeLessThan(labels.indexOf('Low'));
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

describe('getRtpBandMetrics', () => {
    it('maps SQL bands to RTP_BANDS with min/max', async () => {
        query.mockResolvedValueOnce([
            { label: '95%-96%', count: 10, avgTheo: 35 },
            { label: '> 97%', count: 3, avgTheo: 20 },
        ]);
        const result = await getRtpBandMetrics();
        expect(result.length).toBe(2);
        expect(result[0].label).toBe('> 97%');
        expect(result[0].min).toBe(97);
        expect(result[0].max).toBe(200);
        expect(result[1].label).toBe('95%-96%');
    });

    it('RTP_BANDS covers full range', () => {
        expect(RTP_BANDS[0].min).toBe(97);
        expect(RTP_BANDS[RTP_BANDS.length - 1].max).toBe(93);
    });
});

describe('calculateSmartIndex (deprecated alias for calculatePerformanceIndex)', () => {
    it('computes avgTheo / globalAvg (Performance Index)', () => {
        const si = calculateSmartIndex(40, 100, 35);
        expect(si).toBeCloseTo(40 / 35, 5);
    });

    it('returns 0 when globalAvg is 0', () => {
        expect(calculateSmartIndex(40, 100, 0)).toBe(0);
    });
});

describe('addSmartIndex (deprecated alias for addPerformanceIndex)', () => {
    it('adds smartIndex and performanceIndex to dimension rows', () => {
        const rows = [
            { theme: 'A', avg_theo_win: 40, game_count: 100, totalMkt: 10 },
            { theme: 'B', avg_theo_win: 30, game_count: 50, totalMkt: 5 },
        ];
        const result = addSmartIndex(rows);
        expect(result[0].smartIndex).toBeDefined();
        expect(result[0].performanceIndex).toBeDefined();
    });

    it('marks rows with qualified flag based on MIN_QUALIFIED_GAMES', () => {
        const rows = [
            { theme: 'Big', avg_theo_win: 30, game_count: 25, totalMkt: 10 },
            { theme: 'Small', avg_theo_win: 50, game_count: 5, totalMkt: 2 },
        ];
        const result = addSmartIndex(rows);
        const big = result.find(r => r.theme === 'Big');
        const small = result.find(r => r.theme === 'Small');
        expect(big.qualified).toBe(true);
        expect(small.qualified).toBe(false);
    });

    it('sorts by market share descending (Eilers Top Grossing default)', () => {
        const rows = [
            { theme: 'Low-mkt', avg_theo_win: 80, game_count: 25, totalMkt: 2 },
            { theme: 'High-mkt', avg_theo_win: 20, game_count: 25, totalMkt: 15 },
        ];
        const result = addSmartIndex(rows);
        expect(result[0].theme).toBe('High-mkt');
        expect(result[1].theme).toBe('Low-mkt');
    });

    it('returns empty for empty input', () => {
        expect(addSmartIndex([])).toEqual([]);
    });
});

describe('getGlobalAvgTheo', () => {
    it('returns single number from SQL', async () => {
        query.mockResolvedValueOnce([{ avg: 39.17 }]);
        const avg = await getGlobalAvgTheo();
        expect(avg).toBeCloseTo(39.17, 1);
    });

    it('returns 0 when no rows', async () => {
        query.mockResolvedValueOnce([{ avg: null }]);
        const avg = await getGlobalAvgTheo();
        expect(avg).toBe(0);
    });
});

describe('getDominantLayout', () => {
    it('returns most common reel×row combo', () => {
        const games = [
            { specs_reels: 5, specs_rows: 3 },
            { specs_reels: 5, specs_rows: 3 },
            { specs_reels: 3, specs_rows: 3 },
        ];
        expect(getDominantLayout(games)).toBe('5×3');
    });
});

describe('getAvgRtp', () => {
    it('returns average from SQL', async () => {
        query.mockResolvedValueOnce([{ avg: 95.75 }]);
        const avg = await getAvgRtp();
        expect(avg).toBeCloseTo(95.75, 1);
    });

    it('returns 0 when no rows', async () => {
        query.mockResolvedValueOnce([{ avg: null }]);
        expect(await getAvgRtp()).toBe(0);
    });
});
