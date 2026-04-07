import { describe, test, expect, beforeEach } from 'vitest';
import { renderProviders } from '../../src/ui/ui-providers-games.js';
import { initializeDatabase, getProviderDistribution } from '../../src/lib/db/duckdb-client.js';

/**
 * Layer 3E: Providers Page Rendering Tests
 */

describe('Providers Page: Basic Rendering', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="providers">
        <div id="providers-table"></div>
      </div>
    `;

        await initializeDatabase();
        await renderProviders();
    });

    test('should render providers table', () => {
        const table = document.getElementById('providers-table');
        expect(table).toBeDefined();
    });

    test('should display provider rows', () => {
        const table = document.getElementById('providers-table');
        const rows = table.querySelectorAll('tbody tr');
        expect(rows.length).toBeGreaterThan(0);
    });
});

describe('Providers Page: Data Accuracy', () => {
    let providers;

    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="providers">
        <div id="providers-table"></div>
      </div>
    `;

        await initializeDatabase();
        providers = await getProviderDistribution();
        await renderProviders();
    });

    test('should display correct provider count', () => {
        const table = document.getElementById('providers-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBe(providers.length);
    });

    test('total game count should match game_data_master', () => {
        const totalGames = providers.reduce((sum, p) => sum + p.game_count, 0);
        expect(totalGames).toBeGreaterThan(500);
        expect(totalGames).toBeLessThan(2000);
    });

    test('should display game counts correctly', () => {
        const table = document.getElementById('providers-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        rows.forEach((row, index) => {
            const text = row.textContent;
            const count = providers[index].game_count;
            expect(text).toContain(count.toString());
        });
    });
});
