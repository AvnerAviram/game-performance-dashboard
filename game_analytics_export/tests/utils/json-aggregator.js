/**
 * JSON Aggregator Utilities
 *
 * Manual re-implementation of DuckDB aggregations for testing.
 * This allows us to verify DuckDB results against pure JavaScript calculations.
 * Supports both flat schema (game_data_master.json) and nested schema (games_master.json).
 */

/**
 * Dual-schema field accessors: support flat (theme_consolidated, theo_win, etc.)
 * and nested (theme.consolidated, performance.theo_win, etc.)
 */
function themeConsolidated(g) {
    return g.theme_consolidated ?? g.theme_primary ?? g.theme?.consolidated;
}
function providerStudio(g) {
    return g.studio ?? g.provider ?? g.provider_studio ?? g.provider?.studio;
}
function providerParent(g) {
    return g.parent_company ?? g.provider_parent ?? g.provider?.parent;
}
function theoWin(g) {
    return g.theo_win ?? g.performance_theo_win ?? g.performance?.theo_win;
}
function marketSharePercent(g) {
    return g.market_share_pct ?? g.performance_market_share_percent ?? g.performance?.market_share_percent;
}
function performanceAnomaly(g) {
    return g.anomaly ?? g.performance_anomaly ?? g.performance?.anomaly;
}
function performanceRank(g) {
    return g.performance_rank ?? g.performance?.rank;
}
function specsRtp(g) {
    return g.rtp ?? g.specs_rtp ?? g.specs?.rtp;
}
function specsVolatility(g) {
    return g.volatility ?? g.specs_volatility ?? g.specs?.volatility;
}

/**
 * Load and parse games. Supports game_data_master.json (flat array) or games_master.json (nested)
 */
export async function loadGamesJSON() {
    const response = await fetch('/data/game_data_master.json');
    if (!response.ok) {
        throw new Error(`Failed to load games: ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : data.games || [];
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
        const theme = themeConsolidated(game);
        if (theme) uniqueThemes.add(theme);

        const feats = Array.isArray(game.features) ? game.features : [];
        feats.forEach(f => uniqueMechanics.add(f));

        const tw = theoWin(game);
        if (typeof tw === 'number') totalTheoWin += tw;
        const ms = marketSharePercent(game);
        if (typeof ms === 'number') totalMarketShare += ms;
    });

    return {
        total_games: games.length,
        theme_count: uniqueThemes.size,
        mechanic_count: uniqueMechanics.size,
        avg_theo_win: games.length > 0 ? totalTheoWin / games.length : 0,
        total_market_share: totalMarketShare,
    };
}

/**
 * Calculate theme distribution manually
 */
export function calculateThemeDistribution(games) {
    const themeMap = new Map();

    games.forEach(game => {
        const theme = themeConsolidated(game);
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
                theo_wins: [],
            });
        }

        const themeData = themeMap.get(theme);
        themeData.game_count++;

        const tw = theoWin(game);
        if (typeof tw === 'number') {
            themeData.theo_win_sum += tw;
            themeData.theo_wins.push(tw);
        }
        const ms = marketSharePercent(game);
        if (typeof ms === 'number') themeData.market_share_sum += ms;

        const rtp = specsRtp(game);
        if (typeof rtp === 'number') {
            themeData.rtp_sum += rtp;
            themeData.rtp_count++;
        }
        const rank = performanceRank(game);
        if (typeof rank === 'number') themeData.ranks.push(rank);
    });

    // Convert to array and calculate averages
    const themes = Array.from(themeMap.values()).map(theme => ({
        theme: theme.theme,
        game_count: theme.game_count,
        avg_theo_win: theme.game_count > 0 ? theme.theo_win_sum / theme.game_count : 0,
        total_market_share: theme.market_share_sum,
        avg_rtp: theme.rtp_count > 0 ? theme.rtp_sum / theme.rtp_count : 0,
        min_rank: theme.ranks.length > 0 ? Math.min(...theme.ranks) : null,
        max_theo_win: theme.theo_wins.length > 0 ? Math.max(...theme.theo_wins) : 0,
    }));

    return themes;
}

/**
 * Calculate mechanic distribution manually.
 * For flat schema (game_data_master): groups by features array (matches DuckDB).
 * For nested schema (games_master): groups by mechanic.primary.
 */
export function calculateMechanicDistribution(games) {
    const mechanicMap = new Map();
    const hasFeaturesArray = games.some(g => Array.isArray(g.features) && g.features.length > 0);

    games.forEach(game => {
        const mechanicsToAdd = [];
        if (Array.isArray(game.features) && game.features.length > 0) {
            mechanicsToAdd.push(...game.features);
        }
        if (mechanicsToAdd.length === 0) return;

        const tw = theoWin(game);
        const ms = marketSharePercent(game);
        const vol = specsVolatility(game);

        mechanicsToAdd.forEach(mechanic => {
            if (!mechanicMap.has(mechanic)) {
                mechanicMap.set(mechanic, {
                    mechanic,
                    game_count: 0,
                    theo_win_sum: 0,
                    market_share_sum: 0,
                    volatilities: [],
                });
            }
            const mechanicData = mechanicMap.get(mechanic);
            mechanicData.game_count++;
            if (typeof tw === 'number') mechanicData.theo_win_sum += tw;
            if (typeof ms === 'number') mechanicData.market_share_sum += ms;
            if (vol) mechanicData.volatilities.push(vol);
        });
    });

    const mechanics = Array.from(mechanicMap.values()).map(mech => ({
        mechanic: mech.mechanic,
        game_count: mech.game_count,
        avg_theo_win: mech.game_count > 0 ? mech.theo_win_sum / mech.game_count : 0,
        total_market_share: mech.market_share_sum,
        dominant_volatility: calculateMode(mech.volatilities),
    }));

    return mechanics;
}

/**
 * Calculate provider distribution manually
 */
export function calculateProviderDistribution(games) {
    const providerMap = new Map();

    games.forEach(game => {
        const studio = providerStudio(game);
        const parent = providerParent(game);
        if (!studio) return;

        const key = `${studio}|${parent || studio}`;

        if (!providerMap.has(key)) {
            providerMap.set(key, {
                studio,
                parent: parent || studio,
                game_count: 0,
                theo_win_sum: 0,
                market_share_sum: 0,
                volatilities: [],
            });
        }

        const providerData = providerMap.get(key);
        providerData.game_count++;

        const tw = theoWin(game);
        if (typeof tw === 'number') providerData.theo_win_sum += tw;
        const ms = marketSharePercent(game);
        if (typeof ms === 'number') providerData.market_share_sum += ms;
        const vol = specsVolatility(game);
        if (vol) providerData.volatilities.push(vol);
    });

    // Convert to array and calculate averages
    const providers = Array.from(providerMap.values()).map(prov => ({
        provider_studio: prov.studio,
        provider_parent: prov.parent,
        game_count: prov.game_count,
        avg_theo_win: prov.game_count > 0 ? prov.theo_win_sum / prov.game_count : 0,
        total_market_share: prov.market_share_sum,
        dominant_volatility: calculateMode(prov.volatilities),
    }));

    return providers;
}

/**
 * Get anomalies (high and low performers)
 */
export function calculateAnomalies(games) {
    const highPerformers = games
        .filter(g => performanceAnomaly(g) === 'high')
        .sort((a, b) => (theoWin(b) || 0) - (theoWin(a) || 0))
        .slice(0, 25);

    const lowPerformers = games
        .filter(g => performanceAnomaly(g) === 'low')
        .sort((a, b) => (theoWin(a) || 0) - (theoWin(b) || 0))
        .slice(0, 30);

    return {
        high: highPerformers,
        low: lowPerformers,
    };
}

/**
 * Filter games by criteria
 */
export function filterGames(games, filters = {}) {
    let filtered = [...games];

    if (filters.provider) {
        filtered = filtered.filter(g =>
            (providerStudio(g) || '').toLowerCase().includes(filters.provider.toLowerCase())
        );
    }

    if (filters.mechanic) {
        const mechLower = filters.mechanic.toLowerCase();
        filtered = filtered.filter(g => {
            const feats = g.features;
            if (Array.isArray(feats) && feats.some(f => String(f).toLowerCase().includes(mechLower))) return true;
            return false;
        });
    }

    if (filters.theme) {
        filtered = filtered.filter(g =>
            (themeConsolidated(g) || '').toLowerCase().includes(filters.theme.toLowerCase())
        );
    }

    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(g => (g.name || '').toLowerCase().includes(searchLower));
    }

    return filtered;
}

/**
 * Calculate Smart Index for themes/mechanics
 */
export function calculateSmartIndex(items, avgTheoOverall) {
    return items
        .map(item => {
            const gameCount = item.game_count || item['Game Count'] || 0;
            const avgTheo = item.avg_theo_win || item['Avg Theo Win Index'] || 0;
            const weight = Math.sqrt(gameCount);
            const smartIndex = (avgTheo * weight) / avgTheoOverall;

            return {
                ...item,
                smart_index: smartIndex,
            };
        })
        .sort((a, b) => b.smart_index - a.smart_index);
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

/** Flat field fallbacks for common nested paths */
const FLAT_FALLBACKS = {
    'theme.consolidated': ['theme_consolidated', 'theme_primary'],
    'provider.studio': ['studio', 'provider', 'provider_studio'],
    'provider.parent': ['parent_company', 'provider_parent'],
    'performance.theo_win': ['theo_win', 'performance_theo_win'],
    'performance.market_share_percent': ['market_share_pct', 'performance_market_share_percent'],
    'performance.anomaly': ['anomaly', 'performance_anomaly'],
    'performance.rank': ['performance_rank'],
    'specs.rtp': ['rtp', 'specs_rtp'],
    'specs.volatility': ['volatility', 'specs_volatility'],
};

/**
 * Get nested value from object using dot notation.
 * Falls back to flat schema fields when nested path returns undefined.
 */
function getNestedValue(obj, path) {
    let val = path.split('.').reduce((current, key) => current?.[key], obj);
    if (val !== undefined && val !== null) return val;
    const flatKeys = FLAT_FALLBACKS[path];
    if (flatKeys) {
        for (const key of flatKeys) {
            val = obj[key];
            if (val !== undefined && val !== null) return val;
        }
    }
    return undefined;
}

/**
 * Validate data structure. Supports both flat and nested schemas.
 */
export function validateGameStructure(game) {
    const errors = [];

    if (!game.name || typeof game.name !== 'string') {
        errors.push('Missing or invalid name');
    }

    if (!themeConsolidated(game)) {
        errors.push('Missing theme (theme_consolidated/theme_primary or theme.consolidated)');
    }

    if (!providerStudio(game)) {
        errors.push('Missing provider (studio/provider or provider.studio)');
    }

    const tw = theoWin(game);
    if (typeof tw !== 'number') {
        errors.push('Missing or invalid theo_win (theo_win or performance.theo_win)');
    }

    return errors;
}
