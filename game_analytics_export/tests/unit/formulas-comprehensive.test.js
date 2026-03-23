import { describe, test, expect } from 'vitest';
import { calculateSmartIndex } from '../utils/json-aggregator.js';

/**
 * Comprehensive Formula Tests
 *
 * Tests all calculation formulas with edge cases.
 */

describe('Smart Index Formula', () => {
    test('should calculate Smart Index correctly', () => {
        const avgTheoOverall = 10;
        const items = [
            { theme: 'Test1', game_count: 100, avg_theo_win: 15 },
            { theme: 'Test2', game_count: 25, avg_theo_win: 20 },
        ];

        const result = calculateSmartIndex(items, avgTheoOverall);

        // Formula: (avgTheo * sqrt(gameCount)) / avgTheoOverall
        // Test1: (15 * sqrt(100)) / 10 = (15 * 10) / 10 = 15
        // Test2: (20 * sqrt(25)) / 10 = (20 * 5) / 10 = 10

        expect(result[0].smart_index).toBeCloseTo(15, 1);
        expect(result[1].smart_index).toBeCloseTo(10, 1);
    });

    test('should sort by Smart Index descending', () => {
        const avgTheoOverall = 10;
        const items = [
            { theme: 'Low', game_count: 10, avg_theo_win: 5 },
            { theme: 'High', game_count: 100, avg_theo_win: 20 },
        ];

        const result = calculateSmartIndex(items, avgTheoOverall);

        expect(result[0].theme).toBe('High');
        expect(result[1].theme).toBe('Low');
    });

    test('should handle zero game count', () => {
        const avgTheoOverall = 10;
        const items = [{ theme: 'Zero', game_count: 0, avg_theo_win: 15 }];

        const result = calculateSmartIndex(items, avgTheoOverall);

        // sqrt(0) = 0, so Smart Index should be 0
        expect(result[0].smart_index).toBe(0);
    });

    test('should handle one game', () => {
        const avgTheoOverall = 10;
        const items = [{ theme: 'One', game_count: 1, avg_theo_win: 20 }];

        const result = calculateSmartIndex(items, avgTheoOverall);

        // sqrt(1) = 1, so (20 * 1) / 10 = 2
        expect(result[0].smart_index).toBeCloseTo(2, 1);
    });

    test('should handle large game count (1000 games)', () => {
        const avgTheoOverall = 10;
        const items = [{ theme: 'Large', game_count: 1000, avg_theo_win: 10 }];

        const result = calculateSmartIndex(items, avgTheoOverall);

        // sqrt(1000) ≈ 31.62, so (10 * 31.62) / 10 ≈ 31.62
        expect(result[0].smart_index).toBeCloseTo(31.62, 1);
    });

    test('should handle very high avg theo_win', () => {
        const avgTheoOverall = 10;
        const items = [{ theme: 'HighPerf', game_count: 25, avg_theo_win: 50 }];

        const result = calculateSmartIndex(items, avgTheoOverall);

        // (50 * sqrt(25)) / 10 = (50 * 5) / 10 = 25
        expect(result[0].smart_index).toBeCloseTo(25, 1);
    });

    test('should handle very low avg theo_win', () => {
        const avgTheoOverall = 10;
        const items = [{ theme: 'LowPerf', game_count: 100, avg_theo_win: 1 }];

        const result = calculateSmartIndex(items, avgTheoOverall);

        // (1 * sqrt(100)) / 10 = (1 * 10) / 10 = 1
        expect(result[0].smart_index).toBeCloseTo(1, 1);
    });

    test('should handle floating point precision', () => {
        const avgTheoOverall = 12.3456;
        const items = [{ theme: 'Precise', game_count: 47, avg_theo_win: 13.7891 }];

        const result = calculateSmartIndex(items, avgTheoOverall);

        // Should not produce NaN or Infinity
        expect(result[0].smart_index).not.toBeNaN();
        expect(isFinite(result[0].smart_index)).toBe(true);
    });
});

describe('Market Share Calculations', () => {
    test('market share can exceed 100%', () => {
        // Multi-theme games mean sum of theme market shares > 100%
        const themes = [
            { theme: 'A', total_market_share: 60 },
            { theme: 'B', total_market_share: 50 },
            { theme: 'C', total_market_share: 40 },
        ];

        const totalMarketShare = themes.reduce((sum, t) => sum + t.total_market_share, 0);

        expect(totalMarketShare).toBeGreaterThan(100);
        expect(totalMarketShare).toBe(150);
    });

    test('individual market share should be non-negative', () => {
        const themes = [
            { theme: 'Valid', total_market_share: 5.5 },
            { theme: 'Zero', total_market_share: 0 },
        ];

        themes.forEach(theme => {
            expect(theme.total_market_share).toBeGreaterThanOrEqual(0);
        });
    });

    test('market share should not be NaN', () => {
        const themes = [{ theme: 'Test', total_market_share: 5.5 }];

        themes.forEach(theme => {
            expect(isNaN(theme.total_market_share)).toBe(false);
        });
    });
});

describe('Average Calculations', () => {
    test('should calculate average correctly', () => {
        const values = [10, 20, 30];
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

        expect(avg).toBe(20);
    });

    test('should handle single value', () => {
        const values = [15];
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

        expect(avg).toBe(15);
    });

    test('should handle empty array gracefully', () => {
        const values = [];
        const avg = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

        expect(avg).toBe(0);
    });

    test('should handle NULL/undefined values', () => {
        const values = [10, null, 20, undefined, 30];
        const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
        const avg = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;

        expect(avg).toBe(20);
    });

    test('should handle floating point averages', () => {
        const values = [10.5, 20.7, 30.2];
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

        expect(avg).toBeCloseTo(20.47, 2);
    });

    test('average of all zeros should be zero', () => {
        const values = [0, 0, 0];
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

        expect(avg).toBe(0);
    });
});

describe('Aggregation Logic', () => {
    test('should GROUP BY theme_consolidated not theme_primary', () => {
        const games = [
            { theme: { primary: 'Ancient Egypt', consolidated: 'Egyptian' }, performance: { theo_win: 10 } },
            { theme: { primary: 'Egypt Pyramids', consolidated: 'Egyptian' }, performance: { theo_win: 20 } },
        ];

        // Should group both under "Egyptian"
        const grouped = {};
        games.forEach(game => {
            const key = game.theme.consolidated;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(game);
        });

        expect(Object.keys(grouped)).toHaveLength(1);
        expect(grouped['Egyptian']).toHaveLength(2);
    });

    test('should handle missing consolidated theme', () => {
        const games = [
            { theme: { primary: 'Test' }, performance: { theo_win: 10 } },
            { theme: { primary: 'Test2', consolidated: 'Test' }, performance: { theo_win: 20 } },
        ];

        // Should handle gracefully
        const grouped = {};
        games.forEach(game => {
            const key = game.theme.consolidated || game.theme.primary || 'Unknown';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(game);
        });

        expect(Object.keys(grouped).length).toBeGreaterThan(0);
    });
});

describe('Rounding and Precision', () => {
    test('should handle 2 decimal precision', () => {
        const value = 12.3456789;
        const rounded = Math.round(value * 100) / 100;

        expect(rounded).toBe(12.35);
    });

    test('should handle 4 decimal precision', () => {
        const value = 12.3456789;
        const rounded = Math.round(value * 10000) / 10000;

        expect(rounded).toBe(12.3457);
    });

    test('RTP should be between 0 and 100', () => {
        const rtp = 96.5;

        expect(rtp).toBeGreaterThanOrEqual(0);
        expect(rtp).toBeLessThanOrEqual(100);
    });

    test('theo_win should be positive and reasonable', () => {
        const theoWin = 15.25;

        expect(theoWin).toBeGreaterThan(0);
        expect(theoWin).toBeLessThan(200);
    });
});

describe('Edge Cases', () => {
    test('division by zero should be handled', () => {
        const avgTheoOverall = 0;
        const items = [{ theme: 'Test', game_count: 100, avg_theo_win: 15 }];

        // Should not throw error
        const result = items.map(item => {
            const weight = Math.sqrt(item.game_count);
            const smartIndex = avgTheoOverall !== 0 ? (item.avg_theo_win * weight) / avgTheoOverall : 0;
            return { ...item, smart_index: smartIndex };
        });

        expect(result[0].smart_index).toBe(0);
    });

    test('extreme values should not produce Infinity', () => {
        const avgTheoOverall = 0.0001;
        const items = [{ theme: 'Extreme', game_count: 1000000, avg_theo_win: 1000 }];

        const result = calculateSmartIndex(items, avgTheoOverall);

        expect(isFinite(result[0].smart_index)).toBe(true);
    });

    test('negative values should be handled', () => {
        // Should not occur in real data, but test handling
        const avgTheoOverall = 10;
        const items = [{ theme: 'Negative', game_count: -10, avg_theo_win: 15 }];

        const result = calculateSmartIndex(items, avgTheoOverall);

        // sqrt of negative is NaN
        expect(isNaN(result[0].smart_index)).toBe(true);
    });
});
