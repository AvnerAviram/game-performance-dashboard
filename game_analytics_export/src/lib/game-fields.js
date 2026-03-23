/**
 * Game Field Accessors — single source of truth for accessing game properties.
 *
 * Handles the flat (DuckDB) vs nested (raw JSON) field formats.
 * Every file that reads game properties MUST use F.xxx(game) instead of
 * inline fallback chains like `game.performance_theo_win ?? game.performance?.theo_win`.
 */

import { normalizeProvider } from './shared-config.js';

// ── Core accessors ─────────────────────────────────────────────────────

export const F = {
    id: g => g.id || '',
    name: g => g.name || '',

    theoWin: g => g.performance_theo_win ?? g.performance?.theo_win ?? 0,
    marketShare: g => g.performance_market_share_percent ?? g.performance?.market_share_percent ?? 0,
    rank: g => g.performance_rank ?? g.performance?.rank ?? 999,
    anomaly: g => g.performance_anomaly || g.performance?.anomaly || null,

    provider: g => normalizeProvider(g.provider_studio || g.provider?.studio || g.provider),
    providerParent: g => g.provider_parent || g.provider?.parent || 'Unknown',

    theme: g => g.theme_primary || g.theme?.primary || 'Unknown',
    themeConsolidated: g =>
        g.theme_consolidated || g.theme?.consolidated || g.theme_primary || g.theme?.primary || 'Unknown',
    themeSecondary: g => g.theme_secondary || g.theme?.secondary || '',
    themesAll: g => g.themes_all || [],

    mechanicPrimary: g => g.mechanic_primary || '',
    features: g => g.features || [],

    rtp: g => parseFloat(g.specs_rtp || g.rtp || 0) || 0,
    volatility: g => {
        const raw = (g.specs_volatility || g.volatility || '').replace(/<[^>]+>/g, '').trim();
        if (!raw) return '';
        const VOL_MAP = {
            high: 'High',
            medium: 'Medium',
            low: 'Low',
            'very high': 'Very High',
            'medium-high': 'Medium-High',
            'medium-low': 'Medium-Low',
            'low-medium': 'Low-Medium',
            'medium/high': 'Medium-High',
            'low/medium': 'Low-Medium',
            'low to medium': 'Low-Medium',
            'low-mid': 'Low-Medium',
            'low/mid': 'Low-Medium',
            'mid-high to high': 'High',
            'higher volatility': 'High',
            'high/extreme': 'Very High',
            extreme: 'Very High',
            maximum: 'Very High',
            adjustable: 'Medium',
            variable: 'Medium',
            'not specified': 'Not Disclosed',
            'not disclosed': 'Not Disclosed',
            'n/a': 'Not Disclosed',
            unknown: 'Unknown',
        };
        const key = raw
            .toLowerCase()
            .replace(/\s*\(.*\)/, '')
            .trim();
        if (VOL_MAP[key]) return VOL_MAP[key];
        for (const [k, v] of Object.entries(VOL_MAP)) {
            if (key.includes(k) && k.length >= 3) return v;
        }
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    },
    reels: g => parseInt(g.specs_reels || g.reels || 0, 10) || 0,
    rows: g => parseInt(g.specs_rows || g.rows || 0, 10) || 0,
    paylines: g => g.specs_paylines || g.paylines_count || 0,

    minBet: g => parseFloat(g.min_bet || 0) || 0,
    maxBet: g => parseFloat(g.max_bet || 0) || 0,
    maxWin: g => g.max_win || '',

    sites: g => g.sites || 0,
    avgBet: g => g.avg_bet || 0,
    medianBet: g => g.median_bet || 0,
    gamesPlayedIndex: g => g.games_played_index || 0,
    coinIn: g => g.coin_in_index || 0,

    releaseYear: g => g.release_year || g.release?.year || 0,
    releaseMonth: g => g.release_month || g.release?.month || 0,

    franchise: g => g.franchise || null,
    franchiseType: g => g.franchise_type || null,
};

// ── DuckDB column name constants (for dynamic sort keys) ───────────────

export const FIELD_NAMES = {
    THEO_WIN: 'performance_theo_win',
    MARKET_SHARE: 'performance_market_share_percent',
    PROVIDER: 'provider_studio',
    THEME: 'theme_primary',
    THEME_CONSOLIDATED: 'theme_consolidated',
    VOLATILITY: 'specs_volatility',
    RTP: 'specs_rtp',
    REELS: 'specs_reels',
    ROWS: 'specs_rows',
    NAME: 'name',
    RELEASE_YEAR: 'release_year',
    MIN_BET: 'min_bet',
    MAX_BET: 'max_bet',
    SITES: 'sites',
};

// ── Backward-compatible object builders (replacing compat.js) ──────────

/** Returns { primary, secondary, consolidated } theme object. */
export function getTheme(game) {
    return {
        primary: F.theme(game),
        secondary: F.themeSecondary(game),
        consolidated: F.themeConsolidated(game),
    };
}

/** Returns { studio, parent } provider object. */
export function getProvider(game) {
    return {
        studio: F.provider(game),
        parent: F.providerParent(game),
    };
}

/** Returns { theo_win, rank, anomaly, market_share_percent } performance object. */
export function getPerformance(game) {
    return {
        theo_win: F.theoWin(game),
        rank: F.rank(game),
        anomaly: F.anomaly(game),
        market_share_percent: F.marketShare(game),
    };
}
