#!/usr/bin/env node
/**
 * Theme & Mechanic Enrichment Script
 * 
 * Enriches verified games with detailed theme and mechanic descriptions
 * Uses series pattern detection and keyword analysis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Series themes (from batch_research_remaining_70.py)
const SERIES_THEMES = {
  'Buffalo': {
    primary: 'Animals - Buffalo',
    secondary: 'Wildlife/Nature',
    consolidated: 'Animals - Buffalo',
    confidence: '95%'
  },
  'Ultimate Fire Link': {
    primary: 'Fire/Energy',
    secondary: 'Link/Collection',
    consolidated: 'Fire - Link Series',
    confidence: '95%'
  },
  '88 Fortunes': {
    primary: 'Asian/Chinese',
    secondary: 'Fortune/Luck',
    consolidated: 'Asian - Fortune',
    confidence: '95%'
  },
  'Cash Eruption': {
    primary: 'Fire/Volcanic',
    secondary: 'Tribal/Mayan',
    consolidated: 'Fire/Volcanic',
    confidence: '95%'
  },
  'Wheel Of Fortune': {
    primary: 'Game Show',
    secondary: 'Bonus Wheel',
    consolidated: 'Game Show',
    confidence: '95%'
  },
  'Gold Blitz': {
    primary: 'Treasure/Gold',
    secondary: 'Mining/Adventure',
    consolidated: 'Treasure',
    confidence: '90%'
  }
};

// Theme keywords for pattern matching
const THEME_KEYWORDS = {
  'Asian - Fortune': ['fortune', 'dragon', 'lucky', 'prosperity', 'wealth', 'jin', 'bao', 'zhao', 'fu'],
  'Animals - Buffalo': ['buffalo', 'bison', 'wildlife'],
  'Fire/Volcanic': ['fire', 'flame', 'eruption', 'blitz', 'inferno', 'burn'],
  'Egyptian': ['egypt', 'pharaoh', 'cleopatra', 'pyramid', 'sphinx', 'temple'],
  'Mythology': ['zeus', 'thor', 'odin', 'medusa', 'phoenix', 'dragon'],
  'Treasure': ['gold', 'diamond', 'treasure', 'jewel', 'gem', 'coin'],
  'Animals': ['wolf', 'tiger', 'lion', 'eagle', 'bear', 'monkey', 'pig'],
  'Irish/Celtic': ['shamrock', 'clover', 'leprechaun', 'rainbow', 'celtic'],
  'Fruit/Classic': ['fruit', 'cherry', 'lemon', 'bar', '7s', 'sevens'],
  'Adventure': ['quest', 'explorer', 'jungle', 'adventure', 'safari'],
  'Magic/Fantasy': ['magic', 'wizard', 'enchanted', 'spell', 'sorcerer'],
  'Horror': ['vampire', 'zombie', 'blood', 'suckers', 'walking dead', 'hell'],
  'Western': ['wild west', 'cowboy', 'bandit', 'sheriff'],
  'Space': ['space', 'galaxy', 'starburst', 'cosmic'],
  'Food': ['sweet', 'candy', 'chocolate', 'banana'],
  'Marine': ['ocean', 'dolphin', 'fish', 'bass', 'splash'],
  'Christmas/Holiday': ['christmas', 'santa', 'nicked', 'gobble']
};

/**
 * Detect if game belongs to a known series
 */
function detectSeries(gameName) {
  const nameLower = gameName.toLowerCase();
  
  for (const [seriesName, theme] of Object.entries(SERIES_THEMES)) {
    if (nameLower.includes(seriesName.toLowerCase())) {
      return { series: seriesName, theme };
    }
  }
  
  return null;
}

/**
 * Classify theme by keyword matching
 */
function classifyTheme(gameName) {
  const nameLower = gameName.toLowerCase();
  const matches = [];
  
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) {
        matches.push({ theme, keyword, confidence: 80 });
        break;
      }
    }
  }
  
  if (matches.length === 0) {
    return { primary: 'Video Slots', secondary: null, consolidated: 'General', confidence: '60%' };
  }
  
  // Return primary match
  const primary = matches[0];
  const secondary = matches[1] || null;
  
  return {
    primary: primary.theme,
    secondary: secondary ? secondary.theme : null,
    consolidated: primary.theme,
    confidence: `${primary.confidence}%`
  };
}

/**
 * Generate detailed description
 */
function generateDescription(gameName, provider, theme, mechanic) {
  const templates = {
    'Asian - Fortune': `${gameName} is an Asian-themed slot by ${provider} featuring ${theme.primary} symbolism with ${mechanic.primary} mechanics.`,
    'Animals - Buffalo': `${gameName} features ${theme.primary} in a wildlife-themed slot by ${provider} with ${mechanic.primary} gameplay.`,
    'Fire/Volcanic': `${gameName} by ${provider} presents a ${theme.primary.toLowerCase()}-themed experience with ${mechanic.primary} features.`,
    'Treasure': `${gameName} is a treasure-hunting slot by ${provider} featuring ${theme.primary.toLowerCase()} collection with ${mechanic.primary} mechanics.`,
    'Egyptian': `${gameName} takes players to ancient Egypt in this ${provider} slot with ${mechanic.primary} features.`,
    'default': `${gameName} by ${provider} is a ${theme.consolidated.toLowerCase()}-themed slot featuring ${mechanic.primary} gameplay.`
  };
  
  const template = templates[theme.primary] || templates['default'];
  return template;
}

/**
 * Enrich a single game with theme data
 */
function enrichGame(game) {
  console.log(`\n🎨 Enriching: ${game.name}`);
  
  // Check for series pattern
  const series = detectSeries(game.name);
  
  let theme;
  if (series) {
    console.log(`  ✅ Series detected: ${series.series}`);
    theme = {
      primary: series.theme.primary,
      secondary: series.theme.secondary,
      consolidated: series.theme.consolidated,
      details: `Part of ${series.series} series. ${generateDescription(game.name, game.provider.studio, series.theme, game.mechanic)}`
    };
  } else {
    // Classify by keywords
    const classified = classifyTheme(game.name);
    console.log(`  ✅ Theme: ${classified.primary} (${classified.confidence} confidence)`);
    
    theme = {
      primary: classified.primary,
      secondary: classified.secondary,
      consolidated: classified.consolidated,
      details: generateDescription(game.name, game.provider.studio, classified, game.mechanic)
    };
  }
  
  // Update game object
  game.theme = theme;
  
  return game;
}

/**
 * Main execution
 */
async function main() {
  console.log('🎨 Starting Theme & Mechanic Enrichment');
  console.log('📋 Enriching verified games with detailed themes\n');
  
  // Load verified games
  const verifiedPath = path.join(__dirname, '../../data/verified_games_batch.json');
  if (!fs.existsSync(verifiedPath)) {
    console.error('❌ verified_games_batch.json not found');
    console.error('Run automated-game-verification.js first');
    process.exit(1);
  }
  
  const verifiedGames = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));
  console.log(`📦 Loaded ${verifiedGames.length} games to enrich\n`);
  
  // Enrich each game
  const enrichedGames = verifiedGames.map(game => enrichGame(game));
  
  // Save enriched games
  fs.writeFileSync(verifiedPath, JSON.stringify(enrichedGames, null, 2));
  
  // Summary
  console.log('\n\n✅ Enrichment Complete!');
  console.log('═══════════════════════════════════════');
  console.log(`📊 Games enriched: ${enrichedGames.length}`);
  console.log(`💾 Updated: verified_games_batch.json`);
  console.log('\n📋 Next step: Run validate-recovered-games.js');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { enrichGame, detectSeries, classifyTheme };
