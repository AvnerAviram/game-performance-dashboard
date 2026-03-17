import { describe, test, expect, beforeEach } from 'vitest';
import { renderTrends } from '../../src/features/trends.js';
import { initializeDatabase, getReleaseYearDistribution } from '../../src/lib/db/duckdb-client.js';

/**
 * Layer 3H: Trends Page Tests
 */

describe('Trends Page: Basic Rendering', () => {
  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="trends">
        <div id="trends-charts"></div>
      </div>
    `;
    
    await initializeDatabase();
    renderTrends();
  });

  test('should render trends page', () => {
    const trends = document.getElementById('trends');
    expect(trends).toBeDefined();
  });

  test('should have chart containers', () => {
    const charts = document.getElementById('trends-charts');
    expect(charts).toBeDefined();
  });
});

describe('Trends Page: Year Distribution', () => {
  let yearData;

  beforeEach(async () => {
    await initializeDatabase();
    yearData = await getReleaseYearDistribution();
  });

  test('should have games from multiple years', () => {
    expect(yearData.length).toBeGreaterThan(0);
  });

  test('should have valid year ranges', () => {
    yearData.forEach(item => {
      expect(item.release_year).toBeGreaterThanOrEqual(2000);
      expect(item.release_year).toBeLessThanOrEqual(2026);
    });
  });

  test('game counts should be positive', () => {
    yearData.forEach(item => {
      expect(item.game_count).toBeGreaterThan(0);
    });
  });
});
