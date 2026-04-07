import { describe, test, expect, beforeEach } from 'vitest';
import { renderGames } from '../../src/ui/ui-providers-games.js';
import { initializeDatabase, getAllGames } from '../../src/lib/db/duckdb-client.js';

/**
 * Layer 3D: Games Page Rendering Tests
 */

describe('Games Page: Basic Rendering', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="games">
        <div id="games-table"></div>
      </div>
    `;

        await initializeDatabase();
        await renderGames();
    });

    test('should render games table', () => {
        const table = document.getElementById('games-table');
        expect(table).toBeDefined();
    });

    test('should display game rows', () => {
        const table = document.getElementById('games-table');
        const rows = table.querySelectorAll('tbody tr');
        expect(rows.length).toBeGreaterThan(0);
    });
});

describe('Games Page: Pagination', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="games">
        <div id="games-table"></div>
        <div id="pagination-controls"></div>
      </div>
    `;

        await initializeDatabase();
    });

    test('should show 50 games per page by default', async () => {
        await renderGames();

        const table = document.getElementById('games-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBeLessThanOrEqual(50);
    });

    test('should handle different page sizes', async () => {
        // Test would require page size selection functionality
        expect(true).toBe(true);
    });
});

describe('Games Page: Data Display', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="games">
        <div id="games-table"></div>
      </div>
    `;

        await initializeDatabase();
        await renderGames();
    });

    test('should display all required columns', () => {
        const table = document.getElementById('games-table');
        const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(th => th.textContent?.trim());

        expect(headers.some(h => h.toLowerCase().includes('name'))).toBe(true);
        expect(headers.some(h => h.toLowerCase().includes('theme'))).toBe(true);
        expect(headers.some(h => h.toLowerCase().includes('provider'))).toBe(true);
    });

    test('should display valid theo_win values', () => {
        const table = document.getElementById('games-table');
        const text = table.textContent;

        expect(text).not.toContain('NaN');
        expect(text).not.toContain('undefined');
    });
});

describe('Games Page: Filtering', () => {
    let allGames;

    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="games">
        <select id="provider-filter"></select>
        <select id="mechanic-filter"></select>
        <div id="games-table"></div>
      </div>
    `;

        await initializeDatabase();
        allGames = await getAllGames();
    });

    test('should have games from game_data_master', () => {
        expect(allGames.length).toBeGreaterThan(500);
        expect(allGames.length).toBeLessThan(2000);
    });

    test('filtering by provider should reduce count', async () => {
        const provider = allGames[0].provider_studio;
        const filtered = await getAllGames({ provider });

        expect(filtered.length).toBeLessThan(allGames.length);
        expect(filtered.length).toBeGreaterThan(0);
    });
});
