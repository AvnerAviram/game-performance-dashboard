import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CONFIG_DIR = resolve(import.meta.dirname, '../../src/config');

describe('Sub-theme data integrity', () => {
    let breakdowns;

    beforeAll(() => {
        const bd = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'theme-breakdowns.json'), 'utf-8'));
        breakdowns = bd.themes;
    });

    test('theme-breakdowns.json has themes', () => {
        expect(Object.keys(breakdowns).length).toBeGreaterThan(50);
    });

    test('every breakdown entry has game_count > 0', () => {
        for (const [key, val] of Object.entries(breakdowns)) {
            expect(typeof val.game_count, `${key} game_count type`).toBe('number');
            expect(val.game_count, `${key} game_count > 0`).toBeGreaterThan(0);
        }
    });

    test('Animals sub-themes are animal-related, not cross-theme tags', () => {
        const animalSubs = Object.keys(breakdowns).filter(k => {
            const lk = k.toLowerCase();
            return (
                lk !== 'animals' &&
                (lk.startsWith('animals ') || lk.startsWith('animals/') || lk.startsWith('animals -'))
            );
        });

        expect(animalSubs.length).toBeGreaterThanOrEqual(2);
        for (const sub of animalSubs) {
            expect(sub.toLowerCase()).toMatch(/^animals[\s/\-]/);
        }
        // These should NEVER be Animals sub-themes — they are separate consolidated themes
        const crossThemeTags = ['Western', 'Gold', 'Asian', 'Adventure', 'Money', 'Underwater'];
        for (const tag of crossThemeTags) {
            expect(animalSubs).not.toContain(tag);
        }
    });

    test('Fire sub-themes are fire-related, not cross-theme tags', () => {
        const fireSubs = Object.keys(breakdowns).filter(k => {
            const lk = k.toLowerCase();
            return lk !== 'fire' && (lk.startsWith('fire ') || lk.startsWith('fire/') || lk.startsWith('fire -'));
        });

        expect(fireSubs.length).toBeGreaterThanOrEqual(1);
        for (const sub of fireSubs) {
            expect(sub.toLowerCase()).toMatch(/^fire[\s/\-]/);
        }
    });

    const SKIP_SUFFIXES = new Set(['general', 'other', 'misc', 'miscellaneous']);

    /**
     * Mirrors the panel-details.js sub-theme lookup:
     * finds breakdown keys starting with the theme name, strips the prefix,
     * and filters out meaningless suffixes like "General".
     */
    function getSubThemesForPanel(themeName) {
        const lowerTheme = themeName.toLowerCase();
        const re = new RegExp('^' + themeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s/\\-]+', 'i');
        const results = [];
        for (const [key, val] of Object.entries(breakdowns)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey === lowerTheme) continue;
            if (!lowerKey.startsWith(lowerTheme + ' ') && !lowerKey.startsWith(lowerTheme + '/')) continue;
            const displayName = key.replace(re, '').trim();
            if (!displayName || SKIP_SUFFIXES.has(displayName.toLowerCase())) continue;
            results.push([displayName, val.game_count || 0]);
        }
        return results.sort((a, b) => b[1] - a[1]);
    }

    test('Animals sub-themes have clean display names', () => {
        const animals = getSubThemesForPanel('Animals');
        expect(animals.length).toBeGreaterThanOrEqual(2);
        const names = animals.map(([n]) => n);
        expect(names).toContain('Wolves');
        expect(names).toContain('Cats');
        expect(names).toContain('Buffalo');
        expect(names).not.toContain('Animals - General');
        expect(names).not.toContain('General');
    });

    test('Fire sub-themes have clean display names', () => {
        const fire = getSubThemesForPanel('Fire');
        expect(fire.length).toBeGreaterThanOrEqual(1);
        const names = fire.map(([n]) => n);
        expect(names).toContain('Volcanic');
        expect(names).toContain('Flames');
        expect(names).not.toContain('Fire/Volcanic');
    });

    test('sub-theme lookup does NOT return unrelated themes', () => {
        const animals = getSubThemesForPanel('Animals');
        const names = animals.map(([n]) => n);
        expect(names).not.toContain('Western');
        expect(names).not.toContain('Gold');
        expect(names).not.toContain('Asian');
        expect(names).not.toContain('Adventure');
        expect(names).not.toContain('Money');
    });

    test('themes without sub-categories return empty array', () => {
        const unknown = getSubThemesForPanel('Unknown');
        expect(unknown.length).toBe(0);
    });

    test('sub-theme game counts are all positive', () => {
        const themes = ['Animals', 'Fire', 'Asian', 'Egyptian', 'Fantasy'];
        for (const t of themes) {
            const subs = getSubThemesForPanel(t);
            for (const [name, count] of subs) {
                expect(count, `${name} should have count > 0`).toBeGreaterThan(0);
            }
        }
    });
});
