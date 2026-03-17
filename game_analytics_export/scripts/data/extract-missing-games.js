#!/usr/bin/env node
/**
 * Extract Missing Games Script
 * 
 * Compares CSV top 500 slots against current games_master.json
 * to identify the 53 missing high-performer slots that need recovery
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CSV line handling quotes
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

console.log('🔍 Extracting missing games from CSV...\n');

// Read CSV
const csvPath = '/Users/avner/Downloads/Data Download Theme (4).csv';
if (!fs.existsSync(csvPath)) {
  console.error('❌ CSV file not found at:', csvPath);
  console.error('Please ensure CSV is at: ~/Downloads/Data Download Theme (4).csv');
  process.exit(1);
}

const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.trim().split('\n');

console.log('📊 Parsing CSV...');

// Parse CSV
const games = [];
for (let i = 1; i < lines.length; i++) {
  const cols = parseCSVLine(lines[i]);
  const name = cols[3];
  const provider = cols[4];
  const category = cols[5];
  const releaseDate = cols[6];
  const theoWinStr = cols[12];
  const theoWin = parseFloat(theoWinStr);
  
  if (name && !isNaN(theoWin) && theoWin > 0 && category === 'Slot') {
    games.push({
      name: name,
      csv_provider: provider,
      category: category,
      release_date: releaseDate,
      theo_win: theoWin,
      csv_rank: games.length + 1
    });
  }
}

// Sort by theo_win descending
games.sort((a, b) => b.theo_win - a.theo_win);

console.log(`✅ Parsed ${games.length} slot games from CSV`);

// Get top 500 slots (or all if less)
const top500 = games.slice(0, 500);
console.log(`📊 Top ${top500.length} slots by performance`);

// Read current games_master.json
const jsonPath = path.join(__dirname, '../../data/games_master.json');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const currentGames = jsonData.games.map(g => g.name);

console.log(`📦 Current games_master.json has ${currentGames.length} games\n`);

// Find missing games
const missing = top500.filter(game => !currentGames.includes(game.name));

console.log(`❌ Found ${missing.length} missing high-performer slots:\n`);

// Display missing games
missing.forEach((game, i) => {
  console.log(`${i + 1}. ${game.name}`);
  console.log(`   Provider: ${game.csv_provider}`);
  console.log(`   Theo Win: ${game.theo_win}`);
  console.log(`   Release: ${game.release_date}`);
  console.log(`   Rank: #${game.csv_rank}`);
  console.log('');
});

// Save to file
const outputPath = path.join(__dirname, '../../data/missing_games_to_recover.json');
fs.writeFileSync(outputPath, JSON.stringify(missing, null, 2));

console.log(`✅ Saved missing games to: ${path.basename(outputPath)}`);
console.log(`\n📊 Summary:`);
console.log(`   Total CSV slots: ${games.length}`);
console.log(`   Top performers: ${top500.length}`);
console.log(`   Current in JSON: ${currentGames.length}`);
console.log(`   Missing to recover: ${missing.length}`);
