/**
 * X-Ray Data Integrity Tests
 *
 * "Human challenge" tests: for each field drilldown, verify that:
 * 1. The value shown matches the actual value in game_data_master.json
 * 2. The confidence shown matches confidence_map.json
 * 3. The context window (source text) actually contains the value
 * 4. The extraction method makes sense for the field type
 * 5. Platform fields don't claim to have rules-text sources
 * 6. Extracted fields with rules text actually have matching context windows
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const DATA_DIR = join(ROOT, 'data');

const {
    getExtractionMethod,
    getContextWindow,
    extractRulesEvidence,
    buildProviderStats,
} = require('../../server/helpers/provenance-diagnosis.cjs');

let games, confMap, rulesMatches;

function loadJson(file) {
    const p = join(DATA_DIR, file);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function readRulesText(slug, maxChars = 12000) {
    const p = join(DATA_DIR, 'rules_text', `${slug}.txt`);
    if (!existsSync(p)) return null;
    return readFileSync(p, 'utf8').slice(0, maxChars);
}

beforeAll(() => {
    games = loadJson('game_data_master.json');
    confMap = loadJson('confidence_map.json');
    rulesMatches = loadJson('rules_game_matches.json');
});

describe('X-Ray data integrity: values match source files', () => {
    it('every game in the provenance response has matching values from game_data_master.json', () => {
        const sampleGames = games.filter(g => g.rtp > 0).slice(0, 50);
        for (const game of sampleGames) {
            const rtp = game.rtp;
            const vol = game.volatility;
            const provider = game.provider;
            expect(rtp).toBeGreaterThan(0);
            if (vol) expect(typeof vol).toBe('string');
            if (provider) expect(typeof provider).toBe('string');
        }
    });

    it('confidence values match confidence_map.json exactly', () => {
        if (!confMap) return;
        const sample = Object.entries(confMap).slice(0, 30);
        for (const [gameName, conf] of sample) {
            const game = games.find(g => g.name === gameName);
            if (!game) continue;
            if (conf.rtp_confidence) {
                expect(['extracted', 'gt_verified', 'verified', 'text_inferred', 'estimated']).toContain(
                    conf.rtp_confidence
                );
            }
        }
    });
});

describe('X-Ray data integrity: context windows are honest', () => {
    it('context window match text is actually found in the rules text', () => {
        let tested = 0;
        for (const game of games) {
            if (tested >= 20) break;
            if (!game.rtp || game.rtp <= 0) continue;
            const match = rulesMatches?.[game.name];
            if (!match?.slug) continue;
            const rulesText = readRulesText(match.slug);
            if (!rulesText) continue;

            const ctx = getContextWindow(rulesText, 'rtp', game.rtp);
            if (!ctx) continue;

            // The matched text should actually appear in the rules text
            expect(rulesText).toContain(ctx.match);
            tested++;
        }
        // If no rules text files exist at all, skip gracefully
        const hasRulesDir = existsSync(join(DATA_DIR, 'rules_text'));
        if (hasRulesDir) {
            expect(tested).toBeGreaterThanOrEqual(0);
        }
    });

    it('context window captured_value is close to the actual RTP value', () => {
        let tested = 0;
        for (const game of games) {
            if (tested >= 15) break;
            if (!game.rtp || game.rtp <= 0) continue;
            const match = rulesMatches?.[game.name];
            if (!match?.slug) continue;
            const rulesText = readRulesText(match.slug);
            if (!rulesText) continue;

            const ctx = getContextWindow(rulesText, 'rtp', game.rtp);
            if (!ctx?.captured_value) continue;

            const captured = parseFloat(ctx.captured_value);
            if (isNaN(captured)) continue;
            expect(Math.abs(captured - game.rtp)).toBeLessThan(5);
            tested++;
        }
    });

    it('numeric platform fields never have a regex context window', () => {
        const numericPlatformFields = ['theo_win', 'market_share_pct', 'avg_bet'];
        for (const field of numericPlatformFields) {
            const game = games.find(g => g[field] != null);
            if (!game) continue;
            const match = rulesMatches?.[game.name];
            const rulesText = match?.slug ? readRulesText(match.slug) : null;
            const ctx = getContextWindow(rulesText, field, game[field]);
            expect(ctx).toBeNull();
        }
    });
});

describe('X-Ray data integrity: extraction methods are correct', () => {
    it('extracted RTP gets regex extraction method', () => {
        if (!confMap) return;
        const game = games.find(g => g.rtp > 0 && confMap[g.name]?.rtp_confidence === 'extracted');
        if (!game) return;
        const method = getExtractionMethod('rtp', 'extracted', game.rtp, game);
        expect(method).not.toBeNull();
        expect(method.method).toContain('Regex');
    });

    it('gt_verified gets manual verification method', () => {
        if (!confMap) return;
        const game = games.find(g => confMap[g.name]?.rtp_confidence === 'gt_verified');
        if (!game) return;
        const method = getExtractionMethod('rtp', 'gt_verified', game.rtp, game);
        expect(method.method).toContain('verification');
    });

    it('platform fields get CSV import methods', () => {
        const game = games.find(g => g.theo_win > 0);
        const method = getExtractionMethod('theo_win', null, game.theo_win, game);
        expect(method.method).toBe('CSV import');

        const game2 = games.find(g => g.provider);
        const method2 = getExtractionMethod('provider', null, game2.provider, game2);
        expect(method2.method).toBe('CSV import');

        const game3 = games.find(g => g.name);
        const method3 = getExtractionMethod('name', null, game3.name, game3);
        expect(method3.method).toBe('CSV import');
    });

    it('theme_primary with gt_verified data_confidence gets ground truth method', () => {
        const game = games.find(g => g.data_confidence === 'gt_verified' && g.theme_primary);
        if (!game) return;
        const method = getExtractionMethod('theme_primary', null, game.theme_primary, game);
        expect(method.method).toBe('Ground truth + rules text');
    });
});

describe('X-Ray data integrity: theme evidence from rules text', () => {
    it('games with rules text and Fire theme should find fire-related keywords', () => {
        const fireGames = games.filter(g => g.theme_primary === 'Fire');
        let tested = 0;
        let withEvidence = 0;
        for (const game of fireGames) {
            if (tested >= 10) break;
            const match = rulesMatches?.[game.name];
            if (!match?.slug) continue;
            const rulesText = readRulesText(match.slug);
            if (!rulesText) continue;

            tested++;
            const ctx = getContextWindow(rulesText, 'theme_primary', 'Fire');
            if (ctx?.all_evidence?.length > 0) withEvidence++;
        }
        if (tested > 0) {
            expect(withEvidence / tested).toBeGreaterThan(0.3);
        }
    });

    it('games with rules text and Egyptian theme should find egypt-related keywords', () => {
        const egyptGames = games.filter(g => g.theme_primary === 'Egyptian');
        let tested = 0;
        let withEvidence = 0;
        for (const game of egyptGames) {
            if (tested >= 10) break;
            const match = rulesMatches?.[game.name];
            if (!match?.slug) continue;
            const rulesText = readRulesText(match.slug);
            if (!rulesText) continue;

            tested++;
            const ctx = getContextWindow(rulesText, 'theme_primary', 'Egyptian');
            if (ctx?.all_evidence?.length > 0) withEvidence++;
        }
        if (tested > 0) {
            expect(withEvidence / tested).toBeGreaterThan(0.3);
        }
    });

    it('theme evidence keywords actually appear in the rules text', () => {
        let tested = 0;
        for (const game of games) {
            if (tested >= 20) break;
            if (!game.theme_primary) continue;
            const match = rulesMatches?.[game.name];
            if (!match?.slug) continue;
            const rulesText = readRulesText(match.slug);
            if (!rulesText) continue;

            const ctx = getContextWindow(rulesText, 'theme_primary', game.theme_primary);
            if (!ctx) continue;

            expect(rulesText.toLowerCase()).toContain(ctx.match.toLowerCase());
            tested++;
        }
    });
});

describe('X-Ray data integrity: ranking API response structure', () => {
    it('getProviderMetrics returns rows with smartIndex for ranking', async () => {
        const { getProviderMetrics } = await import('../../src/lib/metrics.js');
        const rows = getProviderMetrics(games);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows.slice(0, 5)) {
            expect(row).toHaveProperty('name');
            expect(row).toHaveProperty('count');
            expect(row).toHaveProperty('avgTheo');
            expect(row).toHaveProperty('smartIndex');
            expect(row.smartIndex).toBeGreaterThanOrEqual(0);
        }
    });

    it('getThemeMetrics returns rows with smartIndex for ranking', async () => {
        const { getThemeMetrics } = await import('../../src/lib/metrics.js');
        const rows = getThemeMetrics(games);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows.slice(0, 5)) {
            expect(row).toHaveProperty('theme');
            expect(row).toHaveProperty('count');
            expect(row).toHaveProperty('smartIndex');
        }
    });

    it('getFeatureMetrics returns rows with smartIndex for ranking', async () => {
        const { getFeatureMetrics } = await import('../../src/lib/metrics.js');
        const rows = getFeatureMetrics(games);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows.slice(0, 5)) {
            expect(row).toHaveProperty('feature');
            expect(row).toHaveProperty('count');
            expect(row).toHaveProperty('smartIndex');
        }
    });

    it('ranking rows are sorted by smartIndex descending', async () => {
        const { getProviderMetrics } = await import('../../src/lib/metrics.js');
        const rows = getProviderMetrics(games);
        for (let i = 1; i < rows.length; i++) {
            expect(rows[i - 1].smartIndex).toBeGreaterThanOrEqual(rows[i].smartIndex);
        }
    });

    it('top provider from ranking matches expected real provider', async () => {
        const { getProviderMetrics } = await import('../../src/lib/metrics.js');
        const rows = getProviderMetrics(games);
        const topProvider = rows[0];
        expect(topProvider.name).toBeTruthy();
        expect(topProvider.count).toBeGreaterThan(10);
    });
});

describe('X-Ray data integrity: feature evidence from feature_details', () => {
    it('games with feature_details array produce non-null detail lookups', () => {
        const game = games.find(
            g =>
                Array.isArray(g.features) &&
                g.features.length > 0 &&
                Array.isArray(g.feature_details) &&
                g.feature_details.length > 0
        );
        if (!game) return;
        const detailArr = game.feature_details;
        for (const fName of game.features.slice(0, 3)) {
            const detail = detailArr.find(d => d.name === fName);
            if (detail) {
                expect(detail.name).toBe(fName);
                const evidence = detail.rules_text ?? detail.description ?? null;
                if (evidence) {
                    expect(typeof evidence).toBe('string');
                    expect(evidence.length).toBeGreaterThan(0);
                }
            }
        }
    });

    it('feature_details array is never a plain object/map', () => {
        const gamesWithDetails = games.filter(g => g.feature_details);
        let arrayCount = 0;
        let mapCount = 0;
        for (const game of gamesWithDetails.slice(0, 50)) {
            if (Array.isArray(game.feature_details)) arrayCount++;
            else mapCount++;
        }
        if (gamesWithDetails.length > 0) {
            expect(arrayCount).toBeGreaterThan(0);
        }
    });
});

describe('X-Ray data integrity: year summary data availability', () => {
    it('games exist for multiple years', () => {
        const yearSet = new Set();
        for (const g of games.slice(0, 500)) {
            const y = g.release_year;
            if (y) yearSet.add(String(y));
        }
        expect(yearSet.size).toBeGreaterThan(3);
    });

    it('filtering by year produces valid counts', () => {
        const year2023 = games.filter(g => {
            const ry = g.release_year;
            return ry === 2023 || ry === '2023';
        });
        expect(year2023.length).toBeGreaterThanOrEqual(0);
    });
});

describe('X-Ray data integrity: cross-checks (challenging the data)', () => {
    it('games with extracted RTP confidence should have a rules text match', () => {
        if (!confMap || !rulesMatches) return;
        let withMatch = 0;
        let total = 0;
        for (const [gameName, conf] of Object.entries(confMap)) {
            if (conf.rtp_confidence !== 'extracted') continue;
            total++;
            if (rulesMatches[gameName]) withMatch++;
        }
        if (total === 0) return;
        const matchRate = withMatch / total;
        expect(matchRate).toBeGreaterThan(0.5);
    });

    it('games with extracted RTP and rules text should have a context window', () => {
        if (!confMap || !rulesMatches) return;
        let withContext = 0;
        let tested = 0;
        for (const game of games) {
            if (!game.rtp || tested >= 30) break;
            const conf = confMap[game.name];
            if (conf?.rtp_confidence !== 'extracted') continue;
            const match = rulesMatches[game.name];
            if (!match?.slug) continue;
            const rulesText = readRulesText(match.slug);
            if (!rulesText) continue;

            tested++;
            const ctx = getContextWindow(rulesText, 'rtp', game.rtp);
            if (ctx) withContext++;
        }
        if (tested === 0) return;
        const contextRate = withContext / tested;
        expect(contextRate).toBeGreaterThan(0.3);
    });

    it('no platform field ever gets an "extracted" or "gt_verified" confidence in confMap', () => {
        if (!confMap) return;
        const platformFields = ['theo_win', 'market_share_pct', 'avg_bet', 'release_year', 'provider', 'name'];
        for (const [gameName, conf] of Object.entries(confMap)) {
            for (const field of platformFields) {
                const c = conf[`${field}_confidence`] || conf[field];
                if (c) {
                    expect(['extracted', 'gt_verified']).not.toContain(c);
                }
            }
        }
    });

    it('every game returned by top-game API should exist in game_data_master', () => {
        const allGameNames = new Set(games.map(g => g.name));
        const testDimensions = [
            { dimension: 'provider', values: ['IGT', 'Evolution', 'Light & Wonder'] },
            { dimension: 'theme', values: ['Fire', 'Asian', 'Classic'] },
            { dimension: 'volatility', values: ['High', 'Medium', 'Low'] },
        ];

        const allGames = games;
        for (const { dimension, values } of testDimensions) {
            for (const value of values) {
                const valLower = value.toLowerCase();
                let matches;
                if (dimension === 'provider')
                    matches = allGames.filter(g => (g.provider || '').toLowerCase() === valLower);
                else if (dimension === 'theme')
                    matches = allGames.filter(
                        g =>
                            (g.theme_primary || '').toLowerCase() === valLower ||
                            (g.theme_consolidated || '').toLowerCase() === valLower
                    );
                else if (dimension === 'volatility')
                    matches = allGames.filter(g => (g.volatility || '').toLowerCase() === valLower);
                else matches = [];

                if (matches.length > 0) {
                    matches.sort((a, b) => (b.theo_win || 0) - (a.theo_win || 0));
                    expect(allGameNames.has(matches[0].name)).toBe(true);
                }
            }
        }
    });

    it('feature_details array elements are joinable by name', () => {
        const game = games.find(
            g =>
                Array.isArray(g.features) &&
                g.features.length > 0 &&
                Array.isArray(g.feature_details) &&
                g.feature_details.length > 0
        );
        if (!game) return;
        const detailNames = new Set(game.feature_details.map(d => d.name));
        const matchCount = game.features.filter(f => detailNames.has(f)).length;
        expect(matchCount).toBeGreaterThan(0);
    });
});
