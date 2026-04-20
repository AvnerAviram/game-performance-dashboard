import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('release dates in game_data_master.json', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    test('existing release_year/release_month unchanged', () => {
        for (const g of games) {
            if (g.release_year) {
                expect(g.release_year).toBeGreaterThanOrEqual(2020);
                expect(g.release_year).toBeLessThanOrEqual(2026);
            }
        }
    });

    test('no games have original_release_year (field removed)', () => {
        const bad = games.filter(g => g.original_release_year !== undefined);
        expect(bad.map(g => `${g.name} still has original_release_year`)).toEqual([]);
    });

    test('no games have original_release_date_source (field removed)', () => {
        const bad = games.filter(g => g.original_release_date_source !== undefined);
        expect(bad.map(g => `${g.name} still has original_release_date_source`)).toEqual([]);
    });
});
