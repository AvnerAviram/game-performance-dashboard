export const CANONICAL_FEATURES = [
    'Buy Bonus',
    'Cascading Reels',
    'Cash On Reels',
    'Colossal Symbols',
    'Expanding Reels',
    'Expanding Wilds',
    'Free Spins',
    'Gamble Feature',
    'Hold and Spin',
    'Megaways',
    'Multiplier',
    'Mystery Symbols',
    'Nudges',
    'Persistence',
    'Pick Bonus',
    'Progressive Jackpot',
    'Respin',
    'Sidebets',
    'Stacked Symbols',
    'Static Jackpot',
    'Sticky Wilds',
    'Symbol Transformation',
    'Trail Bonus',
    'Wheel',
    'Wild Reels',
];

export const SHORT_FEATURE_LABELS = {
    'Buy Bonus': 'Buy Bonus',
    'Cascading Reels': 'Cascading Reels',
    'Cash On Reels': 'Cash On Reels',
    'Colossal Symbols': 'Colossal Sym.',
    'Expanding Reels': 'Expanding Reels',
    'Expanding Wilds': 'Expanding Wilds',
    'Free Spins': 'Free Spins',
    'Gamble Feature': 'Gamble',
    'Hold and Spin': 'Hold & Spin',
    Megaways: 'Megaways',
    Multiplier: 'Multiplier',
    'Mystery Symbols': 'Mystery Sym.',
    Nudges: 'Nudges',
    Persistence: 'Persistence',
    'Pick Bonus': 'Pick Bonus',
    'Progressive Jackpot': 'Progressive JP',
    Respin: 'Respin',
    Sidebets: 'Sidebets',
    'Stacked Symbols': 'Stacked Sym.',
    'Static Jackpot': 'Jackpot',
    'Sticky Wilds': 'Sticky Wilds',
    'Symbol Transformation': 'Sym. Transform',
    'Trail Bonus': 'Trail Bonus',
    Wheel: 'Wheel',
    'Wild Reels': 'Wild Reels',
};

const PALETTE = [
    'rgba(99,102,241,.85)',
    'rgba(236,72,153,.85)',
    'rgba(16,185,129,.85)',
    'rgba(245,158,11,.85)',
    'rgba(139,92,246,.85)',
    'rgba(59,130,246,.85)',
    'rgba(244,63,94,.85)',
    'rgba(14,165,233,.85)',
    'rgba(168,85,247,.85)',
    'rgba(234,179,8,.85)',
    'rgba(20,184,166,.85)',
    'rgba(251,146,60,.85)',
    'rgba(52,211,153,.85)',
    'rgba(129,140,248,.85)',
    'rgba(248,113,113,.85)',
    'rgba(45,212,191,.85)',
    'rgba(163,230,53,.85)',
    'rgba(232,121,249,.85)',
    'rgba(74,222,128,.85)',
    'rgba(250,204,21,.85)',
    'rgba(56,189,248,.85)',
    'rgba(192,132,252,.85)',
    'rgba(253,186,116,.85)',
    'rgba(34,197,94,.85)',
    'rgba(217,70,239,.85)',
];

export function getFeatureColor(feature) {
    const idx = CANONICAL_FEATURES.indexOf(feature);
    return idx >= 0 ? PALETTE[idx] : PALETTE[CANONICAL_FEATURES.length % PALETTE.length];
}

export function buildFeatureColorMap(features) {
    const map = {};
    features.forEach((f, i) => {
        map[f] = PALETTE[i % PALETTE.length];
    });
    return map;
}
