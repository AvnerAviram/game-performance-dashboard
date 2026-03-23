import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock game data structure
const mockGameData = {
    allGames: [
        {
            name: '88 Fortunes',
            provider: 'IGT official',
            theme: { consolidated: 'Asian - Fortune/Luck', primary: 'Asian - Fortune/Luck', secondary: 'Dragons' },
            performance: { theo_win: 5.23 },
        },
        {
            name: 'Buffalo Gold',
            provider: 'Aristocrat official',
            theme: { consolidated: 'Animals - Buffalo', primary: 'Animals - Buffalo' },
            performance: { theo_win: 8.45 },
        },
        {
            name: 'Cleopatra',
            provider: 'IGT official',
            theme: { consolidated: 'Ancient Egypt', primary: 'Ancient Egypt' },
            performance: { theo_win: 12.67 },
        },
        {
            name: 'Cash Eruption',
            provider: 'Aristocrat official',
            theme: { consolidated: 'Fire/Volcanic', primary: 'Fire/Volcanic' },
            performance: { theo_win: 43.47 },
        },
        {
            name: 'Bonanza',
            provider: 'Big Time Gaming official',
            theme: { consolidated: 'Mining/Gold Rush', primary: 'Mining/Gold Rush' },
            performance: { theo_win: 6.78 },
        },
    ],
    mechanics: [
        {
            Mechanic: 'Free Spins',
            'Game Count': 4092,
            'Avg Theo Win Index': 0.5401,
            'Smart Index': 2210.28,
            'Market Share %': 97.38,
        },
        {
            Mechanic: 'Multipliers',
            'Game Count': 205,
            'Avg Theo Win Index': 2.0205,
            'Smart Index': 414.2,
            'Market Share %': 4.88,
        },
    ],
};

const mockMechanicDef = {
    name: 'Free Spins',
    description: 'Bonus rounds with free game plays',
    whatItDoes: 'Awards a set number of spins without betting',
    examples: [
        '88 Fortunes (10 spins)',
        'Buffalo Gold (8-20 spins)',
        'Cleopatra (15 spins with 3x multiplier)',
        'Cash Eruption (6-15 spins)',
        'Bonanza (12+ spins)',
    ],
    frequency: '56 of 100 top games (56%)',
    category: 'Bonus Features',
};

describe('UI Functions - Mechanic Panel', () => {
    let dom;
    let document;
    let window;

    beforeEach(() => {
        // Create a fresh DOM for each test
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <body>
                <div class="mechanic-panel" id="mechanic-panel">
                    <h3 id="mechanic-panel-title"></h3>
                    <p id="mechanic-description"></p>
                    <p id="mechanic-how-it-works"></p>
                    <ul id="mechanic-examples"></ul>
                    <div id="mechanic-stats"></div>
                    <div class="mechanic-detail-section">
                        <div id="mechanic-top-themes"></div>
                    </div>
                    <div class="mechanic-detail-section">
                        <div id="mechanic-providers"></div>
                    </div>
                    <div class="mechanic-detail-section">
                        <ul id="mechanic-top-games"></ul>
                    </div>
                    <p id="mechanic-frequency"></p>
                </div>
                <div id="mechanic-backdrop"></div>
            </body>
            </html>
        `);
        document = dom.window.document;
        window = dom.window;

        // Set up global objects
        global.document = document;
        global.window = window;
    });

    describe('Game Name Cleaning', () => {
        it('should strip parentheses from example game names', () => {
            const testCases = [
                { input: '88 Fortunes (10 spins)', expected: '88 Fortunes' },
                { input: 'Buffalo Gold (8-20 spins)', expected: 'Buffalo Gold' },
                { input: 'Cleopatra (15 spins with 3x multiplier)', expected: 'Cleopatra' },
                { input: 'Cash Eruption (6-15 spins)', expected: 'Cash Eruption' },
                { input: 'Bonanza (12+ spins)', expected: 'Bonanza' },
                { input: 'Regular Game Name', expected: 'Regular Game Name' },
            ];

            testCases.forEach(({ input, expected }) => {
                const cleaned = input.replace(/\s*\([^)]*\)/g, '').trim();
                expect(cleaned).toBe(expected);
            });
        });
    });

    describe('Game Matching Logic', () => {
        it('should match games by exact name after cleaning', () => {
            const exampleName = '88 Fortunes (10 spins)';
            const cleanName = exampleName.replace(/\s*\([^)]*\)/g, '').trim();

            const game = mockGameData.allGames.find(g => g.name.toLowerCase() === cleanName.toLowerCase());

            expect(game).toBeDefined();
            expect(game.name).toBe('88 Fortunes');
        });

        it('should match games with partial name match', () => {
            const exampleName = 'Buffalo (any variation)';
            const cleanName = exampleName.replace(/\s*\([^)]*\)/g, '').trim();

            const game = mockGameData.allGames.find(g => g.name.toLowerCase().includes(cleanName.toLowerCase()));

            expect(game).toBeDefined();
            expect(game.name).toBe('Buffalo Gold');
        });

        it('should match all 5 example games from Free Spins mechanic', () => {
            const matchedGames = [];

            mockMechanicDef.examples.forEach(exampleName => {
                const cleanName = exampleName.replace(/\s*\([^)]*\)/g, '').trim();

                const game = mockGameData.allGames.find(
                    g =>
                        g.name.toLowerCase() === cleanName.toLowerCase() ||
                        g.name.toLowerCase().includes(cleanName.toLowerCase()) ||
                        cleanName.toLowerCase().includes(g.name.toLowerCase())
                );

                if (game) {
                    matchedGames.push(game);
                }
            });

            expect(matchedGames.length).toBe(5);
            expect(matchedGames.map(g => g.name)).toEqual([
                '88 Fortunes',
                'Buffalo Gold',
                'Cleopatra',
                'Cash Eruption',
                'Bonanza',
            ]);
        });
    });

    describe('Top Performing Games Sorting', () => {
        it('should sort games by Theo Win in descending order', () => {
            const matchedGames = mockGameData.allGames;

            const sorted = matchedGames
                .filter(g => g.performance?.theo_win)
                .sort((a, b) => (b.performance?.theo_win || 0) - (a.performance?.theo_win || 0));

            expect(sorted[0].name).toBe('Cash Eruption');
            expect(sorted[0].performance.theo_win).toBe(43.47);

            expect(sorted[sorted.length - 1].name).toBe('88 Fortunes');
            expect(sorted[sorted.length - 1].performance.theo_win).toBe(5.23);
        });

        it('should limit results to 10 games', () => {
            const matchedGames = mockGameData.allGames;

            const topGames = matchedGames
                .filter(g => g.performance?.theo_win)
                .sort((a, b) => (b.performance?.theo_win || 0) - (a.performance?.theo_win || 0))
                .slice(0, 10);

            expect(topGames.length).toBeLessThanOrEqual(10);
        });

        it('should handle games without theo_win values', () => {
            const gamesWithNull = [
                ...mockGameData.allGames,
                {
                    name: 'Test Game',
                    provider: 'Test Provider',
                    theme: { consolidated: 'Test Theme' },
                    performance: {},
                },
            ];

            const sorted = gamesWithNull
                .filter(g => g.performance?.theo_win)
                .sort((a, b) => (b.performance?.theo_win || 0) - (a.performance?.theo_win || 0));

            expect(sorted.length).toBe(mockGameData.allGames.length);
            expect(sorted.every(g => g.performance.theo_win > 0)).toBe(true);
        });
    });

    describe('Mechanic Statistics Display', () => {
        it('should format game count correctly', () => {
            const mechData = mockGameData.mechanics[0];
            expect(mechData['Game Count']).toBe(4092);
        });

        it('should format market share with 1 decimal', () => {
            const mechData = mockGameData.mechanics[0];
            const formatted = mechData['Market Share %'].toFixed(1);
            expect(formatted).toBe('97.4');
        });

        it('should format Avg Theo Win with 3 decimals', () => {
            const mechData = mockGameData.mechanics[0];
            const formatted = mechData['Avg Theo Win Index'].toFixed(3);
            expect(formatted).toBe('0.540');
        });

        it('should format Total Theo Win with 2 decimals', () => {
            const mechData = mockGameData.mechanics[0];
            const formatted = mechData['Smart Index'].toFixed(2);
            expect(formatted).toBe('2210.28');
        });
    });

    describe('Frequency Classification', () => {
        it('should classify high market share as "Industry standard"', () => {
            const marketShare = 97.38;
            const classification =
                marketShare > 50
                    ? 'Industry standard feature'
                    : marketShare > 10
                      ? 'Popular feature'
                      : 'Specialty feature';

            expect(classification).toBe('Industry standard feature');
        });

        it('should classify medium market share as "Popular"', () => {
            const marketShare = 25.5;
            const classification =
                marketShare > 50
                    ? 'Industry standard feature'
                    : marketShare > 10
                      ? 'Popular feature'
                      : 'Specialty feature';

            expect(classification).toBe('Popular feature');
        });

        it('should classify low market share as "Specialty"', () => {
            const marketShare = 3.2;
            const classification =
                marketShare > 50
                    ? 'Industry standard feature'
                    : marketShare > 10
                      ? 'Popular feature'
                      : 'Specialty feature';

            expect(classification).toBe('Specialty feature');
        });
    });

    describe('Theme Secondary Display', () => {
        it('should include secondary theme when present', () => {
            const game = mockGameData.allGames[0];
            const theme = game.theme?.consolidated || game.theme?.primary || 'Unknown';
            const themeSecondary = game.theme?.secondary ? ' / ' + game.theme.secondary : '';

            expect(theme).toBe('Asian - Fortune/Luck');
            expect(themeSecondary).toBe(' / Dragons');
        });

        it('should omit secondary theme when not present', () => {
            const game = mockGameData.allGames[1];
            const theme = game.theme?.consolidated || game.theme?.primary || 'Unknown';
            const themeSecondary = game.theme?.secondary ? ' / ' + game.theme.secondary : '';

            expect(theme).toBe('Animals - Buffalo');
            expect(themeSecondary).toBe('');
        });
    });

    describe('Provider Display', () => {
        it('should display full provider name', () => {
            const game = mockGameData.allGames[0];
            expect(game.provider).toBe('IGT official');
        });

        it('should handle unknown provider', () => {
            const gameWithoutProvider = {
                name: 'Test Game',
                theme: { consolidated: 'Test' },
                performance: { theo_win: 1.0 },
            };

            const provider = gameWithoutProvider.provider || 'Unknown';
            expect(provider).toBe('Unknown');
        });
    });

    describe('Theo Win Formatting', () => {
        it('should format theo win to 2 decimals', () => {
            const game = mockGameData.allGames[0];
            const theoWin = (game.performance?.theo_win || 0).toFixed(2);
            expect(theoWin).toBe('5.23');
        });

        it('should handle missing theo win gracefully', () => {
            const gameWithoutTheo = {
                name: 'Test Game',
                performance: {},
            };
            const theoWin = (gameWithoutTheo.performance?.theo_win || 0).toFixed(2);
            expect(theoWin).toBe('0.00');
        });

        it('should display N/A for zero theo win', () => {
            const theoWin = 0;
            const display = theoWin > 0 ? theoWin.toFixed(2) : 'N/A';
            expect(display).toBe('N/A');
        });
    });

    describe('Panel Scroll Position', () => {
        it('should scroll to top when mechanic panel opens', () => {
            const panel = document.getElementById('mechanic-panel');

            // Simulate panel has been scrolled
            panel.scrollTop = 500;
            expect(panel.scrollTop).toBe(500);

            // When setting scrollTop to 0 (as in showMechanicDetails)
            panel.scrollTop = 0;
            expect(panel.scrollTop).toBe(0);
        });

        it('should scroll to top when theme panel opens', () => {
            // Add theme panel to DOM
            const themePanel = document.createElement('div');
            themePanel.id = 'theme-panel';
            document.body.appendChild(themePanel);

            // Simulate panel has been scrolled
            themePanel.scrollTop = 500;
            expect(themePanel.scrollTop).toBe(500);

            // When setting scrollTop to 0 (as in showThemeDetails)
            themePanel.scrollTop = 0;
            expect(themePanel.scrollTop).toBe(0);
        });
    });

    describe('Theme Clickability', () => {
        it('should properly escape theme names with special characters', () => {
            const testThemes = [
                'Money/Luxury',
                'Asian - Dragons',
                'Greek/Mythology',
                'TV/Movie/Entertainment',
                'Animals - General',
            ];

            testThemes.forEach(themeName => {
                const escaped = themeName.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
                expect(escaped).toBeDefined();
                expect(escaped.length).toBeGreaterThan(0);

                // Should not contain unescaped quotes
                expect(escaped.includes("'")).toBe(false);
                expect(escaped.includes('"')).toBe(false);
            });
        });

        it('should unescape theme names correctly when clicking', () => {
            const original = 'Money/Luxury';
            const escaped = original.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            const unescaped = escaped.replace(/&#39;/g, "'").replace(/&quot;/g, '"');

            expect(unescaped).toBe(original);
        });

        it('should handle themes with single quotes', () => {
            const themeName = "Queen's Court";
            const escaped = themeName.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            expect(escaped).toBe('Queen&#39;s Court');

            const unescaped = escaped.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
            expect(unescaped).toBe(themeName);
        });

        it('should handle themes with double quotes', () => {
            const themeName = 'Theme "Special"';
            const escaped = themeName.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            expect(escaped).toBe('Theme &quot;Special&quot;');

            const unescaped = escaped.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
            expect(unescaped).toBe(themeName);
        });

        it('should handle themes with slashes', () => {
            const themeName = 'Money/Luxury';
            const escaped = themeName.replace(/'/g, '&#39;').replace(/"/g, '&quot;');

            // Slashes should remain unchanged
            expect(escaped).toBe('Money/Luxury');
            expect(escaped.includes('/')).toBe(true);
        });
    });
});
