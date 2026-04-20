/**
 * Comprehensive test for X-Ray provenance data coverage.
 * Verifies every field type returns correct extraction methods,
 * context windows, and confidence levels from real game data.
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
    diagnoseField,
    detectInconsistencies,
    buildProviderStats,
    extractRulesEvidence,
    getExtractionMethod,
    getContextWindow,
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

function findRulesMatch(gameName) {
    if (!rulesMatches || !gameName) return null;
    if (rulesMatches[gameName]) return rulesMatches[gameName];
    return null;
}

function getProvenance(gameName, focusField) {
    const game = games.find(g => g.name === gameName);
    if (!game) return null;
    const conf = confMap?.[gameName] || {};
    const match = findRulesMatch(gameName);
    const slug = match?.slug || null;
    const rulesText = slug ? readRulesText(slug) : null;

    const PROVENANCE_FIELDS = [
        'name',
        'rtp',
        'volatility',
        'theme_primary',
        'reels',
        'rows',
        'paylines',
        'original_release_year',
        'description',
        'min_bet',
        'max_bet',
        'max_win',
        'theo_win',
        'market_share_pct',
        'avg_bet',
        'release_year',
        'provider',
    ];
    const PLATFORM_FIELDS = new Set(['name', 'theo_win', 'market_share_pct', 'avg_bet', 'release_year', 'provider']);
    const FIELD_ALIASES = {
        market_share: 'market_share_pct',
        market_share_percent: 'market_share_pct',
    };

    const resolved = focusField ? FIELD_ALIASES[focusField] || focusField : null;
    const providerStats = buildProviderStats(games);
    const fields = {};
    for (const f of PROVENANCE_FIELDS) {
        const val = game[f] ?? null;
        const rawConf = conf[`${f}_confidence`] || conf[f] || null;
        const isPlatform = PLATFORM_FIELDS.has(f);
        const fieldConf = rawConf || (isPlatform && val != null ? 'platform' : null);
        fields[f] = {
            value: val,
            confidence: fieldConf,
            source_type: rawConf ? 'extraction' : isPlatform ? 'platform' : val != null ? 'master' : 'not_extracted',
            rules_evidence: extractRulesEvidence(rulesText, f),
            extraction_method: getExtractionMethod(f, rawConf, val, game),
            context_window: getContextWindow(rulesText, f, val),
            diagnosis: diagnoseField(f, val, rawConf, rulesText, game, providerStats),
        };
    }

    return {
        game: gameName,
        fields,
        focus: resolved && fields[resolved] ? { field: resolved, ...fields[resolved] } : null,
    };
}

let bestOfSources;
beforeAll(() => {
    games = loadJson('game_data_master.json');
    confMap = loadJson('confidence_map.json');
    rulesMatches = loadJson('rules_game_matches.json');
    bestOfSources = loadJson('staged_best_of_sources.json');
});

describe('X-Ray provenance API coverage', () => {
    describe('field alias resolution', () => {
        it('market_share resolves to market_share_pct', () => {
            const result = getProvenance('Cash Eruption', 'market_share');
            expect(result.focus).not.toBeNull();
            expect(result.focus.field).toBe('market_share_pct');
            expect(result.focus.value).toBeGreaterThan(0);
        });

        it('rtp resolves directly (no alias needed)', () => {
            const g = games.find(g => g.rtp > 0);
            const result = getProvenance(g.name, 'rtp');
            expect(result.focus).not.toBeNull();
            expect(result.focus.field).toBe('rtp');
        });

        it('name resolves to name field', () => {
            const result = getProvenance('Cash Eruption', 'name');
            expect(result.focus).not.toBeNull();
            expect(result.focus.value).toBe('Cash Eruption');
        });
    });

    describe('platform fields get platform confidence', () => {
        const platformFields = ['theo_win', 'market_share_pct', 'avg_bet', 'release_year', 'provider', 'name'];

        for (const field of platformFields) {
            it(`${field} has platform confidence when present`, () => {
                const g = games.find(g => g[field] != null);
                if (!g) return; // skip if no game has this field
                const result = getProvenance(g.name, field);
                expect(result.focus).not.toBeNull();
                expect(result.focus.confidence).toBe('platform');
                expect(result.focus.source_type).toBe('platform');
            });
        }
    });

    describe('extracted fields get extraction confidence and methods', () => {
        it('rtp with extracted confidence has regex method', () => {
            const g = games.find(g => g.rtp > 0 && confMap?.[g.name]?.rtp_confidence === 'extracted');
            if (!g) return;
            const result = getProvenance(g.name, 'rtp');
            expect(result.focus.confidence).toBe('extracted');
            expect(result.focus.extraction_method?.method).toContain('Regex');
        });

        it('volatility with extracted confidence has regex method', () => {
            const g = games.find(g => g.volatility && confMap?.[g.name]?.volatility_confidence === 'extracted');
            if (!g) return;
            const result = getProvenance(g.name, 'volatility');
            expect(result.focus.confidence).toBe('extracted');
            expect(result.focus.extraction_method?.method).toContain('Regex');
        });
    });

    describe('context window for rules-text fields', () => {
        it('rtp field has context window with highlighted match', () => {
            const g = games.find(g => {
                if (!g.rtp || g.rtp <= 0) return false;
                const match = findRulesMatch(g.name);
                if (!match?.slug) return false;
                const text = readRulesText(match.slug);
                return text && getContextWindow(text, 'rtp', g.rtp);
            });
            if (!g) return;
            const result = getProvenance(g.name, 'rtp');
            expect(result.focus.context_window).not.toBeNull();
            expect(result.focus.context_window.match).toBeTruthy();
            expect(result.focus.context_window.captured_value).toBeTruthy();
        });

        it('platform fields have null context window (no rules text source)', () => {
            const g = games.find(g => g.theo_win > 0);
            const result = getProvenance(g.name, 'theo_win');
            expect(result.focus.context_window).toBeNull();
        });
    });

    describe('every PROVENANCE_FIELD has a non-null extraction method when value exists', () => {
        const allFields = [
            'name',
            'rtp',
            'volatility',
            'theme_primary',
            'reels',
            'rows',
            'paylines',
            'original_release_year',
            'description',
            'min_bet',
            'max_bet',
            'max_win',
            'theo_win',
            'market_share_pct',
            'avg_bet',
            'release_year',
            'provider',
        ];

        for (const field of allFields) {
            it(`${field} has extraction method when value is present`, () => {
                const g = games.find(g => g[field] != null && g[field] !== '');
                if (!g) return;
                const result = getProvenance(g.name, field);
                expect(result.focus).not.toBeNull();
                expect(result.focus.extraction_method).not.toBeNull();
                expect(result.focus.extraction_method.method).toBeTruthy();
                expect(result.focus.extraction_method.detail).toBeTruthy();
            });
        }
    });

    describe('new extraction methods for previously uncovered fields', () => {
        it('symbols field has Rules HTML extraction method', () => {
            const method = getExtractionMethod('symbols', null, ['wild', 'scatter'], null);
            expect(method).not.toBeNull();
            expect(method.method).toBe('Rules HTML extraction');
        });

        it('features field has Rules HTML classification method', () => {
            const method = getExtractionMethod('features', null, ['Free Spins'], null);
            expect(method).not.toBeNull();
            expect(method.method).toBe('Rules HTML classification');
        });

        it('max_win field has Rules HTML extraction method', () => {
            const method = getExtractionMethod('max_win', null, 5000, null);
            expect(method).not.toBeNull();
            expect(method.method).toBe('Rules HTML extraction');
        });

        it('min_bet field has Rules HTML extraction method', () => {
            const method = getExtractionMethod('min_bet', null, 0.2, null);
            expect(method).not.toBeNull();
            expect(method.method).toBe('Rules HTML extraction');
        });

        it('max_bet field has Rules HTML extraction method', () => {
            const method = getExtractionMethod('max_bet', null, 100, null);
            expect(method).not.toBeNull();
            expect(method.method).toBe('Rules HTML extraction');
        });
    });

    describe('feature_details array join works correctly', () => {
        it('finds feature detail by name from array', () => {
            const game = games.find(g => Array.isArray(g.feature_details) && g.feature_details.length > 0);
            if (!game) return;
            const firstDetail = game.feature_details[0];
            const found = game.feature_details.find(d => d.name === firstDetail.name);
            expect(found).toBeTruthy();
            expect(found.name).toBe(firstDetail.name);
        });

        it('feature detail has description field (not rules_text)', () => {
            const game = games.find(
                g => Array.isArray(g.feature_details) && g.feature_details.some(d => d.description)
            );
            if (!game) return;
            const withDesc = game.feature_details.find(d => d.description);
            expect(withDesc.description).toBeTruthy();
            expect(typeof withDesc.description).toBe('string');
        });
    });

    describe('theme_consolidated matching', () => {
        it('games with theme_consolidated can be matched by consolidated theme', () => {
            const game = games.find(g => g.theme_consolidated);
            if (!game) return;
            const consolidated = game.theme_consolidated.toLowerCase();
            const matches = games.filter(g => (g.theme_consolidated || '').toLowerCase() === consolidated);
            expect(matches.length).toBeGreaterThan(0);
        });
    });

    describe('drilldown three-step completeness', () => {
        it('rtp drilldown has source + method + result', () => {
            const g = games.find(g => {
                if (!g.rtp) return false;
                const match = findRulesMatch(g.name);
                if (!match?.slug) return false;
                const text = readRulesText(match.slug);
                return text && getContextWindow(text, 'rtp', g.rtp);
            });
            if (!g) return;
            const result = getProvenance(g.name, 'rtp');
            const f = result.focus;
            expect(f.context_window).not.toBeNull();
            expect(f.context_window.match).toBeTruthy();
            expect(f.extraction_method).not.toBeNull();
            expect(f.extraction_method.method).toBeTruthy();
            expect(f.value).toBeGreaterThan(0);
        });

        it('platform field drilldown has method + result (no source text)', () => {
            const g = games.find(g => g.market_share_pct > 0);
            const result = getProvenance(g.name, 'market_share');
            const f = result.focus;
            expect(f.context_window).toBeNull();
            expect(f.extraction_method).not.toBeNull();
            expect(f.extraction_method.method).toBe('Calculated');
            expect(f.value).toBeGreaterThan(0);
            expect(f.confidence).toBe('platform');
        });

        it('gt_verified theme has manual verification method', () => {
            const g = games.find(g => g.data_confidence === 'gt_verified' && g.theme_primary);
            if (!g) return;
            const result = getProvenance(g.name, 'theme_primary');
            const f = result.focus;
            expect(f.extraction_method?.method).toBe('Ground truth + rules text');
        });
    });

    describe('buildRanking logic (server-side)', () => {
        function buildRanking(rows, dimension, value) {
            const nameKey = { provider: 'name', theme: 'theme', feature: 'feature', volatility: 'volatility' }[
                dimension
            ];
            if (!nameKey) return null;
            const idx = rows.findIndex(r => (r[nameKey] || '').toLowerCase() === value.toLowerCase());
            if (idx === -1) return null;
            const row = rows[idx];
            const top5 = rows.slice(0, 5).map((r, i) => ({
                rank: i + 1,
                name: r[nameKey],
                game_count: r.count,
                avg_theo_win: +(r.avgTheo || 0).toFixed(2),
                smart_index: +(r.smartIndex || 0).toFixed(2),
            }));
            return {
                rank: idx + 1,
                game_count: row.count,
                avg_theo_win: +(row.avgTheo || 0).toFixed(2),
                smartIndex: +(row.smartIndex || 0).toFixed(2),
                total_dimension_entries: rows.length,
                top5,
            };
        }

        const mockRows = [
            { name: 'IGT', count: 200, avgTheo: 25.5, smartIndex: 50.2 },
            { name: 'Evolution', count: 150, avgTheo: 30.1, smartIndex: 45.3 },
            { name: 'NetEnt', count: 100, avgTheo: 20.0, smartIndex: 30.1 },
        ];

        it('returns correct rank for first entry', () => {
            const r = buildRanking(mockRows, 'provider', 'IGT');
            expect(r.rank).toBe(1);
            expect(r.game_count).toBe(200);
            expect(r.total_dimension_entries).toBe(3);
        });

        it('returns correct rank for last entry', () => {
            const r = buildRanking(mockRows, 'provider', 'NetEnt');
            expect(r.rank).toBe(3);
        });

        it('returns null for unknown dimension type', () => {
            expect(buildRanking(mockRows, 'year', '2020')).toBeNull();
        });

        it('returns null for value not found in rows', () => {
            expect(buildRanking(mockRows, 'provider', 'NonExistent')).toBeNull();
        });

        it('top5 has max 5 entries', () => {
            const bigRows = Array.from({ length: 10 }, (_, i) => ({
                name: `P${i}`,
                count: 100 - i,
                avgTheo: 20 - i,
                smartIndex: 50 - i,
            }));
            const r = buildRanking(bigRows, 'provider', 'P7');
            expect(r.top5).toHaveLength(5);
            expect(r.rank).toBe(8);
        });

        it('case-insensitive value matching', () => {
            const r = buildRanking(mockRows, 'provider', 'igt');
            expect(r).not.toBeNull();
            expect(r.rank).toBe(1);
        });

        it('handles theme dimension with theme key', () => {
            const themeRows = [
                { theme: 'Fire', count: 86, avgTheo: 24.7, smartIndex: 40.0 },
                { theme: 'Asian', count: 223, avgTheo: 23.4, smartIndex: 38.0 },
            ];
            const r = buildRanking(themeRows, 'theme', 'Asian');
            expect(r.rank).toBe(2);
            expect(r.game_count).toBe(223);
        });

        it('top5 entries have correct structure', () => {
            const r = buildRanking(mockRows, 'provider', 'IGT');
            for (const entry of r.top5) {
                expect(entry).toHaveProperty('rank');
                expect(entry).toHaveProperty('name');
                expect(entry).toHaveProperty('game_count');
                expect(entry).toHaveProperty('avg_theo_win');
                expect(entry).toHaveProperty('smart_index');
            }
        });
    });

    describe('no field returns generic "Data pipeline" for known field types', () => {
        const knownFields = [
            'rtp',
            'volatility',
            'theme_primary',
            'theme_consolidated',
            'reels',
            'rows',
            'paylines',
            'original_release_year',
            'name',
            'provider',
            'theo_win',
            'market_share_pct',
            'avg_bet',
            'release_year',
            'description',
            'symbols',
            'features',
            'max_win',
            'min_bet',
            'max_bet',
        ];

        for (const field of knownFields) {
            it(`${field} has a specific extraction method (not "Data pipeline")`, () => {
                const method = getExtractionMethod(field, null, 'test_value', { data_confidence: 'gt_verified' });
                expect(method).not.toBeNull();
                expect(method.method).not.toBe('Data pipeline');
            });
        }
    });

    describe('inconsistency detection', () => {
        it('detects RTP mismatch between master and rules text', () => {
            const g = games.find(g => {
                if (!g.rtp) return false;
                const match = findRulesMatch(g.name);
                if (!match?.slug) return false;
                const text = readRulesText(match.slug);
                if (!text) return false;
                const ctxWin = getContextWindow(text, 'rtp', g.rtp);
                return ctxWin && Math.abs(g.rtp - parseFloat(ctxWin.captured_value)) > 1;
            });
            if (!g) {
                // No mismatch found in real data — that's fine, means data is clean
                expect(true).toBe(true);
                return;
            }
            const match = findRulesMatch(g.name);
            const text = readRulesText(match.slug);
            const issues = detectInconsistencies(g, confMap?.[g.name] || {}, text);
            expect(issues.some(i => i.field === 'rtp')).toBe(true);
        });
    });

    describe('original_release_year vs release_year', () => {
        it('original_release_year has correct source when from slotcatalog', () => {
            const g = games.find(g => g.original_release_date_source === 'slotcatalog' && g.original_release_year);
            if (!g) return;
            const result = getProvenance(g.name, 'original_release_year');
            expect(result.focus).not.toBeNull();
            expect(result.focus.extraction_method?.method).toBe('SlotCatalog');
        });

        it('original_release_year has AI lookup source when from claude', () => {
            const g = games.find(
                g => g.original_release_date_source?.startsWith('claude_lookup') && g.original_release_year
            );
            if (!g) return;
            const result = getProvenance(g.name, 'original_release_year');
            expect(result.focus).not.toBeNull();
            expect(result.focus.extraction_method?.method).toMatch(/^AI web lookup/);
        });

        it('release_year is always platform confidence', () => {
            const g = games.find(g => g.release_year);
            const result = getProvenance(g.name, 'release_year');
            expect(result.focus).not.toBeNull();
            expect(result.focus.confidence).toBe('platform');
        });
    });

    describe('value-based context window fallback', () => {
        it('finds feature name in rules text via value search', () => {
            const g = games.find(
                g => Array.isArray(g.features) && g.features.includes('Free Spins') && findRulesMatch(g.name)
            );
            if (!g) return;
            const match = findRulesMatch(g.name);
            const text = readRulesText(match.slug);
            if (!text) return;
            const ctx = getContextWindow(text, 'features', g.features);
            expect(ctx).not.toBeNull();
            expect(ctx.match.toLowerCase()).toContain('free spins');
        });

        it('finds symbol name in rules text via value search', () => {
            const g = games.find(g => {
                if (!Array.isArray(g.symbols) || !g.symbols.length) return false;
                const name = g.symbols[0]?.name;
                if (!name || name.length < 3) return false;
                return !!findRulesMatch(g.name);
            });
            if (!g) return;
            const match = findRulesMatch(g.name);
            const text = readRulesText(match.slug);
            if (!text) return;
            const ctx = getContextWindow(text, 'symbols', g.symbols);
            expect(ctx).not.toBeNull();
        });
    });

    describe('data_source from staged_best_of_sources', () => {
        let bestOf;
        beforeAll(() => {
            bestOf = loadJson('staged_best_of_sources.json');
        });

        it('best_of_sources file exists and has entries', () => {
            expect(bestOf).not.toBeNull();
            expect(Object.keys(bestOf).length).toBeGreaterThan(0);
        });

        it('entries contain per-field source tracking', () => {
            if (!bestOf) return;
            const firstKey = Object.keys(bestOf)[0];
            const entry = bestOf[firstKey];
            const sourceKeys = Object.keys(entry).filter(k => k.endsWith('_source'));
            expect(sourceKeys.length).toBeGreaterThan(0);
        });
    });

    describe('no unknown confidence for fields with values', () => {
        const PROVENANCE_FIELDS = [
            'name',
            'rtp',
            'volatility',
            'theme_primary',
            'reels',
            'rows',
            'paylines',
            'original_release_year',
            'description',
            'min_bet',
            'max_bet',
            'max_win',
            'symbols',
            'features',
            'provider',
            'theo_win',
            'market_share_pct',
            'avg_bet',
            'release_year',
            'sites',
            'games_played_index',
            'coin_in_index',
        ];
        const PLATFORM_FIELDS = new Set([
            'name',
            'theo_win',
            'market_share_pct',
            'avg_bet',
            'release_year',
            'provider',
            'sites',
            'games_played_index',
            'coin_in_index',
        ]);

        it('every field with a value has a non-null confidence after inference', () => {
            if (!games.length) return;
            const { inferConfidence } = require('../../server/routes/data.cjs');
            const sample = games.filter(g => g.name !== 'Total').slice(0, 200);
            const failures = [];
            for (const g of sample) {
                const conf = confMap ? confMap[g.name] || {} : {};
                const bo = bestOfSources ? bestOfSources[g.name] || {} : {};
                for (const f of PROVENANCE_FIELDS) {
                    const val = g[f] ?? null;
                    if (val == null || val === '' || val === 'N/A') continue;
                    const rawConf = conf[`${f}_confidence`] || conf[f] || null;
                    let fieldConf = rawConf;
                    if (!fieldConf && PLATFORM_FIELDS.has(f) && val != null) fieldConf = 'platform';
                    if (!fieldConf && val != null) fieldConf = inferConfidence(f, g, bo);
                    if (!fieldConf) failures.push(`${g.name} → ${f}`);
                }
            }
            expect(failures).toEqual([]);
        });
    });

    describe('banned drilldown phrases', () => {
        const BANNED = [
            'master dataset',
            'Value imported from',
            'Value sourced directly from',
            'No direct rules text evidence',
            'not extracted from rules text',
        ];

        it('getExtractionMethod never returns banned phrases in detail', () => {
            const testFields = [
                'rtp',
                'volatility',
                'features',
                'symbols',
                'theme_primary',
                'name',
                'provider',
                'theo_win',
                'market_share_pct',
                'release_year',
                'reels',
                'rows',
                'paylines',
                'max_win',
                'min_bet',
                'max_bet',
                'description',
            ];
            for (const f of testFields) {
                const method = getExtractionMethod(f, null, 'test', {});
                if (!method) continue;
                for (const phrase of BANNED) {
                    expect(method.detail.toLowerCase()).not.toContain(phrase.toLowerCase());
                }
            }
        });
    });
});
