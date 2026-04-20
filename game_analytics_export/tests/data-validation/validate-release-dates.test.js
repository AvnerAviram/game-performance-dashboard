import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { F } from '../../src/lib/game-fields.js';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('release dates in game_data_master.json', () => {
    let games;
    let slots;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
        slots = games.filter(g => g.game_category === 'Slot');
    });

    test('slots with original_release_year have valid source', () => {
        const withYear = slots.filter(g => g.original_release_year);
        const noSource = withYear.filter(g => !g.original_release_date_source);
        expect(noSource.map(g => `${g.name}: year but no source`)).toEqual([]);
    });

    test('no original_release_year before 1990', () => {
        const bad = games.filter(g => g.original_release_year && g.original_release_year < 1990);
        expect(bad.map(g => `${g.name}:${g.original_release_year}`)).toEqual([]);
    });

    test('no original_release_year after 2027', () => {
        const bad = games.filter(g => g.original_release_year && g.original_release_year > 2027);
        expect(bad.map(g => `${g.name}:${g.original_release_year}`)).toEqual([]);
    });

    test('original_release_month is 1-12 when present', () => {
        const bad = games.filter(
            g => g.original_release_month && (g.original_release_month < 1 || g.original_release_month > 12)
        );
        expect(bad.map(g => `${g.name}:${g.original_release_month}`)).toEqual([]);
    });

    test('original_release_date_source is a known value when present', () => {
        const allowedPrefixes = [
            'slotreport',
            'slotcatalog',
            'staged',
            'claude_verified',
            'evolution',
            'html_extract',
            'html_copyright',
            'nj_corrected',
            'verified_reference',
            'stripped_claude_calibration_failed',
            'ags_provider_data',
            'verified_review',
        ];
        const bad = games.filter(
            g =>
                g.original_release_date_source &&
                !allowedPrefixes.some(p => g.original_release_date_source.startsWith(p))
        );
        expect(bad.map(g => `${g.name}:${g.original_release_date_source}`)).toEqual([]);
    });

    test('existing release_year/release_month unchanged', () => {
        for (const g of games) {
            if (g.release_year) {
                expect(g.release_year).toBeGreaterThanOrEqual(2020);
                expect(g.release_year).toBeLessThanOrEqual(2026);
            }
        }
    });

    test('known games with trusted sources have correct original release years', () => {
        const knownDates = {
            Starburst: 2012,
            'Dead Or Alive': 2009,
            Reactoonz: 2017,
            'Fire Joker': 2016,
            'Immortal Romance': 2011,
            'Thunderstruck Ii': 2010,
            'Book Of Dead': 2016,
            'Divine Fortune': 2017,
            'Jimi Hendrix': 2016,
            Jumanji: 2018,
        };
        const agsKnownDates = {
            'Golden Wins': 2019,
            'Fu Nan Fu Nu': 2019,
            'River Dragons': 2019,
            'Bonanza Blast': 2020,
            'Olympus Strikes': 2019,
        };
        const nameMap = {};
        for (const g of games) nameMap[g.name] = g;

        for (const [name, expectedYear] of Object.entries(knownDates)) {
            const g = nameMap[name];
            if (!g || !g.original_release_year) continue;
            expect(Math.abs(g.original_release_year - expectedYear)).toBeLessThanOrEqual(1);
        }
        for (const [name, expectedYear] of Object.entries(agsKnownDates)) {
            const g = nameMap[name];
            if (!g) continue;
            expect(g.original_release_year).toBeDefined();
            expect(g.original_release_year).toBe(expectedYear);
            expect(g.original_release_date_source).toBe('ags_provider_data');
        }
    });

    test('original_release_year is not after NJ release_year (+1yr tolerance)', () => {
        const bad = games.filter(
            g => g.original_release_year && g.release_year && g.original_release_year > g.release_year + 1
        );
        expect(bad.map(g => `${g.name}:orig=${g.original_release_year},nj=${g.release_year}`)).toEqual([]);
    });

    test('year distribution: all original_release_year values are within valid range', () => {
        const years = games.filter(g => g.original_release_year).map(g => g.original_release_year);
        if (years.length === 0) return;
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        expect(minYear).toBeGreaterThanOrEqual(2005);
        expect(maxYear).toBeLessThanOrEqual(2027);
    });

    test('games with original_release_year from dated sources also have original_release_date', () => {
        const datedSources = new Set([
            'slotreport',
            'slotcatalog',
            'evolution',
            'slotreport_fuzzy',
            'slotcatalog_fuzzy',
        ]);
        const missing = games.filter(
            g => g.original_release_year && datedSources.has(g.original_release_date_source) && !g.original_release_date
        );
        expect(missing.length).toBe(0);
    });

    test('F.originalReleaseYear returns 0 when original is absent (no fallback to NJ)', () => {
        const noOriginal = games.filter(g => !g.original_release_year && g.release_year);
        expect(noOriginal.length).toBeGreaterThan(0);
        for (const g of noOriginal.slice(0, 10)) {
            expect(F.originalReleaseYear(g)).toBe(0);
        }
    });

    test('no games use claude_lookup as a trusted year source', () => {
        const claudeGames = games.filter(
            g => g.original_release_date_source && g.original_release_date_source.startsWith('claude_lookup')
        );
        expect(claudeGames.map(g => `${g.name}:${g.original_release_date_source}`)).toEqual([]);
    });

    test('stripped games have null original_release_year', () => {
        const bad = games.filter(
            g => g.original_release_date_source === 'stripped_claude_calibration_failed' && g.original_release_year
        );
        expect(bad.map(g => `${g.name} still has year ${g.original_release_year}`)).toEqual([]);
    });
});
