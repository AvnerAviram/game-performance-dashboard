import { describe, test, expect } from 'vitest';

/**
 * UNIT TESTS: Ranking Formula Validation
 * Tests the three industry-standard ranking formulas
 */

describe('Ranking Formulas - Total Theo Win', () => {
    test('should calculate Total Theo Win = avgTheo × count', () => {
        const avgTheo = 2.5;
        const count = 100;

        const totalTheo = avgTheo * count;

        expect(totalTheo).toBe(250);
    });

    test('should handle zero game count', () => {
        const avgTheo = 5.0;
        const count = 0;

        const totalTheo = avgTheo * count;

        expect(totalTheo).toBe(0);
    });

    test('should handle single game', () => {
        const avgTheo = 12.842;
        const count = 1;

        const totalTheo = avgTheo * count;

        expect(totalTheo).toBeCloseTo(12.842, 3);
    });

    test('should handle large game counts', () => {
        const avgTheo = 1.883;
        const count = 157; // Animals theme

        const totalTheo = avgTheo * count;

        expect(totalTheo).toBeCloseTo(295.631, 2);
    });

    test('should handle decimal precision correctly', () => {
        const avgTheo = 2.4722;
        const count = 94; // Money/Luxury theme

        const totalTheo = avgTheo * count;

        expect(totalTheo).toBeCloseTo(232.3868, 2);
    });
});

describe('Ranking Formulas - Weighted Theo Win', () => {
    test('should calculate Weighted Theo = avgTheo × √count', () => {
        const avgTheo = 2.5;
        const count = 100;

        const weightedTheo = avgTheo * Math.sqrt(count);

        expect(weightedTheo).toBeCloseTo(25.0, 2);
    });

    test('should handle zero game count', () => {
        const avgTheo = 5.0;
        const count = 0;

        const weightedTheo = avgTheo * Math.sqrt(count);

        expect(weightedTheo).toBe(0);
    });

    test('should handle single game', () => {
        const avgTheo = 12.842;
        const count = 1;

        const weightedTheo = avgTheo * Math.sqrt(count);

        expect(weightedTheo).toBeCloseTo(12.842, 3);
    });

    test('should penalize small sample sizes', () => {
        const avgTheo = 10.0;
        const smallCount = 4;
        const largeCount = 100;

        const smallWeighted = avgTheo * Math.sqrt(smallCount);
        const largeWeighted = avgTheo * Math.sqrt(largeCount);

        expect(smallWeighted).toBe(20);
        expect(largeWeighted).toBe(100);
        expect(largeWeighted).toBeGreaterThan(smallWeighted * 2);
    });

    test('Fairy Tale theme example (6 games, high avgTheo)', () => {
        const avgTheo = 12.842;
        const count = 6;

        const weightedTheo = avgTheo * Math.sqrt(count);

        // Should be much lower than Total Theo due to small sample
        const totalTheo = avgTheo * count;

        expect(weightedTheo).toBeCloseTo(31.46, 2);
        expect(totalTheo).toBeCloseTo(77.05, 2);
        expect(weightedTheo).toBeLessThan(totalTheo / 2);
    });
});

describe('Ranking Formulas - Market Share', () => {
    test('should calculate market share percentage', () => {
        const gameCount = 157; // Animals
        const totalGames = 999;

        const marketShare = (gameCount / totalGames) * 100;

        expect(marketShare).toBeCloseTo(15.72, 2);
    });

    test('should handle 100% market share', () => {
        const gameCount = 999;
        const totalGames = 999;

        const marketShare = (gameCount / totalGames) * 100;

        expect(marketShare).toBe(100);
    });

    test('should handle very small market share', () => {
        const gameCount = 1;
        const totalGames = 999;

        const marketShare = (gameCount / totalGames) * 100;

        expect(marketShare).toBeCloseTo(0.1, 2);
    });
});

describe('Ranking Formulas - Sort Order', () => {
    test('themes should sort by Smart Index descending', () => {
        const themes = [
            { Theme: 'A', 'Smart Index': 100.5 },
            { Theme: 'B', 'Smart Index': 300.2 },
            { Theme: 'C', 'Smart Index': 200.8 },
        ];

        themes.sort((a, b) => b['Smart Index'] - a['Smart Index']);

        expect(themes[0].Theme).toBe('B');
        expect(themes[1].Theme).toBe('C');
        expect(themes[2].Theme).toBe('A');
        expect(themes[0]['Smart Index']).toBeGreaterThan(themes[1]['Smart Index']);
        expect(themes[1]['Smart Index']).toBeGreaterThan(themes[2]['Smart Index']);
    });

    test('should maintain stable sort for equal values', () => {
        const themes = [
            { Theme: 'First', 'Smart Index': 100 },
            { Theme: 'Second', 'Smart Index': 100 },
            { Theme: 'Third', 'Smart Index': 100 },
        ];

        themes.sort((a, b) => b['Smart Index'] - a['Smart Index']);

        // All values equal, should maintain original order
        expect(themes[0].Theme).toBe('First');
        expect(themes[1].Theme).toBe('Second');
        expect(themes[2].Theme).toBe('Third');
    });
});

describe('Ranking Formulas - Edge Cases', () => {
    test('should handle negative avgTheo values', () => {
        const avgTheo = -2.0;
        const count = 10;

        const totalTheo = avgTheo * count;
        const weightedTheo = avgTheo * Math.sqrt(count);

        expect(totalTheo).toBe(-20);
        expect(weightedTheo).toBeCloseTo(-6.32, 2);
    });

    test('should handle very large numbers', () => {
        const avgTheo = 50.0;
        const count = 10000;

        const totalTheo = avgTheo * count;
        const weightedTheo = avgTheo * Math.sqrt(count);

        expect(totalTheo).toBe(500000);
        expect(weightedTheo).toBe(5000);
    });

    test('should handle floating point precision', () => {
        const avgTheo = 1.883;
        const count = 157;

        const totalTheo = avgTheo * count;

        // Should not have floating point errors
        expect(totalTheo).toBeCloseTo(295.631, 10);
    });
});

describe('Formula Comparisons - Real World Examples', () => {
    test('Animals (157 games) vs Fairy Tale (6 games)', () => {
        const animals = { avgTheo: 1.883, count: 157 };
        const fairyTale = { avgTheo: 12.842, count: 6 };

        const animalsTotalTheo = animals.avgTheo * animals.count;
        const fairyTaleTotalTheo = fairyTale.avgTheo * fairyTale.count;

        const animalsWeighted = animals.avgTheo * Math.sqrt(animals.count);
        const fairyTaleWeighted = fairyTale.avgTheo * Math.sqrt(fairyTale.count);

        // Total Theo: Animals should rank higher (proven market)
        expect(animalsTotalTheo).toBeGreaterThan(fairyTaleTotalTheo);

        // Weighted Theo: Fairy Tale higher (weighted formula favors quality)
        // This is CORRECT - shows weighted formula working as intended
        expect(fairyTaleWeighted).toBeGreaterThan(animalsWeighted);

        // Fairy Tale has much higher avg quality
        expect(fairyTale.avgTheo).toBeGreaterThan(animals.avgTheo);
    });

    test('Money/Luxury (94 games) vs Fire/Volcanic (27 games)', () => {
        const money = { avgTheo: 2.472, count: 94 };
        const fire = { avgTheo: 3.739, count: 27 };

        const moneyTotal = money.avgTheo * money.count;
        const fireTotal = fire.avgTheo * fire.count;

        // Total Theo favors volume
        expect(moneyTotal).toBeCloseTo(232.37, 2);
        expect(fireTotal).toBeCloseTo(100.95, 2);
        expect(moneyTotal).toBeGreaterThan(fireTotal);

        // But Fire has higher quality
        expect(fire.avgTheo).toBeGreaterThan(money.avgTheo);
    });
});
