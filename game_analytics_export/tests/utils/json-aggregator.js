/**
 * JSON Aggregator Utilities
 * 
 * Manual re-implementation of DuckDB aggregations for testing.
 * This allows us to verify DuckDB results against pure JavaScript calculations.
 */

/**
 * Load and parse games_master.json
 */
export async function loadGamesJSON() {
  const response = await fetch('/data/games_master.json');
  if (!response.ok) {
    throw new Error(`Failed to load games_master.json: ${response.status}`);
  }
  const data = await response.json();
  return data.games || [];
}

/**
 * Calculate overview statistics manually
 */
export function calculateOverviewStats(games) {
  const uniqueThemes = new Set();
  const uniqueMechanics = new Set();
  let totalTheoWin = 0;
  let totalMarketShare = 0;

  games.forEach(game => {
    // Themes
    if (game.theme?.consolidated) {
      uniqueThemes.add(game.theme.consolidated);
    }
    
    // Mechanics
    if (game.mechanic?.primary) {
      uniqueMechanics.add(game.mechanic.primary);
    }
    
    // Performance metrics
    if (typeof game.performance?.theo_win === 'number') {
      totalTheoWin += game.performance.theo_win;
    }
    if (typeof game.performance?.market_share_percent === 'number') {
      totalMarketShare += game.performance.market_share_percent;
    }
  });

  return {
    total_games: games.length,
    theme_count: uniqueThemes.size,
    mechanic_count: uniqueMechanics.size,
    avg_theo_win: games.length > 0 ? totalTheoWin / games.length : 0,
    total_market_share: totalMarketShare
  };
}

/**
 * Calculate theme distribution manually
 */
export function calculateThemeDistribution(games) {
  const themeMap = new Map();

  games.forEach(game => {
    const theme = game.theme?.consolidated;
    if (!theme) return;

    if (!themeMap.has(theme)) {
      themeMap.set(theme, {
        theme,
        game_count: 0,
        theo_win_sum: 0,
        market_share_sum: 0,
        rtp_sum: 0,
        rtp_count: 0,
        ranks: [],
        theo_wins: []
      });
    }

    const themeData = themeMap.get(theme);
    themeData.game_count++;
    
    if (typeof game.performance?.theo_win === 'number') {
      themeData.theo_win_sum += game.performance.theo_win;
      themeData.theo_wins.push(game.performance.theo_win);
    }
    
    if (typeof game.performance?.market_share_percent === 'number') {
      themeData.market_share_sum += game.performance.market_share_percent;
    }
    
    if (typeof game.specs?.rtp === 'number') {
      themeData.rtp_sum += game.specs.rtp;
      themeData.rtp_count++;
    }
    
    if (typeof game.performance?.rank === 'number') {
      themeData.ranks.push(game.performance.rank);
    }
  });

  // Convert to array and calculate averages
  const themes = Array.from(themeMap.values()).map(theme => ({
    theme: theme.theme,
    game_count: theme.game_count,
    avg_theo_win: theme.game_count > 0 ? theme.theo_win_sum / theme.game_count : 0,
    total_market_share: theme.market_share_sum,
    avg_rtp: theme.rtp_count > 0 ? theme.rtp_sum / theme.rtp_count : 0,
    min_rank: theme.ranks.length > 0 ? Math.min(...theme.ranks) : null,
    max_theo_win: theme.theo_wins.length > 0 ? Math.max(...theme.theo_wins) : 0
  }));

  return themes;
}

/**
 * Calculate mechanic distribution manually
 */
export function calculateMechanicDistribution(games) {
  const mechanicMap = new Map();

  games.forEach(game => {
    const mechanic = game.mechanic?.primary;
    if (!mechanic) return;

    if (!mechanicMap.has(mechanic)) {
      mechanicMap.set(mechanic, {
        mechanic,
        game_count: 0,
        theo_win_sum: 0,
        market_share_sum: 0,
        volatilities: []
      });
    }

    const mechanicData = mechanicMap.get(mechanic);
    mechanicData.game_count++;
    
    if (typeof game.performance?.theo_win === 'number') {
      mechanicData.theo_win_sum += game.performance.theo_win;
    }
    
    if (typeof game.performance?.market_share_percent === 'number') {
      mechanicData.market_share_sum += game.performance.market_share_percent;
    }
    
    if (game.specs?.volatility) {
      mechanicData.volatilities.push(game.specs.volatility);
    }
  });

  // Convert to array and calculate averages
  const mechanics = Array.from(mechanicMap.values()).map(mech => ({
    mechanic: mech.mechanic,
    game_count: mech.game_count,
    avg_theo_win: mech.game_count > 0 ? mech.theo_win_sum / mech.game_count : 0,
    total_market_share: mech.market_share_sum,
    dominant_volatility: calculateMode(mech.volatilities)
  }));

  return mechanics;
}

/**
 * Calculate provider distribution manually
 */
export function calculateProviderDistribution(games) {
  const providerMap = new Map();

  games.forEach(game => {
    const studio = game.provider?.studio;
    const parent = game.provider?.parent;
    if (!studio) return;

    const key = `${studio}|${parent || studio}`;
    
    if (!providerMap.has(key)) {
      providerMap.set(key, {
        studio,
        parent: parent || studio,
        game_count: 0,
        theo_win_sum: 0,
        market_share_sum: 0,
        volatilities: []
      });
    }

    const providerData = providerMap.get(key);
    providerData.game_count++;
    
    if (typeof game.performance?.theo_win === 'number') {
      providerData.theo_win_sum += game.performance.theo_win;
    }
    
    if (typeof game.performance?.market_share_percent === 'number') {
      providerData.market_share_sum += game.performance.market_share_percent;
    }
    
    if (game.specs?.volatility) {
      providerData.volatilities.push(game.specs.volatility);
    }
  });

  // Convert to array and calculate averages
  const providers = Array.from(providerMap.values()).map(prov => ({
    provider_studio: prov.studio,
    provider_parent: prov.parent,
    game_count: prov.game_count,
    avg_theo_win: prov.game_count > 0 ? prov.theo_win_sum / prov.game_count : 0,
    total_market_share: prov.market_share_sum,
    dominant_volatility: calculateMode(prov.volatilities)
  }));

  return providers;
}

/**
 * Get anomalies (high and low performers)
 */
export function calculateAnomalies(games) {
  const highPerformers = games
    .filter(g => g.performance?.anomaly === 'high')
    .sort((a, b) => (b.performance?.theo_win || 0) - (a.performance?.theo_win || 0))
    .slice(0, 25);

  const lowPerformers = games
    .filter(g => g.performance?.anomaly === 'low')
    .sort((a, b) => (a.performance?.theo_win || 0) - (b.performance?.theo_win || 0))
    .slice(0, 30);

  return {
    high: highPerformers,
    low: lowPerformers
  };
}

/**
 * Filter games by criteria
 */
export function filterGames(games, filters = {}) {
  let filtered = [...games];

  if (filters.provider) {
    filtered = filtered.filter(g => 
      g.provider?.studio?.toLowerCase().includes(filters.provider.toLowerCase())
    );
  }

  if (filters.mechanic) {
    filtered = filtered.filter(g => 
      g.mechanic?.primary?.toLowerCase().includes(filters.mechanic.toLowerCase())
    );
  }

  if (filters.theme) {
    filtered = filtered.filter(g => 
      g.theme?.consolidated?.toLowerCase().includes(filters.theme.toLowerCase())
    );
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(g => 
      g.name?.toLowerCase().includes(searchLower)
    );
  }

  return filtered;
}

/**
 * Calculate Smart Index for themes/mechanics
 */
export function calculateSmartIndex(items, avgTheoOverall) {
  return items.map(item => {
    const gameCount = item.game_count || item['Game Count'] || 0;
    const avgTheo = item.avg_theo_win || item['Avg Theo Win Index'] || 0;
    const weight = Math.sqrt(gameCount);
    const smartIndex = (avgTheo * weight) / avgTheoOverall;
    
    return {
      ...item,
      smart_index: smartIndex
    };
  }).sort((a, b) => b.smart_index - a.smart_index);
}

/**
 * Calculate mode (most common value) in array
 */
function calculateMode(arr) {
  if (arr.length === 0) return null;
  
  const counts = {};
  arr.forEach(val => {
    counts[val] = (counts[val] || 0) + 1;
  });
  
  let maxCount = 0;
  let mode = null;
  Object.entries(counts).forEach(([val, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mode = val;
    }
  });
  
  return mode;
}

/**
 * Compare two numbers with tolerance for floating point errors
 */
export function compareWithTolerance(a, b, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Get unique values from array
 */
export function getUnique(games, field) {
  const values = new Set();
  games.forEach(game => {
    const value = getNestedValue(game, field);
    if (value) values.add(value);
  });
  return Array.from(values);
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Validate data structure
 */
export function validateGameStructure(game) {
  const errors = [];
  
  if (!game.name || typeof game.name !== 'string') {
    errors.push('Missing or invalid name');
  }
  
  if (!game.theme || typeof game.theme !== 'object') {
    errors.push('Missing or invalid theme');
  } else if (!game.theme.consolidated) {
    errors.push('Missing theme.consolidated');
  }
  
  if (!game.mechanic || typeof game.mechanic !== 'object') {
    errors.push('Missing or invalid mechanic');
  }
  
  if (!game.provider || typeof game.provider !== 'object') {
    errors.push('Missing or invalid provider');
  }
  
  if (!game.performance || typeof game.performance !== 'object') {
    errors.push('Missing or invalid performance');
  } else {
    if (typeof game.performance.theo_win !== 'number') {
      errors.push('Missing or invalid performance.theo_win');
    }
  }
  
  return errors;
}
