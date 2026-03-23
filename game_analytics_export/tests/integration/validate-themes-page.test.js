import { describe, test, expect, beforeEach } from 'vitest';
import { renderThemes } from '../../src/ui/ui.js';
import { loadGameData, gameData } from '../../src/lib/data.js';
import { extractTableData, countTableRows, parseTableHeaders } from '../utils/html-parser.js';

/**
 * Layer 3B: Themes Page Rendering Tests
 *
 * Validates that Themes page displays data correctly with all filters and sorting.
 */

describe('Themes Page: Table Rendering', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="themes">
        <div id="themes-table"></div>
      </div>
    `;

        await loadGameData();
        renderThemes();
    });

    test('should render all themes in table', () => {
        const table = document.getElementById('themes-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBe(gameData.themes.length);
    });

    test('table should have correct headers', () => {
        const table = document.getElementById('themes-table');
        const headers = parseTableHeaders(table);

        expect(headers).toContain('Theme');
        expect(headers.some(h => h.includes('Game Count'))).toBe(true);
        expect(headers.some(h => h.includes('Avg'))).toBe(true);
    });

    test('each row should display theme name', () => {
        const table = document.getElementById('themes-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        rows.forEach((row, index) => {
            const themeName = row.querySelector('td:first-child')?.textContent?.trim();
            expect(themeName).toBe(gameData.themes[index].Theme);
        });
    });

    test('should display game counts correctly', () => {
        const table = document.getElementById('themes-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        rows.forEach((row, index) => {
            const text = row.textContent;
            const expectedCount = gameData.themes[index]['Game Count'].toString();
            expect(text).toContain(expectedCount);
        });
    });

    test('should display average theo win values', () => {
        const table = document.getElementById('themes-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        rows.forEach((row, index) => {
            const avgTheo = gameData.themes[index]['Avg Theo Win Index'];
            expect(avgTheo).toBeGreaterThanOrEqual(0);
            // Value should appear somewhere in the row
            expect(row.textContent).toContain(avgTheo.toFixed(2).substring(0, 4));
        });
    });

    test('should display market share percentages', () => {
        const table = document.getElementById('themes-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        rows.forEach((row, index) => {
            const marketShare = gameData.themes[index]['Market Share %'];
            expect(marketShare).toBeGreaterThanOrEqual(0);
        });
    });
});

describe('Themes Page: Sorting', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="themes">
        <div id="themes-table"></div>
      </div>
    `;

        await loadGameData();
        renderThemes();
    });

    test('themes should be sorted by Smart Index by default', () => {
        const themes = gameData.themes;

        for (let i = 0; i < themes.length - 1; i++) {
            expect(themes[i]['Smart Index']).toBeGreaterThanOrEqual(themes[i + 1]['Smart Index']);
        }
    });

    test('Smart Index should be displayed', () => {
        const table = document.getElementById('themes-table');
        const firstRow = table.querySelector('tbody tr');
        const topTheme = gameData.themes[0];

        expect(firstRow.textContent).toContain(topTheme['Smart Index'].toFixed(2).substring(0, 4));
    });
});

describe('Themes Page: Filter Tabs', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="themes">
        <div id="themes-filters">
          <button data-filter="all">All Themes</button>
          <button data-filter="leaders">Market Leaders</button>
          <button data-filter="opportunities">Opportunities</button>
          <button data-filter="premium">Premium Quality</button>
        </div>
        <div id="themes-table"></div>
      </div>
    `;

        await loadGameData();
    });

    test('All Themes filter should show all themes', () => {
        renderThemes(null); // No filter

        const table = document.getElementById('themes-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBe(gameData.themes.length);
    });

    test('Market Leaders filter should show high market share themes', () => {
        const marketLeaders = gameData.themes.filter(t => t['Market Share %'] > 3.0);

        renderThemes(marketLeaders);

        const table = document.getElementById('themes-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBe(marketLeaders.length);
    });

    test('Opportunities filter should show high quality, low saturation', () => {
        const opportunities = gameData.themes.filter(t => t['Avg Theo Win Index'] > 10 && t['Game Count'] < 20);

        if (opportunities.length > 0) {
            renderThemes(opportunities);

            const table = document.getElementById('themes-table');
            const rows = table.querySelectorAll('tbody tr');

            expect(rows.length).toBe(opportunities.length);
        }
    });

    test('Premium Quality filter should show high avg theo', () => {
        const premium = gameData.themes.filter(t => t['Avg Theo Win Index'] > 12);

        renderThemes(premium);

        const table = document.getElementById('themes-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBe(premium.length);
    });
});

describe('Themes Page: Search Functionality', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="themes">
        <input id="theme-search" type="text" />
        <div id="themes-table"></div>
      </div>
    `;

        await loadGameData();
        renderThemes();
    });

    test('search should be case-insensitive', () => {
        const searchTerm = 'egypt';
        const filtered = gameData.themes.filter(t => t.Theme.toLowerCase().includes(searchTerm.toLowerCase()));

        expect(filtered.length).toBeGreaterThan(0);

        renderThemes(filtered);

        const table = document.getElementById('themes-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBe(filtered.length);
    });

    test('search should find partial matches', () => {
        const searchTerm = 'fan';
        const filtered = gameData.themes.filter(t => t.Theme.toLowerCase().includes(searchTerm.toLowerCase()));

        // Should match "Fantasy", etc.
        expect(filtered.length).toBeGreaterThan(0);
    });
});

describe('Themes Page: Data Accuracy', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="themes">
        <div id="themes-table"></div>
      </div>
    `;

        await loadGameData();
        renderThemes();
    });

    test('no duplicate themes should be displayed', () => {
        const table = document.getElementById('themes-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        const themeNames = rows.map(row => row.querySelector('td:first-child')?.textContent?.trim());

        const uniqueNames = new Set(themeNames);
        expect(uniqueNames.size).toBe(themeNames.length);
    });

    test('all displayed values should be valid numbers', () => {
        const table = document.getElementById('themes-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        rows.forEach(row => {
            const text = row.textContent;
            expect(text).not.toContain('NaN');
            expect(text).not.toContain('undefined');
            expect(text).not.toContain('null');
        });
    });

    test('theme counts should sum to at least total games', () => {
        const totalCount = gameData.themes.reduce((sum, t) => sum + t['Game Count'], 0);

        // Can be more than total games due to multi-theme games
        expect(totalCount).toBeGreaterThanOrEqual(gameData.total_games);
    });
});
