import { describe, it, expect } from 'vitest';
import { F } from '../../src/lib/game-fields.js';

/**
 * Same predicate as theme panel drill-down (`showThemeDetails` in panel-details.js):
 * membership is keyed off consolidated theme only.
 */
function gamesMatchingThemePanel(games, themeName) {
    const tn = themeName.toLowerCase();
    return games.filter(g => {
        const primary = F.themeConsolidated(g);
        return primary.toLowerCase() === tn;
    });
}

describe('theme panel consolidation consistency', () => {
    const targetTheme = 'Egypt Classic';

    it('does not match games that only list the theme under themes_all', () => {
        const games = [
            {
                name: 'g1',
                theme_consolidated: 'Asian',
                theme_primary: 'Asian',
                themes_all: JSON.stringify(['Other', targetTheme]),
            },
        ];
        expect(gamesMatchingThemePanel(games, targetTheme)).toHaveLength(0);
        expect(F.themesAll(games[0]).includes(targetTheme)).toBe(true);
    });

    it('matches games whose theme_consolidated equals the drill-down theme', () => {
        const games = [
            {
                name: 'h1',
                theme_consolidated: targetTheme,
                theme_primary: 'Primary',
                themes_all: JSON.stringify(['Some Tag', 'Ignored']),
            },
        ];
        const matched = gamesMatchingThemePanel(games, targetTheme);
        expect(matched).toHaveLength(1);
        expect(F.themeConsolidated(matched[0])).toBe(targetTheme);
    });

    it('themes_all mismatch does not add false positives when consolidated differs', () => {
        const games = [
            {
                name: 'a',
                theme_consolidated: 'Animals',
                themes_all: [targetTheme, 'Savanna/Safari'],
            },
            {
                name: 'b',
                theme_consolidated: targetTheme,
                themes_all: ['Animals'],
            },
        ];
        const matched = gamesMatchingThemePanel(games, targetTheme);
        expect(matched.map(g => g.name)).toEqual(['b']);
    });
});
