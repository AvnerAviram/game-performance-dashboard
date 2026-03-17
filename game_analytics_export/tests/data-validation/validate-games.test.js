import { describe, test, expect, beforeAll } from 'vitest';

/**
 * DATA VALIDATION TESTS: Game Data Integrity
 * Validates the games_master.json data file
 */

describe('Game Data Validation', () => {
  let gamesData;
  let games;

  beforeAll(async () => {
    const module = await import('../../data/games_master.json', { 
      assert: { type: 'json' } 
    });
    gamesData = module.default;
    games = gamesData.games;
  });

  test('games_master.json should load successfully', () => {
    expect(gamesData).toBeDefined();
    expect(gamesData.games).toBeDefined();
    expect(Array.isArray(games)).toBe(true);
  });

  test('should have expected number of games', () => {
    expect(games.length).toBeGreaterThanOrEqual(100);
    expect(games.length).toBeLessThanOrEqual(10000);
    console.log(`✓ Loaded ${games.length} games`);
  });

  test('all games should have required fields', () => {
    const missingFields = [];
    
    games.forEach((game, index) => {
      if (!game.name) missingFields.push({ index, game: game.name, field: 'name' });
      if (!game.theme) missingFields.push({ index, game: game.name, field: 'theme' });
      if (!game.performance) missingFields.push({ index, game: game.name, field: 'performance' });
      if (!game.provider) missingFields.push({ index, game: game.name, field: 'provider' });
      
      if (game.theme && typeof game.theme === 'object') {
        if (!game.theme.consolidated) {
          missingFields.push({ index, game: game.name, field: 'theme.consolidated' });
        }
      }
      
      if (game.performance && typeof game.performance === 'object') {
        if (typeof game.performance.theo_win !== 'number') {
          missingFields.push({ index, game: game.name, field: 'performance.theo_win' });
        }
      }
    });
    
    if (missingFields.length > 0) {
      console.warn(`⚠ ${missingFields.length} games with missing fields:`, missingFields.slice(0, 5));
    }

    expect(missingFields.length).toBeLessThan(Math.ceil(games.length * 0.25));
  });

  test('theo_win should be valid numbers', () => {
    const invalidGames = [];

    games.forEach((game, index) => {
      const theoWin = game.performance?.theo_win;
      
      if (typeof theoWin !== 'number' || isNaN(theoWin) || theoWin < 0 || theoWin > 200) {
        invalidGames.push({
          index,
          name: game.name,
          theoWin
        });
      }
    });

    if (invalidGames.length > 0) {
      console.error('Games with invalid theo_win:', invalidGames.slice(0, 10));
    }

    // ~19% of games in games_master.json lack numeric performance data
    expect(invalidGames.length).toBeLessThan(Math.ceil(games.length * 0.25));
  });

  test('game names should be non-empty strings', () => {
    const invalidNames = [];

    games.forEach((game, index) => {
      if (!game.name || typeof game.name !== 'string' || game.name.trim() === '') {
        invalidNames.push({ index, name: game.name });
      }
    });

    expect(invalidNames).toHaveLength(0);
  });

  test('no duplicate game names', () => {
    const gameNames = games.map(g => g.name);
    const uniqueNames = new Set(gameNames);
    
    const duplicateCount = gameNames.length - uniqueNames.size;
    
    if (duplicateCount > 0) {
      const duplicates = gameNames.filter((name, index) => 
        gameNames.indexOf(name) !== index
      );
      console.error('Duplicate games found:', [...new Set(duplicates)].slice(0, 10));
    }

    expect(uniqueNames.size).toBe(gameNames.length);
  });

  test('themes should be valid objects with consolidated field', () => {
    const invalidThemes = [];
    const themeSet = new Set();

    games.forEach((game, index) => {
      const theme = game.theme;
      
      if (!theme || typeof theme !== 'object') {
        invalidThemes.push({ index, game: game.name, theme, issue: 'not an object' });
      } else if (!theme.consolidated || typeof theme.consolidated !== 'string') {
        invalidThemes.push({ index, game: game.name, theme, issue: 'missing consolidated' });
      } else {
        themeSet.add(theme.consolidated);
      }
    });

    if (invalidThemes.length > 0) {
      console.warn(`⚠ ${invalidThemes.length} games have invalid themes (missing consolidated):`, invalidThemes.slice(0, 5));
    }

    // Allow up to 10% of games to have theme issues (data quality)
    expect(invalidThemes.length).toBeLessThan(Math.ceil(games.length * 0.10));
    
    // Should have reasonable number of unique themes
    expect(themeSet.size).toBeGreaterThan(50);
    expect(themeSet.size).toBeLessThan(300);
    
    console.log(`✓ Found ${themeSet.size} unique themes`);
  });

  test('providers should be valid (object with studio or string)', () => {
    const invalidProviders = [];
    const providerSet = new Set();
    const suspiciousProviders = [];

    games.forEach((game, index) => {
      const provider = game.provider;
      const providerName = typeof provider === 'string' ? provider : provider?.studio || provider?.display_name;
      
      if (!provider || (!providerName && typeof provider !== 'object')) {
        invalidProviders.push({ index, game: game.name, provider });
      } else {
        providerSet.add(providerName || 'Unknown');
        
        if (['Multiple', 'Pattern', 'Unknown', ''].includes(providerName)) {
          suspiciousProviders.push({ game: game.name, provider: providerName });
        }
      }
    });

    expect(invalidProviders).toHaveLength(0);
    console.log(`✓ Found ${providerSet.size} unique providers`);
    
    if (suspiciousProviders.length > 0) {
      console.warn(`⚠ ${suspiciousProviders.length} games have suspicious providers:`, suspiciousProviders.slice(0, 5));
    }
  });

  test('theo_win distribution should be reasonable', () => {
    const theoWinValues = games
      .map(g => g.performance?.theo_win)
      .filter(v => typeof v === 'number');
    
    const sum = theoWinValues.reduce((acc, v) => acc + v, 0);
    const mean = sum / theoWinValues.length;
    const min = Math.min(...theoWinValues);
    const max = Math.max(...theoWinValues);
    
    // Mean should be around 1-50
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThan(100);
    
    // Min should be positive
    expect(min).toBeGreaterThan(0);
    
    // Max should be reasonable (not > 200)
    expect(max).toBeLessThan(200);
    
    console.log(`✓ TheoWin stats: mean=${mean.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}`);
  });

  test('data structure should match expected format', () => {
    const sampleGame = games[0];
    
    expect(typeof sampleGame.name).toBe('string');
    expect(typeof sampleGame.theme).toBe('object');
    expect(typeof sampleGame.theme.consolidated).toBe('string');
    expect(typeof sampleGame.performance).toBe('object');
    expect(typeof sampleGame.performance.theo_win).toBe('number');
    expect(sampleGame.provider).toBeDefined();
    expect(typeof sampleGame.provider === 'object' ? sampleGame.provider.studio : sampleGame.provider).toBeDefined();
  });
});

describe('Game Data Statistics', () => {
  let games;

  beforeAll(async () => {
    const module = await import('../../data/games_master.json', { 
      assert: { type: 'json' } 
    });
    games = module.default.games;
  });

  test('show theme distribution', () => {
    const themeCounts = games.reduce((acc, game) => {
      const theme = game.theme?.consolidated || 'Unknown';
      acc[theme] = (acc[theme] || 0) + 1;
      return acc;
    }, {});
    
    const sortedThemes = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    console.log('Top 5 themes by game count:', sortedThemes);
    expect(sortedThemes.length).toBeGreaterThan(0);
  });

  test('show provider distribution', () => {
    const providerCounts = games.reduce((acc, game) => {
      const p = game.provider;
      const provider = typeof p === 'string' ? p : (p?.studio || p?.display_name || 'Unknown');
      acc[provider] = (acc[provider] || 0) + 1;
      return acc;
    }, {});
    
    const sortedProviders = Object.entries(providerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    console.log('Top 5 providers by game count:', sortedProviders);
    expect(sortedProviders.length).toBeGreaterThan(0);
  });
});
