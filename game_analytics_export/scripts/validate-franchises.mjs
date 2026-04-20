#!/usr/bin/env node
/**
 * Brand / Franchise Validation Script
 *
 * Analyzes franchise_mapping.json to identify generic words misclassified as brands.
 * Produces a report with quality scores and flags suspects for review.
 *
 * Usage: node scripts/validate-franchises.mjs [--json]
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const franchiseMapping = JSON.parse(readFileSync(join(DATA_DIR, 'franchise_mapping.json'), 'utf-8'));
const master = JSON.parse(readFileSync(join(DATA_DIR, 'game_data_master.json'), 'utf-8'));

const COMMON_ENGLISH_WORDS = new Set([
    'age',
    'back',
    'bear',
    'bird',
    'blue',
    'bolt',
    'book',
    'born',
    'burn',
    'cash',
    'city',
    'clue',
    'club',
    'code',
    'coin',
    'cool',
    'crow',
    'dark',
    'dawn',
    'dice',
    'door',
    'down',
    'drop',
    'dust',
    'east',
    'edge',
    'evil',
    'eyes',
    'face',
    'fall',
    'fate',
    'fear',
    'fire',
    'fish',
    'fist',
    'five',
    'flip',
    'fly',
    'foot',
    'four',
    'fury',
    'gain',
    'game',
    'gate',
    'gems',
    'get',
    'gift',
    'glow',
    'gods',
    'gold',
    'grab',
    'grip',
    'grow',
    'guns',
    'guts',
    'hack',
    'hall',
    'hand',
    'hawk',
    'heat',
    'hero',
    'hide',
    'high',
    'hill',
    'hold',
    'hole',
    'home',
    'hook',
    'hope',
    'horn',
    'host',
    'howl',
    'hunt',
    'idol',
    'iron',
    'isle',
    'jack',
    'jade',
    'jail',
    'jump',
    'just',
    'keen',
    'keep',
    'keys',
    'kick',
    'king',
    'kiss',
    'knot',
    'know',
    'lady',
    'lake',
    'lamp',
    'land',
    'last',
    'lead',
    'leaf',
    'liar',
    'life',
    'lift',
    'line',
    'link',
    'lion',
    'live',
    'lock',
    'lone',
    'long',
    'look',
    'lord',
    'lore',
    'lose',
    'lost',
    'love',
    'luck',
    'lure',
    'lush',
    'made',
    'mage',
    'maid',
    'make',
    'mark',
    'mask',
    'maze',
    'mind',
    'mine',
    'mint',
    'miss',
    'mode',
    'moon',
    'more',
    'move',
    'myth',
    'name',
    'nest',
    'next',
    'nine',
    'node',
    'note',
    'nova',
    'odds',
    'once',
    'ones',
    'only',
    'open',
    'over',
    'pace',
    'pack',
    'page',
    'paid',
    'pair',
    'pale',
    'palm',
    'park',
    'part',
    'pass',
    'past',
    'path',
    'peak',
    'pick',
    'pile',
    'pine',
    'plan',
    'play',
    'plot',
    'plus',
    'pool',
    'port',
    'post',
    'pour',
    'prey',
    'pure',
    'push',
    'race',
    'rage',
    'raid',
    'rain',
    'rank',
    'rare',
    'rash',
    'rate',
    'read',
    'real',
    'reef',
    'reel',
    'rich',
    'ride',
    'ring',
    'rise',
    'risk',
    'road',
    'rock',
    'role',
    'roll',
    'rome',
    'room',
    'root',
    'rope',
    'rose',
    'rule',
    'rush',
    'safe',
    'sage',
    'sail',
    'sake',
    'sale',
    'salt',
    'sand',
    'save',
    'seal',
    'seed',
    'seek',
    'sell',
    'send',
    'ship',
    'show',
    'shut',
    'side',
    'sign',
    'silk',
    'sink',
    'size',
    'skip',
    'slip',
    'slow',
    'snap',
    'snow',
    'soar',
    'solo',
    'some',
    'song',
    'soon',
    'sort',
    'soul',
    'sour',
    'spin',
    'spot',
    'star',
    'stay',
    'stem',
    'step',
    'stop',
    'stub',
    'suit',
    'sure',
    'swim',
    'tail',
    'take',
    'tale',
    'talk',
    'tall',
    'tank',
    'tape',
    'task',
    'team',
    'tear',
    'tell',
    'term',
    'test',
    'text',
    'them',
    'then',
    'thin',
    'this',
    'tide',
    'time',
    'tiny',
    'tips',
    'toad',
    'toll',
    'tomb',
    'tome',
    'tone',
    'tool',
    'tops',
    'torn',
    'tour',
    'town',
    'trap',
    'tree',
    'trim',
    'trio',
    'trip',
    'true',
    'tube',
    'tuck',
    'tune',
    'turn',
    'type',
    'unit',
    'upon',
    'used',
    'vale',
    'vast',
    'very',
    'vibe',
    'view',
    'vine',
    'void',
    'vote',
    'wade',
    'wage',
    'wait',
    'wake',
    'walk',
    'wall',
    'wand',
    'want',
    'ward',
    'warm',
    'warn',
    'warp',
    'wars',
    'wash',
    'wave',
    'ways',
    'weak',
    'wear',
    'week',
    'west',
    'what',
    'when',
    'whom',
    'wide',
    'wild',
    'will',
    'wind',
    'wine',
    'wing',
    'wins',
    'wire',
    'wise',
    'wish',
    'with',
    'wolf',
    'wood',
    'word',
    'work',
    'worm',
    'wrap',
    'yard',
    'year',
    'yell',
    'zero',
    'zone',
    'coins',
    'gates',
    'magic',
    'power',
    'queen',
    'reign',
    'sands',
    'story',
    'tales',
    'tiger',
    'wings',
    'twice',
    'house',
    'secrets',
]);

// Build franchise → games mapping
const franchiseGames = {};
for (const [gameId, mapping] of Object.entries(franchiseMapping)) {
    const franchise = mapping?.franchise || mapping;
    if (!franchise || typeof franchise !== 'string') continue;
    if (!franchiseGames[franchise]) {
        franchiseGames[franchise] = {
            name: franchise,
            type: mapping?.franchise_type || 'unknown',
            games: [],
            providers: new Set(),
        };
    }
    const game = master.find(g => g.id === gameId || g.name === gameId);
    franchiseGames[franchise].games.push(gameId);
    if (game?.provider) franchiseGames[franchise].providers.add(game.provider);
}

function scoreFranchise(f) {
    const name = f.name;
    const gameCount = f.games.length;
    const providerCount = f.providers.size;
    const flags = [];
    let score = 50;

    // Licensed IP is always valid
    if (f.type === 'licensed_ip') {
        score += 30;
        flags.push('licensed_ip');
    }

    // Short common English word
    if (name.length <= 5 && COMMON_ENGLISH_WORDS.has(name.toLowerCase())) {
        score -= 30;
        flags.push('common_english_word');
    } else if (COMMON_ENGLISH_WORDS.has(name.toLowerCase())) {
        score -= 20;
        flags.push('dictionary_word');
    }

    // Single game franchise is weak
    if (gameCount === 1) {
        score -= 15;
        flags.push('single_game');
    }

    // Provider consistency — games from same provider = stronger brand signal
    if (providerCount === 1 && gameCount >= 2) {
        score += 15;
        flags.push('single_provider');
    } else if (providerCount > 3 && !f.type?.includes('licensed')) {
        score -= 10;
        flags.push('many_providers');
    }

    // Larger franchises are more likely real
    if (gameCount >= 5) score += 10;
    if (gameCount >= 10) score += 10;

    // Name patterns that suggest real franchises
    if (/^[A-Z][a-z]+ of /i.test(name)) {
        score += 5;
        flags.push('prefix_pattern');
    }

    return { ...f, score: Math.max(0, Math.min(100, score)), flags, providerCount };
}

// Score all franchises
const scored = Object.values(franchiseGames).map(scoreFranchise);
scored.sort((a, b) => a.score - b.score);

// Categorize
const suspects = scored.filter(f => f.score < 40);
const borderline = scored.filter(f => f.score >= 40 && f.score < 60);
const likely_valid = scored.filter(f => f.score >= 60);

const outputJson = process.argv.includes('--json');

if (outputJson) {
    console.log(
        JSON.stringify(
            {
                total: scored.length,
                suspects: suspects.map(f => ({
                    name: f.name,
                    score: f.score,
                    games: f.games.length,
                    providers: f.providerCount,
                    flags: f.flags,
                    type: f.type,
                })),
                borderline: borderline.map(f => ({
                    name: f.name,
                    score: f.score,
                    games: f.games.length,
                    providers: f.providerCount,
                    flags: f.flags,
                })),
                valid_count: likely_valid.length,
            },
            null,
            2
        )
    );
} else {
    console.log('=== Franchise / Brand Validation Report ===\n');
    console.log(`Total franchises: ${scored.length}`);
    console.log(`Likely valid: ${likely_valid.length}`);
    console.log(`Borderline: ${borderline.length}`);
    console.log(`Suspects (score < 40): ${suspects.length}\n`);

    console.log('--- SUSPECTS (likely NOT real brands) ---');
    for (const f of suspects) {
        console.log(
            `  ${f.name.padEnd(25)} score=${f.score}  games=${f.games.length}  providers=${f.providerCount}  flags=[${f.flags.join(', ')}]`
        );
    }

    console.log('\n--- BORDERLINE (needs review) ---');
    for (const f of borderline.slice(0, 30)) {
        console.log(
            `  ${f.name.padEnd(25)} score=${f.score}  games=${f.games.length}  providers=${f.providerCount}  flags=[${f.flags.join(', ')}]`
        );
    }
    if (borderline.length > 30) console.log(`  ... and ${borderline.length - 30} more`);

    console.log('\n--- ACTION REQUIRED ---');
    console.log('1. Review suspects above — decide which to remove from franchise_mapping.json');
    console.log('2. For borderline cases, web-search "{name} slot franchise" to verify');
    console.log('3. After changes: run `npm run build:data` to regenerate parquet');
}
