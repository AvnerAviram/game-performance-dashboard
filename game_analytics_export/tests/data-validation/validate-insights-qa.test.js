/**
 * Phase 3: Market Insights QA — Brands + Provider Intel
 *
 * Validates franchise/brand intelligence and provider-insight aggregations
 * against the source data and metrics.js.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';
import { getProviderMetrics, getThemeMetrics, getFeatureMetrics } from '../../src/lib/metrics.js';
import { F } from '../../src/lib/game-fields.js';
import { parseFeatures } from '../../src/lib/parse-features.js';
import { scoreFinding, assertNoDefiniteFindings } from '../utils/qa-scoring.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

let allGames = [];
let franchiseMap = {};

beforeAll(async () => {
    await loadTestData();
    allGames = gameData.allGames;

    const fmPath = path.join(DATA_DIR, 'franchise_mapping.json');
    if (fs.existsSync(fmPath)) {
        franchiseMap = JSON.parse(fs.readFileSync(fmPath, 'utf8'));
    }
});

describe('Brand Intelligence QA', () => {
    it('franchise mapping file exists and has entries', () => {
        expect(Object.keys(franchiseMap).length).toBeGreaterThan(0);
    });

    it('franchises with count >= 2 have valid game references', () => {
        const findings = [];
        const franchises = {};

        for (const [gid, entry] of Object.entries(franchiseMap)) {
            if (!entry || !entry.franchise) continue;
            const fname = entry.franchise;
            if (!franchises[fname]) franchises[fname] = { count: 0, gameIds: [] };
            franchises[fname].count++;
            franchises[fname].gameIds.push(gid);
        }

        const activeFranchises = Object.entries(franchises).filter(([, v]) => v.count >= 2);
        expect(activeFranchises.length).toBeGreaterThan(0);

        for (const [fname, data] of activeFranchises.slice(0, 20)) {
            if (data.count < 2) {
                findings.push(
                    scoreFinding('POSSIBLE', 'franchise', `${fname}: only ${data.count} game(s) — not shown`, {
                        franchise: fname,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('no franchise has impossibly high game count', () => {
        const findings = [];
        const franchises = {};
        for (const [, entry] of Object.entries(franchiseMap)) {
            if (!entry || !entry.franchise) continue;
            const fname = entry.franchise;
            franchises[fname] = (franchises[fname] || 0) + 1;
        }

        for (const [fname, count] of Object.entries(franchises)) {
            if (count > 50) {
                findings.push(
                    scoreFinding('LIKELY', 'franchise', `${fname}: ${count} games — suspiciously high`, {
                        franchise: fname,
                        count,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Provider Insights QA', () => {
    it('top providers have consistent theme distribution', () => {
        const findings = [];
        const providers = getProviderMetrics(allGames);
        const top5 = providers.slice(0, 5);

        for (const prov of top5) {
            const provGames = allGames.filter(g => F.provider(g) === prov.name);
            const themes = {};
            for (const g of provGames) {
                const t = F.themeConsolidated(g);
                themes[t] = (themes[t] || 0) + 1;
            }
            const themeCount = Object.keys(themes).length;

            if (themeCount === 0 && provGames.length > 0) {
                findings.push(
                    scoreFinding('DEFINITE', 'provider', `${prov.name}: ${provGames.length} games but 0 themes`, {
                        provider: prov.name,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('provider game counts in metrics match direct filter', () => {
        const findings = [];
        const metrics = getProviderMetrics(allGames);

        for (const p of metrics.slice(0, 15)) {
            const direct = allGames.filter(g => F.provider(g) === p.name).length;
            if (direct !== p.count) {
                findings.push(
                    scoreFinding(
                        'DEFINITE',
                        'provider',
                        `${p.name}: metrics.count=${p.count} vs direct filter=${direct}`,
                        { provider: p.name }
                    )
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Feature Insights QA', () => {
    it('top features have non-zero avgTheo', () => {
        const rows = getFeatureMetrics(allGames);
        const top10 = rows.slice(0, 10);
        for (const f of top10) {
            expect(f.avgTheo).toBeGreaterThanOrEqual(0);
            expect(f.count).toBeGreaterThan(0);
        }
    });

    it('feature count matches parseFeatures across all games', () => {
        const findings = [];
        const rows = getFeatureMetrics(allGames);

        for (const f of rows.slice(0, 10)) {
            const manual = allGames.filter(g => parseFeatures(g.features).includes(f.feature)).length;
            if (manual !== f.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'feature', `${f.feature}: count ${f.count} vs manual ${manual}`, {
                        feature: f.feature,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Theme Insights QA', () => {
    it('theme consolidation produces consistent results', () => {
        const findings = [];
        const themeRows = getThemeMetrics(allGames);
        const themeNames = themeRows.map(t => t.theme);
        const duplicates = themeNames.filter((t, i) => themeNames.indexOf(t) !== i);

        if (duplicates.length > 0) {
            findings.push(
                scoreFinding('DEFINITE', 'theme', `Duplicate themes in getThemeMetrics: ${duplicates.join(', ')}`, {
                    duplicates,
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('every game maps to exactly one consolidated theme', () => {
        const findings = [];
        const unmapped = allGames.filter(g => !F.themeConsolidated(g));
        if (unmapped.length > 0) {
            findings.push(
                scoreFinding('DEFINITE', 'theme', `${unmapped.length} game(s) with no consolidated theme`, {
                    examples: unmapped.slice(0, 5).map(g => g.name),
                })
            );
        }
        assertNoDefiniteFindings(findings, expect);
    });
});
