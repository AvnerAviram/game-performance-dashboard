#!/usr/bin/env node
/**
 * Remove Duplicate Games Script
 * 
 * Removes duplicate game entries from games_master.json
 * Keeps the first occurrence of each game name
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataFile = path.join(__dirname, '../../data/games_master.json');

console.log('🔍 Loading games_master.json...');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const games = data.games;

console.log(`📊 Original count: ${games.length} games`);

// Find duplicates
const seen = new Set();
const duplicates = [];
const unique = [];

games.forEach((game, index) => {
  if (seen.has(game.name)) {
    duplicates.push({ name: game.name, id: game.id, index });
  } else {
    seen.add(game.name);
    unique.push(game);
  }
});

console.log(`\n❌ Found ${duplicates.length} duplicate entries:`);
duplicates.slice(0, 10).forEach(dup => {
  console.log(`  - ${dup.name} (ID: ${dup.id}, index: ${dup.index})`);
});

if (duplicates.length > 10) {
  console.log(`  ... and ${duplicates.length - 10} more`);
}

console.log(`\n✅ Keeping ${unique.length} unique games`);

// Update data
data.games = unique;
data.metadata.total_games = unique.length;
data.metadata.notes = (data.metadata.notes || '') + ` Duplicates removed on ${new Date().toISOString()}.`;

// Create backup
const backupFile = dataFile.replace('.json', '.backup.json');
console.log(`\n💾 Creating backup: ${path.basename(backupFile)}`);
fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));

// Write cleaned data
console.log(`📝 Writing cleaned data...`);
fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));

console.log(`\n✅ DONE!`);
console.log(`   Removed: ${duplicates.length} duplicates`);
console.log(`   Remaining: ${unique.length} unique games`);
console.log(`   Backup saved as: ${path.basename(backupFile)}`);
