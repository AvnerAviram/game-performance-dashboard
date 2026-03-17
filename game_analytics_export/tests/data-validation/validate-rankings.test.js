import { describe, test, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';

/**
 * DATA VALIDATION TESTS: Ranking Calculations
 * Validates that rankings are calculated correctly
 */

describe('Ranking Calculations - Themes', () => {
  beforeAll(async () => {
    await loadTestData();
  });

  test('should load theme data successfully', () => {
    expect(gameData.themes).toBeDefined();
    expect(Array.isArray(gameData.themes)).toBe(true);
    expect(gameData.themes.length).toBeGreaterThan(20);
    expect(gameData.themes.length).toBeLessThan(300);
    
    console.log(`✓ Loaded ${gameData.themes.length} themes`);
  });

  test('themes should be sorted by Smart Index descending', () => {
    for (let i = 0; i < gameData.themes.length - 1; i++) {
      const current = gameData.themes[i]['Smart Index'];
      const next = gameData.themes[i + 1]['Smart Index'];
      
      expect(current).toBeGreaterThanOrEqual(next);
    }
    
    console.log('✓ Themes are correctly sorted by Smart Index');
  });

  test('Smart Index should be valid and positive', () => {
    const invalid = gameData.themes.filter(t => {
      const si = t['Smart Index'];
      return typeof si !== 'number' || isNaN(si) || si < 0;
    });

    expect(invalid).toHaveLength(0);
    console.log('✓ All themes have valid Smart Index');
  });

  test('Market Share percentages should be reasonable', () => {
    const totalMarketShare = gameData.themes.reduce((sum, t) => 
      sum + (t['Market Share %'] || 0), 0
    );
    
    // Market share can be > 100% if games have multiple themes
    // But should be at least 50% and less than 200%
    expect(totalMarketShare).toBeGreaterThan(50);
    expect(totalMarketShare).toBeLessThan(200);
    
    console.log(`✓ Total market share: ${totalMarketShare.toFixed(2)}% (can exceed 100% due to multi-theme games)`);
  });

  test('all themes should have positive game counts', () => {
    const invalidCounts = gameData.themes.filter(t => 
      !t['Game Count'] || t['Game Count'] <= 0
    );

    if (invalidCounts.length > 0) {
      console.error('Themes with invalid counts:', invalidCounts);
    }

    expect(invalidCounts).toHaveLength(0);
  });

  test('all themes should have valid avgTheo values', () => {
    const invalidAvgTheo = gameData.themes.filter(t => {
      const avgTheo = t['Avg Theo Win Index'];
      return typeof avgTheo !== 'number' || avgTheo < 0 || avgTheo > 100;
    });

    if (invalidAvgTheo.length > 0) {
      console.error('Themes with invalid avgTheo:', invalidAvgTheo);
    }

    expect(invalidAvgTheo).toHaveLength(0);
  });

  test('top 10 themes should have reasonable values', () => {
    const top10 = gameData.themes.slice(0, 10);
    
    console.log('\nTop 10 Themes (Eilers Method - Quality Ranking):');
    top10.forEach((theme, i) => {
      console.log(`${i + 1}. ${theme.Theme}: ${theme['Game Count']} games, Performance Index: ${theme['Smart Index'].toFixed(4)}`);
      
      // Each should have decent quality (Smart Index now = Avg Theo)
      expect(theme['Smart Index']).toBeGreaterThan(0);
      expect(theme['Smart Index']).toBeLessThan(50); // Realistic max for avgTheo
    });
  });

  test('top theme should have high quality', () => {
    const topTheme = gameData.themes[0];
    
    expect(topTheme['Avg Theo Win Index']).toBeGreaterThan(0);
    expect(topTheme['Smart Index']).toBeGreaterThan(0);
    
    console.log(`✓ Top theme: ${topTheme.Theme}`);
    console.log(`  Smart Index: ${topTheme['Smart Index'].toFixed(4)}`);
    console.log(`  Game Count: ${topTheme['Game Count']}`);
  });

  test('themes should have valid structure', () => {
    const sample = gameData.themes[0];
    expect(sample).toHaveProperty('Theme');
    expect(sample).toHaveProperty('Game Count');
    expect(sample).toHaveProperty('Avg Theo Win Index');
    expect(sample).toHaveProperty('Smart Index');
    expect(sample).toHaveProperty('Market Share %');
  });
});

describe('Ranking Calculations - Mechanics', () => {
  beforeAll(async () => {
    await loadTestData();
  });

  test('should load mechanics data successfully', () => {
    expect(gameData.mechanics).toBeDefined();
    expect(Array.isArray(gameData.mechanics)).toBe(true);
    expect(gameData.mechanics.length).toBeGreaterThanOrEqual(5);
    expect(gameData.mechanics.length).toBeLessThan(100);
    
    console.log(`✓ Loaded ${gameData.mechanics.length} mechanics`);
  });

  test('mechanics should have valid Smart Index values', () => {
    const invalid = gameData.mechanics.filter(m => {
      const si = m['Smart Index'];
      return typeof si !== 'number' || isNaN(si) || si < 0;
    });

    expect(invalid).toHaveLength(0);
    console.log('✓ All mechanics have valid Performance Index (Avg Theo)');
  });

  test('top mechanic should have most games', () => {
    const mechanics = [...gameData.mechanics].sort((a, b) => 
      b['Game Count'] - a['Game Count']
    );
    
    const topMechanic = mechanics[0];
    
    expect(topMechanic['Game Count']).toBeGreaterThan(0);
    expect(topMechanic.Mechanic).toBeDefined();
    
    console.log(`✓ Most used mechanic: ${topMechanic.Mechanic} (${topMechanic['Game Count']} games)`);
  });

  test('all mechanics should have positive game counts', () => {
    const invalidCounts = gameData.mechanics.filter(m => 
      !m['Game Count'] || m['Game Count'] <= 0
    );

    expect(invalidCounts).toHaveLength(0);
  });
});

describe('Data Consistency Checks', () => {
  beforeAll(async () => {
    await loadTestData();
  });

  test('total games count should match', () => {
    expect(gameData.total_games).toBeGreaterThan(100);
    expect(gameData.total_games).toBeLessThan(10000);
    
    console.log(`✓ Total games: ${gameData.total_games}`);
  });

  test('theme count should match array length', () => {
    expect(gameData.theme_count).toBe(gameData.themes.length);
    
    console.log(`✓ Theme count: ${gameData.theme_count}`);
  });

  test('mechanic count should match array length', () => {
    expect(gameData.mechanic_count).toBe(gameData.mechanics.length);
    
    console.log(`✓ Mechanic count: ${gameData.mechanic_count}`);
  });

  test('allGames array should be populated', () => {
    expect(gameData.allGames).toBeDefined();
    expect(Array.isArray(gameData.allGames)).toBe(true);
    expect(gameData.allGames.length).toBe(gameData.total_games);
  });
});
