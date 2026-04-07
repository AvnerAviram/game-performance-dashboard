import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const srcDir = resolve(__dirname, '../../src');

function readSrc(rel) {
    return readFileSync(resolve(srcDir, rel), 'utf8');
}

describe('Theme Clickability – source-level enforcement', () => {
    describe('All theme rendering locations use proper click handlers', () => {
        test('unified themes in themes-renderer.js use row.onclick for click delegation', () => {
            const src = readSrc('ui/renderers/themes-renderer.js');
            expect(src).toContain('row.onclick');
            expect(src).toContain('showThemeDetails');
        });

        test('themes-renderer.js has event delegation for .theme-link elements', () => {
            const src = readSrc('ui/renderers/themes-renderer.js');
            expect(src).toContain('.theme-link');
            expect(src).toContain('showThemeDetails');
            expect(src).toMatch(/addEventListener\(['"]click['"]/);
        });

        test('Build Next card themes are clickable via safeOnclick', () => {
            const src = readSrc('ui/renderers/insights-cards.js');
            const buildNextStart = src.indexOf('getBuildNextCombos');
            const buildNextEnd = src.indexOf('Build Next generated');
            const buildNextSection = src.slice(buildNextStart, buildNextEnd);
            expect(buildNextSection).toContain("safeOnclick('window.showThemeDetails'");
        });

        test('Avoid card themes are clickable via safeOnclick', () => {
            const src = readSrc('ui/renderers/insights-cards.js');
            const avoidStart = src.indexOf('getAvoidCombos');
            const avoidEnd = src.indexOf('Avoid generated');
            const avoidSection = src.slice(avoidStart, avoidEnd);
            expect(avoidSection).toContain("safeOnclick('window.showThemeDetails'");
        });

        test('Watch card themes use safeOnclick, not raw escapeHtml in onclick', () => {
            const src = readSrc('ui/renderers/insights-cards.js');
            const watchStart = src.indexOf('watchDiv');
            const watchSection = src.slice(watchStart);
            expect(watchSection).toContain("safeOnclick('window.showThemeDetails'");
            expect(watchSection).not.toMatch(/onclick="[^"]*\$\{escapeHtml\(/);
        });

        test('game panel primary theme is clickable', () => {
            const src = readSrc('ui/ui-panels.js');
            const themeMechStart = src.indexOf('themeMechContent');
            const themeMechSection = src.slice(themeMechStart, themeMechStart + 800);
            expect(themeMechSection).toContain("safeOnclick('window.showThemeDetails'");
            expect(themeMechSection).toContain('theme_primary');
        });

        test('game panel secondary theme is clickable', () => {
            const src = readSrc('ui/ui-panels.js');
            const secondaryIdx = src.indexOf('theme_secondary');
            const secondarySection = src.slice(secondaryIdx, secondaryIdx + 500);
            expect(secondarySection).toContain("safeOnclick('window.showThemeDetails'");
        });

        test('game panel All Themes chips are clickable', () => {
            const src = readSrc('ui/ui-panels.js');
            const chipsIdx = src.indexOf('All Themes');
            const chipsSection = src.slice(Math.max(0, chipsIdx - 300), chipsIdx);
            expect(chipsSection).toContain("safeOnclick('window.showThemeDetails'");
        });

        test('anomaly theme breakdown tiles are clickable', () => {
            const src = readSrc('ui/renderers/insights-renderer.js');
            const topSection = src.slice(src.indexOf('Theme Performance Breakdown'), src.indexOf('Key Takeaways'));
            expect(topSection).toContain("safeOnclick('window.showThemeDetails'");
            expect(topSection).toContain('cursor-pointer');
        });

        test('anomaly bottom performer theme context tiles are clickable', () => {
            const src = readSrc('ui/renderers/insights-renderer.js');
            const bottomSection = src.slice(src.indexOf('Theme Context'), src.indexOf('Improvement Opportunities'));
            expect(bottomSection).toContain("safeOnclick('window.showThemeDetails'");
            expect(bottomSection).toContain('cursor-pointer');
        });

        test('provider intelligence "Best in" theme is clickable', () => {
            const src = readSrc('ui/renderers/insights-providers.js');
            const bestInIdx = src.indexOf('Best in');
            const bestInSection = src.slice(bestInIdx, bestInIdx + 500);
            expect(bestInSection).toContain("safeOnclick('window.showThemeDetails'");
        });
    });

    describe('No raw escapeHtml inside onclick attributes for theme names', () => {
        test('no renderer uses escapeHtml inside onclick for showThemeDetails', () => {
            const rendererDir = resolve(srcDir, 'ui/renderers');
            const files = readdirSync(rendererDir).filter(f => f.endsWith('.js'));

            files.forEach(file => {
                const src = readFileSync(resolve(rendererDir, file), 'utf8');
                const dangerousPattern = /onclick="[^"]*\$\{escapeHtml\([^)]*\)\}[^"]*showThemeDetails/g;
                const reversePattern = /onclick="[^"]*showThemeDetails[^"]*\$\{escapeHtml\([^)]*\)\}/g;
                const matches = [...(src.match(dangerousPattern) || []), ...(src.match(reversePattern) || [])];
                expect(
                    matches,
                    `${file} uses escapeHtml inside onclick for showThemeDetails — use safeOnclick instead`
                ).toHaveLength(0);
            });
        });
    });

    describe('window.showThemeDetails is defined and accessible', () => {
        test('panel-details.js defines window.showThemeDetails', () => {
            const src = readSrc('ui/panel-details.js');
            expect(src).toMatch(/window\.showThemeDetails\s*=\s*function/);
        });

        test('panel-details.js defines window.showThemeForProvider', () => {
            const src = readSrc('ui/panel-details.js');
            expect(src).toMatch(/window\.showThemeForProvider\s*=\s*function/);
        });

        test('showThemeForProvider delegates to showThemeDetails', () => {
            const src = readSrc('ui/panel-details.js');
            const fnStart = src.indexOf('window.showThemeForProvider');
            const fnBody = src.slice(fnStart, fnStart + 200);
            expect(fnBody).toContain('showThemeDetails');
        });
    });

    describe('showThemeDetails uses F.themeConsolidated, not raw theme_consolidated', () => {
        test('panel-details.js game filter uses F.themeConsolidated or F.themesAll', () => {
            const src = readSrc('ui/panel-details.js');
            const filterIdx = src.indexOf('themeGames = allGames.filter');
            const filterBlock = src.slice(filterIdx, filterIdx + 300);
            expect(filterBlock).not.toContain('g.theme_consolidated');
            expect(filterBlock).toMatch(/F\.themeConsolidated|F\.themesAll/);
        });

        test('showThemeDetails does not use raw g.theme_consolidated for game matching', () => {
            const src = readSrc('ui/panel-details.js');
            const fnStart = src.indexOf('window.showThemeDetails = function');
            const fnEnd = src.indexOf('window.closeThemePanel');
            const fnBody = src.slice(fnStart, fnEnd);
            const rawAccesses = fnBody.match(/g\.theme_consolidated/g) || [];
            expect(
                rawAccesses,
                'showThemeDetails should use F.themeConsolidated(g) not raw g.theme_consolidated'
            ).toHaveLength(0);
        });
    });

    describe('theme_consolidation_map non-string values are handled safely', () => {
        test('panel-details.js guards toLowerCase calls on consolidation map values', () => {
            const src = readSrc('ui/panel-details.js');
            const mapSection = src.slice(
                src.indexOf('themeConsolidationMap'),
                src.indexOf('themeConsolidationMap') + 300
            );
            expect(mapSection).toMatch(/typeof\s+(key|val|k|mapped\[1\])\s*===\s*['"]string['"]/);
        });
    });

    describe('safeOnclick is imported where needed', () => {
        const filesNeedingSafeOnclick = [
            'ui/renderers/insights-cards.js',
            'ui/renderers/insights-renderer.js',
            'ui/renderers/insights-providers.js',
            'ui/renderers/insights-combos.js',
            'ui/renderers/insights-franchises.js',
            'ui/renderers/overview-renderer.js',
            'ui/ui-panels.js',
        ];

        filesNeedingSafeOnclick.forEach(file => {
            test(`${file} imports safeOnclick`, () => {
                const src = readSrc(file);
                expect(src).toMatch(/import\s*\{[^}]*safeOnclick[^}]*\}\s*from/);
            });
        });
    });
});
