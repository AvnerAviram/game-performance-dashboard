import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('symbol data coverage', () => {
    let games;
    let slots;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
        slots = games.filter(g => g.game_category === 'Slot');
    });

    test('at least 3200 games have symbols', () => {
        const withSymbols = games.filter(g => Array.isArray(g.symbols) && g.symbols.length > 0);
        expect(withSymbols.length).toBeGreaterThanOrEqual(3200);
    });

    test('symbol arrays contain strings', () => {
        const bad = [];
        for (const g of games) {
            if (!Array.isArray(g.symbols) || g.symbols.length === 0) continue;
            const nonStrings = g.symbols.filter(s => typeof s !== 'string' && typeof s !== 'object');
            if (nonStrings.length > 0) bad.push(g.name);
        }
        expect(bad).toEqual([]);
    });

    test('known games have symbols', () => {
        const known = ['Starburst', 'Reactoonz', 'Fire Joker'];
        const missing = [];
        for (const name of known) {
            const g = games.find(g2 => g2.name === name);
            if (g && (!g.symbols || g.symbols.length === 0)) missing.push(name);
        }
        expect(missing).toEqual([]);
    });
});
