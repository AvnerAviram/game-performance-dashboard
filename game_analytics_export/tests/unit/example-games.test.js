import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const panelDetailsPath = resolve(__dirname, '../../src/ui/panel-details.js');

describe('Example Games – source-level validation', () => {
    const src = readFileSync(panelDetailsPath, 'utf8');

    const exampleSection = src.slice(
        src.indexOf('let examplesHtml;'),
        src.indexOf('examplesHtml = \'<div class="py-1.5')
    );

    describe('Fuzzy matching for example game lookup', () => {
        test('uses exact match first (g.name === gameName)', () => {
            expect(exampleSection).toContain('g.name === gameName');
        });

        test('falls back to startsWith for partial names', () => {
            expect(exampleSection).toContain('.startsWith(gameName.toLowerCase())');
        });

        test('falls back to includes for broader matching', () => {
            expect(exampleSection).toContain('.includes(gameName.toLowerCase())');
        });

        test('matching is case-insensitive', () => {
            expect(exampleSection).toContain('gameName.toLowerCase()');
        });
    });

    describe('Theo display uses F.theoWin', () => {
        test('uses F.theoWin for matched game theo', () => {
            expect(exampleSection).toContain('F.theoWin(matchedGame)');
        });

        test('does not use raw performance_theo_win for example games', () => {
            expect(exampleSection).not.toContain('matchedGame.performance_theo_win');
        });
    });

    describe('Click handler behavior for unmatched games', () => {
        test('only adds onclick when matchedGame exists', () => {
            expect(exampleSection).toMatch(/matchedGame\s*\?/);
            expect(exampleSection).toContain('safeOnclick');
        });

        test('unmatched games get reduced opacity', () => {
            expect(exampleSection).toContain('opacity-60');
        });

        test('unmatched games do not get cursor-pointer', () => {
            const unmatchedClass = exampleSection.match(/:\s*`class="[^"]*opacity-60[^"]*"/);
            expect(unmatchedClass).toBeTruthy();
            expect(unmatchedClass[0]).not.toContain('cursor-pointer');
        });

        test('uses resolvedName (from matched game) for display and click', () => {
            expect(exampleSection).toContain('resolvedName');
            expect(exampleSection).toContain("safeOnclick('window.showGameDetails', resolvedName)");
        });
    });

    describe('Theme panel resilience', () => {
        test('showThemeDetails does not bail immediately when themeData is null', () => {
            const themeFunc = src.slice(
                src.indexOf('window.showThemeDetails = function'),
                src.indexOf('window.closeThemePanel')
            );
            expect(themeFunc).not.toMatch(/if\s*\(\s*!themeData\s*\)\s*\{\s*\n?\s*console\.error.*\n?\s*return/);
        });

        test('showThemeDetails bails only when both themeData AND themeGames are empty', () => {
            expect(src).toContain('!themeData && themeGames.length === 0');
        });

        test('theme lookup is case-insensitive', () => {
            expect(src).toContain("(t.Theme || '').toLowerCase() === themeName.toLowerCase()");
        });
    });
});
