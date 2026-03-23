import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('Data integrity — completeness ratchets', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'games_dashboard.json'), 'utf-8'));
    });

    test('total game count >= 1500', () => {
        expect(games.length).toBeGreaterThanOrEqual(1500);
    });

    const RATCHETS = {
        features: { min: 1470, accessor: g => Array.isArray(g.features) && g.features.length > 0 },
        themes_all: { min: 1450, accessor: g => Array.isArray(g.themes_all) && g.themes_all.length > 0 },
        rtp: { min: 1350, accessor: g => g.rtp != null },
        volatility: { min: 1250, accessor: g => g.volatility != null && g.volatility !== '' },
        reels: { min: 1400, accessor: g => g.reels != null },
        rows: { min: 1350, accessor: g => g.rows != null },
        symbols: { min: 1390, accessor: g => Array.isArray(g.symbols) && g.symbols.length > 0 },
    };

    for (const [field, { min, accessor }] of Object.entries(RATCHETS)) {
        test(`${field} completeness >= ${min} games`, () => {
            const count = games.filter(accessor).length;
            expect(count).toBeGreaterThanOrEqual(min);
        });
    }
});

describe('Data integrity — feature quality', () => {
    let games;
    let canonicalFeatures;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'games_dashboard.json'), 'utf-8'));
        const vocab = JSON.parse(readFileSync(resolve(DATA_DIR, 'ags_vocabulary.json'), 'utf-8'));
        canonicalFeatures = new Set(vocab.features || []);
    });

    test('all game features are from the canonical vocabulary', () => {
        const nonCanonical = [];
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) {
                if (!canonicalFeatures.has(f)) {
                    nonCanonical.push({ game: g.name, feature: f });
                }
            }
        }
        expect(nonCanonical).toEqual([]);
    });

    test('no empty strings in feature arrays', () => {
        const violations = [];
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) {
                if (typeof f !== 'string' || f.trim() === '') {
                    violations.push({ game: g.name, feature: f });
                }
            }
        }
        expect(violations).toEqual([]);
    });

    test('at least 15 distinct features appear across all games', () => {
        const seen = new Set();
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) seen.add(f);
        }
        expect(seen.size).toBeGreaterThanOrEqual(15);
    });

    test('no duplicate features within a single game', () => {
        const dupes = [];
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            const set = new Set();
            for (const f of g.features) {
                if (set.has(f)) dupes.push({ game: g.name, feature: f });
                set.add(f);
            }
        }
        expect(dupes).toEqual([]);
    });
});

describe('Data integrity — spec sanity', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'games_dashboard.json'), 'utf-8'));
    });

    test('RTP values are in [50, 100] range when present', () => {
        const bad = [];
        for (const g of games) {
            if (g.rtp == null) continue;
            const v = typeof g.rtp === 'string' ? parseFloat(g.rtp) : g.rtp;
            if (isNaN(v) || v < 50 || v > 100) {
                bad.push({ name: g.name, rtp: g.rtp });
            }
        }
        expect(bad).toEqual([]);
    });

    test('reels values are in [1, 30] range when present', () => {
        const bad = [];
        for (const g of games) {
            if (g.reels == null) continue;
            const v = typeof g.reels === 'string' ? parseInt(g.reels, 10) : g.reels;
            if (isNaN(v) || v < 1 || v > 30) {
                bad.push({ name: g.name, reels: g.reels });
            }
        }
        expect(bad).toEqual([]);
    });

    test('rows values are positive when numeric', () => {
        const bad = [];
        for (const g of games) {
            if (g.rows == null) continue;
            if (typeof g.rows === 'number' && g.rows < 1) {
                bad.push({ name: g.name, rows: g.rows });
            }
        }
        expect(bad).toEqual([]);
    });
});

describe('Data integrity — pipeline overwrite detection', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'games_dashboard.json'), 'utf-8'));
    });

    test('at most 60 games have zero enrichment data', () => {
        const zeroEnrich = games.filter(
            g => (!g.features || g.features.length === 0) && !g.themes_all?.length && g.rtp == null
        );
        expect(zeroEnrich.length).toBeLessThanOrEqual(60);
    });

    test('every game has id, name, and provider', () => {
        const missing = games.filter(g => !g.id || !g.name || !g.provider);
        expect(missing.length).toBe(0);
    });

    test('no duplicate game IDs', () => {
        const ids = games.map(g => g.id);
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        expect(dupes).toEqual([]);
    });
});
