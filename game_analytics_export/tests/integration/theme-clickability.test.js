import { describe, it, expect, beforeAll } from 'vitest';
import { loadGameData } from '../../src/lib/data.js';

let gameData;

describe('Theme Clickability - All Themes', () => {
    beforeAll(async () => {
        gameData = await loadGameData();
    });

    it('should have gameData loaded', () => {
        expect(gameData).toBeDefined();
        expect(gameData.themes).toBeDefined();
        expect(gameData.themes.length).toBeGreaterThan(0);
    });

    it('all top-level themes should be accessible', () => {
        const topLevelThemes = gameData.themes.map(t => t.Theme);
        
        expect(topLevelThemes.length).toBeGreaterThan(50);
        expect(topLevelThemes.length).toBeLessThan(120);
        
        console.log(`✓ Found ${topLevelThemes.length} top-level themes`);
    });

    it('all themes should have required data fields', () => {
        gameData.themes.forEach(theme => {
            expect(theme.Theme).toBeDefined();
            expect(typeof theme.Theme).toBe('string');
            expect(theme['Game Count']).toBeDefined();
            expect(theme['Game Count']).toBeGreaterThan(0);
            expect(theme['Avg Theo Win Index']).toBeDefined();
            expect(theme['Smart Index']).toBeDefined();
            expect(theme['Market Share %']).toBeDefined();
        });
    });

    it('consolidated themes should have sub-themes', () => {
        const consolidatedThemes = gameData.themes.filter(t => t._isUnified);
        
        expect(consolidatedThemes.length).toBeGreaterThan(5); // At least Animals, Asian, Money/Luxury, etc.
        
        consolidatedThemes.forEach(theme => {
            expect(theme._subthemes).toBeDefined();
            expect(Object.keys(theme._subthemes).length).toBeGreaterThan(0);
            
            console.log(`✓ ${theme.Theme}: ${Object.keys(theme._subthemes).length} sub-themes`);
        });
    });

    it('Money/Luxury should be a consolidated theme with sub-themes', () => {
        const moneyLuxury = gameData.themes.find(t => t.Theme === 'Money/Luxury');
        
        expect(moneyLuxury).toBeDefined();
        expect(moneyLuxury._isUnified).toBe(true);
        expect(moneyLuxury._subthemes).toBeDefined();
        
        // Should include Gems/Jewelry, Vault/Security
        const subThemeNames = Object.keys(moneyLuxury._subthemes);
        expect(subThemeNames.length).toBeGreaterThan(1);
        
        console.log(`✓ Money/Luxury sub-themes: ${subThemeNames.join(', ')}`);
    });

    it('Ancient Civilizations should be a consolidated theme', () => {
        const ancientCiv = gameData.themes.find(t => t.Theme === 'Ancient Civilizations');
        
        expect(ancientCiv).toBeDefined();
        expect(ancientCiv._isUnified).toBe(true);
        expect(ancientCiv._subthemes).toBeDefined();
        
        // Should include Ancient Egypt, Ancient Greece, Ancient Rome, Greek/Mythology
        const subThemeNames = Object.keys(ancientCiv._subthemes);
        expect(subThemeNames.length).toBeGreaterThanOrEqual(3);
        
        console.log(`✓ Ancient Civilizations sub-themes: ${subThemeNames.join(', ')}`);
    });

    it('Cultural/Regional should be a consolidated theme', () => {
        const cultural = gameData.themes.find(t => t.Theme === 'Cultural/Regional');
        
        expect(cultural).toBeDefined();
        expect(cultural._isUnified).toBe(true);
        expect(cultural._subthemes).toBeDefined();
        
        const subThemeNames = Object.keys(cultural._subthemes);
        expect(subThemeNames.length).toBeGreaterThanOrEqual(5);
        
        console.log(`✓ Cultural/Regional sub-themes: ${subThemeNames.join(', ')}`);
    });

    it('sub-themes should have proper data structure', () => {
        const consolidatedThemes = gameData.themes.filter(t => t._isUnified);
        
        consolidatedThemes.forEach(theme => {
            Object.entries(theme._subthemes).forEach(([subName, subTheme]) => {
                expect(subTheme.Theme).toBe(subName);
                expect(subTheme['Game Count']).toBeGreaterThan(0);
                expect(subTheme['Avg Theo Win Index']).toBeDefined();
                expect(subTheme['Smart Index']).toBeDefined();
                expect(subTheme['Market Share %']).toBeDefined();
            });
        });
    });

    it('all themes should have valid game counts', () => {
        gameData.themes.forEach(theme => {
            const gameCount = theme['Game Count'];
            expect(gameCount).toBeGreaterThan(0);
            expect(gameCount).toBeLessThan(200); // Sanity check - no theme should have 200+ games
        });
    });

    it('theme names should not have invalid characters', () => {
        gameData.themes.forEach(theme => {
            const themeName = theme.Theme;
            
            // Should not have HTML entities
            expect(themeName).not.toContain('&#39;');
            expect(themeName).not.toContain('&quot;');
            expect(themeName).not.toContain('&lt;');
            expect(themeName).not.toContain('&gt;');
            
            // Should be a valid string
            expect(themeName.length).toBeGreaterThan(0);
            expect(themeName.length).toBeLessThan(50);
        });
    });

    it('consolidated themes game counts should match sum of sub-themes', () => {
        const consolidatedThemes = gameData.themes.filter(t => t._isUnified);
        
        consolidatedThemes.forEach(theme => {
            const parentCount = theme['Game Count'];
            const subThemesSum = Object.values(theme._subthemes)
                .reduce((sum, sub) => sum + sub['Game Count'], 0);
            
            // Allow small difference due to rounding or de-duplication
            expect(Math.abs(parentCount - subThemesSum)).toBeLessThan(5);
        });
    });

    it('key consolidated themes should exist', () => {
        const expectedConsolidated = [
            'Animals',
            'Asian',
            'Money/Luxury',
            'Ancient Civilizations',
            'Cultural/Regional'
        ];

        expectedConsolidated.forEach(themeName => {
            const theme = gameData.themes.find(t => t.Theme === themeName);
            expect(theme).toBeDefined();
            expect(theme._isUnified).toBe(true);
            console.log(`✓ ${themeName}: ${theme['Game Count']} games`);
        });
    });

    it('non-consolidated themes should still work', () => {
        const nonConsolidated = gameData.themes.filter(t => !t._isUnified);
        
        expect(nonConsolidated.length).toBeGreaterThan(20);
        
        nonConsolidated.forEach(theme => {
            expect(theme._subthemes === null || theme._subthemes === undefined).toBe(true);
            expect(theme['Game Count']).toBeGreaterThan(0);
        });
        
        console.log(`✓ Found ${nonConsolidated.length} non-consolidated themes`);
    });
});
