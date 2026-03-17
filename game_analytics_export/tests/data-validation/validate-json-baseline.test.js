import { describe, test, expect, beforeAll } from 'vitest';
import { 
  calculateOverviewStats,
  calculateThemeDistribution,
  calculateMechanicDistribution,
  calculateProviderDistribution,
  validateGameStructure
} from '../utils/json-aggregator.js';

/**
 * Layer 1: JSON Baseline Validation Tests
 * 
 * Validates games_master.json contains valid, complete, and accurate data.
 * This establishes the "source of truth" for all subsequent tests.
 */

describe('JSON Baseline: Schema Validation', () => {
  let gamesData;
  let games;

  beforeAll(async () => {
    const response = await fetch('/data/games_master.json');
    gamesData = await response.json();
    games = gamesData.games;
  });

  test('games_master.json should load successfully', () => {
    expect(gamesData).toBeDefined();
    expect(gamesData.metadata).toBeDefined();
    expect(gamesData.games).toBeDefined();
    expect(Array.isArray(games)).toBe(true);
  });

  test('should have exactly 501 games', () => {
    expect(games.length).toBe(501);
    expect(gamesData.metadata.total_games).toBe(501);
  });

  test('all games should have required fields', () => {
    const gamesWithMissingFields = [];
    
    games.forEach((game, index) => {
      const errors = validateGameStructure(game);
      if (errors.length > 0) {
        gamesWithMissingFields.push({
          index,
          id: game.id,
          name: game.name,
          errors
        });
      }
    });

    if (gamesWithMissingFields.length > 0) {
      console.error('Games with missing fields:', gamesWithMissingFields.slice(0, 10));
    }

    expect(gamesWithMissingFields).toHaveLength(0);
  });

  test('all game IDs should be unique', () => {
    const ids = games.map(g => g.id);
    const uniqueIds = new Set(ids);
    
    expect(uniqueIds.size).toBe(games.length);
  });

  test('all game names should be unique', () => {
    const names = games.map(g => g.name);
    const uniqueNames = new Set(names);
    
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    
    if (uniqueNames.size !== games.length) {
      console.error('Duplicate names found:', [...new Set(duplicates)].slice(0, 10));
    }
    
    expect(uniqueNames.size).toBe(games.length);
  });
});

describe('JSON Baseline: Data Types', () => {
  let games;

  beforeAll(async () => {
    const response = await fetch('/data/games_master.json');
    const data = await response.json();
    games = data.games;
  });

  test('all IDs should be strings', () => {
    const invalidIds = games.filter(g => typeof g.id !== 'string' || !g.id);
    expect(invalidIds).toHaveLength(0);
  });

  test('all names should be non-empty strings', () => {
    const invalidNames = games.filter(g => 
      typeof g.name !== 'string' || g.name.trim() === ''
    );
    expect(invalidNames).toHaveLength(0);
  });

  test('all themes should be objects with required fields', () => {
    const invalidThemes = games.filter(g => 
      !g.theme || 
      typeof g.theme !== 'object' ||
      !g.theme.consolidated ||
      typeof g.theme.consolidated !== 'string'
    );
    
    if (invalidThemes.length > 0) {
      console.error('Games with invalid themes:', invalidThemes.slice(0, 5));
    }
    
    expect(invalidThemes).toHaveLength(0);
  });

  test('all mechanics should be objects with primary field', () => {
    const invalidMechanics = games.filter(g => 
      !g.mechanic || 
      typeof g.mechanic !== 'object' ||
      !g.mechanic.primary ||
      typeof g.mechanic.primary !== 'string'
    );
    
    if (invalidMechanics.length > 0) {
      console.error('Games with invalid mechanics:', invalidMechanics.slice(0, 5));
    }
    
    expect(invalidMechanics).toHaveLength(0);
  });

  test('all providers should be objects with studio field', () => {
    const invalidProviders = games.filter(g => 
      !g.provider || 
      typeof g.provider !== 'object' ||
      !g.provider.studio ||
      typeof g.provider.studio !== 'string'
    );
    
    if (invalidProviders.length > 0) {
      console.error('Games with invalid providers:', invalidProviders.slice(0, 5));
    }
    
    expect(invalidProviders).toHaveLength(0);
  });

  test('all specs should be objects with numeric/valid fields', () => {
    const invalidSpecs = games.filter(g => {
      if (!g.specs || typeof g.specs !== 'object') return true;
      
      return (
        typeof g.specs.reels !== 'number' ||
        typeof g.specs.rows !== 'number' ||
        typeof g.specs.rtp !== 'number' ||
        !g.specs.volatility
      );
    });
    
    if (invalidSpecs.length > 0) {
      console.error('Games with invalid specs:', invalidSpecs.slice(0, 5));
    }
    
    expect(invalidSpecs).toHaveLength(0);
  });

  test('all performance objects should have numeric theo_win', () => {
    const invalidPerformance = games.filter(g => 
      !g.performance || 
      typeof g.performance !== 'object' ||
      typeof g.performance.theo_win !== 'number'
    );
    
    if (invalidPerformance.length > 0) {
      console.error('Games with invalid performance:', invalidPerformance.slice(0, 5));
    }
    
    expect(invalidPerformance).toHaveLength(0);
  });
});

describe('JSON Baseline: Value Ranges', () => {
  let games;

  beforeAll(async () => {
    const response = await fetch('/data/games_master.json');
    const data = await response.json();
    games = data.games;
  });

  test('RTP values should be between 0 and 100', () => {
    const invalidRTP = games.filter(g => {
      const rtp = g.specs?.rtp;
      return typeof rtp === 'number' && (rtp < 0 || rtp > 100);
    });
    
    if (invalidRTP.length > 0) {
      console.error('Games with invalid RTP:', invalidRTP.slice(0, 5));
    }
    
    expect(invalidRTP).toHaveLength(0);
  });

  test('theo_win values should be between 0 and 200', () => {
    const invalidTheoWin = games.filter(g => {
      const theoWin = g.performance?.theo_win;
      return typeof theoWin === 'number' && (theoWin < 0 || theoWin > 200);
    });
    
    if (invalidTheoWin.length > 0) {
      console.error('Games with invalid theo_win:', invalidTheoWin.slice(0, 5));
    }
    
    expect(invalidTheoWin).toHaveLength(0);
  });

  test('market_share_percent should be non-negative', () => {
    const invalidMarketShare = games.filter(g => {
      const ms = g.performance?.market_share_percent;
      return typeof ms === 'number' && ms < 0;
    });
    
    expect(invalidMarketShare).toHaveLength(0);
  });

  test('rank should be integer between 1 and 501', () => {
    const invalidRanks = games.filter(g => {
      const rank = g.performance?.rank;
      return typeof rank === 'number' && (
        rank < 1 || 
        rank > 501 || 
        !Number.isInteger(rank)
      );
    });
    
    if (invalidRanks.length > 0) {
      console.error('Games with invalid ranks:', invalidRanks.slice(0, 5));
    }
    
    expect(invalidRanks).toHaveLength(0);
  });

  test('volatility should be valid value', () => {
    const validVolatilities = ['low', 'medium', 'high', 'very high', 'very low'];
    const invalidVolatility = games.filter(g => {
      const vol = g.specs?.volatility;
      return vol && !validVolatilities.includes(vol.toLowerCase());
    });
    
    if (invalidVolatility.length > 0) {
      console.error('Games with invalid volatility:', invalidVolatility.slice(0, 5));
    }
    
    expect(invalidVolatility).toHaveLength(0);
  });

  test('reels should be between 1 and 10', () => {
    const invalidReels = games.filter(g => {
      const reels = g.specs?.reels;
      return typeof reels === 'number' && (reels < 1 || reels > 10);
    });
    
    expect(invalidReels).toHaveLength(0);
  });

  test('rows should be between 1 and 10', () => {
    const invalidRows = games.filter(g => {
      const rows = g.specs?.rows;
      return typeof rows === 'number' && (rows < 1 || rows > 10);
    });
    
    expect(invalidRows).toHaveLength(0);
  });
});

describe('JSON Baseline: Data Quality', () => {
  let games;

  beforeAll(async () => {
    const response = await fetch('/data/games_master.json');
    const data = await response.json();
    games = data.games;
  });

  test('no NaN values in numeric fields', () => {
    const gamesWithNaN = games.filter(g => {
      return (
        isNaN(g.specs?.rtp) ||
        isNaN(g.specs?.reels) ||
        isNaN(g.specs?.rows) ||
        isNaN(g.performance?.theo_win) ||
        isNaN(g.performance?.market_share_percent) ||
        isNaN(g.performance?.rank)
      );
    });
    
    expect(gamesWithNaN).toHaveLength(0);
  });

  test('no Infinity values in numeric fields', () => {
    const gamesWithInfinity = games.filter(g => {
      return (
        !isFinite(g.specs?.rtp) ||
        !isFinite(g.specs?.reels) ||
        !isFinite(g.specs?.rows) ||
        !isFinite(g.performance?.theo_win) ||
        !isFinite(g.performance?.market_share_percent) ||
        !isFinite(g.performance?.rank)
      );
    });
    
    expect(gamesWithInfinity).toHaveLength(0);
  });

  test('no "undefined" or "null" string values', () => {
    const gamesWithBadStrings = games.filter(g => {
      const str = JSON.stringify(g).toLowerCase();
      return str.includes('"undefined"') || str.includes('"null"');
    });
    
    if (gamesWithBadStrings.length > 0) {
      console.error('Games with "undefined" or "null" strings:', gamesWithBadStrings.slice(0, 3));
    }
    
    expect(gamesWithBadStrings).toHaveLength(0);
  });

  test('theme names should not be empty or "Unknown"', () => {
    const invalidThemes = games.filter(g => {
      const theme = g.theme?.consolidated;
      return !theme || theme.toLowerCase() === 'unknown' || theme.trim() === '';
    });
    
    if (invalidThemes.length > 0) {
      console.warn(`Warning: ${invalidThemes.length} games have unknown/empty themes`);
    }
    
    // This might be acceptable for some games, so just warn
    expect(invalidThemes.length).toBeLessThan(10);
  });

  test('provider names should not be empty', () => {
    const invalidProviders = games.filter(g => {
      const provider = g.provider?.studio;
      return !provider || provider.trim() === '';
    });
    
    expect(invalidProviders).toHaveLength(0);
  });
});

describe('JSON Baseline: Statistics', () => {
  let games;
  let stats;

  beforeAll(async () => {
    const response = await fetch('/data/games_master.json');
    const data = await response.json();
    games = data.games;
    stats = calculateOverviewStats(games);
  });

  test('should calculate correct overview stats', () => {
    expect(stats.total_games).toBe(501);
    expect(stats.theme_count).toBeGreaterThan(50);
    expect(stats.theme_count).toBeLessThan(150);
    expect(stats.mechanic_count).toBeGreaterThan(15);
    expect(stats.mechanic_count).toBeLessThan(50);
    
    console.log('Overview stats:', stats);
  });

  test('unique themes count should match manual count', () => {
    const uniqueThemes = new Set(games.map(g => g.theme?.consolidated).filter(Boolean));
    expect(stats.theme_count).toBe(uniqueThemes.size);
  });

  test('unique mechanics count should match manual count', () => {
    const uniqueMechanics = new Set(games.map(g => g.mechanic?.primary).filter(Boolean));
    expect(stats.mechanic_count).toBe(uniqueMechanics.size);
  });

  test('average theo_win should be reasonable', () => {
    expect(stats.avg_theo_win).toBeGreaterThan(0);
    expect(stats.avg_theo_win).toBeLessThan(50);
    
    console.log('Average theo_win:', stats.avg_theo_win.toFixed(2));
  });

  test('total market share should be reasonable', () => {
    // Market share can exceed 100% due to multi-theme games
    expect(stats.total_market_share).toBeGreaterThan(50);
    expect(stats.total_market_share).toBeLessThan(300);
    
    console.log('Total market share:', stats.total_market_share.toFixed(2), '%');
  });
});

describe('JSON Baseline: Distributions', () => {
  let games;
  let themes;
  let mechanics;
  let providers;

  beforeAll(async () => {
    const response = await fetch('/data/games_master.json');
    const data = await response.json();
    games = data.games;
    themes = calculateThemeDistribution(games);
    mechanics = calculateMechanicDistribution(games);
    providers = calculateProviderDistribution(games);
  });

  test('theme distribution should be calculated correctly', () => {
    expect(themes.length).toBeGreaterThan(50);
    
    // Sum of game counts should equal total games (allowing for rounding)
    const totalGames = themes.reduce((sum, t) => sum + t.game_count, 0);
    expect(totalGames).toBeGreaterThanOrEqual(games.length);
    
    console.log(`Calculated ${themes.length} themes from ${games.length} games`);
  });

  test('mechanic distribution should be calculated correctly', () => {
    expect(mechanics.length).toBeGreaterThan(15);
    
    const totalGames = mechanics.reduce((sum, m) => sum + m.game_count, 0);
    expect(totalGames).toBeGreaterThanOrEqual(games.length);
    
    console.log(`Calculated ${mechanics.length} mechanics`);
  });

  test('provider distribution should be calculated correctly', () => {
    expect(providers.length).toBeGreaterThan(10);
    
    const totalGames = providers.reduce((sum, p) => sum + p.game_count, 0);
    expect(totalGames).toBe(games.length);
    
    console.log(`Calculated ${providers.length} providers`);
  });

  test('top themes should have reasonable game counts', () => {
    const sortedByCount = [...themes].sort((a, b) => b.game_count - a.game_count);
    const topTheme = sortedByCount[0];
    
    expect(topTheme.game_count).toBeGreaterThan(5);
    expect(topTheme.game_count).toBeLessThan(100);
    
    console.log(`Top theme: ${topTheme.theme} with ${topTheme.game_count} games`);
  });

  test('all themes should have valid averages', () => {
    const invalidAvgs = themes.filter(t => 
      isNaN(t.avg_theo_win) || 
      t.avg_theo_win < 0 || 
      t.avg_theo_win > 100
    );
    
    expect(invalidAvgs).toHaveLength(0);
  });

  test('all mechanics should have valid averages', () => {
    const invalidAvgs = mechanics.filter(m => 
      isNaN(m.avg_theo_win) || 
      m.avg_theo_win < 0 || 
      m.avg_theo_win > 100
    );
    
    expect(invalidAvgs).toHaveLength(0);
  });
});
