/**
 * Smoke test - ensures src/ modules load and run.
 * This gives non-zero coverage since it actually imports and executes app code.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadGameData, gameData } from '../../src/lib/data.js';
import { getFilteredThemes, getFilteredMechanics } from '../../src/lib/filters.js';

describe('Smoke: src/ modules', () => {
  beforeAll(async () => {
    await loadGameData();
    if (typeof globalThis.window !== 'undefined') {
      globalThis.window.gameData = gameData;
    }
  });

  it('loadGameData populates gameData', () => {
    expect(gameData).toBeDefined();
    expect(gameData.allGames).toBeDefined();
    expect(Array.isArray(gameData.allGames)).toBe(true);
    expect(gameData.allGames.length).toBeGreaterThan(0);
  });

  it('getFilteredThemes returns themes for "all" view', () => {
    const result = getFilteredThemes('all');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('getFilteredMechanics returns mechanics for "all" view', () => {
    const result = getFilteredMechanics('all');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});
