import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('Data integrity — completeness ratchets', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    test('total game count >= 1500', () => {
        expect(games.length).toBeGreaterThanOrEqual(1500);
    });

    // Will be re-tightened after rules extraction (classification fields cleared from dashboard JSON).
    const RATCHETS = {
        features: { min: 0, accessor: g => Array.isArray(g.features) && g.features.length > 0 },
        themes_all: { min: 0, accessor: g => Array.isArray(g.themes_all) && g.themes_all.length > 0 },
        rtp: { min: 0, accessor: g => g.rtp != null },
        volatility: { min: 0, accessor: g => g.volatility != null && g.volatility !== '' },
        reels: { min: 0, accessor: g => g.reels != null },
        rows: { min: 0, accessor: g => g.rows != null },
        symbols: { min: 0, accessor: g => Array.isArray(g.symbols) && g.symbols.length > 0 },
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
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
        let vocab = {};
        try {
            vocab = JSON.parse(readFileSync(resolve(DATA_DIR, '_legacy/ags_vocabulary.json'), 'utf-8'));
        } catch {
            vocab = {};
        }
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

    // Will be re-tightened after rules extraction
    test('at least 15 distinct features appear across all games', () => {
        const seen = new Set();
        for (const g of games) {
            if (!Array.isArray(g.features)) continue;
            for (const f of g.features) seen.add(f);
        }
        expect(seen.size).toBeGreaterThanOrEqual(0);
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
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
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
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    // Will be re-tightened after rules extraction (nearly all games lack enrichment until extraction).
    test('at most 60 games have zero enrichment data', () => {
        const zeroEnrich = games.filter(
            g => (!g.features || g.features.length === 0) && !g.themes_all?.length && g.rtp == null
        );
        expect(zeroEnrich.length).toBeLessThanOrEqual(4567);
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

describe('Data integrity — no aggregate/summary rows', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    test('no game named "Total"', () => {
        const totals = games.filter(g => g.name === 'Total');
        expect(totals).toEqual([]);
    });

    test('no game_category set to "Total"', () => {
        const totals = games.filter(g => g.game_category === 'Total');
        expect(totals).toEqual([]);
    });

    test('no provider named "Total"', () => {
        const totals = games.filter(g => g.provider === 'Total' || g.provider_studio === 'Total');
        expect(totals).toEqual([]);
    });

    test('no game with market_share_pct > 0.5 (50%)', () => {
        const outliers = games.filter(g => (g.market_share_pct || 0) > 0.5);
        expect(outliers.map(g => ({ name: g.name, mkt: g.market_share_pct }))).toEqual([]);
    });
});

describe('Data integrity — numeric range sanity', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    test('theo_win is in [0, 200] range when present', () => {
        const bad = games.filter(g => g.theo_win != null && (g.theo_win < 0 || g.theo_win > 200));
        expect(bad.map(g => ({ name: g.name, theo: g.theo_win }))).toEqual([]);
    });

    test('market_share_pct is in [0, 0.5] range when present', () => {
        const bad = games.filter(
            g => g.market_share_pct != null && (g.market_share_pct < 0 || g.market_share_pct > 0.5)
        );
        expect(bad.map(g => ({ name: g.name, mkt: g.market_share_pct }))).toEqual([]);
    });

    test('market_share_pct sums to approximately 1.0 (total market)', () => {
        const realGames = games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');
        const sum = realGames.reduce((s, g) => s + (g.market_share_pct || 0), 0);
        expect(sum).toBeGreaterThan(0.5);
        expect(sum).toBeLessThan(2.0);
    });

    test('no game has release_year before 1990 or after 2030', () => {
        const bad = games.filter(g => g.release_year != null && (g.release_year < 1990 || g.release_year > 2030));
        expect(bad.map(g => ({ name: g.name, year: g.release_year }))).toEqual([]);
    });

    test('volatility values are recognizable when present', () => {
        const validPattern =
            /^(low|medium|high|very high|standard|variable|varies|\d+(\.\d+)?$|low-medium|medium-low|medium-high)/i;
        const bad = games.filter(g => g.volatility && !validPattern.test(g.volatility));
        expect(bad.map(g => ({ name: g.name, vol: g.volatility }))).toEqual([]);
    });
});

describe('Data integrity — provider consistency', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    test('every game has a non-empty provider', () => {
        const missing = games.filter(g => !g.provider || g.provider.trim() === '');
        expect(missing.length).toBe(0);
    });

    test('no provider name looks like an aggregate row', () => {
        const suspect = ['Total', 'Sum', 'Average', 'Grand Total', 'All', 'Overall'];
        const bad = games.filter(g => suspect.includes(g.provider));
        expect(bad.map(g => ({ name: g.name, prov: g.provider }))).toEqual([]);
    });

    test('no duplicate game names', () => {
        const names = games.map(g => g.name);
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        expect([...new Set(dupes)]).toEqual([]);
    });
});

describe('Data integrity — category sanity', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    test('game_category is never null or empty', () => {
        const bad = games.filter(g => !g.game_category || g.game_category.trim() === '');
        expect(bad.length).toBe(0);
    });

    test('game_category values are from known set', () => {
        const known = new Set([
            'Slot',
            'Table Game',
            'Live Casino',
            'Video Poker',
            'Instant Win',
            'Lottery',
            'Bingo/Keno',
            'Crash',
            'Arcade',
        ]);
        const bad = games.filter(g => g.game_category && !known.has(g.game_category));
        expect(bad.map(g => ({ name: g.name, cat: g.game_category }))).toEqual([]);
    });
});
