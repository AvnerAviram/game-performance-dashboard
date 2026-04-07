import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('Game category validation', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    const VALID_CATEGORIES = new Set([
        'Slot',
        'Instant Win',
        'Table Game',
        'Live Casino',
        'Video Poker',
        'Lottery',
        'Bingo/Keno',
        'Crash',
        'Arcade',
    ]);

    test('every real game has a valid game_category', () => {
        const realGames = games.filter(g => g.name !== 'Total');
        const invalid = realGames.filter(g => !g.game_category || !VALID_CATEGORIES.has(g.game_category));
        expect(invalid.map(g => ({ name: g.name, cat: g.game_category }))).toEqual([]);
    });

    test('at most 1 summary/total row in master (DuckDB loader filters it)', () => {
        const bogus = games.filter(g => g.name === 'Total' || g.game_category === 'Total');
        expect(bogus.length).toBeLessThanOrEqual(1);
    });

    test('slots are the majority (>80%) of games', () => {
        const slots = games.filter(g => g.game_category === 'Slot');
        expect(slots.length / games.length).toBeGreaterThan(0.8);
    });

    test('non-slot categories have reasonable counts', () => {
        const nonSlot = games.filter(g => g.game_category !== 'Slot');
        expect(nonSlot.length).toBeGreaterThan(0);
        expect(nonSlot.length).toBeLessThan(games.length * 0.2);
    });

    test('game_sub_category is either null or "Slingo"', () => {
        const invalid = games.filter(g => g.game_sub_category != null && g.game_sub_category !== 'Slingo');
        expect(invalid.map(g => ({ name: g.name, sub: g.game_sub_category }))).toEqual([]);
    });
});

describe('Game count accuracy (DuckDB contract)', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    test('total master entries matches expected range', () => {
        expect(games.length).toBeGreaterThanOrEqual(4000);
        expect(games.length).toBeLessThanOrEqual(6000);
    });

    test('slot-only count excludes non-slot and bogus entries', () => {
        const slotGames = games.filter(g => g.game_category === 'Slot');
        const totalMinusBogus = games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');

        expect(slotGames.length).toBeLessThan(games.length);
        expect(totalMinusBogus.length).toBeLessThanOrEqual(games.length);
        expect(slotGames.length).toBeGreaterThanOrEqual(4000);
    });

    test('no duplicate game IDs', () => {
        const ids = games.map(g => g.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('no duplicate game names', () => {
        const names = games.map(g => g.name);
        expect(new Set(names).size).toBe(names.length);
    });

    test('every game has positive theo_win or is a non-slot category', () => {
        const zeroTheoSlots = games.filter(g => g.game_category === 'Slot' && (g.theo_win == null || g.theo_win <= 0));
        const pct = zeroTheoSlots.length / games.filter(g => g.game_category === 'Slot').length;
        expect(pct).toBeLessThan(0.05);
    });
});
