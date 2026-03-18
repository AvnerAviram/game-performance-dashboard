/**
 * Game Name Generator - Pattern analysis + AI generation
 * Analyzes 642+ real slot game names to understand naming conventions,
 * then generates contextually appropriate new names.
 */
import { gameData } from '../lib/data.js';
import { log } from '../lib/env.js';

let namePatterns = null;
let selectedFeatures = new Set();
let selectedStyle = 'modern';

const CANONICAL_FEATURES = [
    'Free Spins', 'Hold and Spin', 'Cash On Reels', 'Static Jackpot',
    'Expanding Reels', 'Wheel', 'Pick Bonus', 'Respin',
    'Nudge', 'Persistence', 'Megaways'
];

// Theme-associated naming vocabulary (extracted from real game data analysis)
const THEME_VOCAB = {
    'Asian': { nouns: ['Dragon', 'Fortune', 'Jade', 'Phoenix', 'Tiger', 'Lotus', 'Emperor', 'Dynasty', 'Panda', 'Koi'], adj: ['Golden', 'Lucky', 'Imperial', 'Mighty', 'Sacred', 'Ancient', 'Royal', 'Mystic'] },
    'Animals': { nouns: ['Wolf', 'Eagle', 'Lion', 'Bear', 'Stallion', 'Falcon', 'Panther', 'Buffalo', 'Hawk', 'Rhino'], adj: ['Wild', 'Mighty', 'Raging', 'Savage', 'Majestic', 'Alpha', 'Great', 'Primal'] },
    'Classic': { nouns: ['Sevens', 'Bars', 'Cherry', 'Bell', 'Diamond', 'Star', 'Crown', 'Joker', 'Fruits', 'Blaze'], adj: ['Super', 'Hot', 'Ultra', 'Mega', 'Classic', 'Grand', 'Double', 'Triple'] },
    'Wealth & Gems': { nouns: ['Diamond', 'Ruby', 'Emerald', 'Crystal', 'Sapphire', 'Jewel', 'Gold', 'Treasure', 'Fortune', 'Cash', 'Vault', 'Crown', 'Riches', 'Opal'], adj: ['Brilliant', 'Dazzling', 'Sparkling', 'Radiant', 'Golden', 'Rich', 'Grand', 'Mega', 'Royal', 'Glittering'] },
    'Cultural': { nouns: ['Fiesta', 'Carnival', 'Festival', 'Legend', 'Spirit', 'Saga', 'Tale', 'Heritage', 'Quest', 'Rhythm'], adj: ['Grand', 'Epic', 'Legendary', 'Eternal', 'Mystic', 'Ancient', 'Sacred', 'Vibrant'] },
    'Arcade': { nouns: ['Blitz', 'Rush', 'Surge', 'Frenzy', 'Zone', 'Grid', 'Stack', 'Flash', 'Pulse', 'Blast'], adj: ['Turbo', 'Hyper', 'Mega', 'Ultra', 'Power', 'Super', 'Atomic', 'Cosmic'] },
    'Egyptian': { nouns: ['Pharaoh', 'Sphinx', 'Pyramid', 'Scarab', 'Nile', 'Cleopatra', 'Anubis', 'Ra', 'Horus', 'Ankh'], adj: ['Ancient', 'Golden', 'Mighty', 'Sacred', 'Royal', 'Eternal', 'Mystic', 'Grand'] },
    'Casino & Vegas': { nouns: ['Jackpot', 'Vegas', 'Casino', 'Ace', 'Royal', 'Poker', 'Roulette', 'Fortune', 'Winner', 'Stakes'], adj: ['Lucky', 'Grand', 'High', 'Royal', 'Big', 'Mega', 'Premium', 'VIP'] },
    'Adventure': { nouns: ['Quest', 'Explorer', 'Voyage', 'Hunt', 'Trail', 'Expedition', 'Pioneer', 'Ranger', 'Frontier', 'Journey'], adj: ['Wild', 'Epic', 'Grand', 'Lost', 'Hidden', 'Secret', 'Forbidden', 'Brave'] },
    'Fire & Elements': { nouns: ['Inferno', 'Blaze', 'Storm', 'Thunder', 'Flame', 'Volcano', 'Lightning', 'Frost', 'Tempest', 'Ember'], adj: ['Blazing', 'Raging', 'Eternal', 'Frozen', 'Electric', 'Burning', 'Roaring', 'Scorching'] },
    'Space & Sci-Fi': { nouns: ['Nova', 'Cosmos', 'Galaxy', 'Nebula', 'Star', 'Orbit', 'Reactor', 'Pulsar', 'Astro', 'Vortex'], adj: ['Cosmic', 'Stellar', 'Galactic', 'Hyper', 'Quantum', 'Solar', 'Astral', 'Infinite'] },
    'Fantasy': { nouns: ['Dragon', 'Wizard', 'Knight', 'Enchantment', 'Realm', 'Spell', 'Sorcerer', 'Unicorn', 'Griffin', 'Rune'], adj: ['Enchanted', 'Mystic', 'Legendary', 'Dark', 'Arcane', 'Mythic', 'Ancient', 'Shadow'] },
    'Irish & Celtic': { nouns: ['Leprechaun', 'Shamrock', 'Rainbow', 'Clover', 'Pot', 'Gold', 'Charm', 'Wish', 'Celtic', 'Druid'], adj: ['Lucky', 'Golden', 'Magic', 'Emerald', 'Wild', 'Enchanted', 'Grand', 'Mystic'] },
    'Mythology': { nouns: ['Zeus', 'Thor', 'Odin', 'Athena', 'Poseidon', 'Hercules', 'Apollo', 'Titan', 'Olympus', 'Valhalla'], adj: ['Mighty', 'Divine', 'Legendary', 'Supreme', 'Immortal', 'Eternal', 'Epic', 'Godly'] },
    'Western': { nouns: ['Outlaw', 'Sheriff', 'Bounty', 'Saloon', 'Mustang', 'Canyon', 'Frontier', 'Desperado', 'Bandit', 'Gunslinger'], adj: ['Wild', 'Golden', 'Renegade', 'Dusty', 'Lone', 'Wanted', 'Savage', 'Iron'] },
    'Underwater': { nouns: ['Pearl', 'Ocean', 'Reef', 'Trident', 'Coral', 'Mermaid', 'Depths', 'Tide', 'Lagoon', 'Kraken'], adj: ['Deep', 'Crystal', 'Mystic', 'Enchanted', 'Golden', 'Hidden', 'Sunken', 'Magical'] },
};

const FEATURE_WORDS = {
    'Free Spins': ['Spins', 'Whirl', 'Spin', 'Twist', 'Revolve'],
    'Hold and Spin': ['Hold', 'Lock', 'Link', 'Connect', 'Chain'],
    'Cash On Reels': ['Cash', 'Coins', 'Collect', 'Stack', 'Prize'],
    'Megaways': ['Ways', 'Mega', 'Multiway', 'Power'],
    'Expanding Reels': ['Expand', 'Grow', 'Rise', 'Giant'],
    'Wheel': ['Wheel', 'Spin', 'Fortune', 'Circle'],
    'Pick Bonus': ['Pick', 'Choose', 'Reveal', 'Mystery'],
    'Static Jackpot': ['Jackpot', 'Prize', 'Grand', 'Mega'],
    'Respin': ['Respin', 'Again', 'Repeat', 'Retry'],
};

const NAME_TEMPLATES = {
    classic: [
        '{adj} {noun}', '{noun} {noun2}', '{number} {noun}s',
        '{adj} {noun} {featureWord}', 'The {adj} {noun}',
        '{noun} of {noun2}', '{adj} {adj2} {noun}'
    ],
    modern: [
        '{noun} {featureWord}', '{adj} {noun}', '{noun} {noun2}',
        '{noun} Blitz', '{adj} {noun} {featureWord}',
        '{noun} {noun2} {featureWord}'
    ],
    playful: [
        '{noun} Party', '{adj} {noun} Bash', '{noun} Mania',
        '{adj} {noun} Fun', 'Super {noun} {featureWord}',
        'Crazy {noun}', '{noun} Pop'
    ],
    premium: [
        'Royal {noun}', '{noun} Prestige', '{adj} {noun} Elite',
        'Grand {noun}', '{adj} {noun} Royale', '{noun} Crown',
        'Golden {noun} {noun2}'
    ]
};

const POWER_SUFFIXES = ['Megaways', 'Deluxe', 'Gold', 'Link', 'Rush', 'Blitz', 'Power', 'Ways', 'Stacks', 'Burst', 'Jackpots', 'Riches', 'Fortune', 'Frenzy', 'Bonanza', 'Extreme'];
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
        namesByTheme: {}
    };
    
    let totalWords = 0;
    
    games.forEach(g => {
        if (!g.name) return;
        const name = g.name.trim();
        const words = name.split(/\s+/);
        const theme = g.theme_consolidated || g.theme_primary || 'Other';
        
        patterns.nameLengths.push(words.length);
        totalWords += words.length;
        if (/^\d/.test(name)) patterns.startsWithNumber++;
        
        if (!patterns.namesByTheme[theme]) patterns.namesByTheme[theme] = [];
        patterns.namesByTheme[theme].push(name);
        
        if (!patterns.themeWords[theme]) patterns.themeWords[theme] = {};
        
        words.forEach(w => {
            const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (clean.length <= 2) return;
            patterns.wordFreq[clean] = (patterns.wordFreq[clean] || 0) + 1;
            patterns.themeWords[theme][clean] = (patterns.themeWords[theme][clean] || 0) + 1;
        });
        
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
    
    const userWords = keywords.split(/[,\s]+/).filter(w => w.length > 1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    
    const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'slot', 'game', 'online', 'new', 'play', 'free']);
    
    // Extract top words from real games in this theme for better vocabulary
    const themeWords = patterns.themeWords?.[theme] || {};
    const topRealWords = Object.entries(themeWords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1))
        .filter(w => w.length > 3 && !STOP_WORDS.has(w.toLowerCase()));
    
    // Merge vocabulary: theme vocab + top real words from data + user keywords
    const allNouns = [...new Set([...vocab.nouns, ...topRealWords, ...userWords])];
    const allAdj = [...new Set([...vocab.adj, ...userWords])];
    
    const names = new Set();
    const existingNames = new Set((gameData.allGames || []).map(g => (g.name || '').toLowerCase()));
    
    // Validation: no duplicate words, 2-4 words, not an existing name
    function isValidName(name) {
        if (!name || existingNames.has(name.toLowerCase()) || names.has(name)) return false;
        const words = name.split(/\s+/);
        if (words.length < 2 || words.length > 4) return false;
        const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
        const uniqueWords = new Set(lowerWords);
        if (uniqueWords.size < lowerWords.length) return false;
        return true;
    }
    
    // Strategy 1: Template-based generation (50% of names)
    let attempts = 0;
    while (names.size < Math.ceil(count * 0.5) && attempts < 400) {
        attempts++;
        const template = pick(allTemplates);
        const adj = pick(allAdj);
        const adj2 = pick(allAdj.filter(a => a !== adj));
        const noun = pick(allNouns);
        const noun2 = pick(allNouns.filter(n => n !== noun));
        const fw = pick(featureWords);
        const num = pick(COMMON_NUMBERS);
        const ps = pick(POWER_SUFFIXES);
        
        let name = template
            .replace('{adj}', adj)
            .replace('{adj2}', adj2 || pick(allAdj))
            .replace('{noun}', noun)
            .replace('{noun2}', noun2 || pick(allNouns))
            .replace('{featureWord}', fw)
            .replace('{number}', num)
            .replace('{powerSuffix}', ps);
        
        name = name.trim();
        if (isValidName(name)) names.add(name);
    }
    
    // Strategy 2: Inspired by real top-performing game name structures in this theme
    const topThemeGames = (gameData.allGames || [])
        .filter(g => (g.theme_consolidated || '') === theme)
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
        .slice(0, 30);
    
    const realParts = { firstWords: new Set(), lastWords: new Set(), middleWords: new Set() };
    topThemeGames.forEach(g => {
        const words = (g.name || '').split(/\s+/).filter(w => w.length > 1);
        if (words.length >= 2) {
            realParts.firstWords.add(words[0]);
            realParts.lastWords.add(words[words.length - 1]);
            if (words.length >= 3) words.slice(1, -1).forEach(w => realParts.middleWords.add(w));
        }
    });
    const firstArr = [...realParts.firstWords];
    const lastArr = [...realParts.lastWords];
    const midArr = [...realParts.middleWords];
    
    attempts = 0;
    while (names.size < Math.ceil(count * 0.8) && attempts < 300) {
        attempts++;
        let name;
        const r = Math.random();
        
        if (r < 0.25 && firstArr.length > 0) {
            name = `${pick(firstArr)} ${pick(allNouns)}`;
        } else if (r < 0.45 && lastArr.length > 0) {
            name = `${pick(allAdj)} ${pick(lastArr)}`;
        } else if (r < 0.6 && firstArr.length > 0 && lastArr.length > 0) {
            name = `${pick(firstArr)} ${pick(lastArr)}`;
        } else if (r < 0.75 && midArr.length > 0) {
            name = `${pick(allAdj)} ${pick(midArr)} ${pick(POWER_SUFFIXES)}`;
        } else {
            name = `${pick(allNouns)} ${pick(POWER_SUFFIXES)}`;
        }
        
        name = name.trim();
        if (isValidName(name)) names.add(name);
    }
    
    // Strategy 3: Cross-theme inspiration from globally top-performing games
    const globalTop = (gameData.allGames || [])
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
        .slice(0, 50);
    const globalFirstWords = [...new Set(globalTop.map(g => (g.name || '').split(/\s+/)[0]).filter(w => w.length > 2))];
    
    attempts = 0;
    while (names.size < count && attempts < 200) {
        attempts++;
        const r = Math.random();
        let name;
        if (r < 0.5 && globalFirstWords.length > 0) {
            name = `${pick(globalFirstWords)} ${pick(allNouns)}`;
        } else {
            name = `${pick(allNouns)} ${pick(allAdj)} ${pick(POWER_SUFFIXES)}`;
        }
        name = name.trim();
        if (isValidName(name)) names.add(name);
    }
    
    return [...names].slice(0, count);
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

async function generateWithClaude(theme, features, style, keywords) {
    const patterns = analyzeNames();
    const themeNames = patterns.namesByTheme[theme] || [];
    const sampleNames = themeNames.slice(0, 15).join(', ');
    
    const topWords = Object.entries(patterns.themeWords[theme] || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([w]) => w);
    
    try {
        const resp = await fetch('/api/generate-names', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                theme,
                features: [...features],
                style,
                keywords,
                sampleNames: sampleNames,
                topThemeWords: topWords,
                totalGames: patterns.totalGames,
                avgWordCount: Math.round(patterns.avgWordCount * 10) / 10
            })
        });
        
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || 'API request failed');
        }
        
        const data = await resp.json();
        return data.names || [];
    } catch (e) {
        log('Claude API unavailable, falling back to pattern generation:', e.message);
        return null;
    }
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
    
    const topWords = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const avgLen = lengths.reduce((s, l) => s + l, 0) / lengths.length;
    
    return {
        gameCount: themeNames.length,
        avgWordCount: Math.round(avgLen * 10) / 10,
        pctStartsWithNumber: Math.round((hasNumber / themeNames.length) * 100),
        topWords,
        sampleNames: themeNames.slice(0, 8)
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
        btn.className = 'px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors';
        btn.textContent = feat;
        btn.addEventListener('click', () => {
            if (selectedFeatures.has(feat)) {
                selectedFeatures.delete(feat);
                btn.classList.remove('bg-indigo-100', 'dark:bg-indigo-900/40', 'border-indigo-400', 'text-indigo-700', 'dark:text-indigo-300');
            } else if (selectedFeatures.size < 3) {
                selectedFeatures.add(feat);
                btn.classList.add('bg-indigo-100', 'dark:bg-indigo-900/40', 'border-indigo-400', 'text-indigo-700', 'dark:text-indigo-300');
            }
        });
        featuresDiv.appendChild(btn);
    });
    
    // Style buttons
    document.querySelectorAll('.ng-style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ng-style-btn').forEach(b => b.classList.remove('bg-indigo-100', 'dark:bg-indigo-900/40', 'border-indigo-400', 'text-indigo-700', 'dark:text-indigo-300'));
            btn.classList.add('bg-indigo-100', 'dark:bg-indigo-900/40', 'border-indigo-400', 'text-indigo-700', 'dark:text-indigo-300');
            selectedStyle = btn.dataset.style;
        });
    });
    
    // Select "modern" by default
    document.querySelector('.ng-style-btn[data-style="modern"]')?.click();
    
    // Theme change -> show patterns
    themeSelect.addEventListener('change', () => {
        const theme = themeSelect.value;
        if (theme) renderPatternStats(theme);
    });
    
    // Generate button
    generateBtn.addEventListener('click', async () => {
        const theme = themeSelect.value;
        if (!theme) {
            blinkField(themeSelect);
            return;
        }
        
        const keywords = document.getElementById('ng-keywords')?.value || '';
        const resultsDiv = document.getElementById('ng-results');
        
        resultsDiv.innerHTML = '<div class="flex items-center justify-center h-[200px] gap-3 text-gray-400"><div class="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full"></div>Generating names...</div>';
        
        // Try Claude first, fall back to patterns
        let names = await generateWithClaude(theme, selectedFeatures, selectedStyle, keywords);
        let isAI = true;
        
        if (!names || !names.length) {
            names = generatePatternNames(theme, selectedFeatures, selectedStyle, keywords, 10);
            isAI = false;
        }
        
        renderResults(names, theme, isAI);
    });
    
    // Reset button
    const resetBtn = document.getElementById('ng-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            themeSelect.value = '';
            selectedFeatures.clear();
            document.querySelectorAll('#ng-features button').forEach(b => {
                b.classList.remove('bg-indigo-100', 'dark:bg-indigo-900/40', 'border-indigo-400', 'text-indigo-700', 'dark:text-indigo-300');
            });
            selectedStyle = 'modern';
            document.querySelectorAll('.ng-style-btn').forEach(b => b.classList.remove('bg-indigo-100', 'dark:bg-indigo-900/40', 'border-indigo-400', 'text-indigo-700', 'dark:text-indigo-300'));
            document.querySelector('.ng-style-btn[data-style="modern"]')?.classList.add('bg-indigo-100', 'dark:bg-indigo-900/40', 'border-indigo-400', 'text-indigo-700', 'dark:text-indigo-300');
            const kw = document.getElementById('ng-keywords');
            if (kw) kw.value = '';
            const resultsDiv = document.getElementById('ng-results');
            if (resultsDiv) resultsDiv.innerHTML = '<div class="flex items-center justify-center h-[200px] text-gray-400 dark:text-gray-500 text-sm">Select a theme and click "Generate Names" to get started</div>';
            const patternsDiv = document.getElementById('ng-patterns');
            if (patternsDiv) patternsDiv.innerHTML = '<div class="text-center text-gray-400 dark:text-gray-500 text-sm col-span-3 py-8">Patterns will appear when you select a theme</div>';
        });
    }

    // Check if Claude API is available
    fetch('/api/generate-names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(r => {
            const label = document.getElementById('ng-mode-label');
            if (r.status === 501) {
                if (label) label.textContent = 'Pattern-based generation (add Claude API key for AI mode)';
            } else if (r.status !== 401) {
                if (label) label.textContent = 'Claude AI generation available';
                if (label) label.classList.add('text-emerald-500');
            }
        })
        .catch(() => {});
}

function renderResults(names, theme, isAI) {
    const div = document.getElementById('ng-results');
    if (!div) return;
    
    const badge = isAI 
        ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold">AI Generated</span>'
        : '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">Pattern Based</span>';
    
    let html = `<div class="flex items-center gap-2 mb-4">${badge}<span class="text-xs text-gray-400">${names.length} names for "${theme}" theme</span></div>`;
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">';
    
    names.forEach((name, i) => {
        const colors = ['from-indigo-500 to-violet-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500', 'from-rose-500 to-pink-500', 'from-cyan-500 to-blue-500'];
        const color = colors[i % colors.length];
        html += `
            <div class="group relative flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all cursor-pointer" onclick="navigator.clipboard.writeText('${name.replace(/'/g, "\\'")}').then(() => { this.querySelector('.copy-hint').textContent = 'Copied!'; setTimeout(() => this.querySelector('.copy-hint').textContent = 'Click to copy', 1500); })">
                <div class="w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shrink-0">${i + 1}</div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">${name}</div>
                    <div class="copy-hint text-[10px] text-gray-400 group-hover:text-indigo-500 transition-colors">Click to copy</div>
                </div>
            </div>`;
    });
    
    html += '</div>';
    div.innerHTML = html;
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
        html += `<span class="${size} px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" style="opacity:${opacity}" title="${count} games">${word}</span>`;
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
        html += `<div class="text-xs text-gray-600 dark:text-gray-400 truncate" title="${name}">• ${name}</div>`;
    });
    html += `</div></div>`;
    
    div.innerHTML = html;
}
