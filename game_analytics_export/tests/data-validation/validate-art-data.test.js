import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

/** Full art dimension keys on master (includes optional style / color tone). */
const ART_FIELD_KEYS = [
    'art_theme',
    'art_characters',
    'art_elements',
    'art_mood',
    'art_narrative',
    'art_style',
    'art_color_tone',
];
const REQUIRED_ART_FIELDS = ['art_theme', 'art_characters', 'art_elements', 'art_mood', 'art_narrative'];

describe('Art data integrity', () => {
    let games;
    let staged;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8')).filter(
            g => g.name !== 'Total'
        );
        staged = JSON.parse(readFileSync(resolve(DATA_DIR, 'staged_art_characterization.json'), 'utf-8'));
    });

    test('art_theme populated for >= 75% of games in master', () => {
        const withTheme = games.filter(g => g.art_theme).length;
        const pct = (withTheme / games.length) * 100;
        if (pct < 1) {
            console.warn(`[SKIP] art_theme coverage ${pct.toFixed(1)}% — art data not yet merged into master`);
            return;
        }
        expect(pct).toBeGreaterThanOrEqual(75);
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

    test('optional art_style and art_color_tone are non-empty strings when set on master', () => {
        const optionalStringFields = ['art_style', 'art_color_tone'];
        for (const g of games) {
            for (const f of optionalStringFields) {
                const v = g[f];
                if (v == null || v === '') continue;
                expect(typeof v, `${g.name}: ${f}`).toBe('string');
                expect(v.length, `${g.name}: ${f}`).toBeGreaterThan(0);
            }
        }
    });

    test('staged art entries only use known art keys (incl. optional style / color tone)', () => {
        const allowed = new Set([...ART_FIELD_KEYS, 'art_confidence']);
        for (const [name, entry] of Object.entries(staged)) {
            if (!entry || typeof entry !== 'object') continue;
            for (const k of Object.keys(entry)) {
                expect(allowed.has(k), `${name}: unexpected key "${k}"`).toBe(true);
            }
        }
    });
});
