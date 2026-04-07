/**
 * Game Name Generator - Pattern analysis + AI generation
 * Analyzes 1,600+ real slot game names to understand naming conventions,
 * then generates contextually appropriate new names.
 */
import { gameData } from '../lib/data.js';
import { log } from '../lib/env.js';
import { apiPost, apiFetch } from '../lib/api-client.js';
import { escapeHtml, escapeAttr } from '../lib/sanitize.js';
import { CANONICAL_FEATURES } from '../lib/features.js';
import { parseFeatures } from '../lib/parse-features.js';

let namePatterns = null;
let selectedFeatures = new Set();
let selectedStyle = 'modern';

// Theme-associated naming vocabulary (extracted from real game data analysis)
const THEME_VOCAB = {
    Asian: {
        nouns: ['Dragon', 'Fortune', 'Jade', 'Phoenix', 'Tiger', 'Lotus', 'Emperor', 'Dynasty', 'Panda', 'Koi'],
        adj: ['Golden', 'Lucky', 'Imperial', 'Mighty', 'Sacred', 'Ancient', 'Royal', 'Mystic'],
    },
    Animals: {
        nouns: ['Wolf', 'Eagle', 'Lion', 'Bear', 'Stallion', 'Falcon', 'Panther', 'Buffalo', 'Hawk', 'Rhino'],
        adj: ['Wild', 'Mighty', 'Raging', 'Savage', 'Majestic', 'Alpha', 'Great', 'Primal'],
    },
    Classic: {
        nouns: ['Sevens', 'Bars', 'Cherry', 'Bell', 'Diamond', 'Star', 'Crown', 'Joker', 'Fruits', 'Blaze'],
        adj: ['Super', 'Hot', 'Ultra', 'Mega', 'Classic', 'Grand', 'Double', 'Triple'],
    },
    'Wealth & Gems': {
        nouns: [
            'Diamond',
            'Ruby',
            'Emerald',
            'Crystal',
            'Sapphire',
            'Jewel',
            'Gold',
            'Treasure',
            'Fortune',
            'Cash',
            'Vault',
            'Crown',
            'Riches',
            'Opal',
        ],
        adj: [
            'Brilliant',
            'Dazzling',
            'Sparkling',
            'Radiant',
            'Golden',
            'Rich',
            'Grand',
            'Mega',
            'Royal',
            'Glittering',
        ],
    },
    Cultural: {
        nouns: ['Fiesta', 'Carnival', 'Festival', 'Legend', 'Spirit', 'Saga', 'Tale', 'Heritage', 'Quest', 'Rhythm'],
        adj: ['Grand', 'Epic', 'Legendary', 'Eternal', 'Mystic', 'Ancient', 'Sacred', 'Vibrant'],
    },
    Arcade: {
        nouns: ['Blitz', 'Rush', 'Surge', 'Frenzy', 'Zone', 'Grid', 'Stack', 'Flash', 'Pulse', 'Blast'],
        adj: ['Turbo', 'Hyper', 'Mega', 'Ultra', 'Power', 'Super', 'Atomic', 'Cosmic'],
    },
    Egyptian: {
        nouns: ['Pharaoh', 'Sphinx', 'Pyramid', 'Scarab', 'Nile', 'Cleopatra', 'Anubis', 'Ra', 'Horus', 'Ankh'],
        adj: ['Ancient', 'Golden', 'Mighty', 'Sacred', 'Royal', 'Eternal', 'Mystic', 'Grand'],
    },
    'Casino & Vegas': {
        nouns: ['Jackpot', 'Vegas', 'Casino', 'Ace', 'Royal', 'Poker', 'Roulette', 'Fortune', 'Winner', 'Stakes'],
        adj: ['Lucky', 'Grand', 'High', 'Royal', 'Big', 'Mega', 'Premium', 'VIP'],
    },
    Adventure: {
        nouns: [
            'Quest',
            'Explorer',
            'Voyage',
            'Hunt',
            'Trail',
            'Expedition',
            'Pioneer',
            'Ranger',
            'Frontier',
            'Journey',
        ],
        adj: ['Wild', 'Epic', 'Grand', 'Lost', 'Hidden', 'Secret', 'Forbidden', 'Brave'],
    },
    'Fire & Elements': {
        nouns: ['Inferno', 'Blaze', 'Storm', 'Thunder', 'Flame', 'Volcano', 'Lightning', 'Frost', 'Tempest', 'Ember'],
        adj: ['Blazing', 'Raging', 'Eternal', 'Frozen', 'Electric', 'Burning', 'Roaring', 'Scorching'],
    },
    'Space & Sci-Fi': {
        nouns: ['Nova', 'Cosmos', 'Galaxy', 'Nebula', 'Star', 'Orbit', 'Reactor', 'Pulsar', 'Astro', 'Vortex'],
        adj: ['Cosmic', 'Stellar', 'Galactic', 'Hyper', 'Quantum', 'Solar', 'Astral', 'Infinite'],
    },
    Fantasy: {
        nouns: [
            'Dragon',
            'Wizard',
            'Knight',
            'Enchantment',
            'Realm',
            'Spell',
            'Sorcerer',
            'Unicorn',
            'Griffin',
            'Rune',
        ],
        adj: ['Enchanted', 'Mystic', 'Legendary', 'Dark', 'Arcane', 'Mythic', 'Ancient', 'Shadow'],
    },
    'Irish & Celtic': {
        nouns: ['Leprechaun', 'Shamrock', 'Rainbow', 'Clover', 'Pot', 'Gold', 'Charm', 'Wish', 'Celtic', 'Druid'],
        adj: ['Lucky', 'Golden', 'Magic', 'Emerald', 'Wild', 'Enchanted', 'Grand', 'Mystic'],
    },
    Mythology: {
        nouns: ['Zeus', 'Thor', 'Odin', 'Athena', 'Poseidon', 'Hercules', 'Apollo', 'Titan', 'Olympus', 'Valhalla'],
        adj: ['Mighty', 'Divine', 'Legendary', 'Supreme', 'Immortal', 'Eternal', 'Epic', 'Godly'],
    },
    Western: {
        nouns: [
            'Outlaw',
            'Sheriff',
            'Bounty',
            'Saloon',
            'Mustang',
            'Canyon',
            'Frontier',
            'Desperado',
            'Bandit',
            'Gunslinger',
        ],
        adj: ['Wild', 'Golden', 'Renegade', 'Dusty', 'Lone', 'Wanted', 'Savage', 'Iron'],
    },
    Underwater: {
        nouns: ['Pearl', 'Ocean', 'Reef', 'Trident', 'Coral', 'Mermaid', 'Depths', 'Tide', 'Lagoon', 'Kraken'],
        adj: ['Deep', 'Crystal', 'Mystic', 'Enchanted', 'Golden', 'Hidden', 'Sunken', 'Magical'],
    },
};

const FEATURE_WORDS = {
    'Free Spins': ['Spins', 'Whirl', 'Spin', 'Twist', 'Revolve'],
    'Hold and Spin': ['Hold', 'Lock', 'Link', 'Connect', 'Chain'],
    'Cash On Reels': ['Cash', 'Coins', 'Collect', 'Stack', 'Prize'],
    Megaways: ['Ways', 'Mega', 'Multiway', 'Power'],
    'Expanding Reels': ['Expand', 'Grow', 'Rise', 'Giant'],
    Wheel: ['Wheel', 'Spin', 'Fortune', 'Circle'],
    'Pick Bonus': ['Pick', 'Choose', 'Reveal', 'Mystery'],
    'Static Jackpot': ['Jackpot', 'Prize', 'Grand', 'Mega'],
    Respin: ['Respin', 'Again', 'Repeat', 'Retry'],
    Multiplier: ['Multiply', 'Boost', 'Double', 'Triple'],
    'Buy Bonus': ['Buy', 'Instant', 'Express', 'Direct'],
    'Cascading Reels': ['Cascade', 'Tumble', 'Avalanche', 'Fall'],
    'Sticky Wilds': ['Sticky', 'Locked', 'Frozen', 'Fixed'],
    'Expanding Wilds': ['Expand', 'Spread', 'Cover', 'Fill'],
    'Progressive Jackpot': ['Progressive', 'Growing', 'Rising', 'Climbing'],
    'Gamble Feature': ['Gamble', 'Risk', 'Double', 'Dare'],
    'Mystery Symbols': ['Mystery', 'Secret', 'Hidden', 'Unknown'],
    'Colossal Symbols': ['Colossal', 'Giant', 'Massive', 'Titan'],
    'Stacked Symbols': ['Stacked', 'Tower', 'Column', 'Pillar'],
    'Symbol Transformation': ['Transform', 'Morph', 'Shift', 'Change'],
};

const NAME_TEMPLATES = {
    classic: [
        '{adj} {noun}',
        '{noun} {noun2}',
        '{number} {noun}s',
        '{adj} {noun} {featureWord}',
        'The {adj} {noun}',
        '{noun} of {noun2}',
        '{adj} {adj2} {noun}',
    ],
    modern: [
        '{noun} {featureWord}',
        '{adj} {noun}',
        '{noun} {noun2}',
        '{noun} Blitz',
        '{adj} {noun} {featureWord}',
        '{noun} {noun2} {featureWord}',
    ],
    playful: [
        '{noun} Party',
        '{adj} {noun} Bash',
        '{noun} Mania',
        '{adj} {noun} Fun',
        'Super {noun} {featureWord}',
        'Crazy {noun}',
        '{noun} Pop',
    ],
    premium: [
        'Royal {noun}',
        '{noun} Prestige',
        '{adj} {noun} Elite',
        'Grand {noun}',
        '{adj} {noun} Royale',
        '{noun} Crown',
        'Golden {noun} {noun2}',
    ],
};

const POWER_SUFFIXES = [
    'Megaways',
    'Deluxe',
    'Gold',
    'Link',
    'Rush',
    'Blitz',
    'Power',
    'Ways',
    'Stacks',
    'Burst',
    'Jackpots',
    'Riches',
    'Fortune',
    'Frenzy',
    'Bonanza',
    'Extreme',
];
const PROVEN_PATTERNS = [
    '{noun} of {noun2}',
    '{adj} {noun}',
    '{noun} {powerSuffix}',
    '{number} {noun}',
    '{adj} {noun} {powerSuffix}',
    '{noun} & {noun2}',
    '{noun} {noun2}',
    '{adj} {adj2} {noun}',
    '{noun} {noun2} {powerSuffix}',
    'Book of {noun}',
    '{noun} Rising',
    '{noun} Eruption',
    'Return of the {noun}',
    'Rise of {noun}',
    '{adj} {noun} Hold & Win',
    '{noun} Cash',
];

const COMMON_NUMBERS = ['5', '7', '8', '9', '10', '20', '25', '40', '50', '88', '100', '777', '888'];

function analyzeNames() {
    if (namePatterns) return namePatterns;

    const games = gameData.allGames || [];
    const patterns = {
        wordFreq: {},
        themeWords: {},
        nameLengths: [],
        startsWithNumber: 0,
        avgWordCount: 0,
        commonPrefixes: {},
        commonSuffixes: {},
        namesByTheme: {},
        bigrams: {},
        themeBigrams: {},
        wordTheoWeight: {},
        themeWordTheo: {},
        featureNames: {},
    };

    let totalWords = 0;

    games.forEach(g => {
        if (!g.name) return;
        const name = g.name.trim();
        const words = name.split(/\s+/);
        const theme = g.theme_consolidated || g.theme_primary || 'Other';
        const theo = g.performance_theo_win || 0;

        patterns.nameLengths.push(words.length);
        totalWords += words.length;
        if (/^\d/.test(name)) patterns.startsWithNumber++;

        if (!patterns.namesByTheme[theme]) patterns.namesByTheme[theme] = [];
        patterns.namesByTheme[theme].push(name);

        if (!patterns.themeWords[theme]) patterns.themeWords[theme] = {};
        if (!patterns.themeWordTheo[theme]) patterns.themeWordTheo[theme] = {};
        if (!patterns.themeBigrams[theme]) patterns.themeBigrams[theme] = {};

        const feats = parseFeatures(g.features);
        feats.forEach(f => {
            if (!patterns.featureNames[f]) patterns.featureNames[f] = [];
            patterns.featureNames[f].push(name);
        });

        words.forEach(w => {
            const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (clean.length <= 2) return;
            patterns.wordFreq[clean] = (patterns.wordFreq[clean] || 0) + 1;
            patterns.themeWords[theme][clean] = (patterns.themeWords[theme][clean] || 0) + 1;
            if (!patterns.wordTheoWeight[clean]) patterns.wordTheoWeight[clean] = { sum: 0, count: 0 };
            patterns.wordTheoWeight[clean].sum += theo;
            patterns.wordTheoWeight[clean].count++;
            if (!patterns.themeWordTheo[theme][clean]) patterns.themeWordTheo[theme][clean] = { sum: 0, count: 0 };
            patterns.themeWordTheo[theme][clean].sum += theo;
            patterns.themeWordTheo[theme][clean].count++;
        });

        for (let i = 0; i < words.length - 1; i++) {
            const bi = words[i] + ' ' + words[i + 1];
            patterns.bigrams[bi] = (patterns.bigrams[bi] || 0) + 1;
            patterns.themeBigrams[theme][bi] = (patterns.themeBigrams[theme][bi] || 0) + 1;
        }

        if (words.length >= 2) {
            const first = words[0].toLowerCase();
            const last = words[words.length - 1].toLowerCase();
            patterns.commonPrefixes[first] = (patterns.commonPrefixes[first] || 0) + 1;
            patterns.commonSuffixes[last] = (patterns.commonSuffixes[last] || 0) + 1;
        }
    });

    patterns.avgWordCount = games.length > 0 ? totalWords / games.length : 3;
    patterns.totalGames = games.length;

    namePatterns = patterns;
    log('📝 Name patterns analyzed:', games.length, 'games');
    return patterns;
}

function weightedPick(arr, weights) {
    if (!weights || !weights.length) return pick(arr);
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) return pick(arr);
    let r = Math.random() * total;
    for (let i = 0; i < arr.length; i++) {
        r -= weights[i];
        if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
}

function generatePatternNames(theme, features, style, keywords, count = 10) {
    const patterns = analyzeNames();
    const vocab = THEME_VOCAB[theme] || THEME_VOCAB['Classic'];
    const styleTemplates = NAME_TEMPLATES[style] || NAME_TEMPLATES['modern'];
    const allTemplates = [...styleTemplates, ...PROVEN_PATTERNS];

    const featureWords = [];
    features.forEach(f => {
        if (FEATURE_WORDS[f]) featureWords.push(...FEATURE_WORDS[f]);
    });
    if (!featureWords.length) featureWords.push('Fortune', 'Bonus', 'Prize', 'Gold');

    const userWords = keywords
        .split(/[,\s]+/)
        .filter(w => w.length > 1)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    const STOP_WORDS = new Set([
        'the',
        'and',
        'for',
        'with',
        'from',
        'that',
        'this',
        'slot',
        'game',
        'online',
        'new',
        'play',
        'free',
    ]);

    const FILLER = new Set([
        'of',
        'and',
        'the',
        'in',
        'to',
        'a',
        'an',
        'or',
        'for',
        'by',
        'on',
        'at',
        'is',
        'it',
        'as',
        'if',
        'so',
        'no',
        'up',
        'but',
        'not',
        'with',
        'from',
        'into',
        'over',
        'upon',
        'than',
    ]);

    const themeWords = patterns.themeWords?.[theme] || {};
    const themeWordTheo = patterns.themeWordTheo?.[theme] || {};
    const topRealWords = Object.entries(themeWords)
        .sort((a, b) => {
            const aAvg = themeWordTheo[a[0]] ? themeWordTheo[a[0]].sum / themeWordTheo[a[0]].count : 0;
            const bAvg = themeWordTheo[b[0]] ? themeWordTheo[b[0]].sum / themeWordTheo[b[0]].count : 0;
            return bAvg * 0.6 + b[1] * 0.4 - (aAvg * 0.6 + a[1] * 0.4);
        })
        .slice(0, 25)
        .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1))
        .filter(w => w.length > 3 && !STOP_WORDS.has(w.toLowerCase()) && !FILLER.has(w.toLowerCase()));

    const featureInspired = [];
    if (features.size > 0 || (Array.isArray(features) && features.length > 0)) {
        const featsArr = features instanceof Set ? [...features] : [...(features || [])];
        featsArr.forEach(f => {
            const fNames = patterns.featureNames?.[f] || [];
            fNames.forEach(n => {
                n.split(/\s+/).forEach(w => {
                    const c = w.replace(/[^a-zA-Z]/g, '');
                    if (c.length > 2 && !STOP_WORDS.has(c.toLowerCase())) {
                        featureInspired.push(c.charAt(0).toUpperCase() + c.slice(1).toLowerCase());
                    }
                });
            });
        });
    }

    const allNouns = [...new Set([...vocab.nouns, ...topRealWords, ...featureInspired.slice(0, 10), ...userWords])];
    const allAdj = [...new Set([...vocab.adj, ...userWords])];

    const nounWeights = allNouns.map(n => {
        const low = n.toLowerCase();
        const theoData = themeWordTheo[low] || patterns.wordTheoWeight[low];
        const theoAvg = theoData ? theoData.sum / theoData.count : 0;
        const freq = themeWords[low] || 0;
        return 1 + theoAvg * 0.5 + freq * 0.2;
    });

    const candidates = [];
    const existingNames = new Set((gameData.allGames || []).map(g => (g.name || '').toLowerCase()));
    const existingNamesArr = [...existingNames];

    function isValidName(name) {
        if (!name || existingNames.has(name.toLowerCase())) return false;
        const seen = new Set();
        if (candidates.some(c => c.name === name)) return false;
        const words = name.split(/\s+/);
        if (words.length < 2 || words.length > 4) return false;
        const first = words[0].toLowerCase().replace(/[^a-z]/g, '');
        const last = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
        if (FILLER.has(first) || FILLER.has(last)) return false;
        for (const w of words) {
            const lw = w.toLowerCase().replace(/[^a-z]/g, '');
            if (lw.length === 0) return false;
            if (seen.has(lw)) return false;
            seen.add(lw);
        }
        return true;
    }

    function scoreName(name) {
        const words = name.split(/\s+/);
        let score = 0;
        words.forEach(w => {
            const low = w.toLowerCase().replace(/[^a-z]/g, '');
            const theoData = themeWordTheo[low] || patterns.wordTheoWeight[low];
            if (theoData) score += (theoData.sum / theoData.count) * 0.3;
            if (themeWords[low]) score += Math.min(themeWords[low], 5) * 0.2;
        });
        for (let i = 0; i < words.length - 1; i++) {
            const bi = words[i] + ' ' + words[i + 1];
            const biCount = (patterns.themeBigrams?.[theme]?.[bi] || 0) + (patterns.bigrams?.[bi] || 0) * 0.3;
            if (biCount > 0) score += biCount * 2;
        }
        if (words.length >= 2 && words.length <= 3) score += 0.5;
        return score;
    }

    function findSimilar(name) {
        const nameLow = name.toLowerCase();
        const nameWords = new Set(nameLow.split(/\s+/));
        let best = null;
        let bestOverlap = 0;
        for (const ex of existingNamesArr) {
            const exWords = new Set(ex.split(/\s+/));
            let overlap = 0;
            for (const w of nameWords) {
                if (exWords.has(w)) overlap++;
            }
            const ratio = overlap / Math.max(nameWords.size, exWords.size);
            if (ratio > bestOverlap && ratio >= 0.5) {
                bestOverlap = ratio;
                best = ex;
            }
        }
        return best;
    }

    // Strategy 1: Template-based (40%)
    let attempts = 0;
    while (candidates.length < Math.ceil(count * 1.5) && attempts < 500) {
        attempts++;
        const template = pick(allTemplates);
        const adj = pick(allAdj);
        const adj2 = pick(allAdj.filter(a => a !== adj));
        const noun = weightedPick(allNouns, nounWeights);
        const noun2 = weightedPick(
            allNouns.filter(n => n !== noun),
            nounWeights.filter((_, i) => allNouns[i] !== noun)
        );
        const fw = pick(featureWords);
        const num = pick(COMMON_NUMBERS);
        const ps = pick(POWER_SUFFIXES);

        let name = template
            .replace('{adj}', adj)
            .replace('{adj2}', adj2 || pick(allAdj))
            .replace('{noun}', noun)
            .replace('{noun2}', noun2 || weightedPick(allNouns, nounWeights))
            .replace('{featureWord}', fw)
            .replace('{number}', num)
            .replace('{powerSuffix}', ps)
            .trim();
        if (isValidName(name)) candidates.push({ name, score: scoreName(name), source: 'pattern' });
    }

    // Strategy 2: Bigram-inspired (real 2-word sequences from top games)
    const themeBigrams = Object.entries(patterns.themeBigrams?.[theme] || {})
        .filter(([bi, c]) => {
            if (c < 1) return false;
            const parts = bi.split(/\s+/);
            return parts.every(p => !FILLER.has(p.toLowerCase().replace(/[^a-z]/g, '')));
        })
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
    attempts = 0;
    while (candidates.length < Math.ceil(count * 2.5) && attempts < 300) {
        attempts++;
        if (themeBigrams.length > 0 && Math.random() < 0.6) {
            const [bi] = pick(themeBigrams);
            const r = Math.random();
            let name;
            if (r < 0.33) name = `${bi} ${pick(POWER_SUFFIXES)}`;
            else if (r < 0.66) name = `${pick(allAdj)} ${bi}`;
            else name = bi;
            name = name.trim();
            if (isValidName(name)) candidates.push({ name, score: scoreName(name), source: 'bigram' });
        } else {
            const topThemeGames = (gameData.allGames || [])
                .filter(g => (g.theme_consolidated || '') === theme)
                .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
                .slice(0, 30);
            if (topThemeGames.length >= 2) {
                const g1 = pick(topThemeGames);
                const g2 = pick(topThemeGames.filter(g => g !== g1));
                const w1 = (g1.name || '').split(/\s+/);
                const w2 = (g2.name || '').split(/\s+/);
                if (w1.length >= 1 && w2.length >= 1) {
                    const name = `${w1[0]} ${w2[w2.length - 1]}`.trim();
                    if (isValidName(name)) candidates.push({ name, score: scoreName(name), source: 'mashup' });
                }
            }
        }
    }

    // Strategy 3: Global top-performer inspiration
    const globalTop = (gameData.allGames || [])
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
        .slice(0, 50);
    const globalFirstWords = [
        ...new Set(
            globalTop.map(g => (g.name || '').split(/\s+/)[0]).filter(w => w.length > 2 && !FILLER.has(w.toLowerCase()))
        ),
    ];

    attempts = 0;
    while (candidates.length < count * 3 && attempts < 200) {
        attempts++;
        let name;
        if (Math.random() < 0.5 && globalFirstWords.length > 0) {
            name = `${pick(globalFirstWords)} ${weightedPick(allNouns, nounWeights)}`;
        } else {
            name = `${weightedPick(allNouns, nounWeights)} ${pick(POWER_SUFFIXES)}`;
        }
        name = name.trim();
        if (isValidName(name)) candidates.push({ name, score: scoreName(name), source: 'global' });
    }

    candidates.sort((a, b) => b.score - a.score);

    return candidates.slice(0, count).map(c => {
        const similar = findSimilar(c.name);
        if (similar) return { name: c.name, similarTo: similar };
        return c.name;
    });
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function blinkField(el) {
    if (!el) return;
    el.classList.add('ring-2', 'ring-red-400');
    el.style.animation = 'blink-field 0.3s ease 3';
    el.focus?.();
    setTimeout(() => {
        el.classList.remove('ring-2', 'ring-red-400');
        el.style.animation = '';
    }, 1000);
}

async function generateWithClaude(theme, features, style, keywords, code) {
    const patterns = analyzeNames();
    const themeNames = patterns.namesByTheme[theme] || [];
    const sampleNames = themeNames.slice(0, 15).join(', ');

    const topWords = Object.entries(patterns.themeWords[theme] || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([w]) => w);

    const data = await apiPost('/api/generate-names', {
        theme,
        features: [...features],
        style,
        keywords,
        code,
        useAI: true,
        sampleNames: sampleNames,
        topThemeWords: topWords,
        totalGames: patterns.totalGames,
        avgWordCount: Math.round(patterns.avgWordCount * 10) / 10,
    });
    return data.names || [];
}

function getThemePatternStats(theme) {
    const patterns = analyzeNames();
    const themeNames = patterns.namesByTheme[theme] || [];
    if (!themeNames.length) return null;

    const words = {};
    const lengths = [];
    let hasNumber = 0;

    themeNames.forEach(name => {
        const w = name.split(/\s+/);
        lengths.push(w.length);
        if (/^\d/.test(name)) hasNumber++;
        w.forEach(word => {
            const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (clean.length > 2) words[clean] = (words[clean] || 0) + 1;
        });
    });

    const topWords = Object.entries(words)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);
    const avgLen = lengths.reduce((s, l) => s + l, 0) / lengths.length;

    return {
        gameCount: themeNames.length,
        avgWordCount: Math.round(avgLen * 10) / 10,
        pctStartsWithNumber: Math.round((hasNumber / themeNames.length) * 100),
        topWords,
        sampleNames: themeNames.slice(0, 8),
    };
}

// ---- UI Setup ----

export function setupNameGenerator() {
    log('🎮 Setting up Name Generator');
    analyzeNames();

    const themeSelect = document.getElementById('ng-theme');
    const featuresDiv = document.getElementById('ng-features');
    const generateBtn = document.getElementById('ng-generate');

    if (!themeSelect || !featuresDiv || !generateBtn) return;

    // Populate themes
    const themes = [...(gameData.themes || [])].sort((a, b) => (b['Game Count'] || 0) - (a['Game Count'] || 0));
    themes.forEach(t => {
        const name = t.Theme || t.theme;
        if (name) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = `${name} (${t['Game Count'] || 0} games)`;
            themeSelect.appendChild(opt);
        }
    });

    // Populate features
    CANONICAL_FEATURES.forEach(feat => {
        const btn = document.createElement('button');
        btn.className =
            'ng-feature-btn px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors';
        btn.dataset.feature = feat;
        btn.textContent = feat;
        btn.addEventListener('click', () => {
            if (selectedFeatures.has(feat)) {
                selectedFeatures.delete(feat);
                btn.classList.remove(
                    'bg-indigo-100',
                    'dark:bg-indigo-900/40',
                    'border-indigo-400',
                    'text-indigo-700',
                    'dark:text-indigo-300'
                );
            } else if (selectedFeatures.size < 3) {
                selectedFeatures.add(feat);
                btn.classList.add(
                    'bg-indigo-100',
                    'dark:bg-indigo-900/40',
                    'border-indigo-400',
                    'text-indigo-700',
                    'dark:text-indigo-300'
                );
            }
        });
        featuresDiv.appendChild(btn);
    });

    // Style buttons
    document.querySelectorAll('.ng-style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document
                .querySelectorAll('.ng-style-btn')
                .forEach(b =>
                    b.classList.remove(
                        'bg-indigo-100',
                        'dark:bg-indigo-900/40',
                        'border-indigo-400',
                        'text-indigo-700',
                        'dark:text-indigo-300'
                    )
                );
            btn.classList.add(
                'bg-indigo-100',
                'dark:bg-indigo-900/40',
                'border-indigo-400',
                'text-indigo-700',
                'dark:text-indigo-300'
            );
            selectedStyle = btn.dataset.style;
        });
    });

    // Select "modern" by default
    document.querySelector('.ng-style-btn[data-style="modern"]')?.click();

    // Theme change -> show patterns + auto-generate
    themeSelect.addEventListener('change', () => {
        const theme = themeSelect.value;
        if (theme) {
            renderPatternStats(theme);
            const keywords = document.getElementById('ng-keywords')?.value || '';
            const resultsDiv = document.getElementById('ng-results');
            if (resultsDiv) {
                const names = generatePatternNames(theme, selectedFeatures, selectedStyle, keywords, 10);
                renderResults(names, theme, false);
            }
        }
    });

    // Generate button — always pattern-based (free)
    generateBtn.addEventListener('click', async () => {
        const theme = themeSelect.value;
        if (!theme) {
            blinkField(themeSelect);
            return;
        }

        const keywords = document.getElementById('ng-keywords')?.value || '';
        const resultsDiv = document.getElementById('ng-results');

        resultsDiv.innerHTML =
            '<div class="flex items-center justify-center h-[200px] gap-3 text-gray-400"><div class="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full"></div>Generating names...</div>';

        const names = generatePatternNames(theme, selectedFeatures, selectedStyle, keywords, 10);
        renderResults(names, theme, false);
    });

    // AI Generate button — requires secret code
    const aiBtn = document.getElementById('ng-ai-generate');
    if (aiBtn) {
        aiBtn.addEventListener('click', async () => {
            const theme = themeSelect.value;
            if (!theme) {
                blinkField(themeSelect);
                return;
            }
            const codeInput = document.getElementById('ng-ai-code');
            const code = codeInput?.value?.trim();
            if (!code) {
                blinkField(codeInput);
                return;
            }

            const keywords = document.getElementById('ng-keywords')?.value || '';
            const resultsDiv = document.getElementById('ng-results');
            const statusEl = document.getElementById('ng-ai-status');

            resultsDiv.innerHTML =
                '<div class="flex items-center justify-center h-[200px] gap-3 text-gray-400"><div class="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full"></div>AI is generating names (2-stage refinement)...</div>';
            aiBtn.disabled = true;

            try {
                const names = await generateWithClaude(theme, selectedFeatures, selectedStyle, keywords, code);
                if (names && names.length > 0) {
                    renderResults(names, theme, true);
                    if (statusEl) {
                        statusEl.textContent = '';
                        statusEl.className = '';
                    }
                } else {
                    const fallback = generatePatternNames(theme, selectedFeatures, selectedStyle, keywords, 10);
                    renderResults(fallback, theme, false);
                    if (statusEl) {
                        statusEl.textContent = 'AI unavailable — showing pattern results';
                        statusEl.className = 'text-xs text-amber-600 mt-1';
                    }
                }
            } catch (e) {
                const msg = e.message || 'AI generation failed';
                if (statusEl) {
                    statusEl.textContent = msg;
                    statusEl.className = 'text-xs text-red-500 mt-1';
                }
                const fallback = generatePatternNames(theme, selectedFeatures, selectedStyle, keywords, 10);
                renderResults(fallback, theme, false);
            } finally {
                aiBtn.disabled = false;
            }
        });
    }

    // Reset button
    const resetBtn = document.getElementById('ng-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            themeSelect.value = '';
            selectedFeatures.clear();
            document.querySelectorAll('#ng-features button').forEach(b => {
                b.classList.remove(
                    'bg-indigo-100',
                    'dark:bg-indigo-900/40',
                    'border-indigo-400',
                    'text-indigo-700',
                    'dark:text-indigo-300'
                );
            });
            selectedStyle = 'modern';
            document
                .querySelectorAll('.ng-style-btn')
                .forEach(b =>
                    b.classList.remove(
                        'bg-indigo-100',
                        'dark:bg-indigo-900/40',
                        'border-indigo-400',
                        'text-indigo-700',
                        'dark:text-indigo-300'
                    )
                );
            document
                .querySelector('.ng-style-btn[data-style="modern"]')
                ?.classList.add(
                    'bg-indigo-100',
                    'dark:bg-indigo-900/40',
                    'border-indigo-400',
                    'text-indigo-700',
                    'dark:text-indigo-300'
                );
            const kw = document.getElementById('ng-keywords');
            if (kw) kw.value = '';
            const resultsDiv = document.getElementById('ng-results');
            if (resultsDiv)
                resultsDiv.innerHTML =
                    '<div class="flex items-center justify-center h-[200px] text-gray-400 dark:text-gray-500 text-sm">Select a theme and click "Generate Names" to get started</div>';
            const patternsDiv = document.getElementById('ng-patterns');
            if (patternsDiv)
                patternsDiv.innerHTML =
                    '<div class="text-center text-gray-400 dark:text-gray-500 text-sm col-span-3 py-8">Patterns will appear when you select a theme</div>';
        });
    }

    const label = document.getElementById('ng-mode-label');
    if (label) label.textContent = 'Pattern-based generation (free) · Enter AI code for Claude-powered names';
}

function findSimilarGame(name) {
    const allGames = gameData.allGames || [];
    const nameLow = name.toLowerCase();
    const nameWords = new Set(nameLow.split(/\s+/));
    let best = null;
    let bestOverlap = 0;
    for (const g of allGames) {
        const ex = (g.name || '').toLowerCase();
        const exWords = new Set(ex.split(/\s+/));
        let overlap = 0;
        for (const w of nameWords) {
            if (exWords.has(w)) overlap++;
        }
        const ratio = overlap / Math.max(nameWords.size, exWords.size);
        if (ratio > bestOverlap && ratio >= 0.5) {
            bestOverlap = ratio;
            best = g.name;
        }
    }
    return best;
}

async function checkTrademark(name) {
    return apiFetch('/api/trademark-check?name=' + encodeURIComponent(name));
}

function renderTMResults(container, data) {
    const liveResults = data.results.filter(r => r.statusLabel === 'Live');
    const pendingResults = data.results.filter(r => r.statusLabel === 'Pending');
    const deadResults = data.results.filter(r => r.statusLabel === 'Dead');

    const queriesChecked = (data.queries || [data.name]).map(q => `"${escapeHtml(q)}"`).join(', ');

    if (data.results.length === 0) {
        container.innerHTML = `
            <div class="mt-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                    No active US trademarks found
                </div>
                <p class="text-[10px] text-gray-400 mt-1">Checked: ${queriesChecked}</p>
                <p class="text-[10px] text-gray-400 mt-0.5">USPTO (US) only &middot; Not legal advice &middot; ${escapeHtml(String(data.dailyRemaining))} checks remaining today</p>
            </div>`;
        return;
    }

    const statusBadge = label => {
        if (label === 'Live')
            return '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">LIVE</span>';
        if (label === 'Pending')
            return '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">PENDING</span>';
        return '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">DEAD</span>';
    };

    const borderClass =
        liveResults.length > 0
            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
            : pendingResults.length > 0
              ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50';

    const headerIcon =
        liveResults.length > 0
            ? '<svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>'
            : '<svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

    const summary =
        liveResults.length > 0
            ? `${liveResults.length} active trademark${liveResults.length > 1 ? 's' : ''} found`
            : `${pendingResults.length} pending, ${deadResults.length} dead`;

    let html = `<div class="mt-2 p-3 rounded-lg border ${borderClass}">
        <div class="flex items-center gap-2 text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2">
            ${headerIcon}
            <span>${escapeHtml(summary)}</span>
            <span class="text-[10px] text-gray-400 font-normal ml-auto">${escapeHtml(String(data.totalCount))} total match${data.totalCount !== 1 ? 'es' : ''}</span>
        </div>
        <div class="space-y-1.5">`;

    const sorted = [...liveResults, ...pendingResults, ...deadResults];
    sorted.forEach(r => {
        const gamingFlag = r.isGamingClass
            ? '<span class="text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-semibold">GAMING</span>'
            : '';
        const matchedVia =
            r.matchedQuery && r.matchedQuery.toLowerCase() !== data.name.toLowerCase()
                ? `<span class="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 font-medium">via "${escapeHtml(r.matchedQuery)}"</span>`
                : '';
        html += `
            <div class="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-[11px] leading-relaxed">
                ${statusBadge(r.statusLabel)}
                ${gamingFlag}
                ${matchedVia}
                <span class="font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(r.mark)}</span>
                <span class="text-gray-400">&mdash;</span>
                <span class="text-gray-600 dark:text-gray-400">${escapeHtml(r.owner)}${r.country ? ' (' + escapeHtml(r.country) + ')' : ''}</span>
            </div>
            <div class="text-[10px] text-gray-400 dark:text-gray-500 ml-6 truncate" title="${escapeAttr(r.descriptions)}">${escapeHtml(r.descriptions.length > 80 ? r.descriptions.slice(0, 80) + '...' : r.descriptions)}</div>`;
    });

    html += `</div>
        <p class="text-[10px] text-gray-400 mt-2 pt-1.5 border-t border-gray-200 dark:border-gray-700">USPTO (US) only &middot; Not legal advice &middot; ${escapeHtml(String(data.dailyRemaining))} checks remaining today</p>
    </div>`;

    container.innerHTML = html;
}

function renderResults(names, theme, isAI) {
    const div = document.getElementById('ng-results');
    if (!div) return;

    const normalized = names.map(entry => {
        if (typeof entry === 'object' && entry.name) return entry;
        if (typeof entry === 'string' && entry.endsWith(' \u26A0\uFE0F')) {
            const clean = entry.replace(/ \u26A0\uFE0F$/, '');
            return { name: clean, similarTo: findSimilarGame(clean) };
        }
        const similar = isAI ? findSimilarGame(entry) : null;
        return similar ? { name: entry, similarTo: similar } : { name: entry, similarTo: null };
    });

    const badge = isAI
        ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold">AI Generated</span>'
        : '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">Pattern Based</span>';

    let html = `<div class="flex items-center gap-2 mb-4">${badge}<span class="text-xs text-gray-400">${normalized.length} names for "${escapeHtml(theme)}" theme</span><button id="ng-refresh" class="ml-auto text-[10px] font-medium px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center gap-1" title="Generate new names with the same setup"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Refresh</button></div>`;
    html += '<div class="space-y-2">';

    normalized.forEach((entry, i) => {
        const colors = [
            'from-indigo-500 to-violet-500',
            'from-emerald-500 to-teal-500',
            'from-amber-500 to-orange-500',
            'from-rose-500 to-pink-500',
            'from-cyan-500 to-blue-500',
        ];
        const color = colors[i % colors.length];
        const hasSimilar = !!entry.similarTo;
        const safeName = escapeHtml(entry.name);
        const attrName = escapeAttr(entry.name);
        const similarHint = hasSimilar
            ? `<span class="text-amber-500">Similar to: <strong class="text-amber-600 dark:text-amber-400">${escapeHtml(entry.similarTo)}</strong></span> · `
            : '';
        html += `
            <div class="name-card-wrapper" data-name="${attrName}">
                <div class="group relative flex items-center gap-3 p-3 rounded-xl border ${hasSimilar ? 'border-amber-300 dark:border-amber-700' : 'border-gray-200 dark:border-gray-700'} hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all">
                    <div class="w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shrink-0">${i + 1}</div>
                    <div class="flex-1 min-w-0 cursor-pointer copy-name-card" data-copy-text="${attrName}">
                        <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">${safeName}</div>
                        <div class="copy-hint text-[10px] text-gray-400 group-hover:text-indigo-500 transition-colors">${similarHint}Click to copy</div>
                    </div>
                    <button class="tm-check-btn shrink-0 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 flex flex-col items-center justify-center px-2 py-1.5 gap-0.5 transition-colors" data-name="${attrName}" title="Check USPTO trademark">
                        <span class="tm-label text-[8px] font-bold tracking-wider text-gray-400 leading-none">USPTO</span>
                        <svg class="tm-icon w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                    </button>
                </div>
                <div class="tm-result-area"></div>
            </div>`;
    });

    html += '</div>';
    div.innerHTML = html;

    div.querySelectorAll('.copy-name-card').forEach(card => {
        card.addEventListener('click', e => {
            e.stopPropagation();
            const text = card.dataset.copyText;
            navigator.clipboard.writeText(text).then(() => {
                const hint = card.querySelector('.copy-hint');
                if (hint) {
                    const original = hint.innerHTML;
                    hint.textContent = 'Copied!';
                    setTimeout(() => {
                        hint.innerHTML = original;
                    }, 1500);
                }
            });
        });
    });

    div.querySelectorAll('.tm-check-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const name = btn.dataset.name;
            const wrapper = btn.closest('.name-card-wrapper');
            const resultArea = wrapper?.querySelector('.tm-result-area');
            if (!resultArea) return;

            btn.disabled = true;
            const iconEl = btn.querySelector('.tm-icon');
            const labelEl = btn.querySelector('.tm-label');
            if (iconEl)
                iconEl.outerHTML =
                    '<div class="tm-icon w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>';

            try {
                const data = await checkTrademark(name);
                const liveCount = data.results.filter(r => r.statusLabel === 'Live').length;
                const newIcon = btn.querySelector('.tm-icon');
                if (liveCount > 0) {
                    if (newIcon)
                        newIcon.outerHTML =
                            '<svg class="tm-icon w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>';
                    if (labelEl)
                        labelEl.className = 'tm-label text-[8px] font-bold tracking-wider text-red-500 leading-none';
                    btn.title = liveCount + ' active trademark(s) found';
                } else if (data.results.length > 0) {
                    if (newIcon)
                        newIcon.outerHTML =
                            '<svg class="tm-icon w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
                    if (labelEl)
                        labelEl.className = 'tm-label text-[8px] font-bold tracking-wider text-amber-500 leading-none';
                    btn.title = data.results.length + ' trademark(s) found (none active)';
                } else {
                    if (newIcon)
                        newIcon.outerHTML =
                            '<svg class="tm-icon w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>';
                    if (labelEl)
                        labelEl.className =
                            'tm-label text-[8px] font-bold tracking-wider text-emerald-500 leading-none';
                    btn.title = 'No active trademarks found';
                }
                renderTMResults(resultArea, data);
            } catch (err) {
                const errIcon = btn.querySelector('.tm-icon');
                if (errIcon)
                    errIcon.outerHTML =
                        '<svg class="tm-icon w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
                btn.title = 'Check failed';
                resultArea.innerHTML = `<div class="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[11px] text-red-600 dark:text-red-400">${escapeHtml(err.message || 'Trademark check failed')}</div>`;
                btn.disabled = false;
            }
        });
    });

    const refreshBtn = document.getElementById('ng-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            const themeSelect = document.getElementById('ng-theme');
            const curTheme = themeSelect?.value || theme;
            const keywords = document.getElementById('ng-keywords')?.value || '';
            const styleBtn = document.querySelector(
                '.ng-style-btn.bg-indigo-100, .ng-style-btn[class*="border-indigo-400"]'
            );
            const style = styleBtn?.dataset?.style || 'modern';
            const featureBtns = document.querySelectorAll(
                '.ng-feature-btn.bg-indigo-100, .ng-feature-btn[class*="border-indigo-400"]'
            );
            const feats = [...featureBtns].map(b => b.dataset.feature).filter(Boolean);
            const newNames = generatePatternNames(curTheme, feats, style, keywords, 10);
            renderResults(newNames, curTheme, false);
        });
    }
}

function renderPatternStats(theme) {
    const div = document.getElementById('ng-patterns');
    if (!div) return;

    const stats = getThemePatternStats(theme);
    if (!stats) {
        div.innerHTML = '<p class="text-gray-400 text-sm col-span-3 text-center py-8">No data for this theme</p>';
        return;
    }

    let html = '';

    // Word Cloud
    html += `<div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
        <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Most Used Words</h4>
        <div class="flex flex-wrap gap-1">`;
    stats.topWords.forEach(([word, count], i) => {
        const size = i < 3 ? 'text-sm font-bold' : i < 6 ? 'text-xs font-semibold' : 'text-[11px]';
        const opacity = Math.max(0.4, 1 - i * 0.06);
        html += `<span class="${size} px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" style="opacity:${opacity}" title="${escapeAttr(String(count))} games">${escapeHtml(word)}</span>`;
    });
    html += `</div></div>`;

    // Stats
    html += `<div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
        <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Naming Stats</h4>
        <div class="space-y-2 text-xs text-gray-600 dark:text-gray-400">
            <div class="flex justify-between"><span>Games in theme</span><span class="font-bold text-gray-900 dark:text-white">${stats.gameCount}</span></div>
            <div class="flex justify-between"><span>Avg words/name</span><span class="font-bold text-gray-900 dark:text-white">${stats.avgWordCount}</span></div>
            <div class="flex justify-between"><span>Starts with number</span><span class="font-bold text-gray-900 dark:text-white">${stats.pctStartsWithNumber}%</span></div>
        </div>
    </div>`;

    // Sample Names
    html += `<div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
        <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Real Game Names</h4>
        <div class="space-y-1">`;
    stats.sampleNames.forEach(name => {
        html += `<div class="text-xs text-gray-600 dark:text-gray-400 truncate" title="${escapeAttr(name)}">• ${escapeHtml(name)}</div>`;
    });
    html += `</div></div>`;

    div.innerHTML = html;
}
