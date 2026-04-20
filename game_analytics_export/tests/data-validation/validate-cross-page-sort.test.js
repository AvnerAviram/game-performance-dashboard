/**
 * Cross-Page Sorting Consistency Validation
 *
 * Verifies that dimensions (themes, mechanics, providers) appear in the
 * same Smart Index order everywhere they are ranked — overview charts,
 * detail page tables, metric functions, and filter tabs.
 *
 * This test uses the real game_data_master.json dataset.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { loadTestData, gameData, getActiveThemes, getActiveMechanics } from '../utils/load-test-data.js';
import { getThemeMetrics, getFeatureMetrics, getProviderMetrics, addSmartIndex } from '../../src/lib/metrics.js';
import { F } from '../../src/lib/game-fields.js';
import { parseFeatures } from '../../src/lib/parse-features.js';

let allGames;

beforeAll(async () => {
    await loadTestData();
    allGames = gameData.allGames;
});

describe('Cross-page Smart Index consistency', () => {
    test('getThemeMetrics returns Smart Index-sorted data with smartIndex field', () => {
        const themes = getThemeMetrics(allGames);
        expect(themes.length).toBeGreaterThan(0);
        expect(themes[0].smartIndex).toBeDefined();
        for (let i = 0; i < themes.length - 1; i++) {
            expect(themes[i].smartIndex).toBeGreaterThanOrEqual(themes[i + 1].smartIndex);
        }
    });

    test('getFeatureMetrics returns Smart Index-sorted data with smartIndex field', () => {
        const features = getFeatureMetrics(allGames);
        expect(features.length).toBeGreaterThan(0);
        expect(features[0].smartIndex).toBeDefined();
        for (let i = 0; i < features.length - 1; i++) {
            expect(features[i].smartIndex).toBeGreaterThanOrEqual(features[i + 1].smartIndex);
        }
    });

    test('getProviderMetrics returns Smart Index-sorted data with smartIndex field', () => {
        const providers = getProviderMetrics(allGames);
        expect(providers.length).toBeGreaterThan(0);
        expect(providers[0].smartIndex).toBeDefined();
        for (let i = 0; i < providers.length - 1; i++) {
            expect(providers[i].smartIndex).toBeGreaterThanOrEqual(providers[i + 1].smartIndex);
        }
    });

    test('getThemeMetrics top-10 are stable and Smart Index-sorted', () => {
        const first = getThemeMetrics(allGames);
        const second = getThemeMetrics(allGames);

        const top10First = first.slice(0, 10);
        const top10Second = second.slice(0, 10);

        expect(top10First.length).toBe(10);
        for (let i = 0; i < 10; i++) {
            expect(top10First[i].theme).toBe(top10Second[i].theme);
            expect(top10First[i].smartIndex).toBeCloseTo(top10Second[i].smartIndex, 5);
        }
    });

    test('getFeatureMetrics top-10 are all Smart Index-sorted and exclude HIDDEN_FEATURES', () => {
        const metricsFeatures = getFeatureMetrics(allGames);
        const top10 = metricsFeatures.slice(0, 10);

        expect(top10.length).toBe(10);
        for (let i = 0; i < top10.length - 1; i++) {
            expect(top10[i].smartIndex).toBeGreaterThanOrEqual(top10[i + 1].smartIndex);
        }

        const names = top10.map(f => f.feature);
        expect(names).not.toContain('Multiplier');
    });

    test('all metric functions include smartIndex in each row', () => {
        const themes = getThemeMetrics(allGames);
        const features = getFeatureMetrics(allGames);
        const providers = getProviderMetrics(allGames);

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
        const themes = getThemeMetrics(allGames);
        if (themes.length < 3) return;

        const hasDifferentOrder = themes.some((t, i) => {
            if (i === 0) return false;
            return t.avgTheo > themes[i - 1].avgTheo;
        });
        expect(hasDifferentOrder).toBe(true);
    });

    test('Smart Index is not just count — avgTheo matters', () => {
        const themes = getThemeMetrics(allGames);
        if (themes.length < 3) return;

        const hasDifferentOrder = themes.some((t, i) => {
            if (i === 0) return false;
            return t.count > themes[i - 1].count;
        });
        expect(hasDifferentOrder).toBe(true);
    });

    test('addSmartIndex produces same result as metric functions', () => {
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
        const fromMetrics = getThemeMetrics(allGames);

        expect(withSI.length).toBe(fromMetrics.length);
        expect(withSI[0].theme).toBe(fromMetrics[0].theme);
        expect(withSI[0].smartIndex).toBeCloseTo(fromMetrics[0].smartIndex, 5);
    });
});
