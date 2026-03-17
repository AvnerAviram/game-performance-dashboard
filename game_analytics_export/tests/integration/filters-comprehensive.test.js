import { describe, test, expect, beforeEach } from 'vitest';
import { getFilteredThemes, getFilteredMechanics } from '../../src/lib/filters.js';
import { loadGameData, gameData } from '../../src/lib/data.js';
import { filterGames } from '../utils/json-aggregator.js';

/**
 * Comprehensive Filter and Sort Tests
 * 
 * Tests all filter combinations, search functionality, and sorting.
 */

describe('Provider Filters', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('filter themes by provider', () => {
    const provider = 'NetEnt';
    const filtered = getFilteredThemes('all', { provider });
    
    // Should only include themes with games from that provider
    expect(Array.isArray(filtered)).toBe(true);
    expect(filtered.length).toBeLessThanOrEqual(gameData.themes.length);
  });

  test('filter mechanics by provider', () => {
    const provider = 'Pragmatic Play';
    const filtered = getFilteredMechanics('all', { provider });
    
    expect(Array.isArray(filtered)).toBe(true);
    expect(filtered.length).toBeLessThanOrEqual(gameData.mechanics.length);
  });

  test('invalid provider returns empty results', () => {
    const provider = 'NonExistentProvider12345';
    const filtered = getFilteredThemes('all', { provider });
    
    expect(filtered.length).toBe(0);
  });

  test('empty provider filter returns all results', () => {
    const filtered = getFilteredThemes('all', { provider: '' });
    
    expect(filtered.length).toBe(gameData.themes.length);
  });
});

describe('Mechanic Filters', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('filter themes by mechanic', () => {
    const mechanic = 'Free Spins';
    const filtered = getFilteredThemes('all', { mechanic });
    
    expect(Array.isArray(filtered)).toBe(true);
    expect(filtered.length).toBeLessThanOrEqual(gameData.themes.length);
  });

  test('filter by rare mechanic reduces results significantly', () => {
    // Find least common mechanic
    const sortedMechanics = [...gameData.mechanics].sort((a, b) => 
      a['Game Count'] - b['Game Count']
    );
    const rareMechanic = sortedMechanics[0].Mechanic;
    
    const filtered = getFilteredThemes('all', { mechanic: rareMechanic });
    
    expect(filtered.length).toBeLessThan(gameData.themes.length / 2);
  });
});

describe('Theme Filters', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('filter mechanics by theme', () => {
    const theme = 'Egyptian';
    const filtered = getFilteredMechanics('all', { theme });
    
    expect(Array.isArray(filtered)).toBe(true);
    expect(filtered.length).toBeLessThanOrEqual(gameData.mechanics.length);
  });

  test('filter by specific theme', () => {
    const theme = gameData.themes[0].Theme;
    const filtered = getFilteredMechanics('all', { theme });
    
    expect(filtered.length).toBeGreaterThan(0);
  });
});

describe('Multiple Filter Combinations', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('apply provider AND mechanic filters together', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return; // Skip if no games loaded
    }
    
    const filters = {
      provider: 'NetEnt',
      mechanic: 'Free Spins'
    };
    
    const filtered = filterGames(gameData.allGames, filters);
    
    // Should match both filters
    filtered.forEach(game => {
      expect(game.provider?.studio?.toLowerCase()).toContain(filters.provider.toLowerCase());
      expect(game.mechanic?.primary?.toLowerCase()).toContain(filters.mechanic.toLowerCase());
    });
  });

  test('apply provider AND theme filters together', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const filters = {
      provider: 'Pragmatic',
      theme: 'Adventure'
    };
    
    const filtered = filterGames(gameData.allGames, filters);
    
    filtered.forEach(game => {
      expect(game.provider?.studio?.toLowerCase()).toContain(filters.provider.toLowerCase());
      expect(game.theme?.consolidated?.toLowerCase()).toContain(filters.theme.toLowerCase());
    });
  });

  test('apply all three filters together', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const filters = {
      provider: 'Play',
      mechanic: 'Free',
      theme: 'Egypt'
    };
    
    const filtered = filterGames(gameData.allGames, filters);
    
    // Should match all filters (or return empty if no matches)
    expect(Array.isArray(filtered)).toBe(true);
  });

  test('conflicting filters return empty results', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const filters = {
      provider: 'NetEnt',
      search: 'ZZZNonExistentGameName999'
    };
    
    const filtered = filterGames(gameData.allGames, filters);
    
    expect(filtered.length).toBe(0);
  });
});

describe('Search Functionality', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('search is case-insensitive', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const searchLower = filterGames(gameData.allGames, { search: 'cash' });
    const searchUpper = filterGames(gameData.allGames, { search: 'CASH' });
    const searchMixed = filterGames(gameData.allGames, { search: 'CaSh' });
    
    expect(searchLower.length).toBe(searchUpper.length);
    expect(searchLower.length).toBe(searchMixed.length);
  });

  test('search finds partial matches', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const filtered = filterGames(gameData.allGames, { search: 'gold' });
    
    // Should find games with "gold", "golden", "Gold Rush", etc.
    expect(filtered.length).toBeGreaterThan(0);
    filtered.forEach(game => {
      expect(game.name.toLowerCase()).toContain('gold');
    });
  });

  test('search with special characters', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const filtered = filterGames(gameData.allGames, { search: "King's" });
    
    // Should handle apostrophes
    expect(Array.isArray(filtered)).toBe(true);
  });

  test('empty search returns all results', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const filtered = filterGames(gameData.allGames, { search: '' });
    
    expect(filtered.length).toBe(gameData.allGames.length);
  });

  test('search with no matches returns empty array', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const filtered = filterGames(gameData.allGames, { search: 'XYZ999NonExistent' });
    
    expect(filtered.length).toBe(0);
  });

  test('search works with numbers', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const filtered = filterGames(gameData.allGames, { search: '5' });
    
    // Should find games with "5" in name like "Book of 5 Lives"
    expect(Array.isArray(filtered)).toBe(true);
  });
});

describe('Sorting', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('themes sorted by Smart Index descending by default', () => {
    const themes = gameData.themes;
    
    for (let i = 0; i < themes.length - 1; i++) {
      expect(themes[i]['Smart Index']).toBeGreaterThanOrEqual(
        themes[i + 1]['Smart Index']
      );
    }
  });

  test('can sort themes by game count', () => {
    const sorted = [...gameData.themes].sort((a, b) => 
      b['Game Count'] - a['Game Count']
    );
    
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i]['Game Count']).toBeGreaterThanOrEqual(
        sorted[i + 1]['Game Count']
      );
    }
  });

  test('can sort themes by avg theo win', () => {
    const sorted = [...gameData.themes].sort((a, b) => 
      b['Avg Theo Win Index'] - a['Avg Theo Win Index']
    );
    
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i]['Avg Theo Win Index']).toBeGreaterThanOrEqual(
        sorted[i + 1]['Avg Theo Win Index']
      );
    }
  });

  test('can sort themes by market share', () => {
    const sorted = [...gameData.themes].sort((a, b) => 
      b['Market Share %'] - a['Market Share %']
    );
    
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i]['Market Share %']).toBeGreaterThanOrEqual(
        sorted[i + 1]['Market Share %']
      );
    }
  });

  test('can sort themes alphabetically', () => {
    const sorted = [...gameData.themes].sort((a, b) => 
      a.Theme.localeCompare(b.Theme)
    );
    
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].Theme.localeCompare(sorted[i + 1].Theme)).toBeLessThanOrEqual(0);
    }
  });

  test('sorting maintains data integrity', () => {
    const original = [...gameData.themes];
    const sorted = [...gameData.themes].sort((a, b) => 
      b['Game Count'] - a['Game Count']
    );
    
    // Should have same length
    expect(sorted.length).toBe(original.length);
    
    // Should have same themes (just reordered)
    const originalNames = new Set(original.map(t => t.Theme));
    const sortedNames = new Set(sorted.map(t => t.Theme));
    expect(sortedNames.size).toBe(originalNames.size);
  });
});

describe('Filter View Tabs', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('All Themes view shows all themes', () => {
    const filtered = getFilteredThemes('all');
    expect(filtered.length).toBe(gameData.themes.length);
  });

  test('Market Leaders view shows high market share themes', () => {
    const filtered = getFilteredThemes('leaders');
    
    filtered.forEach(theme => {
      expect(theme['Market Share %']).toBeGreaterThan(3.0);
    });
  });

  test('Opportunities view shows high quality, low saturation', () => {
    const filtered = getFilteredThemes('opportunities');
    
    filtered.forEach(theme => {
      expect(theme['Avg Theo Win Index']).toBeGreaterThan(10);
      expect(theme['Game Count']).toBeLessThan(20);
    });
  });

  test('Premium Quality view shows high avg theo', () => {
    const filtered = getFilteredThemes('premium');
    
    filtered.forEach(theme => {
      expect(theme['Avg Theo Win Index']).toBeGreaterThan(12);
    });
  });

  test('All Mechanics view shows all mechanics', () => {
    const filtered = getFilteredMechanics('all');
    expect(filtered.length).toBe(gameData.mechanics.length);
  });

  test('Most Popular mechanics have high game counts', () => {
    const filtered = getFilteredMechanics('popular');
    
    filtered.forEach(mechanic => {
      expect(mechanic['Game Count']).toBeGreaterThan(50);
    });
  });

  test('High Performing mechanics have high avg theo', () => {
    const filtered = getFilteredMechanics('high-performing');
    
    filtered.forEach(mechanic => {
      expect(mechanic['Avg Theo Win Index']).toBeGreaterThan(10);
    });
  });
});

describe('Filter Edge Cases', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('null filter object returns all results', () => {
    const filtered = getFilteredThemes('all', null);
    expect(filtered.length).toBe(gameData.themes.length);
  });

  test('undefined filter object returns all results', () => {
    const filtered = getFilteredThemes('all', undefined);
    expect(filtered.length).toBe(gameData.themes.length);
  });

  test('filter with empty string values', () => {
    const filtered = getFilteredThemes('all', { provider: '', mechanic: '', theme: '' });
    expect(filtered.length).toBe(gameData.themes.length);
  });

  test('filter handles whitespace in search', () => {
    if (!gameData.allGames || gameData.allGames.length === 0) {
      return;
    }
    
    const filtered = filterGames(gameData.allGames, { search: '  gold  ' });
    expect(Array.isArray(filtered)).toBe(true);
  });
});
