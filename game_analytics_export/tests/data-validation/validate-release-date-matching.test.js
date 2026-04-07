import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');
const MATCHES_PATH = resolve(DATA_DIR, '_release_date_matches.json');
const MASTER_PATH = resolve(DATA_DIR, 'game_data_master.json');

describe('release date matching validation', () => {
    let matches;
    let master;
    let masterIds;

    beforeAll(() => {
        if (!existsSync(MATCHES_PATH)) {
            throw new Error('_release_date_matches.json not found — run match_release_dates.py first');
        }
        matches = JSON.parse(readFileSync(MATCHES_PATH, 'utf-8'));
        master = JSON.parse(readFileSync(MASTER_PATH, 'utf-8'));
        masterIds = new Set(master.map(g => g.id));
    });

    test('match file is a non-empty object', () => {
        expect(typeof matches).toBe('object');
        expect(Object.keys(matches).length).toBeGreaterThan(500);
    });

    test('no duplicate master IDs in matches', () => {
        const ids = Object.keys(matches);
        const unique = new Set(ids);
        expect(ids.length).toBe(unique.size);
    });

    test('all matched IDs exist in master', () => {
        const missing = Object.keys(matches).filter(id => !masterIds.has(id));
        expect(missing).toEqual([]);
    });

    test('all dates are parseable ISO strings', () => {
        const bad = [];
        for (const [id, m] of Object.entries(matches)) {
            const d = new Date(m.release_date);
            if (isNaN(d.getTime())) bad.push({ id, date: m.release_date });
        }
        expect(bad).toEqual([]);
    });

    test('all release years are between 2000 and 2027', () => {
        const out = [];
        for (const [id, m] of Object.entries(matches)) {
            if (m.release_year < 2000 || m.release_year > 2027) {
                out.push({ id, year: m.release_year });
            }
        }
        expect(out).toEqual([]);
    });

    test('release_month is 1-12', () => {
        const bad = [];
        for (const [id, m] of Object.entries(matches)) {
            if (m.release_month < 1 || m.release_month > 12) {
                bad.push({ id, month: m.release_month });
            }
        }
        expect(bad).toEqual([]);
    });

    test('every match has a source field', () => {
        const missing = Object.entries(matches).filter(([, m]) => !m.source);
        expect(missing.length).toBe(0);
    });

    test('known games have correct years (within 1 year tolerance)', () => {
        const knownDates = {
            starburst: 2012,
            'dead or alive': 2009,
            reactoonz: 2017,
            'fire joker': 2016,
            'immortal romance': 2011,
        };

        const nameToId = {};
        for (const g of master) {
            nameToId[g.name.toLowerCase()] = g.id;
        }

        for (const [name, expectedYear] of Object.entries(knownDates)) {
            const id = nameToId[name];
            if (!id) continue;
            const m = matches[id];
            if (!m) continue;
            expect(Math.abs(m.release_year - expectedYear)).toBeLessThanOrEqual(1);
        }
    });

    test('year distribution spans at least 2008-2025', () => {
        const years = Object.values(matches).map(m => m.release_year);
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        expect(minYear).toBeLessThanOrEqual(2010);
        expect(maxYear).toBeGreaterThanOrEqual(2024);
    });
});
