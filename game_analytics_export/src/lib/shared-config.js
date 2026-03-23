/**
 * Shared configuration — single source of truth for normalization maps,
 * ordering constants, and threshold values used across the dashboard.
 *
 * Every file that needs these MUST import from here.
 * Duplicating any of these elsewhere will fail the enforcement test.
 */

// ── Provider normalization ─────────────────────────────────────────────
export const PROVIDER_NORMALIZATION_MAP = {
    Igt: 'IGT',
    'International Gaming Technology': 'IGT',
    Inspired: 'Inspired Gaming',
    'Inspired Ga': 'Inspired Gaming',
    'Inspired Entertainment': 'Inspired Gaming',
    'Play N Go': "Play'n GO",
    'Light And Wonder': 'Light & Wonder',
    Blueprint: 'Blueprint Gaming',
    'White Hat Studios': 'Blueprint Gaming',
    Lucksome: 'Blueprint Gaming',
    'Atomic Slot Lab': 'Blueprint Gaming',
    'Red Tiger': 'Red Tiger Gaming',
    Bragg: 'Bragg Gaming Group',
    '4ThePlayer': '4theplayer',
    'Pear Fiction Studios': 'PearFiction',
    Bally: 'Light & Wonder',
    WMS: 'Light & Wonder',
    Nyx: 'Light & Wonder',
    'NextGen Gaming': 'Light & Wonder',
    'Slingshot Studios': 'Light & Wonder',
    'Circular Arrow': 'Light & Wonder',
    'Fortune Factory Studios': 'Light & Wonder',
    Dsg: 'Design Works Gaming',
};

// ── Mechanic normalization ─────────────────────────────────────────────
export const MECHANIC_NORMALIZE = {
    'Hold & Win': 'Hold and Win',
};

// ── Volatility ordering & colors ───────────────────────────────────────

/** Display order from highest to lowest (used by charts and sorting). */
export const VOLATILITY_ORDER = ['Very High', 'High', 'Medium-High', 'Medium', 'Medium-Low', 'Low-Medium', 'Low'];

/** SQL-compatible sort rank (lowercase keys, matching DuckDB CASE). */
export const VOLATILITY_SQL_RANK = {
    low: 1,
    medium: 2,
    high: 3,
    'very high': 4,
};

/** Hex colors for chart bars/slices per volatility level. */
export const VOL_COLORS = {
    Low: '#10b981',
    'Low-Medium': '#34d399',
    'Medium-Low': '#6ee7b7',
    Medium: '#60a5fa',
    'Medium-High': '#f59e0b',
    High: '#f97316',
    'Very High': '#ef4444',
};

/** Tailwind class strings for VolatilityBadge per volatility level. */
export const VOL_BADGE_CLASSES = {
    Low: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800',
    'Low-Medium': 'bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-900/20 dark:text-lime-300 dark:ring-lime-800',
    Medium: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800',
    'Medium-High':
        'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:ring-orange-800',
    High: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-800',
    'Very High': 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-800',
};

// ── Thresholds ─────────────────────────────────────────────────────────

/** Minimum games a provider needs to appear in rankings/charts. */
export const MIN_PROVIDER_GAMES = 3;

/** Minimum games for "best feature" calculations. */
export const MIN_FEATURE_GAMES = 5;

/** Minimum sample size for sub-theme tags, combo signals, etc. */
export const MIN_SAMPLE_SIZE = 2;

/** Market share threshold for "market leaders" filter. */
export const MARKET_LEADER_THRESHOLD = 0.1;

/** Max items to show before "show more" collapse. */
export const INITIAL_SHOW = 5;

/** Default per-page count for paginated tables. */
export const DEFAULT_PAGE_SIZE = 50;

// ── Helpers ────────────────────────────────────────────────────────────

/** Normalize a provider name using the canonical map. */
export function normalizeProvider(raw) {
    if (!raw) return 'Unknown';
    return PROVIDER_NORMALIZATION_MAP[raw] || raw;
}

/** Normalize a mechanic name. */
export function normalizeMechanic(raw) {
    if (!raw) return 'Slot';
    return MECHANIC_NORMALIZE[raw] || raw;
}

/**
 * Normalize volatility string to Title-Case for display/lookup.
 * Preserves the original separator (space or hyphen).
 * "very high" → "Very High", "medium-high" → "Medium-High"
 */
export function normalizeVolatility(raw) {
    if (!raw) return 'Unknown';
    return raw.replace(/\b\w/g, c => c.toUpperCase());
}
