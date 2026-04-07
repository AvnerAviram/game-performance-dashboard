import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('Art data integrity', () => {
    let games;
    let staged;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8')).filter(
            g => g.name !== 'Total'
        );
        staged = JSON.parse(readFileSync(resolve(DATA_DIR, 'staged_art_characterization.json'), 'utf-8'));
    });

    test('art_setting populated for >= 75% of games in master', () => {
        const withSetting = games.filter(g => g.art_setting).length;
        const pct = (withSetting / games.length) * 100;
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

    test('all 5 art fields are present on games with art_setting', () => {
        const ART_FIELDS = ['art_setting', 'art_characters', 'art_elements', 'art_mood', 'art_narrative'];
        const gamesWithArt = games.filter(g => g.art_setting);
        const incomplete = gamesWithArt.filter(g => ART_FIELDS.some(f => g[f] == null));
        expect(incomplete.length).toBe(0);
    });
});
