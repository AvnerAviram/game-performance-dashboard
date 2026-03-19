export const CANONICAL_FEATURES = [
    'Cash On Reels', 'Expanding Reels', 'Free Spins', 'Hold and Spin',
    'Nudges', 'Persistence', 'Pick Bonus', 'Respin', 'Static Jackpot',
    'Wheel', 'Wild Reels'
];

export const SHORT_FEATURE_LABELS = {
    'Cash On Reels': 'Cash On Reels',
    'Expanding Reels': 'Expanding Reels',
    'Free Spins': 'Free Spins',
    'Hold and Spin': 'Hold & Spin',
    'Nudges': 'Nudges',
    'Persistence': 'Persistence',
    'Pick Bonus': 'Pick Bonus',
    'Respin': 'Respin',
    'Static Jackpot': 'Jackpot',
    'Wheel': 'Wheel',
    'Wild Reels': 'Wild Reels',
};

const PALETTE = [
    'rgba(99,102,241,.85)', 'rgba(236,72,153,.85)', 'rgba(16,185,129,.85)',
    'rgba(245,158,11,.85)', 'rgba(139,92,246,.85)', 'rgba(59,130,246,.85)',
    'rgba(244,63,94,.85)',  'rgba(14,165,233,.85)', 'rgba(168,85,247,.85)',
    'rgba(234,179,8,.85)',  'rgba(20,184,166,.85)',
];

export function getFeatureColor(feature) {
    const idx = CANONICAL_FEATURES.indexOf(feature);
    return idx >= 0 ? PALETTE[idx] : PALETTE[CANONICAL_FEATURES.length % PALETTE.length];
}

export function buildFeatureColorMap(features) {
    const map = {};
    features.forEach((f, i) => { map[f] = PALETTE[i % PALETTE.length]; });
    return map;
}

