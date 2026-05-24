import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { MASTER_JSON, STAGING } from '../helpers/paths.js';

/** Full art dimension keys on master (post-pipeline merge). */
const ART_FIELD_KEYS = [
    'art_theme',
    'art_theme_secondary',
    'art_characters',
    'art_elements',
    'art_narrative',
    'art_color_tone',
    'art_confidence',
    'background_description',
    'is_branded',
    'screenshot_quality',
];
const REQUIRED_ART_FIELDS = ['art_theme', 'art_characters', 'art_elements'];

describe('Art data integrity', () => {
    let games;
    let staged;

    beforeAll(() => {
        games = JSON.parse(readFileSync(MASTER_JSON, 'utf-8')).filter(g => g.name !== 'Total');
        staged = JSON.parse(readFileSync(STAGING.art, 'utf-8'));
    });

    test('art_theme populated for >= 2700 games (absolute count during migration)', () => {
        const withTheme = games.filter(g => g.art_theme).length;
        if (withTheme < 10) {
            console.warn(`[SKIP] art_theme count ${withTheme} — art data not yet merged into master`);
            return;
        }
        expect(withTheme).toBeGreaterThanOrEqual(2700);
    });

    test('art_characters populated for >= 75% of games in master', () => {
        const withChars = games.filter(g => Array.isArray(g.art_characters) && g.art_characters.length > 0).length;
        const pct = (withChars / games.length) * 100;
        expect(pct).toBeGreaterThanOrEqual(75);
    });

    test('every staged art entry has a matching game in master', () => {
        const masterNames = new Set(games.map(g => g.name));
        const orphans = Object.keys(staged).filter(name => !masterNames.has(name));
        expect(orphans).toEqual([]);
    });

    test('all required art fields are present on games with art_theme', () => {
        const gamesWithArt = games.filter(g => g.art_theme);
        const incomplete = gamesWithArt.filter(g => REQUIRED_ART_FIELDS.some(f => g[f] == null));
        expect(incomplete.length).toBe(0);
    });

    test('art_color_tone is an array of strings when set on master', () => {
        for (const g of games) {
            const v = g.art_color_tone;
            if (v == null) continue;
            expect(Array.isArray(v), `${g.name}: art_color_tone should be array`).toBe(true);
            for (const c of v) {
                expect(typeof c, `${g.name}: color entry`).toBe('string');
                expect(c.length, `${g.name}: color entry`).toBeGreaterThan(0);
            }
        }
    });

    test('staged art entries only use known art keys', () => {
        const allowed = new Set([
            ...ART_FIELD_KEYS,
            'art_setting',
            'art_mood',
            'art_style',
            'art_character_categories',
        ]);
        for (const [name, entry] of Object.entries(staged)) {
            if (!entry || typeof entry !== 'object') continue;
            for (const k of Object.keys(entry)) {
                expect(allowed.has(k), `${name}: unexpected key "${k}"`).toBe(true);
            }
        }
    });
});

describe('Theme system consistency', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(MASTER_JSON, 'utf-8')).filter(g => g.name !== 'Total');
    });

    test('art_theme count is between 30 and 80', () => {
        const themes = new Set(games.map(g => g.art_theme).filter(Boolean));
        expect(themes.size).toBeGreaterThanOrEqual(30);
        expect(themes.size).toBeLessThanOrEqual(80);
    });

    test('themes with <= 2 games are logged as warnings', () => {
        const counts = {};
        games.forEach(g => {
            if (g.art_theme) counts[g.art_theme] = (counts[g.art_theme] || 0) + 1;
        });
        const tiny = Object.entries(counts).filter(([, n]) => n <= 2);
        if (tiny.length > 0) {
            console.warn(`[QA] ${tiny.length} themes with <= 2 games: ${tiny.map(([t]) => t).join(', ')}`);
        }
        expect(tiny.length).toBeLessThan(25);
    });

    test('top theme by game count is Classic Slots', () => {
        const counts = {};
        games.forEach(g => {
            if (g.art_theme) counts[g.art_theme] = (counts[g.art_theme] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        expect(sorted[0][0]).toBe('Classic Slots');
    });
});
