import { describe, test, expect, beforeEach } from 'vitest';
import { renderMechanics } from '../../src/ui/ui.js';
import { loadGameData, gameData } from '../../src/lib/data.js';
import { countTableRows, parseTableHeaders } from '../utils/html-parser.js';

/**
 * Layer 3C: Mechanics Page Rendering Tests
 */

describe('Mechanics Page: Table Rendering', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="mechanics">
        <div id="mechanics-table"></div>
      </div>
    `;

        await loadGameData();
        renderMechanics();
    });

    test('should render all mechanics', () => {
        const table = document.getElementById('mechanics-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBe(gameData.mechanics.length);
    });

    test('table should have correct headers', () => {
        const table = document.getElementById('mechanics-table');
        const headers = parseTableHeaders(table);

        expect(headers).toContain('Mechanic');
        expect(headers.some(h => h.includes('Game Count'))).toBe(true);
    });

    test('should display mechanic names correctly', () => {
        const table = document.getElementById('mechanics-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        rows.forEach((row, index) => {
            const mechanicName = row.querySelector('td:first-child')?.textContent?.trim();
            expect(mechanicName).toBe(gameData.mechanics[index].Mechanic);
        });
    });

    test('should display game counts', () => {
        const table = document.getElementById('mechanics-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));

        rows.forEach((row, index) => {
            const text = row.textContent;
            const count = gameData.mechanics[index]['Game Count'];
            expect(text).toContain(count.toString());
        });
    });
});

describe('Mechanics Page: Sorting', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="mechanics">
        <div id="mechanics-table"></div>
      </div>
    `;

        await loadGameData();
        renderMechanics();
    });

    test('should be sorted by Smart Index by default', () => {
        const mechanics = gameData.mechanics;

        for (let i = 0; i < mechanics.length - 1; i++) {
            expect(mechanics[i]['Smart Index']).toBeGreaterThanOrEqual(mechanics[i + 1]['Smart Index']);
        }
    });

    test('Free Spins should have high game count', () => {
        const freeSpins = gameData.mechanics.find(m => m.Mechanic.toLowerCase().includes('free spins'));

        if (freeSpins) {
            expect(freeSpins['Game Count']).toBeGreaterThan(100);
        }
    });
});

describe('Mechanics Page: Filter Tabs', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="mechanics">
        <div id="mechanics-table"></div>
      </div>
    `;

        await loadGameData();
    });

    test('All Mechanics shows all items', () => {
        renderMechanics(null);

        const table = document.getElementById('mechanics-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBe(gameData.mechanics.length);
    });

    test('Most Popular filter shows high game count mechanics', () => {
        const popular = gameData.mechanics.filter(m => m['Game Count'] > 50);

        renderMechanics(popular);

        const table = document.getElementById('mechanics-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBe(popular.length);
    });

    test('High Performing filter shows high avg theo', () => {
        const highPerforming = gameData.mechanics.filter(m => m['Avg Theo Win Index'] > 10);

        renderMechanics(highPerforming);

        const table = document.getElementById('mechanics-table');
        const rows = table.querySelectorAll('tbody tr');

        expect(rows.length).toBe(highPerforming.length);
    });
});

describe('Mechanics Page: Data Accuracy', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="mechanics">
        <div id="mechanics-table"></div>
      </div>
    `;

        await loadGameData();
        renderMechanics();
    });

    test('no duplicate mechanics displayed', () => {
        const table = document.getElementById('mechanics-table');
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        const mechanicNames = rows.map(row => row.querySelector('td:first-child')?.textContent?.trim());

        const uniqueNames = new Set(mechanicNames);
        expect(uniqueNames.size).toBe(mechanicNames.length);
    });

    test('all values should be valid', () => {
        const table = document.getElementById('mechanics-table');
        const text = table.textContent;

        expect(text).not.toContain('NaN');
        expect(text).not.toContain('undefined');
    });
});
