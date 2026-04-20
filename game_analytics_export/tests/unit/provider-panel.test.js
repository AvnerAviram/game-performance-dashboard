import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const uiPanelsPath = resolve(__dirname, '../../src/ui/ui-panels.js');
const panelDetailsPath = resolve(__dirname, '../../src/ui/panel-details.js');

describe('Provider Panel – source-level validation', () => {
    const uiPanelsSrc = readFileSync(uiPanelsPath, 'utf8');
    const panelDetailsSrc = readFileSync(panelDetailsPath, 'utf8');

    describe('Theme/mechanic click handlers use correct wrapper functions', () => {
        test('provider theme rows use showThemeForProvider in provider panel section', () => {
            const providerSection = uiPanelsSrc.slice(
                uiPanelsSrc.indexOf('showProviderDetails'),
                uiPanelsSrc.lastIndexOf('showProviderDetails')
            );
            const themeOnclicks = providerSection.match(/safeOnclick\(['"]window\.showThemeForProvider['"]/g) || [];
            expect(themeOnclicks.length).toBeGreaterThan(0);
        });

        test('provider mechanic rows use showMechForProvider, not showMechanicDetails', () => {
            const mechOnclicks = uiPanelsSrc.match(/safeOnclick\(['"]window\.showMech\w+['"]/g) || [];
            expect(mechOnclicks.length).toBeGreaterThan(0);
            mechOnclicks.forEach(call => {
                expect(call).toContain('showMechForProvider');
                expect(call).not.toContain('showMechanicDetails');
            });
        });

        test('showThemeForProvider wrapper exists and calls showThemeDetails with {provider}', () => {
            expect(panelDetailsSrc).toContain('window.showThemeForProvider');
            expect(panelDetailsSrc).toMatch(/showThemeDetails\(\w+,\s*\{\s*provider\s*\}/);
        });

        test('showMechForProvider wrapper exists and calls showMechanicDetails with {provider}', () => {
            expect(panelDetailsSrc).toContain('window.showMechForProvider');
            expect(panelDetailsSrc).toMatch(/showMechanicDetails\(\w+,\s*\{\s*provider\s*\}/);
        });
    });

    describe('GameListItem receives full game object (not shaped)', () => {
        test('provider panel spreads full game into GameListItem', () => {
            const providerGamesSection = uiPanelsSrc.slice(
                uiPanelsSrc.indexOf('// ===== TOP GAMES SECTION ====='),
                uiPanelsSrc.indexOf('// ===== TOP THEMES SECTION =====')
            );
            expect(providerGamesSection).toContain('GameListItem({ ...g');
            expect(providerGamesSection).not.toMatch(/GameListItem\(\{\s*\n?\s*name:/);
        });

        test('theme panel passes full game to GameListItem', () => {
            expect(panelDetailsSrc).toContain('GameListItem(game)');
        });

        test('mechanic panel passes full game to GameListItem', () => {
            expect(panelDetailsSrc).toContain('GameListItem(game)');
        });
    });

    describe('Null checks exist for DOM elements', () => {
        test('showGameDetails guards panel title', () => {
            expect(uiPanelsSrc).toMatch(/gamePanelTitle\)\s*\{?\s*gamePanelTitle\.(textContent|innerHTML)/);
        });

        test('showGameDetails guards panel and backdrop with if', () => {
            const fnStart = uiPanelsSrc.indexOf('export function showGameDetails');
            const fnEnd = uiPanelsSrc.indexOf('\nwindow.showGameDetails');
            const gameDetailsSection = uiPanelsSrc.slice(fnStart, fnEnd);
            expect(gameDetailsSection).toContain('if (panel)');
            expect(gameDetailsSection).toContain('if (backdrop)');
        });

        test('showProviderDetails guards panel title', () => {
            expect(uiPanelsSrc).toMatch(/provPanelTitle\)\s*provPanelTitle\.textContent/);
        });

        test('showProviderDetails guards panelContent write', () => {
            const fnStart = uiPanelsSrc.indexOf('export function showProviderDetails');
            const fnEnd = uiPanelsSrc.indexOf('\nwindow.showProviderDetails');
            const provSection = uiPanelsSrc.slice(fnStart, fnEnd);
            expect(provSection).toContain('if (panelContent)');
            expect(provSection).toContain('if (panel)');
            expect(provSection).toContain('if (backdrop)');
        });

        test('showThemeDetails guards titleEl and panelContent', () => {
            const themeSection = panelDetailsSrc.slice(
                panelDetailsSrc.indexOf('window.showThemeDetails'),
                panelDetailsSrc.indexOf('window.closeThemePanel')
            );
            expect(themeSection).toContain('if (titleEl)');
            expect(themeSection).toContain('if (themePanelContent)');
        });

        test('showMechanicDetails guards titleEl and mechPanelContent', () => {
            const mechSection = panelDetailsSrc.slice(
                panelDetailsSrc.indexOf('window.showMechanicDetails'),
                panelDetailsSrc.indexOf('window.closeMechanicPanel')
            );
            expect(mechSection).toContain('if (titleEl)');
            expect(mechSection).toContain('if (mechPanelContent)');
        });
    });

    describe('NaN percentile safety', () => {
        test('percentile parsing uses Number.isFinite guard', () => {
            expect(uiPanelsSrc).toContain('Number.isFinite(pctRaw)');
        });
    });

    describe('Field access uses F.xxx() accessors', () => {
        test('provider panel sorting uses F.theoWin', () => {
            const sortSection = uiPanelsSrc.slice(
                uiPanelsSrc.indexOf('// ===== TOP GAMES SECTION ====='),
                uiPanelsSrc.indexOf('const GAMES_INIT')
            );
            expect(sortSection).toContain('F.theoWin');
            expect(sortSection).not.toContain('performance_theo_win');
        });

        test('provider theme aggregation uses F.themeConsolidated', () => {
            const sectionStart = uiPanelsSrc.indexOf('// ===== TOP THEMES SECTION =====');
            const sectionEnd = uiPanelsSrc.indexOf('// ===== TOP FEATURES SECTION =====');
            const themeSection = uiPanelsSrc.slice(sectionStart, sectionEnd);
            expect(themeSection).toContain('F.themeConsolidated');
        });

        test('provider volatility uses F.volatility', () => {
            const volSection = uiPanelsSrc.slice(
                uiPanelsSrc.indexOf('// ===== VOLATILITY DISTRIBUTION'),
                uiPanelsSrc.indexOf('const maxVolCount')
            );
            expect(volSection).toContain('F.volatility');
            expect(volSection).not.toContain('g.specs_volatility');
        });
    });
});
