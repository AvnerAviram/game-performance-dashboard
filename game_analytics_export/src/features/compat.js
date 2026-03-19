/**
 * Compatibility helper for DuckDB flat fields vs nested JSON
 * Use this throughout ui.js to support both structures
 */

// Get theme fields (supports both flat and nested)
export function getTheme(game) {
    return {
        primary: game.theme_primary || game.theme?.primary || 'Unknown',
        secondary: game.theme_secondary || game.theme?.secondary || '',
        consolidated: game.theme_consolidated || game.theme?.consolidated || game.theme?.primary || 'Unknown'
    };
}

// Get provider fields
export function getProvider(game) {
    return {
        studio: game.provider_studio || game.provider?.studio || 'Unknown',
        parent: game.provider_parent || game.provider?.parent || 'Unknown'
    };
}

// Get performance fields
export function getPerformance(game) {
    return {
        theo_win: game.performance_theo_win ?? game.performance?.theo_win ?? 0,
        rank: game.performance_rank ?? game.performance?.rank ?? 999,
        anomaly: game.performance_anomaly || game.performance?.anomaly,
        market_share_percent: game.performance_market_share_percent ?? game.performance?.market_share_percent ?? 0
    };
}
