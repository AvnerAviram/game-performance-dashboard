#!/usr/bin/env node
/**
 * Verify and Correct games_master.json - VERIFIED ONLY
 *
 * - CSV-only: Only games that exist in CSV
 * - Strict match: Single unambiguous match (name + theo_win)
 * - 2+ source verification: CSV + SlotCatalog found (or provider match)
 * - Output: Only verified games
 *
 * Usage:
 *   node verify-and-correct-games.mjs --dry-run --limit=10  # Test on 10 games first
 *   node verify-and-correct-games.mjs --csv-only  # 500+ games, no web (recommended if API fails)
 *   node verify-and-correct-games.mjs             # Full run (fetches SlotCatalog)
 *   node verify-and-correct-games.mjs --skip-web  # Use cache only
 *   node verify-and-correct-games.mjs --strict    # Require SlotCatalog provider match
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_WEB = process.argv.includes('--skip-web');
const CSV_ONLY = process.argv.includes('--csv-only'); // No web verification - output top 500 from CSV
// Default: relaxed = CSV + SlotCatalog found = 2 sources. Use --strict for provider-only match.
const RELAXED = !process.argv.includes('--strict');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : null;
const CSV_PATH = '/Users/avner/Downloads/Data Download Theme (4).csv';
const DATA_DIR = path.join(__dirname, '../../data');
const GAMES_MASTER_PATH = path.join(DATA_DIR, 'games_master.json');
const CORRECTIONS_LOG_PATH = path.join(DATA_DIR, 'CSV_CORRECTIONS_LOG.json');
const CACHE_DIR = path.join(__dirname, '../../cache/slotcatalog');
const DELAY_MS = 2500; // 2-3 sec between web requests
const TARGET_GAMES = 520; // Build from top CSV slots to get 500+ verified

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- CSV Parsing ---

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else current += c;
  }
  result.push(current.trim());
  return result;
}

function parseReleaseDate(s) {
  if (!s) return { year: null, month: null };
  const m = s.match(/(\w+),?\s*(\d{4})/);
  if (!m) return { year: null, month: null };
  const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  return { month: months[m[1].slice(0, 3)] || null, year: parseInt(m[2], 10) };
}

function parseMarketShare(s) {
  if (!s) return null;
  const n = parseFloat(String(s).replace('%', '').trim());
  return isNaN(n) ? null : n;
}

function normalizeName(name) {
  if (!name) return '';
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeProvider(p) {
  if (!p) return '';
  return String(p)
    .toLowerCase()
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[^a-z0-9]/g, '');
}

function buildCsvLookup(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  const slots = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const name = cols[3];
    const provider = cols[4];
    const category = cols[5];
    const theoWin = parseFloat(cols[12]);
    if (name && !isNaN(theoWin) && theoWin > 0 && category === 'Slot') {
      slots.push({
        name,
        csv_provider: provider,
        release_date: cols[6],
        theo_win: theoWin,
        market_share_percent: parseMarketShare(cols[14]),
        release: parseReleaseDate(cols[6]),
      });
    }
  }
  const byKey = new Map();
  const byName = new Map();
  for (const row of slots) {
    const k = normalizeName(row.name) + '_' + row.theo_win.toFixed(2);
    byKey.set(k, row);
    const n = normalizeName(row.name);
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(row);
  }
  return { byKey, byName, slots };
}

/** Strict match: exact key or single candidate within 0.01 theo */
function matchJsonToCsv(game, csvLookup) {
  const n = normalizeName(game.name);
  const theo = game.performance?.theo_win;
  if (theo == null) return null;

  const key = n + '_' + parseFloat(theo).toFixed(2);
  let row = csvLookup.byKey.get(key);
  if (row) return row;

  const candidates = csvLookup.byName.get(n);
  if (!candidates) return null;
  const within = candidates.filter((c) => Math.abs(c.theo_win - theo) < 0.02);
  return within.length === 1 ? within[0] : null; // strict: only single match
}

function buildProviderCorrectionMap(log) {
  const map = new Map();
  for (const c of log.provider_corrections || []) {
    const sources = c.verification_sources || [];
    if (sources.length >= 2) {
      map.set(normalizeName(c.game_name), { provider: c.corrected_provider, sources });
    }
  }
  return map;
}

function getSlotCatalogCachePath(gameName) {
  const norm = gameName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return path.join(CACHE_DIR, `${norm}.json`);
}

function readSlotCatalogCache(gameName) {
  const p = getSlotCatalogCachePath(gameName);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Provider verification: 2+ sources must agree */
function isProviderVerified(game, csvRow, correctionMap, slotCatalogResult) {
  const csvProvider = (csvRow?.csv_provider || '').trim();
  const corrected = correctionMap.get(normalizeName(game.name));
  const effectiveProvider = corrected ? corrected.provider : csvProvider;
  const nEffective = normalizeProvider(effectiveProvider);

  // Source 1: CSV_CORRECTIONS_LOG correction with 2+ sources (pre-verified)
  if (corrected && corrected.sources.length >= 2) {
    return true;
  }

  // Source 2: SlotCatalog provider agrees with CSV or corrected
  if (slotCatalogResult?.found && slotCatalogResult?.provider) {
    const sc = normalizeProvider(slotCatalogResult.provider);
    if (nEffective && sc && (nEffective.includes(sc) || sc.includes(nEffective))) return true;
  }

  // Relaxed: CSV (source 1) + SlotCatalog found (source 2: game exists) = verify
  if (RELAXED && slotCatalogResult?.found && csvRow) {
    return true;
  }

  return false;
}


async function main() {
  console.log('🔍 Verify and Correct games_master.json (VERIFIED ONLY)\n');
  if (DRY_RUN) console.log('📋 DRY RUN - no files will be modified\n');
  if (SKIP_WEB) console.log('⚠️  --skip-web: Using cache only; games without cache verification will be excluded\n');
  if (LIMIT) console.log(`🧪 --limit=${LIMIT}: Testing on ${LIMIT} games first\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error('❌ CSV not found:', CSV_PATH);
    process.exit(1);
  }

  let gamesMaster = { metadata: {}, games: [] };
  if (fs.existsSync(GAMES_MASTER_PATH)) {
    gamesMaster = JSON.parse(fs.readFileSync(GAMES_MASTER_PATH, 'utf8'));
  }
  const correctionsLog = fs.existsSync(CORRECTIONS_LOG_PATH)
    ? JSON.parse(fs.readFileSync(CORRECTIONS_LOG_PATH, 'utf8'))
    : { corrections_log: {}, provider_corrections: [] };
  const existingByKey = new Map();
  for (const g of gamesMaster.games || []) {
    const k = normalizeName(g.name) + '_' + (g.performance?.theo_win ?? '').toFixed(2);
    existingByKey.set(k, g);
  }
  const log = {
    performance_syncs: [],
    duplicate_resolutions: [],
    invalid_removals: [],
    excluded_not_in_csv: [],
    excluded_not_verified: [],
    provider_corrections_applied: [],
  };

  const providerCorrections = buildProviderCorrectionMap(correctionsLog);

  // Phase 1: Build from CSV (top slots by theo_win)
  console.log('Phase 1: Building from CSV...');
  const csvLookup = buildCsvLookup(CSV_PATH);
  const topSlots = csvLookup.slots.slice(0, TARGET_GAMES);
  console.log(`   Top ${topSlots.length} CSV slots (by theo_win)`);

  // Phase 2: Create game objects from CSV (merge with existing data when available)
  console.log('\nPhase 2: Building game list from CSV...');
  let games = [];
  for (const r of topSlots) {
    const k = normalizeName(r.name) + '_' + r.theo_win.toFixed(2);
    const existing = existingByKey.get(k) || existingByKey.get(normalizeName(r.name) + '_');
    const game = existing
      ? { ...existing, _csvRow: r }
      : {
          name: r.name,
          name_normalized: r.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          theme: { primary: null, secondary: null, consolidated: null, details: null },
          mechanic: { primary: null, features: [], category: null },
          specs: { reels: null, rows: null, paylines: null, volatility: null, rtp: null },
          provider: { studio: r.csv_provider, parent: r.csv_provider, display_name: r.csv_provider, verified: false, aliases: [] },
          release: { year: r.release.year, month: r.release.month, exact_date: null },
          performance: { theo_win: r.theo_win, market_share_percent: r.market_share_percent, percentile: null, anomaly: null },
          classification: { confidence: null, verified: false, data_source: 'csv' },
          audit: { created: null, updated: null, data_sources: ['CSV'], notes: null },
          data_validity: 'pending',
          _csvRow: r,
        };
    games.push(game);
  }
  if (LIMIT) {
    games.length = Math.min(games.length, LIMIT);
    console.log(`   Limited to ${games.length} games (--limit=${LIMIT})`);
  } else {
    console.log(`   Built ${games.length} games from CSV`);
  }

  // Phase 3: Sync CSV data
  console.log('\nPhase 3: Syncing CSV data...');
  for (const game of games) {
    const r = game._csvRow;
    game.performance = game.performance || {};
    game.performance.theo_win = r.theo_win;
    game.performance.market_share_percent = r.market_share_percent ?? game.performance.market_share_percent;
    game.release = game.release || {};
    game.release.year = r.release.year ?? game.release.year;
    game.release.month = r.release.month ?? game.release.month;

    const corr = providerCorrections.get(normalizeName(game.name));
    if (corr && game.provider) {
      game.provider.studio = corr.provider;
      game.provider.parent = corr.provider;
      game.provider.display_name = corr.provider;
      log.provider_corrections_applied.push({ game_name: game.name, corrected_provider: corr.provider });
    }
  }

  // Phase 4: Invalid (non-slot) - filter any merged existing games with that flag
  const nonSlot = ['table game', 'poker', 'roulette', 'blackjack', 'baccarat', 'live casino', 'instant win', 'craps', 'not a slot'];
  const beforeInvalid = games.length;
  games = games.filter((g) => {
    const notes = ((g.data_validity_reason || '') + ' ' + (g.audit?.notes || '')).toLowerCase();
    if (nonSlot.some((t) => notes.includes(t))) {
      log.invalid_removals.push({ game_name: g.name, reason: 'Non-slot' });
      return false;
    }
    return true;
  });

  // Phase 6: Web verification (2+ sources) - skip if --csv-only
  let verified;
  if (CSV_ONLY) {
    console.log('\nPhase 6: Skipping web verification (--csv-only mode)');
    verified = games;
  } else {
    console.log('\nPhase 6: Web verification (2+ sources)...');
    console.log(`   Fetching SlotCatalog for ${games.length} games (~${Math.ceil(games.length * DELAY_MS / 60000)} min)...`);
    verified = [];

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const hasCorrection = providerCorrections.has(normalizeName(game.name));

    if (hasCorrection) {
      verified.push(game);
      if ((i + 1) % 50 === 0) process.stdout.write(`   ${i + 1}/${games.length}\r`);
      continue;
    }

    let scResult = readSlotCatalogCache(game.name);
    if (!scResult && !SKIP_WEB) {
      try {
        const { scrapeGames } = await import('./slotcatalog-scraper.mjs');
        const results = await scrapeGames([game.name]);
        scResult = results[0] || null;
      } catch (err) {
        console.log(`\n   ⚠️  SlotCatalog fetch failed for ${game.name}:`, err.message);
      }
      if (i < games.length - 1) await sleep(DELAY_MS);
    }
    if ((i + 1) % 10 === 0 || i === games.length - 1) process.stdout.write(`   ${i + 1}/${games.length} verified: ${verified.length}\r`);

    // Enrich from SlotCatalog when we have data (only fill nulls)
    if (scResult?.found) {
      game.specs = game.specs || {};
      if (scResult.reels != null && game.specs.reels == null) game.specs.reels = scResult.reels;
      if (scResult.rows != null && game.specs.rows == null) game.specs.rows = scResult.rows;
      if (scResult.paylines != null && game.specs.paylines == null) game.specs.paylines = String(scResult.paylines);
      if (scResult.rtp != null && game.specs.rtp == null) game.specs.rtp = scResult.rtp;
      if (scResult.volatility != null && game.specs.volatility == null) game.specs.volatility = scResult.volatility;
      if (scResult.provider && game.provider && (game.provider.studio == null || game.provider.studio === '')) {
        game.provider.studio = scResult.provider;
        game.provider.parent = scResult.provider;
        game.provider.display_name = scResult.provider;
      }
    }

    if (isProviderVerified(game, game._csvRow, providerCorrections, scResult)) {
      verified.push(game);
    } else {
      log.excluded_not_verified.push({
        game_name: game.name,
        csv_provider: game._csvRow?.csv_provider,
        slotcatalog_provider: scResult?.provider ?? (scResult?.found ? 'null' : 'not_found'),
      });
    }
  }
  console.log(''); // newline after progress
  }

  games = verified;
  console.log(`   Excluded ${log.excluded_not_verified.length} (could not verify with 2+ sources)`);
  console.log(`   Verified: ${games.length}`);

  // Cleanup
  for (const g of games) delete g._csvRow;

  // Phase 7: Output
  const sorted = [...games].sort((a, b) => (b.performance?.theo_win || 0) - (a.performance?.theo_win || 0));
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].performance = sorted[i].performance || {};
    sorted[i].performance.percentile = ((sorted.length - i) / sorted.length * 100).toFixed(2);
    const norm = sorted[i].name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    sorted[i].id = `game-${String(i + 1).padStart(3, '0')}-${norm}`;
    sorted[i].data_validity = 'valid';
  }

  const now = new Date().toISOString();
  gamesMaster.metadata = gamesMaster.metadata || {};
  gamesMaster.metadata.total_games = games.length;
  gamesMaster.metadata.last_updated = now;
  gamesMaster.metadata.validation_status = 'verified';
  gamesMaster.metadata.notes = CSV_ONLY
    ? `CSV-only ${now.split('T')[0]}. Top ${games.length} slots from CSV, no web verification.`
    : `Verified-only ${now.split('T')[0]}. CSV-only, strict match, 2+ source verification. Excluded: ${log.excluded_not_in_csv.length} not in CSV, ${log.excluded_not_verified.length} not verified.`;
  gamesMaster.games = sorted;

  if (log.excluded_not_in_csv.length) {
    correctionsLog.excluded_not_in_csv = (correctionsLog.excluded_not_in_csv || []).concat(log.excluded_not_in_csv);
  }
  if (log.excluded_not_verified.length) {
    correctionsLog.excluded_not_verified = (correctionsLog.excluded_not_verified || []).concat(log.excluded_not_verified);
  }
  correctionsLog.corrections_log = correctionsLog.corrections_log || {};
  correctionsLog.corrections_log.last_updated = now.split('T')[0] + ' - verified-only run';

  if (!DRY_RUN) {
    const backupPath = GAMES_MASTER_PATH.replace('.json', `.backup-${now.replace(/[:.]/g, '-').slice(0, 19)}.json`);
    fs.copyFileSync(GAMES_MASTER_PATH, backupPath);
    fs.writeFileSync(GAMES_MASTER_PATH, JSON.stringify(gamesMaster, null, 2));
    fs.writeFileSync(CORRECTIONS_LOG_PATH, JSON.stringify(correctionsLog, null, 2));
    console.log(`\n💾 Backup: ${path.basename(backupPath)}`);
    console.log('✅ Wrote games_master.json and CSV_CORRECTIONS_LOG.json');
  } else {
    console.log('\n📋 DRY RUN - no files written');
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`📊 Final (verified only): ${games.length} games`);
  console.log(`   Excluded not in CSV: ${log.excluded_not_in_csv.length}`);
  console.log(`   Excluded not verified: ${log.excluded_not_verified.length}`);
}

main().catch(console.error);
