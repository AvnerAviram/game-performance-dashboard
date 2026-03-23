#!/usr/bin/env node
/**
 * Generates franchise_mapping.json by:
 *  1. Matching known licensed IPs (TV shows, movies, brands)
 *  2. Clustering games by shared name prefixes (game families)
 *
 * Output is meant for human review before integration.
 * Run: node data/generate_franchise_map.js
 */

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'games_dashboard.json');
const outPath = path.join(__dirname, 'franchise_mapping.json');

const games = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const allGames = Array.isArray(games) ? games : games.games || [];

// ── Known licensed IPs ──────────────────────────────────────────────────
// Each entry: { franchise name, match patterns (lowercase substrings) }
const LICENSED_IPS = [
  { franchise: 'Rick and Morty',     patterns: ['rick and morty'] },
  { franchise: 'Ted',                patterns: [], match: name => /^ted\b/i.test(name) },
  { franchise: 'Peaky Blinders',     patterns: ['peaky blinders'] },
  { franchise: 'The Goonies',        patterns: ['the goonies', 'goonies'] },
  { franchise: 'The Flintstones',    patterns: ['flintstones'] },
  { franchise: 'The Jetsons',        patterns: ['jetsons'] },
  { franchise: 'Deal or No Deal',    patterns: ['deal or no deal'] },
  { franchise: 'Beavis and Butt-Head', patterns: ['beavis'] },
  { franchise: 'Black Mirror',       patterns: ['black mirror'] },
  { franchise: 'King Kong',          patterns: ['king kong'], match: name => /\bkong\b/i.test(name) },
  { franchise: 'Napoleon',           patterns: ['napoleon'] },
  { franchise: 'Monopoly',           patterns: ['monopoly'] },
  { franchise: 'Clue',               patterns: ['clue '], match: name => /^clue\b/i.test(name) },
  { franchise: 'Wheel of Fortune',   patterns: ['wheel of fortune'] },
  { franchise: 'Jumanji',            patterns: ['jumanji'] },
  { franchise: 'Slingo',             patterns: ['slingo'] },
  { franchise: 'Scrooge',            patterns: ['scrooge'] },
  { franchise: 'Leprechaun',         patterns: [], match: name => /^leprechaun\b/i.test(name) },
  { franchise: 'Buffalo',            patterns: [], match: name => /\bbuffalo\b/i.test(name) },
  { franchise: 'Wolf Legend',        patterns: ['wolf legend'] },
];

// ── Step 1: Assign licensed IPs ─────────────────────────────────────────
const ipAssigned = new Map(); // game id -> franchise info

for (const game of allGames) {
  const nameLower = (game.name || '').toLowerCase();
  for (const ip of LICENSED_IPS) {
    const patternMatch = ip.patterns.some(p => nameLower.includes(p));
    const fnMatch = ip.match ? ip.match(game.name || '') : false;
    if (patternMatch || fnMatch) {
      ipAssigned.set(game.id, {
        franchise: ip.franchise,
        franchise_type: 'licensed_ip',
      });
      break;
    }
  }
}

// ── Trailing stop words & overrides ──────────────────────────────────────
const TRAILING_STOP = new Set([
  'of', 'the', 'and', 'n', 'a', 'in', 'on', 'at', 'to', 'by',
  'de', 'la', 'el', 'du', 'or', 'an',
]);

// Normalized prefix → corrected franchise name (for brands the algorithm can't detect)
const FRANCHISE_OVERRIDES = {
  'huff n':                       'Huff N Puff',
  'catch of the':                 'Catch of the Day',
  'rich wilde and the tome of':   'Rich Wilde',
};

// Games the prefix algorithm misses because an inserted word breaks the prefix
const EXTRA_FAMILY_MEMBERS = {
  'Bankin Bacon': [/^bankin.*bacon/i],
  'Rakin Bacon':  [/^rakin.*bacon/i],
};

function cleanFranchiseName(normalizedPrefix, titleCaseName) {
  if (FRANCHISE_OVERRIDES[normalizedPrefix]) {
    return FRANCHISE_OVERRIDES[normalizedPrefix];
  }
  let words = titleCaseName.split(' ');
  while (words.length > 1 && TRAILING_STOP.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  return words.join(' ');
}

// ── Step 2: Name-prefix clustering for game families ────────────────────
const norm = s => (s || '').replace(/[''`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const nameList = allGames.map(g => ({
  game: g,
  norm: norm(g.name),
  words: norm(g.name).split(' '),
}));

const prefixMap = {};
for (let i = 0; i < nameList.length; i++) {
  for (let j = i + 1; j < nameList.length; j++) {
    const a = nameList[i].words, b = nameList[j].words;
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
    if (shared >= 2) {
      const prefix = a.slice(0, shared).join(' ');
      if (!prefixMap[prefix]) prefixMap[prefix] = new Set();
      prefixMap[prefix].add(i);
      prefixMap[prefix].add(j);
    }
  }
}

const prefixes = Object.entries(prefixMap)
  .map(([p, s]) => ({ prefix: p, indices: s }))
  .sort((a, b) => a.prefix.length - b.prefix.length);

const assigned = new Set();
const families = {};

for (let i = prefixes.length - 1; i >= 0; i--) {
  const { prefix, indices } = prefixes[i];
  const unassigned = [...indices].filter(idx => !assigned.has(idx));
  if (unassigned.length < 2) continue;

  let bestPrefix = prefix;
  for (let j = 0; j < i; j++) {
    if (prefix.startsWith(prefixes[j].prefix + ' ') || prefix === prefixes[j].prefix) {
      unassigned.forEach(idx => prefixes[j].indices.add(idx));
      bestPrefix = null;
      break;
    }
  }

  if (bestPrefix) {
    if (!families[bestPrefix]) families[bestPrefix] = new Set();
    unassigned.forEach(idx => { families[bestPrefix].add(idx); assigned.add(idx); });
  }
}

for (const { prefix, indices } of prefixes) {
  if (families[prefix]) continue;
  const unassigned = [...indices].filter(idx => !assigned.has(idx));
  if (unassigned.length >= 2) {
    families[prefix] = new Set(unassigned);
    unassigned.forEach(idx => assigned.add(idx));
  } else if (indices.size >= 2) {
    const existing = Object.keys(families).find(f => prefix.startsWith(f + ' ') || prefix.startsWith(f));
    if (existing) {
      indices.forEach(idx => families[existing].add(idx));
    } else {
      families[prefix] = indices;
      indices.forEach(idx => assigned.add(idx));
    }
  }
}

// ── Step 3: Merge IP assignments with prefix families ───────────────────
const result = {};

for (const game of allGames) {
  if (ipAssigned.has(game.id)) {
    const { franchise, franchise_type } = ipAssigned.get(game.id);
    result[game.id] = { franchise, franchise_type };
  }
}

for (const [prefix, idxSet] of Object.entries(families)) {
  if (idxSet.size < 2) continue;
  const gs = [...idxSet].map(i => nameList[i].game);
  const rawBase = gs[0].name.split(/\s+/).slice(0, prefix.split(' ').length).join(' ');
  const franchise = cleanFranchiseName(prefix, rawBase);

  for (const g of gs) {
    if (result[g.id]) continue;
    result[g.id] = { franchise, franchise_type: 'game_family' };
  }
}

// ── Step 3b: Catch missed family members via pattern matching ───────────
for (const [franchiseName, patterns] of Object.entries(EXTRA_FAMILY_MEMBERS)) {
  for (const game of allGames) {
    if (result[game.id]) continue;
    if (patterns.some(rx => rx.test(game.name))) {
      result[game.id] = { franchise: franchiseName, franchise_type: 'game_family' };
    }
  }
}

// ── Step 4: Write output ────────────────────────────────────────────────
const sorted = Object.entries(result)
  .sort(([, a], [, b]) => a.franchise.localeCompare(b.franchise))
  .reduce((acc, [id, info]) => {
    acc[id] = info;
    return acc;
  }, {});

fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n');

// Stats
const ipCount = Object.values(sorted).filter(v => v.franchise_type === 'licensed_ip').length;
const famCount = Object.values(sorted).filter(v => v.franchise_type === 'game_family').length;
const franchises = [...new Set(Object.values(sorted).map(v => v.franchise))];

console.log(`Franchise mapping generated: ${outPath}`);
console.log(`  Total games mapped: ${Object.keys(sorted).length} / ${allGames.length}`);
console.log(`  Licensed IPs: ${ipCount} games`);
console.log(`  Game families: ${famCount} games`);
console.log(`  Unique franchises: ${franchises.length}`);
console.log(`\nTop franchises:`);

const byCounts = {};
for (const v of Object.values(sorted)) {
  byCounts[v.franchise] = (byCounts[v.franchise] || 0) + 1;
}
Object.entries(byCounts)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 20)
  .forEach(([name, count]) => {
    const type = sorted[Object.keys(sorted).find(id => sorted[id].franchise === name)].franchise_type;
    console.log(`  ${name}: ${count} games (${type})`);
  });
