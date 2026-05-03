/**
 * Cross-Page Sorting Consistency Validation
 *
 * Verifies that dimensions (themes, mechanics, providers) appear in the
 * same Smart Index order everywhere they are ranked.
 *
 * Uses local aggregators (same logic as pre-SQL metrics.js).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { loadTestData, gameData, getActiveThemes, getActiveMechanics } from '../utils/load-test-data.js';
import {
    computeThemeMetrics,
    computeFeatureMetrics,
    computeProviderMetrics,
    addSmartIndex,
} from '../utils/test-aggregators.js';
import { F } from '../../src/lib/game-fields.js';
import { parseFeatures } from '../../src/lib/parse-features.js';

let allGames;

beforeAll(async () => {
    await loadTestData();
    allGames = gameData.allGames;
});

describe('Cross-page Smart Index consistency', () => {
    test('theme metrics return Smart Index-sorted data with smartIndex field', () => {
        const themes = computeThemeMetrics(allGames);
        expect(themes.length).toBeGreaterThan(0);
        expect(themes[0].smartIndex).toBeDefined();
        for (let i = 0; i < themes.length - 1; i++) {
            expect(themes[i].smartIndex).toBeGreaterThanOrEqual(themes[i + 1].smartIndex);
        }
    });

    test('feature metrics return Smart Index-sorted data with smartIndex field', () => {
        const features = computeFeatureMetrics(allGames);
        expect(features.length).toBeGreaterThan(0);
        expect(features[0].smartIndex).toBeDefined();
        for (let i = 0; i < features.length - 1; i++) {
            expect(features[i].smartIndex).toBeGreaterThanOrEqual(features[i + 1].smartIndex);
        }
    });

    test('provider metrics return Smart Index-sorted data with smartIndex field', () => {
        const providers = computeProviderMetrics(allGames);
        expect(providers.length).toBeGreaterThan(0);
        expect(providers[0].smartIndex).toBeDefined();
        for (let i = 0; i < providers.length - 1; i++) {
            expect(providers[i].smartIndex).toBeGreaterThanOrEqual(providers[i + 1].smartIndex);
        }
    });

    test('theme metrics top-10 are stable and Smart Index-sorted', () => {
        const first = computeThemeMetrics(allGames);
        const second = computeThemeMetrics(allGames);

        const top10First = first.slice(0, 10);
        const top10Second = second.slice(0, 10);

        expect(top10First.length).toBe(10);
        for (let i = 0; i < 10; i++) {
            expect(top10First[i].theme).toBe(top10Second[i].theme);
            expect(top10First[i].smartIndex).toBeCloseTo(top10Second[i].smartIndex, 5);
        }
    });

    test('feature metrics top-10 are all Smart Index-sorted and exclude HIDDEN_FEATURES', () => {
        const metricsFeatures = computeFeatureMetrics(allGames);
        const top10 = metricsFeatures.slice(0, 10);

        expect(top10.length).toBe(10);
        for (let i = 0; i < top10.length - 1; i++) {
            expect(top10[i].smartIndex).toBeGreaterThanOrEqual(top10[i + 1].smartIndex);
        }

        const names = top10.map(f => f.feature);
        expect(names).not.toContain('Multiplier');
    });

    test('all metric functions include smartIndex in each row', () => {
        const themes = computeThemeMetrics(allGames);
        const features = computeFeatureMetrics(allGames);
        const providers = computeProviderMetrics(allGames);

        for (const t of themes) {
            expect(typeof t.smartIndex).toBe('number');
            expect(t.smartIndex).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(t.smartIndex)).toBe(true);
        }
        for (const f of features) {
            expect(typeof f.smartIndex).toBe('number');
            expect(f.smartIndex).toBeGreaterThanOrEqual(0);
        }
        for (const p of providers) {
            expect(typeof p.smartIndex).toBe('number');
            expect(p.smartIndex).toBeGreaterThanOrEqual(0);
        }
    });

    test('Smart Index is not just avgTheo — count matters', () => {
        const themes = computeThemeMetrics(allGames);
        if (themes.length < 3) return;

        const hasDifferentOrder = themes.some((t, i) => {
            if (i === 0) return false;
            return t.avgTheo > themes[i - 1].avgTheo;
        });
        expect(hasDifferentOrder).toBe(true);
    });

    test('Smart Index is not just count — avgTheo matters', () => {
        const themes = computeThemeMetrics(allGames);
        if (themes.length < 3) return;

        const hasDifferentOrder = themes.some((t, i) => {
            if (i === 0) return false;
            return t.count > themes[i - 1].count;
        });
        expect(hasDifferentOrder).toBe(true);
    });

    test('addSmartIndex produces same result as local aggregation', () => {
        const rawThemes = [];
        const map = {};
        for (const g of allGames) {
            const theme = F.themeConsolidated(g);
            if (!map[theme]) map[theme] = { theme, count: 0, totalTheo: 0, totalMkt: 0 };
            map[theme].count++;
            map[theme].totalTheo += F.theoWin(g);
            map[theme].totalMkt += F.marketShare(g);
        }
        for (const t of Object.values(map)) {
            rawThemes.push({ ...t, avgTheo: t.count > 0 ? t.totalTheo / t.count : 0 });
        }

        const withSI = addSmartIndex(rawThemes);
        const fromAggregator = computeThemeMetrics(allGames);

        expect(withSI.length).toBe(fromAggregator.length);
        expect(withSI[0].theme).toBe(fromAggregator[0].theme);
        expect(withSI[0].smartIndex).toBeCloseTo(fromAggregator[0].smartIndex, 5);
    });
});
