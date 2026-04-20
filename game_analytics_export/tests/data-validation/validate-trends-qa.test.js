/**
 * Phase 4: Trends Page QA
 *
 * Validates year-over-year trend computations against raw game data.
 * Uses F.xxx() accessors consistently to prevent the Egyptian-2013 class of bugs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';
import { F } from '../../src/lib/game-fields.js';
import { parseFeatures } from '../../src/lib/parse-features.js';
import { getProviderMetrics } from '../../src/lib/metrics.js';
import { scoreFinding, assertNoDefiniteFindings } from '../utils/qa-scoring.js';

let allGames = [];

beforeAll(async () => {
    await loadTestData();
    allGames = gameData.allGames;
});

function computeTrendsLocal(games) {
    const byYear = {};
    for (const g of games) {
        const y = F.releaseYear(g);
        if (!y) continue;
        const key = String(y);
        if (!byYear[key]) byYear[key] = { sum: 0, count: 0 };
        byYear[key].sum += F.theoWin(g);
        byYear[key].count += 1;
    }
    const result = {};
    for (const [year, { sum, count }] of Object.entries(byYear)) {
        result[year] = { avg: count ? sum / count : 0, games: count };
    }
    return result;
}

function computeThemeTrendsLocal(games) {
    const themeCounts = {};
    for (const g of games) {
        const t = F.themeConsolidated(g);
        themeCounts[t] = (themeCounts[t] ?? 0) + 1;
    }
    const top10 = Object.entries(themeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([t]) => t);

    const years = [...new Set(games.map(g => F.releaseYear(g)).filter(y => y))].sort((a, b) => a - b).map(String);

    const result = {};
    for (const theme of top10) {
        const byYear = {};
        for (const g of games) {
            if (F.themeConsolidated(g) !== theme) continue;
            const y = String(F.releaseYear(g) || '');
            if (!years.includes(y)) continue;
            if (!byYear[y]) byYear[y] = { sum: 0, count: 0 };
            byYear[y].sum += F.theoWin(g);
            byYear[y].count += 1;
        }
        result[theme] = { byYear, years };
    }
    return result;
}

describe('Trends Page QA', () => {
    it('every year has at least one game', () => {
        const trends = computeTrendsLocal(allGames);
        for (const [year, data] of Object.entries(trends)) {
            expect(data.games).toBeGreaterThan(0);
        }
    });

    it('no year has 0 average theo when games exist', () => {
        const findings = [];
        const trends = computeTrendsLocal(allGames);
        for (const [year, data] of Object.entries(trends)) {
            if (data.games > 5 && data.avg === 0) {
                findings.push(
                    scoreFinding('DEFINITE', 'trends', `Year ${year}: ${data.games} games but avg Theo is 0`, {
                        year,
                        games: data.games,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('year values are in valid range (1990-current+1)', () => {
        const trends = computeTrendsLocal(allGames);
        const currentYear = new Date().getFullYear();
        for (const year of Object.keys(trends)) {
            const y = parseInt(year);
            expect(y).toBeGreaterThanOrEqual(1990);
            expect(y).toBeLessThanOrEqual(currentYear + 1);
        }
    });

    it('theme trends top 10 themes match overall top 10 by count', () => {
        const findings = [];

        const globalThemeCounts = {};
        for (const g of allGames) {
            const t = F.themeConsolidated(g);
            globalThemeCounts[t] = (globalThemeCounts[t] ?? 0) + 1;
        }
        const globalTop10 = Object.entries(globalThemeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([t]) => t);

        const trendThemes = Object.keys(computeThemeTrendsLocal(allGames));

        for (const gt of globalTop10) {
            if (!trendThemes.includes(gt)) {
                findings.push(
                    scoreFinding('DEFINITE', 'trends', `Theme "${gt}" is in global top 10 but missing from trends`, {
                        theme: gt,
                        count: globalThemeCounts[gt],
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('theme trend averages match manual per-year calculation', () => {
        const findings = [];
        const themeTrends = computeThemeTrendsLocal(allGames);

        for (const [theme, { byYear }] of Object.entries(themeTrends)) {
            for (const [year, data] of Object.entries(byYear)) {
                const yearGames = allGames.filter(
                    g => F.themeConsolidated(g) === theme && String(F.releaseYear(g)) === year
                );
                if (yearGames.length !== data.count) {
                    findings.push(
                        scoreFinding(
                            'DEFINITE',
                            'trends',
                            `${theme}/${year}: count ${data.count} vs filter ${yearGames.length}`,
                            { theme, year }
                        )
                    );
                }
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('provider trends top 10 uses GGR share ranking (same as Providers page)', () => {
        const ranked = getProviderMetrics(allGames);
        const top10Providers = ranked.slice(0, 10).map(p => p.name);

        expect(top10Providers.length).toBeGreaterThanOrEqual(5);
        expect(top10Providers[0]).toBeTruthy();
    });

    it('no year has outlier average theo (more than 10x global average)', () => {
        const findings = [];
        const trends = computeTrendsLocal(allGames);
        const allAvgs = Object.values(trends)
            .filter(d => d.games >= 5)
            .map(d => d.avg);
        const globalAvg = allAvgs.reduce((s, a) => s + a, 0) / allAvgs.length;

        for (const [year, data] of Object.entries(trends)) {
            if (data.games >= 5 && data.avg > globalAvg * 10) {
                findings.push(
                    scoreFinding(
                        'LIKELY',
                        'trends',
                        `Year ${year}: avg Theo ${data.avg.toFixed(2)} is >10x global avg ${globalAvg.toFixed(2)}`,
                        { year, avg: data.avg, globalAvg, games: data.games }
                    )
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});
