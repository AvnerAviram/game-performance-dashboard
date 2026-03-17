/**
 * Test Data Generator
 * 
 * Generate mock data for testing without relying on external files.
 */

/**
 * Generate mock game data
 */
export function generateMockGame(overrides = {}) {
  const id = overrides.id || `game-${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    id,
    name: overrides.name || `Test Game ${id}`,
    name_normalized: overrides.name_normalized || id.toLowerCase(),
    theme: {
      primary: overrides.theme?.primary || 'Adventure',
      secondary: overrides.theme?.secondary || null,
      consolidated: overrides.theme?.consolidated || 'Adventure'
    },
    mechanic: {
      primary: overrides.mechanic?.primary || 'Free Spins',
      features: overrides.mechanic?.features || ['Free Spins', 'Wilds'],
      category: overrides.mechanic?.category || 'Bonus Games'
    },
    specs: {
      reels: overrides.specs?.reels || 5,
      rows: overrides.specs?.rows || 3,
      paylines: overrides.specs?.paylines || '20',
      volatility: overrides.specs?.volatility || 'medium',
      rtp: overrides.specs?.rtp || 96.0
    },
    provider: {
      studio: overrides.provider?.studio || 'Test Studio',
      parent: overrides.provider?.parent || 'Test Studio',
      display_name: overrides.provider?.display_name || 'Test Studio'
    },
    performance: {
      theo_win: overrides.performance?.theo_win ?? 10.5,
      market_share_percent: overrides.performance?.market_share_percent ?? 0.5,
      rank: overrides.performance?.rank ?? 100,
      anomaly: overrides.performance?.anomaly || null
    },
    ...overrides
  };
}

/**
 * Generate multiple mock games
 */
export function generateMockGames(count = 10, template = {}) {
  return Array.from({ length: count }, (_, i) => 
    generateMockGame({
      ...template,
      id: `game-${String(i + 1).padStart(3, '0')}`,
      name: template.name || `Test Game ${i + 1}`,
      performance: {
        ...template.performance,
        rank: template.performance?.rank ?? (i + 1)
      }
    })
  );
}

/**
 * Generate games with different themes
 */
export function generateGamesWithThemes(themesData) {
  const games = [];
  
  themesData.forEach(({ theme, count, avgTheoWin }) => {
    for (let i = 0; i < count; i++) {
      games.push(generateMockGame({
        theme: {
          primary: theme,
          consolidated: theme
        },
        performance: {
          theo_win: avgTheoWin + (Math.random() - 0.5) * 5,
          market_share_percent: Math.random() * 2
        }
      }));
    }
  });
  
  return games;
}

/**
 * Generate games with different mechanics
 */
export function generateGamesWithMechanics(mechanicsData) {
  const games = [];
  
  mechanicsData.forEach(({ mechanic, count, avgTheoWin }) => {
    for (let i = 0; i < count; i++) {
      games.push(generateMockGame({
        mechanic: {
          primary: mechanic,
          category: 'Bonus Games'
        },
        performance: {
          theo_win: avgTheoWin + (Math.random() - 0.5) * 5,
          market_share_percent: Math.random() * 2
        }
      }));
    }
  });
  
  return games;
}

/**
 * Generate games for specific provider
 */
export function generateProviderGames(provider, count = 10) {
  return generateMockGames(count, {
    provider: {
      studio: provider,
      parent: provider,
      display_name: provider
    }
  });
}

/**
 * Generate high performers (anomalies)
 */
export function generateHighPerformers(count = 25) {
  return generateMockGames(count, {
    performance: {
      theo_win: 20 + Math.random() * 30, // 20-50 range
      market_share_percent: 1 + Math.random() * 3,
      anomaly: 'high'
    }
  });
}

/**
 * Generate low performers (anomalies)
 */
export function generateLowPerformers(count = 30) {
  return generateMockGames(count, {
    performance: {
      theo_win: 0.5 + Math.random() * 2, // 0.5-2.5 range
      market_share_percent: 0.01 + Math.random() * 0.1,
      anomaly: 'low'
    }
  });
}

/**
 * Generate theme distribution data
 */
export function generateThemeDistribution(themes) {
  return themes.map(theme => ({
    theme: theme.name,
    game_count: theme.count || 10,
    avg_theo_win: theme.avgTheoWin || 10,
    total_market_share: theme.marketShare || 5,
    avg_rtp: theme.avgRtp || 96.0,
    min_rank: theme.minRank || 1,
    max_theo_win: theme.maxTheoWin || 30
  }));
}

/**
 * Generate mechanic distribution data
 */
export function generateMechanicDistribution(mechanics) {
  return mechanics.map(mechanic => ({
    mechanic: mechanic.name,
    game_count: mechanic.count || 10,
    avg_theo_win: mechanic.avgTheoWin || 10,
    total_market_share: mechanic.marketShare || 5,
    dominant_volatility: mechanic.volatility || 'medium'
  }));
}

/**
 * Generate provider distribution data
 */
export function generateProviderDistribution(providers) {
  return providers.map(provider => ({
    provider_studio: provider.name,
    provider_parent: provider.parent || provider.name,
    game_count: provider.count || 10,
    avg_theo_win: provider.avgTheoWin || 10,
    total_market_share: provider.marketShare || 5,
    dominant_volatility: provider.volatility || 'medium'
  }));
}

/**
 * Generate realistic dataset for testing
 */
export function generateRealisticDataset() {
  const themes = [
    { name: 'Adventure', count: 50, avgTheoWin: 12 },
    { name: 'Egyptian', count: 40, avgTheoWin: 15 },
    { name: 'Fruit', count: 35, avgTheoWin: 8 },
    { name: 'Fantasy', count: 30, avgTheoWin: 14 },
    { name: 'Asian', count: 25, avgTheoWin: 11 }
  ];
  
  const mechanics = [
    { name: 'Free Spins', count: 100, avgTheoWin: 12 },
    { name: 'Megaways', count: 50, avgTheoWin: 16 },
    { name: 'Hold & Win', count: 30, avgTheoWin: 14 }
  ];
  
  const providers = [
    { name: 'NetEnt', count: 60, avgTheoWin: 14 },
    { name: 'Pragmatic Play', count: 50, avgTheoWin: 13 },
    { name: 'Play\'n GO', count: 40, avgTheoWin: 12 }
  ];
  
  const games = [];
  let rankCounter = 1;
  
  // Generate games combining themes, mechanics, and providers
  themes.forEach(theme => {
    const gamesForTheme = Math.floor(theme.count / mechanics.length);
    
    mechanics.forEach(mechanic => {
      const provider = providers[Math.floor(Math.random() * providers.length)];
      
      for (let i = 0; i < gamesForTheme; i++) {
        games.push(generateMockGame({
          name: `${theme.name} ${mechanic.name} Game ${i + 1}`,
          theme: {
            primary: theme.name,
            consolidated: theme.name
          },
          mechanic: {
            primary: mechanic.name,
            category: 'Bonus Games'
          },
          provider: {
            studio: provider.name,
            parent: provider.name,
            display_name: provider.name
          },
          performance: {
            theo_win: theme.avgTheoWin + (Math.random() - 0.5) * 8,
            market_share_percent: Math.random() * 2,
            rank: rankCounter++
          }
        }));
      }
    });
  });
  
  return {
    games,
    themes: generateThemeDistribution(themes),
    mechanics: generateMechanicDistribution(mechanics),
    providers: generateProviderDistribution(providers)
  };
}

/**
 * Generate edge case data for testing
 */
export function generateEdgeCases() {
  return {
    emptyTheme: generateMockGame({
      theme: { primary: '', consolidated: '' }
    }),
    nullPerformance: generateMockGame({
      performance: { theo_win: null, market_share_percent: null }
    }),
    extremeValues: generateMockGame({
      performance: { theo_win: 999, market_share_percent: 100 }
    }),
    zeroValues: generateMockGame({
      performance: { theo_win: 0, market_share_percent: 0 }
    }),
    negativeRank: generateMockGame({
      performance: { rank: -1 }
    }),
    missingFields: {
      id: 'incomplete-game',
      name: 'Incomplete Game'
      // Missing other required fields
    }
  };
}

/**
 * Mock DuckDB response structure
 */
export function mockDuckDBResponse(data) {
  return Promise.resolve(data);
}

/**
 * Create mock gameData object
 */
export function createMockGameData(overrides = {}) {
  const dataset = generateRealisticDataset();
  
  return {
    total_games: overrides.total_games || dataset.games.length,
    theme_count: overrides.theme_count || dataset.themes.length,
    mechanic_count: overrides.mechanic_count || dataset.mechanics.length,
    themes: overrides.themes || dataset.themes,
    mechanics: overrides.mechanics || dataset.mechanics,
    top_anomalies: overrides.top_anomalies || generateHighPerformers(25),
    bottom_anomalies: overrides.bottom_anomalies || generateLowPerformers(30),
    allGames: overrides.allGames || dataset.games,
    _dataSource: overrides._dataSource || 'mock'
  };
}
