import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock global gameData
global.gameData = {
    allGames: [],
};

describe('Providers & Games Pages - Unit Tests', () => {
    let dom;
    let document;

    beforeAll(async () => {
        // Setup DOM environment
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <body>
                <div id="providers-content"></div>
                <span id="providers-count"></span>
                <input id="provider-search" />
                <button id="clear-provider-search"></button>
                
                <div id="games-content"></div>
                <span id="games-count"></span>
                <input id="games-search" />
                <select id="games-filter-provider"></select>
                <select id="games-filter-mechanic"></select>
            </body>
            </html>
        `);
        document = dom.window.document;
        global.document = document;
        global.window = dom.window;
    });

    describe('Data Structure Tests', () => {
        it('should have valid flattened game data structure', () => {
            const sampleGame = {
                name: 'Test Game',
                provider_studio: 'Test Studio',
                provider_parent: 'Test Parent',
                theme_consolidated: 'Test Theme',
                mechanic_primary: 'Test Mechanic',
                performance_rank: 1,
                performance_theo_win: 10.5,
                performance_market_share_percent: 2.5,
                specs_rtp: 96.5,
                specs_volatility: 'medium',
                release_year: 2024,
            };

            expect(sampleGame.provider_studio).toBeDefined();
            expect(sampleGame.theme_consolidated).toBeDefined();
            expect(sampleGame.mechanic_primary).toBeDefined();
            expect(typeof sampleGame.performance_theo_win).toBe('number');
        });

        it('should validate provider data structure', () => {
            const sampleProvider = {
                studio: 'IGT',
                parent: 'IGT',
                game_count: 10,
                avg_theo_win: 15.5,
                total_market_share: 5.2,
                avg_rtp: 96.1,
                dominant_volatility: 'medium',
            };

            expect(sampleProvider.studio).toBeDefined();
            expect(sampleProvider.game_count).toBeGreaterThan(0);
            expect(sampleProvider.avg_theo_win).toBeGreaterThan(0);
            expect(typeof sampleProvider.total_market_share).toBe('number');
        });
    });

    describe('Pagination Logic', () => {
        it('should calculate correct pagination for 50 games', () => {
            const totalGames = 50;
            const gamesPerPage = 50;
            const totalPages = Math.ceil(totalGames / gamesPerPage);

            expect(totalPages).toBe(1);
        });

        it('should calculate correct pagination for 150 games', () => {
            const totalGames = 150;
            const gamesPerPage = 50;
            const totalPages = Math.ceil(totalGames / gamesPerPage);

            expect(totalPages).toBe(3);
        });

        it('should slice games correctly for page 1', () => {
            const games = Array.from({ length: 150 }, (_, i) => ({ id: i }));
            const page = 0;
            const perPage = 50;
            const startIdx = page * perPage;
            const endIdx = Math.min(startIdx + perPage, games.length);
            const paginated = games.slice(startIdx, endIdx);

            expect(paginated.length).toBe(50);
            expect(paginated[0].id).toBe(0);
            expect(paginated[49].id).toBe(49);
        });

        it('should slice games correctly for page 2', () => {
            const games = Array.from({ length: 150 }, (_, i) => ({ id: i }));
            const page = 1;
            const perPage = 50;
            const startIdx = page * perPage;
            const endIdx = Math.min(startIdx + perPage, games.length);
            const paginated = games.slice(startIdx, endIdx);

            expect(paginated.length).toBe(50);
            expect(paginated[0].id).toBe(50);
            expect(paginated[49].id).toBe(99);
        });
    });

    describe('Sorting Logic', () => {
        it('should sort games by rank ascending', () => {
            const games = [{ performance_rank: 3 }, { performance_rank: 1 }, { performance_rank: 2 }];

            games.sort((a, b) => a.performance_rank - b.performance_rank);

            expect(games[0].performance_rank).toBe(1);
            expect(games[1].performance_rank).toBe(2);
            expect(games[2].performance_rank).toBe(3);
        });

        it('should sort games by theo win descending', () => {
            const games = [
                { performance_theo_win: 10.5 },
                { performance_theo_win: 20.3 },
                { performance_theo_win: 5.2 },
            ];

            games.sort((a, b) => b.performance_theo_win - a.performance_theo_win);

            expect(games[0].performance_theo_win).toBe(20.3);
            expect(games[1].performance_theo_win).toBe(10.5);
            expect(games[2].performance_theo_win).toBe(5.2);
        });

        it('should sort providers by game count descending', () => {
            const providers = [{ game_count: 5 }, { game_count: 15 }, { game_count: 10 }];

            providers.sort((a, b) => b.game_count - a.game_count);

            expect(providers[0].game_count).toBe(15);
            expect(providers[1].game_count).toBe(10);
            expect(providers[2].game_count).toBe(5);
        });
    });

    describe('Filter Logic', () => {
        it('should filter games by search term', () => {
            const games = [
                { name: 'Diamond Strike', provider_studio: 'IGT' },
                { name: 'Wolf Gold', provider_studio: 'Pragmatic' },
                { name: 'Starburst', provider_studio: 'NetEnt' },
            ];

            const searchTerm = 'diamond';
            const filtered = games.filter(
                g => g.name.toLowerCase().includes(searchTerm) || g.provider_studio.toLowerCase().includes(searchTerm)
            );

            expect(filtered.length).toBe(1);
            expect(filtered[0].name).toBe('Diamond Strike');
        });

        it('should filter games by provider', () => {
            const games = [
                { name: 'Game 1', provider_studio: 'IGT' },
                { name: 'Game 2', provider_studio: 'Pragmatic' },
                { name: 'Game 3', provider_studio: 'IGT' },
            ];

            const filtered = games.filter(g => g.provider_studio === 'IGT');

            expect(filtered.length).toBe(2);
        });

        it('should filter games by mechanic', () => {
            const games = [
                { name: 'Game 1', mechanic_primary: 'Cascading' },
                { name: 'Game 2', mechanic_primary: 'Megaways' },
                { name: 'Game 3', mechanic_primary: 'Cascading' },
            ];

            const filtered = games.filter(g => g.mechanic_primary === 'Cascading');

            expect(filtered.length).toBe(2);
        });

        it('should filter providers by search term', () => {
            const providers = [
                { studio: 'IGT', parent: 'IGT' },
                { studio: 'Pragmatic Play', parent: 'Pragmatic Play' },
                { studio: 'Light & Wonder', parent: 'Light & Wonder' },
            ];

            const searchTerm = 'play';
            const filtered = providers.filter(
                p => p.studio.toLowerCase().includes(searchTerm) || p.parent.toLowerCase().includes(searchTerm)
            );

            expect(filtered.length).toBe(1);
            expect(filtered[0].studio).toBe('Pragmatic Play');
        });
    });

    describe('Data Aggregation Validation', () => {
        it('should calculate correct average theo win', () => {
            const games = [{ performance_theo_win: 10 }, { performance_theo_win: 20 }, { performance_theo_win: 30 }];

            const total = games.reduce((sum, g) => sum + g.performance_theo_win, 0);
            const avg = total / games.length;

            expect(avg).toBe(20);
        });

        it('should calculate correct market share sum', () => {
            const games = [
                { performance_market_share_percent: 1.5 },
                { performance_market_share_percent: 2.0 },
                { performance_market_share_percent: 1.5 },
            ];

            const total = games.reduce((sum, g) => sum + g.performance_market_share_percent, 0);

            expect(total).toBe(5.0);
        });
    });

    describe('Volatility Badge Rendering', () => {
        it('should format volatility class correctly', () => {
            const volatilities = ['low', 'medium', 'high', 'very high', null];

            const classes = volatilities.map(v => (v || 'unknown').replace(/ /g, '-'));

            expect(classes[0]).toBe('low');
            expect(classes[1]).toBe('medium');
            expect(classes[2]).toBe('high');
            expect(classes[3]).toBe('very-high');
            expect(classes[4]).toBe('unknown');
        });
    });

    describe('Edge Cases', () => {
        it('should handle games with null/undefined values', () => {
            const game = {
                name: 'Test',
                performance_rank: null,
                performance_theo_win: undefined,
                specs_rtp: 0,
            };

            const rank = game.performance_rank || 999;
            const theo = game.performance_theo_win || 0;
            const rtp = game.specs_rtp;

            expect(rank).toBe(999);
            expect(theo).toBe(0);
            expect(rtp).toBe(0);
        });

        it('should handle empty games array', () => {
            const games = [];
            const totalPages = Math.ceil(games.length / 50);

            expect(totalPages).toBe(0);
        });

        it('should handle single game', () => {
            const games = [{ name: 'Test' }];
            const totalPages = Math.ceil(games.length / 50);

            expect(totalPages).toBe(1);
        });
    });
});

console.log('✅ Unit tests loaded');
