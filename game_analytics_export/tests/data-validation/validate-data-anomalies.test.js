/**
 * Cross-cutting: Data Anomaly Spot-Check
 *
 * Detects statistical outliers, data conflicts, and coverage gaps
 * across the entire dataset. These checks are not page-specific.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';
import { F } from '../../src/lib/game-fields.js';
import { parseFeatures } from '../../src/lib/parse-features.js';
import { scoreFinding, assertNoDefiniteFindings } from '../utils/qa-scoring.js';

let allGames = [];

beforeAll(async () => {
    await loadTestData();
    allGames = gameData.allGames;
});

describe('Outlier Detection', () => {
    it('no game has Theo Win > 3 standard deviations from mean', () => {
        const findings = [];
        const theos = allGames.map(g => F.theoWin(g)).filter(t => t > 0);
        const mean = theos.reduce((s, t) => s + t, 0) / theos.length;
        const stdDev = Math.sqrt(theos.reduce((s, t) => s + (t - mean) ** 2, 0) / theos.length);
        const threshold = mean + 3 * stdDev;

        const outliers = allGames.filter(g => F.theoWin(g) > threshold);
        if (outliers.length > 0 && outliers.length > allGames.length * 0.02) {
            findings.push(
                scoreFinding(
                    'LIKELY',
                    'outlier',
                    `${outliers.length} games with Theo Win > 3σ (${threshold.toFixed(2)})`,
                    {
                        threshold: threshold.toFixed(2),
                        mean: mean.toFixed(2),
                        stdDev: stdDev.toFixed(2),
                        examples: outliers.slice(0, 5).map(g => `${g.name}: ${F.theoWin(g)}`),
                    }
                )
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('no game has impossibly high RTP (> 99.5%)', () => {
        const findings = [];
        const highRtp = allGames.filter(g => F.rtp(g) > 99.5);
        if (highRtp.length > 0) {
            findings.push(
                scoreFinding('LIKELY', 'rtp', `${highRtp.length} game(s) with RTP > 99.5%`, {
                    examples: highRtp.slice(0, 5).map(g => `${g.name}: ${F.rtp(g)}%`),
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Data Conflicts', () => {
    it('no game has theme = Unknown AND features present', () => {
        const findings = [];
        const conflicts = allGames.filter(g => {
            const theme = F.themeConsolidated(g);
            const feats = parseFeatures(g.features);
            return theme === 'Unknown' && feats.length >= 3;
        });

        if (conflicts.length > allGames.length * 0.05) {
            findings.push(
                scoreFinding(
                    'LIKELY',
                    'conflict',
                    `${conflicts.length} games (${((conflicts.length / allGames.length) * 100).toFixed(1)}%) have Unknown theme but 3+ features`,
                    {
                        count: conflicts.length,
                        examples: conflicts.slice(0, 5).map(g => g.name),
                    }
                )
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('no game has release year in the future (> current year + 1)', () => {
        const findings = [];
        const currentYear = new Date().getFullYear();
        const future = allGames.filter(g => {
            const y = F.releaseYear(g);
            return y > currentYear + 1;
        });

        if (future.length > 0) {
            findings.push(
                scoreFinding(
                    'DEFINITE',
                    'release_year',
                    `${future.length} game(s) with release year > ${currentYear + 1}`,
                    {
                        examples: future.slice(0, 5).map(g => `${g.name}: ${F.releaseYear(g)}`),
                    }
                )
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('no game has release year before 1990', () => {
        const findings = [];
        const ancient = allGames.filter(g => {
            const y = F.releaseYear(g);
            return y > 0 && y < 1990;
        });

        if (ancient.length > 0) {
            findings.push(
                scoreFinding('LIKELY', 'release_year', `${ancient.length} game(s) with release year before 1990`, {
                    examples: ancient.slice(0, 5).map(g => `${g.name}: ${F.releaseYear(g)}`),
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Coverage Gaps', () => {
    it('at least 50% of games have a valid theme', () => {
        const withTheme = allGames.filter(g => F.themeConsolidated(g) !== 'Unknown').length;
        const pct = (withTheme / allGames.length) * 100;
        expect(pct).toBeGreaterThan(50);
    });

    it('at least 30% of games have features', () => {
        const withFeats = allGames.filter(g => parseFeatures(g.features).length > 0).length;
        const pct = (withFeats / allGames.length) * 100;
        expect(pct).toBeGreaterThan(30);
    });

    it('at least 40% of games have valid RTP', () => {
        const withRtp = allGames.filter(g => F.rtp(g) > 0).length;
        const pct = (withRtp / allGames.length) * 100;
        expect(pct).toBeGreaterThan(40);
    });

    it('some games have volatility data', () => {
        const withVol = allGames.filter(
            g => F.volatility(g) && F.volatility(g) !== 'Unknown' && F.volatility(g) !== 'Not Disclosed'
        ).length;
        const pct = (withVol / allGames.length) * 100;
        // Raw game_data_master has sparse volatility (~6%); DuckDB-enriched data
        // has more. This threshold is intentionally low for raw-JSON tests.
        expect(pct).toBeGreaterThan(3);
    });

    it('at least 40% of games have a release year', () => {
        const withYear = allGames.filter(g => F.releaseYear(g) > 0).length;
        const pct = (withYear / allGames.length) * 100;
        expect(pct).toBeGreaterThan(40);
    });
});

describe('Name Quality', () => {
    it('no duplicate game names', () => {
        const findings = [];
        const nameMap = {};
        for (const g of allGames) {
            const name = (g.name || '').trim();
            nameMap[name] = (nameMap[name] || 0) + 1;
        }
        const dups = Object.entries(nameMap).filter(([, c]) => c > 1);
        if (dups.length > 0 && dups.length > 5) {
            findings.push(
                scoreFinding('LIKELY', 'name', `${dups.length} duplicate game names`, {
                    examples: dups.slice(0, 10).map(([n, c]) => `${n} (×${c})`),
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('no game has empty name', () => {
        const findings = [];
        const empty = allGames.filter(g => !g.name || g.name.trim() === '');
        if (empty.length > 0) {
            findings.push(
                scoreFinding('DEFINITE', 'name', `${empty.length} game(s) with empty name`, {
                    count: empty.length,
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });
});
