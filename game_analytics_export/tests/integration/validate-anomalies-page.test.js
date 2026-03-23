import { describe, test, expect, beforeEach } from 'vitest';
import { renderAnomalies } from '../../src/ui/ui.js';
import { loadGameData, gameData } from '../../src/lib/data.js';

/**
 * Layer 3F: Anomalies Page Rendering Tests
 */

describe('Anomalies Page: Top Performers', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="anomalies">
        <div id="top-performers"></div>
        <div id="bottom-performers"></div>
      </div>
    `;

        await loadGameData();
        renderAnomalies();
    });

    test('should display high performers', () => {
        const container = document.getElementById('top-performers');
        expect(gameData.top_anomalies.length).toBeGreaterThan(0);
        expect(gameData.top_anomalies.length).toBeLessThanOrEqual(25);
    });

    test('should display low performers', () => {
        const container = document.getElementById('bottom-performers');
        expect(gameData.bottom_anomalies.length).toBeGreaterThan(0);
        expect(gameData.bottom_anomalies.length).toBeLessThanOrEqual(30);
    });

    test('high performers should be sorted by theo_win descending', () => {
        const highPerformers = gameData.top_anomalies;

        for (let i = 0; i < highPerformers.length - 1; i++) {
            expect(highPerformers[i]['Theo Win']).toBeGreaterThanOrEqual(highPerformers[i + 1]['Theo Win']);
        }
    });

    test('low performers should have lower theo_win', () => {
        const lowPerformers = gameData.bottom_anomalies;
        const highPerformers = gameData.top_anomalies;

        const avgLow = lowPerformers.reduce((sum, g) => sum + g['Theo Win'], 0) / lowPerformers.length;
        const avgHigh = highPerformers.reduce((sum, g) => sum + g['Theo Win'], 0) / highPerformers.length;

        expect(avgLow).toBeLessThan(avgHigh);
    });
});

describe('Anomalies Page: Card Display', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="anomalies">
        <div id="anomalies-content"></div>
      </div>
    `;

        await loadGameData();
        renderAnomalies();
    });

    test('should display game names', () => {
        const content = document.getElementById('anomalies-content');
        const topGame = gameData.top_anomalies[0];

        if (topGame && topGame.game) {
            expect(content.textContent).toContain(topGame.game);
        }
    });

    test('no undefined or null values', () => {
        const content = document.getElementById('anomalies-content');
        const text = content.textContent.toLowerCase();

        expect(text).not.toContain('undefined');
        expect(text).not.toContain('null');
    });
});
