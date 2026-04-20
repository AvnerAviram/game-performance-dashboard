/**
 * Phase 2: Providers + Themes + Mechanics Table QA
 *
 * Validates table-level aggregations against metrics.js and checks
 * for dimension-filter consistency with the shared filter module.
 *
 * Tier rules:
 *   DEFINITE — reuses exact metrics.js or dimension-filter logic.
 *   LIKELY   — statistical threshold (e.g., top-provider theo mismatch > 10%).
 *   POSSIBLE — coverage/info.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';
import { getProviderMetrics, getThemeMetrics, getFeatureMetrics, getVolatilityMetrics } from '../../src/lib/metrics.js';
import { F } from '../../src/lib/game-fields.js';
import { parseFeatures } from '../../src/lib/parse-features.js';
import { scoreFinding, assertNoDefiniteFindings } from '../utils/qa-scoring.js';
import { matchGameToDimension } from '../../server/helpers/dimension-filter.cjs';
import { normalizeProvider } from '../../src/lib/shared-config.js';

let allGames = [];

beforeAll(async () => {
    await loadTestData();
    allGames = gameData.allGames;
});

describe('Provider Table QA', () => {
    it('provider metrics game counts sum correctly', () => {
        const findings = [];
        const rows = getProviderMetrics(allGames, { minGames: 1 });
        for (const p of rows) {
            const manual = allGames.filter(g => F.provider(g) === p.name).length;
            if (manual !== p.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'provider', `${p.name}: metrics count ${p.count} vs manual ${manual}`, {
                        provider: p.name,
                        metricsCount: p.count,
                        manualCount: manual,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('provider avgTheo matches manual calculation', () => {
        const findings = [];
        const rows = getProviderMetrics(allGames, { minGames: 1 });
        for (const p of rows.slice(0, 20)) {
            const games = allGames.filter(g => F.provider(g) === p.name);
            const manualAvg = games.reduce((s, g) => s + F.theoWin(g), 0) / games.length;
            const diff = Math.abs(manualAvg - p.avgTheo);
            if (diff > 0.01) {
                findings.push(
                    scoreFinding('DEFINITE', 'provider', `${p.name}: avgTheo diff ${diff.toFixed(4)}`, {
                        metricsAvg: p.avgTheo,
                        manualAvg,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('dimension filter matches F.provider for top providers', () => {
        const findings = [];
        const rows = getProviderMetrics(allGames);
        for (const p of rows.slice(0, 10)) {
            const viaF = allGames.filter(g => F.provider(g) === p.name).length;
            const viaFilter = allGames.filter(g =>
                matchGameToDimension(g, 'provider', p.name.toLowerCase(), { normalizeProvider })
            ).length;
            if (viaF !== viaFilter) {
                findings.push(
                    scoreFinding(
                        'LIKELY',
                        'provider',
                        `${p.name}: F.provider count ${viaF} vs dimension-filter count ${viaFilter}`,
                        { provider: p.name, viaF, viaFilter }
                    )
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Theme Table QA', () => {
    it('theme metrics game counts sum to total games', () => {
        const rows = getThemeMetrics(allGames);
        const sumCounts = rows.reduce((s, t) => s + t.count, 0);
        expect(sumCounts).toBe(allGames.length);
    });

    it('theme avgTheo matches manual calculation for top themes', () => {
        const findings = [];
        const rows = getThemeMetrics(allGames);
        const topThemes = rows.sort((a, b) => b.count - a.count).slice(0, 15);

        for (const t of topThemes) {
            const games = allGames.filter(g => F.themeConsolidated(g) === t.theme);
            if (games.length !== t.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'theme', `${t.theme}: count mismatch ${t.count} vs ${games.length}`, {
                        theme: t.theme,
                    })
                );
                continue;
            }
            const manualAvg = games.reduce((s, g) => s + F.theoWin(g), 0) / games.length;
            const diff = Math.abs(manualAvg - t.avgTheo);
            if (diff > 0.01) {
                findings.push(
                    scoreFinding('DEFINITE', 'theme', `${t.theme}: avgTheo diff ${diff.toFixed(4)}`, {
                        metricsAvg: t.avgTheo,
                        manualAvg,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('dimension filter matches F.themeConsolidated for top themes', () => {
        const findings = [];
        const rows = getThemeMetrics(allGames);
        const topThemes = rows.sort((a, b) => b.count - a.count).slice(0, 10);

        for (const t of topThemes) {
            const viaF = allGames.filter(g => F.themeConsolidated(g) === t.theme).length;
            const viaFilter = allGames.filter(g => matchGameToDimension(g, 'theme', t.theme.toLowerCase())).length;
            if (viaF !== viaFilter && Math.abs(viaF - viaFilter) > viaF * 0.1) {
                findings.push(
                    scoreFinding(
                        'LIKELY',
                        'theme',
                        `${t.theme}: F.themeConsolidated count ${viaF} vs dimension-filter count ${viaFilter}`,
                        { theme: t.theme, viaF, viaFilter }
                    )
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Mechanics Table QA', () => {
    it('feature metrics counts reflect actual feature occurrence', () => {
        const findings = [];
        const rows = getFeatureMetrics(allGames);
        for (const f of rows.slice(0, 15)) {
            const manual = allGames.filter(g => parseFeatures(g.features).includes(f.feature)).length;
            if (manual !== f.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'feature', `${f.feature}: metrics count ${f.count} vs manual ${manual}`, {
                        feature: f.feature,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('feature avgTheo is positive for top features', () => {
        const rows = getFeatureMetrics(allGames);
        for (const f of rows.slice(0, 10)) {
            expect(f.avgTheo).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('Volatility Table QA', () => {
    it('volatility bands are non-overlapping', () => {
        const rows = getVolatilityMetrics(allGames);
        const names = rows.map(v => v.volatility);
        expect(new Set(names).size).toBe(names.length);
    });

    it('volatility counts match manual F.volatility grouping', () => {
        const findings = [];
        const rows = getVolatilityMetrics(allGames);
        for (const v of rows) {
            const manual = allGames.filter(g => F.volatility(g) === v.volatility).length;
            if (manual !== v.count) {
                findings.push(
                    scoreFinding(
                        'DEFINITE',
                        'volatility',
                        `${v.volatility}: metrics count ${v.count} vs manual ${manual}`,
                        { volatility: v.volatility }
                    )
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});
