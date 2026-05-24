import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { MASTER_JSON, MAPPINGS, STAGING } from '../helpers/paths.js';

/** Must match classify_art.py VALID_THEMES (authoritative art vocabulary). */
const VALID_THEMES = [
    'Egyptian/Pharaoh',
    'Ancient Greece/Rome',
    'Norse/Viking Realm',
    'Aztec/Mayan',
    'Asian Temple/Garden',
    'Arabian Palace/Bazaar',
    'Indian/South Asian',
    'Medieval Castle',
    'Prehistoric/Primordial',
    'Irish/Celtic Highlands',
    'Jungle/Rainforest',
    'Deep Ocean/Underwater',
    'Atlantis/Lost City',
    'Tropical Island/Beach',
    'Arctic/Snow',
    'Desert/Sahara',
    'Mountain/Volcano',
    'Savanna/Wildlife',
    'Prairie/Plains/Grassland',
    'Australian Outback',
    'Lakeside/River/Fishing Dock',
    'Farm/Countryside',
    'Forest/Woodland',
    'Fantasy/Fairy Tale',
    'Haunted Manor/Graveyard',
    'Outer Space',
    'Urban/Modern City',
    'Neon/Cyber City',
    'Casino Floor',
    'Luxury/VIP',
    'Wild West/Frontier',
    'Pirate Ship/Port',
    'Crime/Heist',
    'Sports',
    'Music/Entertainment',
    'Food/Cooking',
    'Mexican/Latin Village',
    'Steampunk/Victorian',
    'Circus/Carnival',
    'Branded/Licensed',
    'Classic Slots',
    'Fruit Machine',
    'Candy/Sweet World',
    'Royal Palace/Court',
    'Treasure Cave/Mine',
    'Tavern/Saloon',
    'Laboratory/Workshop',
    'Festive/Holiday',
    'Inferno/Fire',
    'American Patriotic',
    'Love Story/Romance',
    'Quest/Adventure/Journey',
    'Suburban/Residential',
    'Train/Railway Station',
];

describe('art_theme_consolidation_map contract', () => {
    let artThemeMap;
    let themeMap;
    let games;
    let stagedArt;

    beforeAll(() => {
        artThemeMap = JSON.parse(readFileSync(MAPPINGS.artTheme, 'utf-8'));
        themeMap = JSON.parse(readFileSync(MAPPINGS.theme, 'utf-8'));
        games = JSON.parse(readFileSync(MASTER_JSON, 'utf-8'));
        stagedArt = JSON.parse(readFileSync(STAGING.art, 'utf-8'));
    });

    test('every canonical VALID_THEMES entry has a row in the art map', () => {
        for (const t of VALID_THEMES) {
            expect(artThemeMap).toHaveProperty(t);
        }
    });

    test('every art map key is either a VALID_THEMES label or appears in live art_theme data', () => {
        const used = new Set();
        for (const g of games) {
            if (g.art_theme) used.add(g.art_theme);
        }
        for (const v of Object.values(stagedArt)) {
            if (v?.art_theme) used.add(v.art_theme);
        }
        const validSet = new Set(VALID_THEMES);
        for (const key of Object.keys(artThemeMap)) {
            expect(validSet.has(key) || used.has(key)).toBe(true);
        }
    });

    test('every consolidated target appears as a theme_consolidation_map output value', () => {
        const allowedOutputs = new Set(Object.values(themeMap));
        const bad = [...new Set(Object.values(artThemeMap))].filter(v => !allowedOutputs.has(v));
        expect(bad).toEqual([]);
    });

    test('no mapping value is Unknown', () => {
        expect(Object.values(artThemeMap).some(v => v === 'Unknown')).toBe(false);
    });

    test('every non-null art_theme on master games exists in art map keys', () => {
        const missing = [];
        for (const g of games) {
            const t = g.art_theme;
            if (t == null || t === '') continue;
            if (!(t in artThemeMap)) missing.push({ name: g.name, art_theme: t });
        }
        expect(missing).toEqual([]);
    });

    test('every art_theme on staged_art_characterization exists in art map keys', () => {
        const missing = [];
        for (const [name, v] of Object.entries(stagedArt)) {
            const t = v?.art_theme;
            if (t == null || t === '') continue;
            if (!(t in artThemeMap)) missing.push({ game: name, art_theme: t });
        }
        expect(missing).toEqual([]);
    });
});
