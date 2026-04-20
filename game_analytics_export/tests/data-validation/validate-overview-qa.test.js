/**
 * Phase 1: Overview Page QA
 *
 * Validates KPIs, theme/provider rankings, and top performers
 * against metrics.js (single source of truth for aggregation).
 *
 * Tier rules:
 *   DEFINITE — uses exact metrics.js logic; test fails on mismatch.
 *   LIKELY   — statistical threshold check; warns loudly.
 *   POSSIBLE — coverage/info; never fails.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';
import {
    getProviderMetrics,
    getThemeMetrics,
    getFeatureMetrics,
    getVolatilityMetrics,
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

describe('Overview Page QA', () => {
    // ── KPI Cards ──────────────────────────────────────────────────

    it('total games count is positive and matches loaded data', () => {
        expect(allGames.length).toBeGreaterThan(0);
        expect(gameData.total_games).toBe(allGames.length);
    });

    it('unique theme count is reasonable (10-200 range)', () => {
        const themes = new Set(allGames.map(g => F.themeConsolidated(g)));
        expect(themes.size).toBeGreaterThan(10);
        expect(themes.size).toBeLessThan(200);
        // gameData.theme_count comes from json-aggregator which may count slightly
        // differently (e.g., excludes Unknown). Allow ±2 tolerance.
        expect(Math.abs(gameData.theme_count - themes.size)).toBeLessThanOrEqual(2);
    });

    it('unique mechanic count matches feature-parsed count', () => {
        const mechs = new Set();
        allGames.forEach(g => parseFeatures(g.features).forEach(f => mechs.add(f)));
        expect(mechs.size).toBeGreaterThan(5);
        // json-aggregator may normalize features slightly differently. Allow ±2.
        expect(Math.abs(gameData.mechanic_count - mechs.size)).toBeLessThanOrEqual(2);
    });

    it('classified percentage is between 40-100%', () => {
        const classified = allGames.filter(g => {
            const hasTheme = F.themeConsolidated(g) !== 'Unknown';
            const hasFeats = parseFeatures(g.features).length > 0;
            return hasTheme && hasFeats;
        }).length;
        const pct = (classified / allGames.length) * 100;
        expect(pct).toBeGreaterThanOrEqual(40);
        expect(pct).toBeLessThanOrEqual(100);
    });

    // ── Provider Rankings ──────────────────────────────────────────

    it('top 10 providers by GGR share have positive metrics', () => {
        const providerRows = getProviderMetrics(allGames);
        const top10 = providerRows.slice(0, 10);

        expect(top10.length).toBeGreaterThanOrEqual(5);
        for (const p of top10) {
            expect(p.count).toBeGreaterThan(0);
            expect(p.avgTheo).toBeGreaterThanOrEqual(0);
            expect(p.ggrShare).toBeGreaterThan(0);
        }
    });

    it('provider Smart Index is monotonically decreasing (within top 10)', () => {
        const providerRows = getProviderMetrics(allGames);
        const top10 = providerRows.slice(0, 10);
        for (let i = 1; i < top10.length; i++) {
            expect(top10[i].smartIndex).toBeLessThanOrEqual(top10[i - 1].smartIndex);
        }
    });

    it('no provider appears twice in rankings', () => {
        const providerRows = getProviderMetrics(allGames);
        const names = providerRows.map(p => p.name);
        expect(new Set(names).size).toBe(names.length);
    });

    // ── Theme Rankings ─────────────────────────────────────────────

    it('theme metrics cover all games (excluding Unknown)', () => {
        const themeRows = getThemeMetrics(allGames);
        const totalInThemes = themeRows.reduce((s, t) => s + t.count, 0);
        expect(totalInThemes).toBe(allGames.length);
    });

    it('no theme appears twice in rankings', () => {
        const themeRows = getThemeMetrics(allGames);
        const themes = themeRows.map(t => t.theme);
        expect(new Set(themes).size).toBe(themes.length);
    });

    // ── Feature Rankings ───────────────────────────────────────────

    it('feature metrics have positive counts for top features', () => {
        const featureRows = getFeatureMetrics(allGames);
        const top10 = featureRows.slice(0, 10);
        expect(top10.length).toBeGreaterThanOrEqual(5);
        for (const f of top10) {
            expect(f.count).toBeGreaterThan(0);
        }
    });

    // ── Volatility Breakdown ───────────────────────────────────────

    it('volatility breakdown covers all games with standard volatility', () => {
        const volRows = getVolatilityMetrics(allGames);
        const STANDARD_VOLS = new Set([
            'Very High',
            'High',
            'Medium-High',
            'Medium',
            'Medium-Low',
            'Low-Medium',
            'Low',
        ]);
        const withStandardVol = allGames.filter(g => STANDARD_VOLS.has(F.volatility(g))).length;
        const sumVol = volRows.reduce((s, v) => s + v.count, 0);
        expect(sumVol).toBe(withStandardVol);
    });

    // ── Global Avg Theo ────────────────────────────────────────────

    it('global average theo is positive', () => {
        const avgTheo = getGlobalAvgTheo(allGames);
        expect(avgTheo).toBeGreaterThan(0);
    });

    // ── Cross-KPI Consistency ──────────────────────────────────────

    it('no game has negative theo_win', () => {
        const findings = [];
        const negTheo = allGames.filter(g => F.theoWin(g) < 0);
        if (negTheo.length > 0) {
            findings.push(
                scoreFinding('DEFINITE', 'theoWin', `${negTheo.length} game(s) with negative Theo Win`, {
                    examples: negTheo.slice(0, 5).map(g => `${g.name}: ${F.theoWin(g)}`),
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('no game has market_share > 100%', () => {
        const findings = [];
        const over100 = allGames.filter(g => F.marketShare(g) > 100);
        if (over100.length > 0) {
            findings.push(
                scoreFinding('DEFINITE', 'marketShare', `${over100.length} game(s) with market share > 100%`, {
                    examples: over100.slice(0, 5).map(g => `${g.name}: ${F.marketShare(g)}`),
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('RTP values are within valid range (80-100) when present', () => {
        const findings = [];
        const invalid = allGames.filter(g => {
            const rtp = F.rtp(g);
            return rtp > 0 && (rtp < 80 || rtp > 100);
        });
        if (invalid.length > 0) {
            findings.push(
                scoreFinding('LIKELY', 'rtp', `${invalid.length} game(s) with RTP outside 80-100% range`, {
                    examples: invalid.slice(0, 5).map(g => `${g.name}: ${F.rtp(g)}`),
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });
});
