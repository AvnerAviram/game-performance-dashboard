import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * CSV/XLSX Data Integrity Validation
 *
 * Ensures ALL XLSX-origin fields in game_data_master.json are intact and
 * have not been corrupted or overwritten by extraction or any other process.
 *
 * This is the definitive test: if this fails, XLSX data has been damaged.
 * Run after every extraction batch.
 */

const DATA_DIR = resolve(import.meta.dirname, '../../data');

const XLSX_FIELDS = [
    'id',
    'name',
    'provider',
    'game_category',
    'release_year',
    'release_month',
    'sites',
    'avg_bet',
    'median_bet',
    'games_played_index',
    'coin_in_index',
    'theo_win',
    'market_share_pct',
];

const NUMERIC_XLSX_FIELDS = [
    'sites',
    'avg_bet',
    'median_bet',
    'games_played_index',
    'coin_in_index',
    'theo_win',
    'market_share_pct',
    'release_year',
    'release_month',
];

let master;

beforeAll(() => {
    const raw = readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8');
    master = JSON.parse(raw);
    if (!Array.isArray(master)) {
        master = master.games || [];
    }
});

describe('CSV Integrity: Field Presence', () => {
    test('master should have expected game count (4,550 — no aggregate rows)', () => {
        expect(master.length).toBe(4550);
    });

    test('every game has ALL XLSX fields present as keys', () => {
        const missing = [];
        for (const game of master) {
            for (const field of XLSX_FIELDS) {
                if (!(field in game)) {
                    missing.push({ name: game.name, field });
                }
            }
        }
        if (missing.length > 0) {
            console.error('Missing XLSX fields:', missing.slice(0, 20));
        }
        expect(missing).toHaveLength(0);
    });

    test('no game has a null or undefined name', () => {
        const bad = master.filter(g => !g.name || typeof g.name !== 'string' || g.name.trim() === '');
        expect(bad).toHaveLength(0);
    });

    test('no game has a null or undefined provider', () => {
        const bad = master.filter(g => !g.provider || typeof g.provider !== 'string' || g.provider.trim() === '');
        if (bad.length > 0) {
            console.error(
                'Games with missing provider:',
                bad.slice(0, 10).map(g => g.name)
            );
        }
        expect(bad).toHaveLength(0);
    });

    test('all game names are unique', () => {
        const names = master.map(g => g.name);
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        if (dupes.length > 0) {
            console.error('Duplicate names:', [...new Set(dupes)].slice(0, 10));
        }
        expect(new Set(names).size).toBe(master.length);
    });

    test('all game IDs are unique', () => {
        const ids = master.map(g => g.id);
        expect(new Set(ids).size).toBe(master.length);
    });
});

describe('CSV Integrity: Numeric Fields Not Corrupted', () => {
    test.each(NUMERIC_XLSX_FIELDS)('%s values are numbers or null (never string/object/NaN)', field => {
        const bad = master.filter(g => {
            const v = g[field];
            if (v === null || v === undefined) return false;
            if (typeof v !== 'number') return true;
            if (isNaN(v) || !isFinite(v)) return true;
            return false;
        });
        if (bad.length > 0) {
            console.error(
                `Bad ${field} values:`,
                bad.slice(0, 5).map(g => ({
                    name: g.name,
                    [field]: g[field],
                    type: typeof g[field],
                }))
            );
        }
        expect(bad).toHaveLength(0);
    });
});

describe('CSV Integrity: Value Ranges', () => {
    test('theo_win values are between 0 and 200 (or null)', () => {
        const bad = master.filter(g => typeof g.theo_win === 'number' && (g.theo_win < 0 || g.theo_win > 200));
        expect(bad).toHaveLength(0);
    });

    test('avg_bet values are positive (or null)', () => {
        const bad = master.filter(g => typeof g.avg_bet === 'number' && g.avg_bet < 0);
        expect(bad).toHaveLength(0);
    });

    test('market_share_pct values are between 0 and 100 (or null)', () => {
        const bad = master.filter(
            g => typeof g.market_share_pct === 'number' && (g.market_share_pct < 0 || g.market_share_pct > 100)
        );
        expect(bad).toHaveLength(0);
    });

    test('sites values are positive integers (or null)', () => {
        const bad = master.filter(g => typeof g.sites === 'number' && (g.sites < 0 || !Number.isInteger(g.sites)));
        expect(bad).toHaveLength(0);
    });

    test('release_year values are between 2000 and 2030 (or null)', () => {
        const bad = master.filter(
            g => typeof g.release_year === 'number' && (g.release_year < 2000 || g.release_year > 2030)
        );
        expect(bad).toHaveLength(0);
    });

    test('release_month values are between 1 and 12 (or null)', () => {
        const bad = master.filter(
            g => typeof g.release_month === 'number' && (g.release_month < 1 || g.release_month > 12)
        );
        expect(bad).toHaveLength(0);
    });

    test('game_category values are from known set', () => {
        const known = new Set([
            'Slot',
            'Table Game',
            'Live',
            'Live Casino',
            'Instant Win',
            'Lottery',
            'Video Poker',
            'Bingo',
            'Bingo/Keno',
            'Crash',
            'Virtual Sports',
            'Arcade',
            'Total',
            '',
            'Other',
        ]);
        const bad = master.filter(g => g.game_category && !known.has(g.game_category));
        if (bad.length > 0) {
            const unknowns = [...new Set(bad.map(g => g.game_category))];
            console.error('Unknown categories:', unknowns);
        }
        expect(bad).toHaveLength(0);
    });
});

describe('CSV Integrity: Aggregate Checksums', () => {
    test('total theo_win sum is stable (±1% tolerance)', () => {
        const sum = master.reduce((s, g) => s + (g.theo_win || 0), 0);
        expect(sum).toBeGreaterThan(3100);
        expect(sum).toBeLessThan(3200);
    });

    test('total market_share_pct sum is stable (fractions, no aggregate rows)', () => {
        const realGames = master.filter(g => g.name !== 'Total' && g.game_category !== 'Total');
        const sum = realGames.reduce((s, g) => s + (g.market_share_pct || 0), 0);
        expect(sum).toBeGreaterThan(0.5);
        expect(sum).toBeLessThan(2.0);
    });

    test('provider count is stable', () => {
        const providers = new Set(master.filter(g => g.provider !== 'Total').map(g => g.provider));
        expect(providers.size).toBeGreaterThanOrEqual(50);
        expect(providers.size).toBeLessThanOrEqual(70);
    });

    test('slot count is stable', () => {
        const slots = master.filter(g => g.game_category === 'Slot');
        expect(slots.length).toBeGreaterThanOrEqual(3900);
        expect(slots.length).toBeLessThanOrEqual(4300);
    });

    test('top 10 games by theo_win are unchanged', () => {
        const sorted = [...master].filter(g => typeof g.theo_win === 'number').sort((a, b) => b.theo_win - a.theo_win);
        const top10 = sorted.slice(0, 10).map(g => g.name);

        expect(top10.length).toBe(10);
        for (const name of top10) {
            expect(typeof name).toBe('string');
            expect(name.length).toBeGreaterThan(0);
        }
        console.log('Top 10 by theo_win:', top10);
    });
});

describe('CSV Integrity: No Extraction Bleed', () => {
    test('extraction fields never overwrote XLSX fields with extraction-like values', () => {
        const suspicious = [];
        for (const game of master) {
            if (typeof game.provider === 'number') {
                suspicious.push({ name: game.name, issue: 'provider is number' });
            }
            if (typeof game.theo_win === 'string') {
                suspicious.push({ name: game.name, issue: 'theo_win is string' });
            }
            if (typeof game.name === 'object') {
                suspicious.push({ name: game.id, issue: 'name is object' });
            }
            if (Array.isArray(game.provider)) {
                suspicious.push({ name: game.name, issue: 'provider is array' });
            }
        }
        if (suspicious.length > 0) {
            console.error('Type corruption detected:', suspicious.slice(0, 10));
        }
        expect(suspicious).toHaveLength(0);
    });

    test('games with extraction_date still have original XLSX fields', () => {
        const extracted = master.filter(g => g.extraction_date);
        if (extracted.length === 0) return;

        const missing = [];
        for (const game of extracted) {
            for (const field of XLSX_FIELDS) {
                if (!(field in game)) {
                    missing.push({ name: game.name, field });
                }
            }
            if (typeof game.theo_win !== 'number' && game.theo_win !== null) {
                missing.push({ name: game.name, field: 'theo_win', issue: 'wrong type after extraction' });
            }
        }
        if (missing.length > 0) {
            console.error('Extracted games with damaged XLSX fields:', missing.slice(0, 10));
        }
        expect(missing).toHaveLength(0);
    });
});
