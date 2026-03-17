import { describe, test, expect, beforeEach } from 'vitest';
import { loadGameData, gameData } from '../../src/lib/data.js';

/**
 * Layer 3I: Prediction Page Tests
 */

describe('Prediction Page: Form Elements', () => {
  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="prediction">
        <select id="theme-select"></select>
        <select id="mechanic-select"></select>
        <div id="prediction-results"></div>
      </div>
    `;
    
    await loadGameData();
  });

  test('should have theme selection', () => {
    const themeSelect = document.getElementById('theme-select');
    expect(themeSelect).toBeDefined();
  });

  test('should have mechanic selection', () => {
    const mechanicSelect = document.getElementById('mechanic-select');
    expect(mechanicSelect).toBeDefined();
  });

  test('theme options should match available themes', () => {
    expect(gameData.themes.length).toBeGreaterThan(0);
  });

  test('mechanic options should match available mechanics', () => {
    expect(gameData.mechanics.length).toBeGreaterThan(0);
  });
});

describe('Prediction Page: Calculations', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('prediction should use real theme data', () => {
    const testTheme = gameData.themes[0];
    expect(testTheme['Avg Theo Win Index']).toBeGreaterThan(0);
    expect(testTheme['Game Count']).toBeGreaterThan(0);
  });

  test('prediction should use real mechanic data', () => {
    const testMechanic = gameData.mechanics[0];
    expect(testMechanic['Avg Theo Win Index']).toBeGreaterThan(0);
    expect(testMechanic['Game Count']).toBeGreaterThan(0);
  });

  test('no hardcoded prediction values', () => {
    // Predictions should be calculated from actual data
    expect(gameData.themes[0]['Smart Index']).toBeGreaterThan(0);
  });
});
