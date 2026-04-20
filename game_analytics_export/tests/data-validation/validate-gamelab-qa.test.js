/**
 * Phase 6: Game Lab QA
 *
 * Validates feature recipes, combos, heatmap data, and RTP band metrics.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';
import {
    getFeatureRecipes,
    getFeatureCombos,
    getRtpBandMetrics,
    getThemeMetrics,
    getGlobalAvgTheo,
} from '../../src/lib/metrics.js';
import { F } from '../../src/lib/game-fields.js';
import { parseFeatures } from '../../src/lib/parse-features.js';
import { scoreFinding, assertNoDefiniteFindings } from '../utils/qa-scoring.js';

let allGames = [];

beforeAll(async () => {
    await loadTestData();
    allGames = gameData.allGames;
});

describe('Feature Recipes QA', () => {
    it('recipes contain at least 2 features each', () => {
        const recipes = getFeatureRecipes(allGames);
        for (const r of recipes) {
            expect(r.features.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('recipe game counts match manual filter', () => {
        const findings = [];
        const recipes = getFeatureRecipes(allGames).slice(0, 10);

        for (const r of recipes) {
            const manual = allGames.filter(g => {
                const feats = parseFeatures(g.features).sort();
                return feats.join(' + ') === r.key;
            }).length;

            if (manual !== r.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'recipe', `${r.key}: count ${r.count} vs manual ${manual}`, {
                        recipe: r.key,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('recipe avgTheo is consistent with game data', () => {
        const findings = [];
        const recipes = getFeatureRecipes(allGames).slice(0, 10);

        for (const r of recipes) {
            const gamesInRecipe = allGames.filter(g => {
                const feats = parseFeatures(g.features).sort();
                return feats.join(' + ') === r.key;
            });
            if (gamesInRecipe.length === 0) continue;
            const manualAvg = gamesInRecipe.reduce((s, g) => s + F.theoWin(g), 0) / gamesInRecipe.length;
            const diff = Math.abs(manualAvg - r.avgTheo);
            if (diff > 0.01) {
                findings.push(
                    scoreFinding('DEFINITE', 'recipe', `${r.key}: avgTheo diff ${diff.toFixed(4)}`, {
                        metricsAvg: r.avgTheo,
                        manualAvg,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('recipe lift is correctly calculated against global average', () => {
        const findings = [];
        const globalAvg = getGlobalAvgTheo(allGames);
        const recipes = getFeatureRecipes(allGames).slice(0, 5);

        for (const r of recipes) {
            const expectedLift = globalAvg > 0 ? ((r.avgTheo - globalAvg) / globalAvg) * 100 : 0;
            const diff = Math.abs(r.lift - expectedLift);
            if (diff > 0.1) {
                findings.push(
                    scoreFinding('DEFINITE', 'recipe', `${r.key}: lift diff ${diff.toFixed(2)}pp`, {
                        reportedLift: r.lift,
                        expectedLift,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Feature Combos QA', () => {
    it('feature pair combos have at least 2 games each', () => {
        const themeRows = getThemeMetrics(allGames);
        const topTheme = themeRows.sort((a, b) => b.count - a.count)[0];
        const themeGames = allGames.filter(g => F.themeConsolidated(g) === topTheme.theme);

        const combos = getFeatureCombos(themeGames, { comboSize: 2 });
        for (const c of combos) {
            expect(c.count).toBeGreaterThanOrEqual(2);
            expect(c.features.length).toBe(2);
        }
    });
});

describe('RTP Band QA', () => {
    it('RTP bands cover all games with valid RTP', () => {
        const findings = [];
        const bands = getRtpBandMetrics(allGames);
        const bandTotal = bands.reduce((s, b) => s + b.count, 0);
        const gamesWithRtp = allGames.filter(g => F.rtp(g) > 0).length;

        if (bandTotal !== gamesWithRtp) {
            findings.push(
                scoreFinding('DEFINITE', 'rtp', `Band total ${bandTotal} vs games-with-rtp ${gamesWithRtp}`, {
                    bandTotal,
                    gamesWithRtp,
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('RTP bands have correct boundary ranges', () => {
        const bands = getRtpBandMetrics(allGames);
        for (const b of bands) {
            expect(b.min).toBeLessThan(b.max);
        }
    });

    it('no game falls into multiple RTP bands', () => {
        const findings = [];
        const bands = getRtpBandMetrics(allGames);
        const totalInBands = bands.reduce((s, b) => s + b.count, 0);
        const gamesWithRtp = allGames.filter(g => F.rtp(g) > 0).length;

        if (totalInBands > gamesWithRtp) {
            findings.push(
                scoreFinding(
                    'DEFINITE',
                    'rtp',
                    `Overlap detected: bands total ${totalInBands} > unique ${gamesWithRtp}`,
                    {
                        totalInBands,
                        gamesWithRtp,
                    }
                )
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });
});
