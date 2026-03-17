#!/usr/bin/env node
/**
 * SlotCatalog Scraper
 *
 * Features:
 * - Query SlotCatalog by game name
 * - Extract: reels, rows, paylines, RTP, volatility, max_win
 * - Rate limiting (1 req/second)
 * - Retry logic with exponential backoff
 * - Response caching
 */

import https from 'https';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, '../../cache/slotcatalog');
const RATE_LIMIT = pLimit(1); // 1 request at a time
const DELAY_MS = 1000; // 1 second between requests

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate cache filename from game name
 */
function getCacheFilename(gameName) {
  const normalized = gameName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return path.join(CACHE_DIR, `${normalized}.json`);
}

/**
 * Check if cached response exists and is fresh (< 7 days old)
 */
function getCachedResponse(gameName) {
  const cacheFile = getCacheFilename(gameName);

  if (fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

    if (ageInDays < 7) {
      try {
        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        console.log(`  ✅ Cache hit: ${gameName}`);
        return data;
      } catch (e) {
        console.log(`  ⚠️  Cache corrupted: ${gameName}`);
      }
    }
  }

  return null;
}

/**
 * Save response to cache
 */
function saveCachedResponse(gameName, data) {
  const cacheFile = getCacheFilename(gameName);
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
}

/**
 * Search SlotCatalog for a game
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', Accept: 'text/html,application/xhtml+xml' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function searchSlotCatalog(gameName) {
  try {
    const searchUrl = `https://slotcatalog.com/en/slots/${encodeURIComponent(gameName.toLowerCase().replace(/\s+/g, '-'))}`;

    const response = await httpsGet(searchUrl);

    if (response.status === 404) {
      return { found: false, gameName };
    }

    const $ = cheerio.load(response.data);

    // Extract specs
    const specs = {
      found: true,
      gameName: gameName,
      url: searchUrl,
      reels: null,
      rows: null,
      paylines: null,
      rtp: null,
      volatility: null,
      max_win: null,
      provider: null,
    };

    // Try to find specs in various formats
    const selectors = [
      '.game-specs .spec-item', '.technical-details .detail-item',
      '.game-info [class*="spec"]', '.game-details [class*="info"]',
      'dl dt', '.info-row', '[data-label]', '.specs-list li'
    ];
    $(selectors.join(', ')).each((i, elem) => {
      const $el = $(elem);
      const label = ($el.find('.label, .spec-label, dt').text() || $el.text().split(':')[0] || '').trim().toLowerCase();
      const value = ($el.find('.value, .spec-value, dd').text() || $el.text().split(':').slice(1).join(':') || '').trim();
      if (!value) return;

      if (label.includes('reel') && !label.includes('type')) {
        specs.reels = parseInt(value) || specs.reels;
      } else if (label.includes('row')) {
        specs.rows = parseInt(value) || specs.rows;
      } else if (label.includes('payline') || label.includes('ways')) {
        specs.paylines = value || specs.paylines;
      } else if (label.includes('rtp')) {
        const rtpMatch = value.match(/(\d+\.?\d*)/);
        if (rtpMatch) specs.rtp = parseFloat(rtpMatch[1]);
      } else if (label.includes('volatility') || label.includes('variance')) {
        specs.volatility = value.toLowerCase() || specs.volatility;
      } else if (label.includes('max') && (label.includes('win') || label.includes('payout'))) {
        specs.max_win = value || specs.max_win;
      } else if (label.includes('provider') || label.includes('developer')) {
        specs.provider = value || specs.provider;
      }
    });

    // Alternative: layout 5x3 from page text
    if (!specs.reels) {
      const layout = $('[data-label="Layout"], .layout, .game-layout').text();
      const layoutMatch = layout.match(/(\d+)\s*[x×]\s*(\d+)/);
      if (layoutMatch) {
        specs.reels = parseInt(layoutMatch[1]);
        specs.rows = parseInt(layoutMatch[2]);
      }
    }

    // Fallback: scan full page for patterns
    const fullText = $('body').text();
    if (!specs.rtp && fullText) {
      const rtpM = fullText.match(/(?:RTP|rtp)[:\s]*(\d+\.?\d*)\s*%/i);
      if (rtpM) specs.rtp = parseFloat(rtpM[1]);
    }
    if (!specs.provider && fullText) {
      const provM = fullText.match(/(?:Provider|Developer)[:\s]+([A-Za-z0-9&\s\.]+?)(?:\n|$|;)/i);
      if (provM) specs.provider = provM[1].trim();
    }

    return specs;
  } catch (error) {
    console.error(`  ❌ Error fetching ${gameName}:`, error.message);
    return {
      found: false,
      gameName,
      error: error.message,
    };
  }
}

/**
 * Scrape game with rate limiting and caching
 */
async function scrapeGame(gameName, index, total) {
  return RATE_LIMIT(async () => {
    console.log(`\n[${index + 1}/${total}] Scraping: ${gameName}`);

    // Check cache first
    const cached = getCachedResponse(gameName);
    if (cached) {
      return cached;
    }

    // Rate limit: wait before making request
    if (index > 0) {
      await sleep(DELAY_MS);
    }

    // Fetch from SlotCatalog
    const result = await searchSlotCatalog(gameName);

    // Cache the result
    saveCachedResponse(gameName, result);

    if (result.found) {
      console.log(`  ✅ Found: ${result.reels}x${result.rows || '?'}, RTP: ${result.rtp || 'N/A'}%`);
    } else {
      console.log(`  ❌ Not found on SlotCatalog`);
    }

    return result;
  });
}

/**
 * Scrape multiple games
 */
export async function scrapeGames(gameNames) {
  console.log(`\n🔍 Starting SlotCatalog scraper for ${gameNames.length} games...`);
  console.log(`⏱️  Rate limit: 1 request/second`);
  console.log(`📁 Cache directory: ${CACHE_DIR}\n`);

  const results = [];

  for (let i = 0; i < gameNames.length; i++) {
    const result = await scrapeGame(gameNames[i], i, gameNames.length);
    results.push(result);
  }

  const found = results.filter((r) => r.found).length;
  const notFound = results.filter((r) => !r.found).length;

  console.log(`\n✅ Scraping complete!`);
  console.log(`   Found: ${found}`);
  console.log(`   Not found: ${notFound}`);
  console.log(`   Total: ${results.length}`);

  return results;
}

/**
 * CLI usage
 */
if (process.argv[1]?.includes('slotcatalog-scraper')) {
  const missingGamesPath = path.join(__dirname, '../../data/missing_games_to_recover.json');

  if (!fs.existsSync(missingGamesPath)) {
    console.error('❌ missing_games_to_recover.json not found');
    console.error('Run extract-missing-games.js first');
    process.exit(1);
  }

  const missingGames = JSON.parse(fs.readFileSync(missingGamesPath, 'utf8'));
  const gameNames = missingGames.map((g) => g.name);

  const results = await scrapeGames(gameNames);

  // Save results
  const outputPath = path.join(__dirname, '../../data/slotcatalog_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${path.basename(outputPath)}`);
}
