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
    Ags: 'AGS',
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
export const MIN_PROVIDER_GAMES = 15;

/** Minimum games for "best feature" calculations. */
export const MIN_FEATURE_GAMES = 5;

/** Minimum games for a theme/mechanic to be "qualified" in rankings (Eilers-style threshold). */
export const MIN_QUALIFIED_GAMES = 20;

/** Minimum sample size for sub-theme tags, combo signals, etc. */
export const MIN_SAMPLE_SIZE = 2;

/** Market share threshold for "market leaders" filter — percent points on DuckDB `performance_market_share_percent` (0.5 = 0.5% GGR). */
export const MARKET_LEADER_THRESHOLD = 0.5;

/** Element name consolidation — merge overlapping art element labels. */
export const ELEMENT_CONSOLIDATION = {
    'Fire/Flames/Lava': 'Fire/Flames',
    'Stars/Sparkles/Cosmic': 'Stars/Sparkles',
    'Books/Scrolls/Maps': 'Books/Scrolls',
    'Food/Candy/Drinks': 'Food/Drinks',
    'Coral Reef/Underwater': 'Coral Reef/Underwater',
    'Coral Reef': 'Coral Reef/Underwater',
    Food: 'Food/Drinks',
};

/** Character name consolidation — merge legacy and vision pipeline variants. */
export const CHARACTER_CONSOLIDATION = {
    'Pharaoh/Egyptian Ruler': 'Pharaoh',
    'Explorer/Adventurer': 'Explorer',
    'Warrior/Knight': 'Warrior',
};

/** Features completely hidden from the dashboard (too ambiguous for users). */
export const HIDDEN_FEATURES = new Set(['Multiplier', 'Multipliers']);

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

/**
 * Normalize volatility string to Title-Case for display/lookup.
 * Preserves the original separator (space or hyphen).
 * "very high" → "Very High", "medium-high" → "Medium-High"
 */
export function normalizeVolatility(raw) {
    if (!raw) return 'Unknown';
    return raw.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Color hex map ─────────────────────────────────────────────────────
export const COLOR_HEX_MAP = {
    Gold: '#EAB308',
    Silver: '#C0C0C0',
    Red: '#EF4444',
    Blue: '#3B82F6',
    Green: '#22C55E',
    Purple: '#A855F7',
    Pink: '#EC4899',
    Teal: '#14B8A6',
    Yellow: '#FFD700',
    Orange: '#F97316',
    Black: '#1F2937',
    White: '#F3F4F6',
    Beige: '#D2B48C',
    Brown: '#92400E',
    Crimson: '#DC143C',
    Magenta: '#FF00FF',
    Coral: '#FF7F50',
    'Dark Blue': '#1E3A5F',
    'Light Blue': '#87CEEB',
    'Dark Green': '#1B5E20',
    'Light Green': '#81C784',
    Navy: '#000080',
    Turquoise: '#40E0D0',
    Ivory: '#FFFFF0',
    Lavender: '#E6E6FA',
    Indigo: '#4B0082',
    Maroon: '#800000',
    Olive: '#808000',
    Emerald: '#50C878',
    Ruby: '#E0115F',
    Sapphire: '#0F52BA',
    Amber: '#FFBF00',
    Copper: '#B87333',
    Bronze: '#CD7F32',
    Platinum: '#E5E4E2',
    Charcoal: '#36454F',
    Rose: '#FF007F',
    Burgundy: '#800020',
    Slate: '#708090',
    Tan: '#D2B48C',
    Peach: '#FFCBA4',
    Mint: '#98FB98',
    Aqua: '#00FFFF',
    Neon: '#39FF14',
    Pastel: '#FFD1DC',
    Earth: '#5C4033',
    Warm: '#FF6B35',
    Cool: '#4A90D9',
    Dark: '#2D2D2D',
    Light: '#F0F0F0',
    Bright: '#FFD700',
    Muted: '#9E9E9E',
    Metallic: '#AAA9AD',
    Rainbow: '#FF0000',
    Multi: '#FF69B4',
    Gray: '#9CA3AF',
};

/** Map shade variants to their base color for aggregation in bubble charts. */
export const COLOR_BASE_MAP = {
    'Dark Blue': 'Blue',
    'Light Blue': 'Blue',
    'Neon Blue': 'Blue',
    'Dark Green': 'Green',
    'Light Green': 'Green',
    'Neon Green': 'Green',
    'Neon Pink': 'Pink',
    Crimson: 'Red',
};

/** Get the base color for aggregation (or return the color itself if already base). */
export function colorBase(name) {
    return COLOR_BASE_MAP[name] || name;
}

/** Get hex color for a color name, with hash-based fallback for unknown names. */
export function colorHex(name) {
    if (!name) return '#9CA3AF';
    const first = name.split(/[\s/]/)[0];
    if (COLOR_HEX_MAP[first]) return COLOR_HEX_MAP[first];
    const hash = name.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    return '#' + ((hash & 0xffffff) | 0x404040).toString(16).slice(-6);
}

/** Return contrasting text color (dark or white) for a given background hex. */
export function textColorForBg(hex) {
    if (!hex || hex.length < 7) return '#FFFFFF';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#1F2937' : '#FFFFFF';
}
