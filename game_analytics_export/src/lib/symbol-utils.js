/**
 * Symbol categorization and utilities.
 * Shared across game panels, insights, and advisors.
 */

export const SYMBOL_CATEGORIES = [
    'Wild',
    'Scatter/Bonus',
    'Gems/Crystals',
    'Gold/Treasure',
    'Cash/Collect',
    'Multiplier',
    '7s/BARs',
    'Animals',
    'Mythical',
    'Egyptian',
    'Nature',
    'Food/Fruit',
    'Fire/Elements',
    'Card',
    'Themed',
];

export const SYMBOL_CAT_COLORS = {
    Wild: {
        cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
        bar: 'bg-purple-400',
        ring: 'ring-purple-200 dark:ring-purple-700',
    },
    'Scatter/Bonus': {
        cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        bar: 'bg-amber-400',
        ring: 'ring-amber-200 dark:ring-amber-700',
    },
    'Gems/Crystals': {
        cls: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
        bar: 'bg-fuchsia-400',
        ring: 'ring-fuchsia-200 dark:ring-fuchsia-700',
    },
    'Gold/Treasure': {
        cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
        bar: 'bg-yellow-400',
        ring: 'ring-yellow-200 dark:ring-yellow-700',
    },
    'Cash/Collect': {
        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
        bar: 'bg-emerald-400',
        ring: 'ring-emerald-200 dark:ring-emerald-700',
    },
    Multiplier: {
        cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
        bar: 'bg-indigo-400',
        ring: 'ring-indigo-200 dark:ring-indigo-700',
    },
    '7s/BARs': {
        cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
        bar: 'bg-red-400',
        ring: 'ring-red-200 dark:ring-red-700',
    },
    Animals: {
        cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
        bar: 'bg-orange-400',
        ring: 'ring-orange-200 dark:ring-orange-700',
    },
    Mythical: {
        cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
        bar: 'bg-violet-400',
        ring: 'ring-violet-200 dark:ring-violet-700',
    },
    Egyptian: {
        cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
        bar: 'bg-amber-500',
        ring: 'ring-amber-300 dark:ring-amber-600',
    },
    Nature: {
        cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
        bar: 'bg-teal-400',
        ring: 'ring-teal-200 dark:ring-teal-700',
    },
    'Food/Fruit': {
        cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
        bar: 'bg-rose-400',
        ring: 'ring-rose-200 dark:ring-rose-700',
    },
    'Fire/Elements': {
        cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
        bar: 'bg-orange-500',
        ring: 'ring-orange-300 dark:ring-orange-600',
    },
    Card: {
        cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
        bar: 'bg-gray-400',
        ring: 'ring-gray-200 dark:ring-gray-600',
    },
    Themed: {
        cls: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
        bar: 'bg-sky-400',
        ring: 'ring-sky-200 dark:ring-sky-700',
    },
};

const GARBAGE_SYMBOLS =
    /^(spin|split|boost|reels|xways|xway|data|vs|reel|bet|win|line|pay|auto|stop|start|info|menu|help|exit|max|min|total|base|game|slot|play|mode|hold|feature|reset|cancel|collect|gamble)$/i;

const MECHANIC_SYMBOLS =
    /^(wild|wilds|scatter|scatters|bonus|free\s*spins?|cash|jackpot|multiplier|multi|mystery|expand|expanding|stacked|locked|sticky|walking|mega|mini|minor|major|grand|symbol|symbols|special|prize|cash\s*prize\s*symbols?|respins?|collect|nudge|trigger|retrigger)$/i;

export function normalizeSymbolName(name) {
    if (!name || typeof name !== 'string') return null;
    let n = name.trim();
    if (!n) return null;
    n = n.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (!n) return null;
    if (n.length <= 1) return null;
    if (/^\d+$/.test(n)) return null;
    if (GARBAGE_SYMBOLS.test(n)) return null;
    if (MECHANIC_SYMBOLS.test(n)) return null;
    return n;
}

function pluralNormalize(name) {
    const lo = name.toLowerCase();
    if (lo.endsWith('s') && lo.length > 3) return lo.slice(0, -1);
    return lo;
}

export function categorizeSymbol(s) {
    const lo = String(s).toLowerCase();
    if (/\bwild\b/.test(lo)) return 'Wild';
    if (/scatter|bonus\b|free.?spin|\bspin\b|\bwheel\b/.test(lo)) return 'Scatter/Bonus';
    if (/multiplier|\bmulti\b|x\s?multiplier/i.test(lo) && !/wild/i.test(lo)) return 'Multiplier';
    if (/jackpot/i.test(lo)) return 'Cash/Collect';
    if (/cash|collect\b|prize|dollar|\$|money\b/.test(lo)) return 'Cash/Collect';
    if (/diamond|ruby|emerald|sapphire|amethyst|crystal|gem\b|gems\b|jewel|topaz|opal|garnet|turquoise|jade\b/.test(lo))
        return 'Gems/Crystals';
    if (/\bgold\b|golden|coin\b|coins\b|treasure|crown\b|chest\b|nugget|ingot/.test(lo)) return 'Gold/Treasure';
    if (/\b7s?\b|seven|bar\b|bars\b|bell\b|bells\b|triple.?bar|double.?bar|single.?bar/.test(lo)) return '7s/BARs';
    if (/dragon|phoenix|pegasus|griffin|unicorn|hydra|kraken|serpent/.test(lo)) return 'Mythical';
    if (
        /scarab|ankh|horus|pharaoh|anubis|cleopatra|sphinx|hieroglyph|cartouche|nefertiti|ra\b|isis\b|bastet|osiris/.test(
            lo
        )
    )
        return 'Egyptian';
    if (
        /wolf|lion|eagle|tiger|horse|fish\b|bear\b|buffalo|bison|panther|leopard|elk|stag|deer|rhino|gorilla|monkey|ape|parrot|crocodile|turtle|owl|hawk|falcon|raven|snake|cobra|shark|whale|dolphin|cat\b|dog\b|rabbit|fox\b|moose|bull\b/.test(
            lo
        )
    )
        return 'Animals';
    if (
        /cherr|grape|plum\b|lemon|watermelon|orange\b|banana|apple\b|strawberr|pear\b|pineapple|melon|peach|fruit/.test(
            lo
        )
    )
        return 'Food/Fruit';
    if (/fire\b|flame|blaz|lava|volcano|volcanic|lightning|thunder|ice\b|frost|snow|wind|storm|element/.test(lo))
        return 'Fire/Elements';
    if (
        /flower|lotus|rose\b|lily|orchid|blossom|tree\b|leaf|bamboo|mushroom|star\b|moon\b|sun\b|rainbow|river|mountain|forest|ocean|garden|plant|clover|shamrock|acorn/.test(
            lo
        )
    )
        return 'Nature';
    if (/\b[akqj]\b/.test(lo) && lo.length < 30) return 'Card';
    if (/\bace\b|\bking\b|\bqueen\b|\bjack\b|\bten\b|\bnine\b/.test(lo)) return 'Card';
    if (/\b(10|9)\b/.test(lo) && lo.length < 20) return 'Card';
    if (/card.?symbol|playing.?card|card.?suit|card.?icon/.test(lo)) return 'Card';
    return 'Themed';
}

export function parseSymbols(val) {
    if (Array.isArray(val)) return val;
    if (!val || typeof val !== 'string') return [];
    try {
        const arr = JSON.parse(val);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return []; /* malformed JSON — treat as empty array */
    }
}

/**
 * Aggregate symbol stats for a set of games.
 * Returns { catStats, topSymbols } where catStats[cat] = { count, gameCount, totalTheo, symbols: Set }
 */
export function aggregateSymbolStats(games) {
    const catStats = {};
    SYMBOL_CATEGORIES.forEach(c => {
        catStats[c] = { count: 0, gameCount: 0, totalTheo: 0, symbols: new Map() };
    });
    const symbolFreq = {};
    const pluralMap = {};

    games.forEach(g => {
        const syms = parseSymbols(g.symbols);
        if (syms.length === 0) return;
        const theo = g.performance_theo_win || 0;
        const seen = new Set();
        syms.forEach(s => {
            const raw = String(s);
            const normalized = normalizeSymbolName(raw);
            if (!normalized) return;

            const pKey = pluralNormalize(normalized);
            if (!pluralMap[pKey]) pluralMap[pKey] = normalized;
            const canonical = pluralMap[pKey];

            const cat = categorizeSymbol(canonical);
            catStats[cat].count++;
            const existing = catStats[cat].symbols.get(canonical) || 0;
            catStats[cat].symbols.set(canonical, existing + 1);
            if (!seen.has(cat)) {
                catStats[cat].gameCount++;
                catStats[cat].totalTheo += theo;
                seen.add(cat);
            }
            symbolFreq[canonical] = (symbolFreq[canonical] || 0) + 1;
        });
    });

    const topSymbols = Object.entries(symbolFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name, count, cat: categorizeSymbol(name) }));

    return { catStats, topSymbols };
}
