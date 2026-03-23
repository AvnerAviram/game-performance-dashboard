import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../src/lib/filters.js';

const mockThemes = [
    { Theme: 'Fantasy', 'Game Count': 60, 'Avg Theo Win Index': 2.0, 'Smart Index': 4.5, 'Market Share %': 8 },
    { Theme: 'Egypt', 'Game Count': 40, 'Avg Theo Win Index': 2.5, 'Smart Index': 5.0, 'Market Share %': 6 },
    { Theme: 'Asian', 'Game Count': 30, 'Avg Theo Win Index': 1.8, 'Smart Index': 3.0, 'Market Share %': 4 },
];

const mockMechanics = [
    { Mechanic: 'Free Spins', 'Game Count': 100, 'Smart Index': 6.0 },
    { Mechanic: 'Hold & Win', 'Game Count': 50, 'Smart Index': 5.0 },
];

const mockProviders = [
    { name: 'NetEnt', game_count: 50, avg_theo_win: 2.0 },
    { name: 'Pragmatic', game_count: 30, avg_theo_win: 1.8 },
    { name: 'Small', game_count: 5, avg_theo_win: 1.2 },
];

const mockGames = [
    { name: 'A', 'Market Share': 0.5, 'Release Year': 2025, 'Theo Win': 2.0 },
    { name: 'B', 'Market Share': 0.01, 'Release Year': 2024, 'Theo Win': 3.0 },
    { name: 'C', 'Market Share': 0.001, 'Release Year': 2020, 'Theo Win': 1.0 },
];

describe('window.switchThemeView', () => {
    beforeEach(() => {
        window.gameData = { themes: mockThemes, mechanics: mockMechanics };
        window.themesCurrentPage = 1;
        window.renderThemes = vi.fn();

        document.body.innerHTML = `
            <div id="page-container">
                <button data-filter="all">All</button>
                <button data-filter="leaders">Leaders</button>
                <button data-filter="premium">Premium</button>
            </div>
            <span id="themes-count">0</span>
        `;
    });

    it('switches to all view and updates UI', () => {
        window.switchThemeView('all');
        expect(window.renderThemes).toHaveBeenCalled();
        expect(document.getElementById('themes-count').textContent).toBe('3');
    });

    it('switches to leaders view', () => {
        window.switchThemeView('leaders');
        expect(window.renderThemes).toHaveBeenCalled();
    });

    it('switches to premium view', () => {
        window.switchThemeView('premium');
        expect(window.renderThemes).toHaveBeenCalled();
    });

    it('updates active tab styling', () => {
        window.switchThemeView('leaders');
        const leadersBtn = document.querySelector('[data-filter="leaders"]');
        expect(leadersBtn.className).toContain('bg-indigo-600');
        const allBtn = document.querySelector('[data-filter="all"]');
        expect(allBtn.className).not.toContain('bg-indigo-600');
    });

    it('resets page to 1', () => {
        window.themesCurrentPage = 5;
        window.switchThemeView('all');
        expect(window.themesCurrentPage).toBe(1);
    });

    it('handles missing page-container gracefully', () => {
        document.body.innerHTML = '';
        window.switchThemeView('all');
        expect(window.renderThemes).toHaveBeenCalled();
    });

    it('handles missing renderThemes gracefully', () => {
        delete window.renderThemes;
        expect(() => window.switchThemeView('all')).not.toThrow();
    });

    it('handles missing themes-count span', () => {
        document.getElementById('themes-count')?.remove();
        expect(() => window.switchThemeView('all')).not.toThrow();
    });

    it('handles undefined themesCurrentPage', () => {
        delete window.themesCurrentPage;
        expect(() => window.switchThemeView('all')).not.toThrow();
    });
});

describe('window.switchMechanicView', () => {
    beforeEach(() => {
        window.gameData = { themes: mockThemes, mechanics: mockMechanics };
        window.mechanicsCurrentPage = 1;
        window.renderMechanics = vi.fn();
        document.body.innerHTML = `
            <div id="page-container">
                <button data-filter="all">All</button>
                <button data-filter="popular">Popular</button>
                <button data-filter="highPerforming">High Performing</button>
            </div>
            <span id="mechanics-count">0</span>
        `;
    });

    it('switches to all view', () => {
        window.switchMechanicView('all');
        expect(window.renderMechanics).toHaveBeenCalled();
    });

    it('switches to popular view', () => {
        window.switchMechanicView('popular');
        expect(window.renderMechanics).toHaveBeenCalled();
    });

    it('switches to highPerforming view', () => {
        window.switchMechanicView('highPerforming');
        expect(window.renderMechanics).toHaveBeenCalled();
    });

    it('updates active tab styling', () => {
        window.switchMechanicView('popular');
        const btn = document.querySelector('[data-filter="popular"]');
        expect(btn.className).toContain('bg-indigo-600');
    });

    it('handles missing renderMechanics', () => {
        delete window.renderMechanics;
        expect(() => window.switchMechanicView('all')).not.toThrow();
    });

    it('handles missing DOM elements', () => {
        document.body.innerHTML = '';
        delete window.mechanicsCurrentPage;
        expect(() => window.switchMechanicView('all')).not.toThrow();
    });
});

describe('window.switchGameView', () => {
    beforeEach(() => {
        window.gameData = { games: mockGames };
        window._setGameViewFilter = vi.fn();
        document.body.innerHTML = `
            <div id="page-container">
                <button data-filter="all">All</button>
                <button data-filter="marketLeaders">Market Leaders</button>
                <button data-filter="newReleases">New</button>
                <button data-filter="hiddenGems">Gems</button>
            </div>
        `;
    });

    it('switches to all view', () => {
        window.switchGameView('all');
        expect(window._setGameViewFilter).toHaveBeenCalledWith('all');
    });

    it('switches to marketLeaders view', () => {
        window.switchGameView('marketLeaders');
        expect(window._setGameViewFilter).toHaveBeenCalledWith('marketLeaders');
    });

    it('updates active tab styling', () => {
        window.switchGameView('marketLeaders');
        const btn = document.querySelector('[data-filter="marketLeaders"]');
        expect(btn.className).toContain('bg-indigo-600');
    });

    it('handles missing _setGameViewFilter', () => {
        delete window._setGameViewFilter;
        expect(() => window.switchGameView('all')).not.toThrow();
    });

    it('handles missing page-container', () => {
        document.body.innerHTML = '';
        expect(() => window.switchGameView('all')).not.toThrow();
    });
});

describe('window.switchProviderView', () => {
    beforeEach(() => {
        window.gameData = { providers: mockProviders };
        window.providersCurrentPage = 1;
        window.renderProviders = vi.fn();
        document.body.innerHTML = `
            <div id="page-container">
                <button data-filter="all">All</button>
                <button data-filter="topStudios">Top</button>
                <button data-filter="highQuality">Quality</button>
            </div>
            <span id="providers-count">0</span>
        `;
    });

    it('switches to all view', () => {
        window.switchProviderView('all');
        expect(window.renderProviders).toHaveBeenCalled();
    });

    it('switches to topStudios view', () => {
        window.switchProviderView('topStudios');
        expect(window.renderProviders).toHaveBeenCalled();
    });

    it('switches to highQuality view', () => {
        window.switchProviderView('highQuality');
        expect(window.renderProviders).toHaveBeenCalled();
    });

    it('updates active tab and count', () => {
        window.switchProviderView('topStudios');
        const btn = document.querySelector('[data-filter="topStudios"]');
        expect(btn.className).toContain('bg-indigo-600');
    });

    it('handles missing renderProviders', () => {
        delete window.renderProviders;
        expect(() => window.switchProviderView('all')).not.toThrow();
    });

    it('handles missing DOM elements', () => {
        document.body.innerHTML = '';
        delete window.providersCurrentPage;
        expect(() => window.switchProviderView('all')).not.toThrow();
    });

    it('resets page to 1', () => {
        window.providersCurrentPage = 3;
        window.switchProviderView('all');
        expect(window.providersCurrentPage).toBe(1);
    });

    it('handles empty providers', () => {
        window.gameData = { providers: [] };
        window.switchProviderView('topStudios');
        expect(window.renderProviders).toHaveBeenCalledWith([]);
    });
});
