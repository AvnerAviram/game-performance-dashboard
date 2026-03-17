#!/usr/bin/env node
/**
 * Merge Verified Games Script
 * 
 * Safely integrates verified recovered games into games_master.json
 * - Creates backup before modification
 * - Assigns sequential IDs
 * - Sorts by theo_win (descending)
 * - Updates metadata
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create timestamped backup
 */
function createBackup(jsonPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const backupPath = jsonPath.replace('.json', `.backup-${timestamp}.json`);
  
  fs.copyFileSync(jsonPath, backupPath);
  console.log(`✅ Backup created: ${path.basename(backupPath)}`);
  
  return backupPath;
}

/**
 * Assign sequential IDs
 */
function assignIds(games, startingIndex) {
  games.forEach((game, i) => {
    const index = startingIndex + i;
    const normalized = game.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    game.id = `game-${String(index).padStart(3, '0')}-${normalized}`;
  });
  
  return games;
}

/**
 * Sort games by theo_win descending
 */
function sortByPerformance(games) {
  return games.sort((a, b) => {
    const theoA = a.performance?.theo_win || 0;
    const theoB = b.performance?.theo_win || 0;
    return theoB - theoA;
  });
}

/**
 * Update metadata
 */
function updateMetadata(metadata, addedCount) {
  const now = new Date().toISOString();
  
  metadata.total_games += addedCount;
  metadata.last_updated = now;
  
  // Append to notes
  const note = ` Added ${addedCount} high-performer slots via automated recovery protocol (${now.split('T')[0]}).`;
  metadata.notes = (metadata.notes || '') + note;
  
  return metadata;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔀 Starting Game Merge Process');
  console.log('📋 Merging verified games into games_master.json\n');
  
  // Load verified games
  const verifiedPath = path.join(__dirname, '../../data/verified_games_batch.json');
  if (!fs.existsSync(verifiedPath)) {
    console.error('❌ verified_games_batch.json not found');
    console.error('Run validate-recovered-games.js first');
    process.exit(1);
  }
  
  const verifiedGames = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));
  console.log(`📦 Loaded ${verifiedGames.length} verified games to merge\n`);
  
  if (verifiedGames.length === 0) {
    console.error('❌ No games to merge!');
    process.exit(1);
  }
  
  // Load current games_master.json
  const jsonPath = path.join(__dirname, '../../data/games_master.json');
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const currentGames = jsonData.games;
  
  console.log(`📊 Current games_master.json has ${currentGames.length} games\n`);
  
  // Create backup
  console.log('💾 Creating backup...');
  const backupPath = createBackup(jsonPath);
  
  // Assign IDs to new games
  console.log('\n🔢 Assigning sequential IDs...');
  const startingIndex = currentGames.length + 1;
  assignIds(verifiedGames, startingIndex);
  console.log(`✅ Assigned IDs from game-${String(startingIndex).padStart(3, '0')} to game-${String(startingIndex + verifiedGames.length - 1).padStart(3, '0')}`);
  
  // Merge games
  console.log('\n🔀 Merging games...');
  const mergedGames = [...currentGames, ...verifiedGames];
  console.log(`✅ Total games after merge: ${mergedGames.length}`);
  
  // Sort by theo_win
  console.log('\n📊 Sorting by performance (theo_win descending)...');
  const sortedGames = sortByPerformance(mergedGames);
  console.log(`✅ Games sorted`);
  
  // Update metadata
  console.log('\n📝 Updating metadata...');
  const updatedMetadata = updateMetadata(jsonData.metadata, verifiedGames.length);
  console.log(`✅ Metadata updated:`);
  console.log(`   Total games: ${currentGames.length} → ${updatedMetadata.total_games}`);
  console.log(`   Last updated: ${updatedMetadata.last_updated}`);
  
  // Create new JSON structure
  const newJsonData = {
    metadata: updatedMetadata,
    games: sortedGames
  };
  
  // Write to file
  console.log('\n💾 Writing updated games_master.json...');
  fs.writeFileSync(jsonPath, JSON.stringify(newJsonData, null, 2));
  console.log(`✅ Successfully wrote ${path.basename(jsonPath)}`);
  
  // Summary
  console.log('\n\n✅ Merge Complete!');
  console.log('═══════════════════════════════════════');
  console.log(`📊 Before: ${currentGames.length} games`);
  console.log(`➕ Added: ${verifiedGames.length} games`);
  console.log(`📊 After: ${updatedMetadata.total_games} games`);
  console.log(`\n💾 Backup: ${path.basename(backupPath)}`);
  console.log(`📁 Location: ${path.dirname(backupPath)}`);
  
  // Show top 10 added games
  console.log('\n🏆 Top 10 added games by performance:');
  const addedGameNames = new Set(verifiedGames.map(g => g.name));
  const topAdded = sortedGames
    .filter(g => addedGameNames.has(g.name))
    .slice(0, 10);
  
  topAdded.forEach((game, i) => {
    console.log(`   ${i + 1}. ${game.name} - Theo Win: ${game.performance.theo_win}`);
  });
  
  console.log('\n📋 Next step: Run test-dashboard-integration.js');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { createBackup, assignIds, sortByPerformance, updateMetadata };
