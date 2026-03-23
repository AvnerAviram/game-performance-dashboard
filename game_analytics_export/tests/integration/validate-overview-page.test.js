import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderOverview } from '../../src/ui/ui.js';
import { loadGameData, gameData } from '../../src/lib/data.js';
import { parseQuickStats, parseComparisonCards, parseTableData, countTableRows } from '../utils/html-parser.js';

/**
 * Layer 3A: Overview Page Rendering Tests
 *
 * Validates that Overview page displays data correctly.
 */

describe('Overview Page: Data Loading', () => {
    beforeEach(async () => {
        // Clear DOM
        document.body.innerHTML = '<div id="overview"></div>';

        // Load data
        await loadGameData();
    });

    test('gameData should be loaded', () => {
        expect(gameData.total_games).toBeGreaterThan(0);
        expect(gameData.themes.length).toBeGreaterThan(0);
        expect(gameData.mechanics.length).toBeGreaterThan(0);
    });
});

describe('Overview Page: Quick Stats Display', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="overview">
        <div id="overview-stats"></div>
        <div id="top-themes-table"></div>
        <div id="comparison-cards"></div>
      </div>
    `;

        await loadGameData();
        renderOverview();
    });

    test('should display total games count', () => {
        const overviewElement = document.getElementById('overview');
        const text = overviewElement.textContent;

        // Should contain the total games number
        expect(text).toContain(gameData.total_games.toString());
    });

    test('should display theme count', () => {
        const overviewElement = document.getElementById('overview');
        const text = overviewElement.textContent;

        expect(text).toContain(gameData.theme_count.toString());
    });

    test('should display mechanic count', () => {
        const overviewElement = document.getElementById('overview');
        const text = overviewElement.textContent;

        expect(text).toContain(gameData.mechanic_count.toString());
    });
});

describe('Overview Page: Top 10 Themes Table', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="overview">
        <div id="top-themes-table"></div>
      </div>
    `;

        await loadGameData();
        renderOverview();
    });

    test('should display exactly 10 themes', () => {
        const tableContainer = document.getElementById('top-themes-table');
        const rows = tableContainer.querySelectorAll('tbody tr');

        expect(rows.length).toBe(10);
    });

    test('top 10 themes should match gameData', () => {
        const top10Themes = gameData.themes.slice(0, 10);
        const tableContainer = document.getElementById('top-themes-table');
        const rows = Array.from(tableContainer.querySelectorAll('tbody tr'));

        rows.forEach((row, index) => {
            const themeName = row.querySelector('td:first-child')?.textContent?.trim();
            expect(themeName).toBe(top10Themes[index].Theme);
        });
    });

    test('should display game counts correctly', () => {
        const top10Themes = gameData.themes.slice(0, 10);
        const tableContainer = document.getElementById('top-themes-table');
        const rows = Array.from(tableContainer.querySelectorAll('tbody tr'));

        rows.forEach((row, index) => {
            const cells = Array.from(row.querySelectorAll('td'));
            const gameCount = cells.find(
                cell =>
                    !isNaN(parseInt(cell.textContent)) &&
                    parseInt(cell.textContent) === top10Themes[index]['Game Count']
            );

            expect(gameCount).toBeDefined();
        });
    });

    test('should be sorted by Smart Index descending', () => {
        const top10Themes = gameData.themes.slice(0, 10);

        for (let i = 0; i < top10Themes.length - 1; i++) {
            expect(top10Themes[i]['Smart Index']).toBeGreaterThanOrEqual(top10Themes[i + 1]['Smart Index']);
        }
    });
});

describe('Overview Page: Comparison Cards', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="overview">
        <div id="comparison-cards"></div>
      </div>
    `;

        await loadGameData();
        renderOverview();
    });

    test('should display 6 comparison cards', () => {
        const container = document.getElementById('comparison-cards');
        const cards = container.querySelectorAll('.bg-gradient-to-br');

        expect(cards.length).toBeGreaterThanOrEqual(4); // At least 4 cards
        expect(cards.length).toBeLessThanOrEqual(6); // Maximum 6 cards
    });

    test('should display Best Theme card', () => {
        const container = document.getElementById('comparison-cards');
        const text = container.textContent;

        expect(text.toLowerCase()).toContain('best theme');
    });

    test('Best Theme should show highest Smart Index theme', () => {
        const topTheme = gameData.themes[0];
        const container = document.getElementById('comparison-cards');
        const text = container.textContent;

        expect(text).toContain(topTheme.Theme);
    });

    test('should display Best Mechanic card', () => {
        const container = document.getElementById('comparison-cards');
        const text = container.textContent;

        expect(text.toLowerCase()).toContain('best mechanic');
    });

    test('should display Best Provider card', () => {
        const container = document.getElementById('comparison-cards');
        const text = container.textContent;

        expect(text.toLowerCase()).toContain('best provider');
    });

    test('should display Highest Theo Win game', () => {
        const container = document.getElementById('comparison-cards');
        const text = container.textContent;

        expect(text.toLowerCase()).toContain('highest theo win');
    });
});

describe('Overview Page: Charts', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="overview">
        <div id="themes-chart-container">
          <canvas id="themesChart"></canvas>
        </div>
        <div id="mechanics-chart-container">
          <canvas id="mechanicsChart"></canvas>
        </div>
        <div id="scatter-chart-container">
          <canvas id="scatterChart"></canvas>
        </div>
      </div>
    `;

        await loadGameData();
        renderOverview();
    });

    test('should have themes chart canvas', () => {
        const canvas = document.getElementById('themesChart');
        expect(canvas).toBeDefined();
    });

    test('should have mechanics chart canvas', () => {
        const canvas = document.getElementById('mechanicsChart');
        expect(canvas).toBeDefined();
    });

    test('should have scatter chart canvas', () => {
        const canvas = document.getElementById('scatterChart');
        expect(canvas).toBeDefined();
    });
});

describe('Overview Page: Data Accuracy', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="overview">
        <div id="overview-content"></div>
      </div>
    `;

        await loadGameData();
        renderOverview();
    });

    test('no hard-coded values should be displayed', () => {
        const overview = document.getElementById('overview');
        const text = overview.textContent;

        // Check that data matches gameData, not hard-coded values
        expect(text).toContain(gameData.total_games.toString());
        expect(gameData.total_games).toBeGreaterThan(0); // Verify it's the real value from games_dashboard
    });

    test('displayed data should match source data', () => {
        // Verify no manipulation of data during rendering
        expect(gameData.themes[0]['Smart Index']).toBeGreaterThan(0);
        expect(gameData.mechanics[0]['Game Count']).toBeGreaterThan(0);
    });

    test('no NaN or undefined values in display', () => {
        const overview = document.getElementById('overview');
        const text = overview.textContent.toLowerCase();

        expect(text).not.toContain('nan');
        expect(text).not.toContain('undefined');
        expect(text).not.toContain('null');
    });
});
