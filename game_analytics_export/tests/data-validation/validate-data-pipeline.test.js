/**
 * Data Pipeline Integrity Tests
 *
 * Validates that game_data_master.json data survives the full pipeline:
 *   master JSON → DuckDB INSERT (JSON.stringify) → parseFeatures/parseSymbols → dashboard
 *
 * Catches: feature name mutations, missing features, symbol object breakage,
 *          CANONICAL_FEATURES drift, UI_TO_FEATURE gaps, LIKE query false positives.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { HIDDEN_FEATURES } from '../../src/lib/shared-config.js';

const DATA_DIR = resolve(import.meta.dirname, '../../data');
const SRC_DIR = resolve(import.meta.dirname, '../../src');

let games;
let vocabulary;
let themeMap;

beforeAll(() => {
    games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    vocabulary = JSON.parse(readFileSync(resolve(DATA_DIR, '_legacy', 'ags_vocabulary.json'), 'utf-8'));
    themeMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'theme_consolidation_map.json'), 'utf-8'));
});

describe('Feature name integrity: master JSON → CANONICAL_FEATURES', () => {
    let CANONICAL_FEATURES;
    let SHORT_FEATURE_LABELS;

    beforeAll(async () => {
        const mod = await import('../../src/lib/features.js');
        CANONICAL_FEATURES = mod.CANONICAL_FEATURES;
        SHORT_FEATURE_LABELS = mod.SHORT_FEATURE_LABELS;
    });

    test('every non-hidden feature in master JSON exists in CANONICAL_FEATURES', () => {
        const allFeatures = new Set();
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) allFeatures.add(f);
        }

        const missing = [...allFeatures].filter(f => !HIDDEN_FEATURES.has(f) && !CANONICAL_FEATURES.includes(f));
        expect(missing).toEqual([]);
    });

    test('every feature in CANONICAL_FEATURES has a SHORT_FEATURE_LABEL', () => {
        const missing = CANONICAL_FEATURES.filter(f => !(f in SHORT_FEATURE_LABELS));
        expect(missing).toEqual([]);
    });

    test('CANONICAL_FEATURES has enough palette colors', async () => {
        const mod = await import('../../src/lib/features.js');
        for (const feat of CANONICAL_FEATURES) {
            const color = mod.getFeatureColor(feat);
            expect(color).toBeTruthy();
            expect(color).not.toBe(undefined);
        }
    });

    test('CANONICAL_FEATURES is sorted alphabetically', () => {
        const sorted = [...CANONICAL_FEATURES].sort();
        expect(CANONICAL_FEATURES).toEqual(sorted);
    });

    test('no duplicate entries in CANONICAL_FEATURES', () => {
        const dupes = CANONICAL_FEATURES.filter((f, i) => CANONICAL_FEATURES.indexOf(f) !== i);
        expect(dupes).toEqual([]);
    });
});

describe('Feature name integrity: master JSON → UI_TO_FEATURE', () => {
    let UI_TO_FEATURE;

    beforeAll(async () => {
        const source = readFileSync(resolve(SRC_DIR, 'lib/game-analytics-engine.js'), 'utf-8');
        const block = source.match(/const UI_TO_FEATURE = \{([\s\S]*?)\};/);
        expect(block).toBeTruthy();
        const values = new Set();
        const valuePattern = /:\s*'([^']+)'/g;
        let m;
        while ((m = valuePattern.exec(block[1]))) values.add(m[1]);
        UI_TO_FEATURE = values;
    });

    test('every feature in master JSON has a UI_TO_FEATURE mapping', () => {
        const allFeatures = new Set();
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) allFeatures.add(f);
        }

        const missing = [...allFeatures].filter(f => !UI_TO_FEATURE.has(f));
        expect(missing).toEqual([]);
    });
});

describe('Feature roundtrip: JSON.stringify → JSON.parse preserves names', () => {
    test('features survive JSON.stringify → JSON.parse without mutation', () => {
        const mutations = [];
        for (const g of games) {
            if (!Array.isArray(g.features) || g.features.length === 0) continue;
            const stringified = JSON.stringify(g.features);
            const parsed = JSON.parse(stringified);
            for (let i = 0; i < g.features.length; i++) {
                if (g.features[i] !== parsed[i]) {
                    mutations.push({ game: g.name, original: g.features[i], parsed: parsed[i] });
                }
            }
        }
        expect(mutations).toEqual([]);
    });

    test('themes_all survive JSON.stringify → JSON.parse without mutation', () => {
        const mutations = [];
        for (const g of games) {
            if (!Array.isArray(g.themes_all) || g.themes_all.length === 0) continue;
            const stringified = JSON.stringify(g.themes_all);
            const parsed = JSON.parse(stringified);
            for (let i = 0; i < g.themes_all.length; i++) {
                if (g.themes_all[i] !== parsed[i]) {
                    mutations.push({ game: g.name, original: g.themes_all[i], parsed: parsed[i] });
                }
            }
        }
        expect(mutations).toEqual([]);
    });

    test('features with single quotes survive SQL escaping roundtrip', () => {
        const problematic = [];
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) {
                if (f.includes("'")) {
                    const escaped = JSON.stringify(g.features).replace(/'/g, "''");
                    const unescaped = escaped.replace(/''/g, "'");
                    const parsed = JSON.parse(unescaped);
                    if (!parsed.includes(f)) {
                        problematic.push({ game: g.name, feature: f });
                    }
                }
            }
        }
        expect(problematic).toEqual([]);
    });
});

describe('parseFeatures handles all data formats correctly', () => {
    let parseFeatures;

    beforeAll(async () => {
        const mod = await import('../../src/lib/parse-features.js');
        parseFeatures = mod.parseFeatures;
    });

    test('parses JSON string array', () => {
        expect(parseFeatures('["Free Spins","Hold and Spin"]')).toEqual(['Free Spins', 'Hold and Spin']);
    });

    test('passes through native array', () => {
        expect(parseFeatures(['Free Spins'])).toEqual(['Free Spins']);
    });

    test('handles null/undefined/empty', () => {
        expect(parseFeatures(null)).toEqual([]);
        expect(parseFeatures(undefined)).toEqual([]);
        expect(parseFeatures('')).toEqual([]);
        expect(parseFeatures('null')).toEqual([]);
    });

    test('handles malformed JSON gracefully', () => {
        expect(parseFeatures('{broken')).toEqual([]);
        expect(parseFeatures('not json')).toEqual([]);
    });

    test('parses every game features from master via JSON roundtrip', () => {
        const failures = [];
        for (const g of games) {
            if (!Array.isArray(g.features) || g.features.length === 0) continue;
            const jsonStr = JSON.stringify(g.features);
            const parsed = parseFeatures(jsonStr);
            const visible = g.features.filter(f => !HIDDEN_FEATURES.has(f));
            if (parsed.length !== visible.length) {
                failures.push({ game: g.name, expected: visible.length, got: parsed.length });
            }
            for (const f of visible) {
                if (!parsed.includes(f)) {
                    failures.push({ game: g.name, missing: f });
                }
            }
            for (const f of g.features) {
                if (HIDDEN_FEATURES.has(f) && parsed.includes(f)) {
                    failures.push({ game: g.name, hiddenShouldBeStripped: f });
                }
            }
        }
        expect(failures).toEqual([]);
    });
});

describe('parseSymbols handles object symbols correctly', () => {
    let parseSymbols;

    beforeAll(async () => {
        const mod = await import('../../src/lib/symbol-utils.js');
        parseSymbols = mod.parseSymbols;
    });

    test('extracts .name from symbol objects', () => {
        const input = JSON.stringify([
            { name: 'WILD', type: 'wild', description: 'desc' },
            { name: 'SCATTER', type: 'bonus', description: 'desc' },
        ]);
        const result = parseSymbols(input);
        expect(result).toEqual(['WILD', 'SCATTER']);
    });

    test('handles flat string symbols', () => {
        expect(parseSymbols(JSON.stringify(['WILD', 'SCATTER']))).toEqual(['WILD', 'SCATTER']);
    });

    test('handles mixed formats', () => {
        const input = JSON.stringify([{ name: 'WILD', type: 'wild' }, 'SCATTER']);
        expect(parseSymbols(input)).toEqual(['WILD', 'SCATTER']);
    });

    test('handles null/empty', () => {
        expect(parseSymbols(null)).toEqual([]);
        expect(parseSymbols('')).toEqual([]);
        expect(parseSymbols(undefined)).toEqual([]);
    });

    test('never returns [object Object]', () => {
        for (const g of games) {
            if (!Array.isArray(g.symbols) || g.symbols.length === 0) continue;
            const jsonStr = JSON.stringify(g.symbols);
            const parsed = parseSymbols(jsonStr);
            const objectObjects = parsed.filter(s => s === '[object Object]');
            expect(objectObjects).toEqual([]);
        }
    });

    test('parses every game symbols from master via JSON roundtrip', () => {
        const failures = [];
        for (const g of games) {
            if (!Array.isArray(g.symbols) || g.symbols.length === 0) continue;
            const jsonStr = JSON.stringify(g.symbols);
            const parsed = parseSymbols(jsonStr);
            if (parsed.length === 0 && g.symbols.length > 0) {
                failures.push({ game: g.name, symbolCount: g.symbols.length, parsedCount: 0 });
            }
            for (const s of parsed) {
                if (typeof s !== 'string' || s.trim() === '') {
                    failures.push({ game: g.name, badSymbol: s });
                }
            }
        }
        expect(failures).toEqual([]);
    });
});

describe('LIKE query safety: no feature substring false positives', () => {
    test('no feature name is a substring of another (within JSON quotes)', () => {
        const allFeatures = new Set();
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) allFeatures.add(f);
        }
        const features = [...allFeatures].sort();

        const conflicts = [];
        for (const a of features) {
            for (const b of features) {
                if (a === b) continue;
                // In JSON: "FeatureName" — the quoted form prevents most substring issues
                // But check if `"A"` is a substring of `"B"` (which would cause LIKE false positives)
                if (`"${b}"`.includes(`"${a}"`)) {
                    conflicts.push({ feature: a, falsely_matches: b });
                }
            }
        }
        expect(conflicts).toEqual([]);
    });
});

describe('Feature vocabulary alignment: master ↔ ags_vocabulary.json', () => {
    test('every feature in master JSON exists in ags_vocabulary.json', () => {
        const vocabFeatures = new Set(vocabulary.features || []);
        const allFeatures = new Set();
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) allFeatures.add(f);
        }

        const missing = [...allFeatures].filter(f => !vocabFeatures.has(f));
        expect(missing).toEqual([]);
    });
});

describe('DuckDB column mapping completeness', () => {
    test('extracted games with features produce valid JSON strings', () => {
        const failures = [];
        for (const g of games) {
            if (!Array.isArray(g.features) || g.features.length === 0) continue;
            const json = JSON.stringify(g.features);
            try {
                const parsed = JSON.parse(json);
                if (!Array.isArray(parsed)) failures.push({ game: g.name, reason: 'not array after parse' });
            } catch {
                failures.push({ game: g.name, reason: 'invalid JSON' });
            }
        }
        expect(failures).toEqual([]);
    });

    test('extracted games with themes produce valid JSON strings', () => {
        const failures = [];
        for (const g of games) {
            if (!Array.isArray(g.themes_all) || g.themes_all.length === 0) continue;
            const json = JSON.stringify(g.themes_all);
            try {
                const parsed = JSON.parse(json);
                if (!Array.isArray(parsed)) failures.push({ game: g.name, reason: 'not array after parse' });
            } catch {
                failures.push({ game: g.name, reason: 'invalid JSON' });
            }
        }
        expect(failures).toEqual([]);
    });

    test('no game has features stored as objects (must be flat strings)', () => {
        const objectFeatures = [];
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) {
                if (typeof f !== 'string') {
                    objectFeatures.push({ game: g.name, feature: f, type: typeof f });
                }
            }
        }
        expect(objectFeatures).toEqual([]);
    });

    test('symbols stored as objects have .name property', () => {
        const missing = [];
        for (const g of games) {
            if (!Array.isArray(g.symbols)) continue;
            for (const s of g.symbols) {
                if (typeof s === 'object' && s !== null && !s.name) {
                    missing.push({ game: g.name, symbol: JSON.stringify(s).slice(0, 50) });
                }
            }
        }
        expect(missing).toEqual([]);
    });
});

describe('Theme pipeline integrity', () => {
    test('every theme in themes_all is a string', () => {
        const bad = [];
        for (const g of games) {
            if (!Array.isArray(g.themes_all)) continue;
            for (const t of g.themes_all) {
                if (typeof t !== 'string' || t.trim() === '') {
                    bad.push({ game: g.name, theme: t });
                }
            }
        }
        expect(bad).toEqual([]);
    });

    test('theme_primary exists in theme_consolidation_map for extracted games', () => {
        const unmapped = [];
        for (const g of games) {
            if (!g.extraction_date || !g.theme_primary) continue;
            if (!(g.theme_primary in themeMap)) {
                unmapped.push({ game: g.name, theme: g.theme_primary });
            }
        }
        expect(unmapped).toEqual([]);
    });
});

describe('Coverage quality gates (>95% extraction coverage)', () => {
    test('extracted games count', () => {
        const extracted = games.filter(g => g.extraction_date);
        expect(extracted.length).toBeGreaterThanOrEqual(2900);
    });

    test('>99% of extracted games have features', () => {
        const extracted = games.filter(g => g.extraction_date);
        const withFeatures = extracted.filter(g => Array.isArray(g.features) && g.features.length > 0);
        expect(withFeatures.length / extracted.length).toBeGreaterThanOrEqual(0.99);
    });

    test('>99% of extracted games have themes', () => {
        const extracted = games.filter(g => g.extraction_date);
        const withThemes = extracted.filter(g => Array.isArray(g.themes_all) && g.themes_all.length > 0);
        expect(withThemes.length / extracted.length).toBeGreaterThanOrEqual(0.99);
    });

    test('>80% of extracted games have reels', () => {
        const extracted = games.filter(g => g.extraction_date);
        const withReels = extracted.filter(g => g.reels != null && g.reels > 0);
        expect(withReels.length / extracted.length).toBeGreaterThanOrEqual(0.8);
    });

    test('>60% of extracted games have RTP', () => {
        const extracted = games.filter(g => g.extraction_date);
        const withRtp = extracted.filter(g => g.rtp != null && g.rtp > 0);
        expect(withRtp.length / extracted.length).toBeGreaterThanOrEqual(0.6);
    });
});
