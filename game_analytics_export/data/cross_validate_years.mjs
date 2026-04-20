/**
 * Cross-validate year data across all sources:
 *   - slot.report vs master (existing years)
 *   - slot.report vs SlotsLaunch
 *   - Identify global_year > NJ_year invalids
 *   - Output _slot_report_matches.json for pipeline integration
 *
 * Usage:
 *   node cross_validate_years.mjs                # full cross-validation report
 *   node cross_validate_years.mjs --invalids     # just list global > NJ games
 *   node cross_validate_years.mjs --match-only   # just create SR match file
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;

function norm(s) {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[''´`]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSuffix(s) {
  return s.replace(/\s+(deluxe|hd|online|slot|slots)\s*$/, '').trim();
}

function parseSRYear(g) {
  if (g.year) return g.year;
  const d = g.release_date;
  if (!d) return null;
  let m = d.match(/^(\d{4})/);
  if (m) return parseInt(m[1]);
  m = d.match(/(\d{4})$/);
  if (m) return parseInt(m[1]);
  return null;
}

function parseSRDate(g) {
  const d = g.release_date;
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  let m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = d.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// Provider name normalization map (SR name -> master name)
const SR_TO_MASTER_PROVIDER = {
  'pragmatic play': null, // not in master
  'netent': 'evolution', // NetEnt is under Evolution
  'red tiger': 'evolution', // Red Tiger under Evolution
  'isoftbet': null,
  'endorphina': null,
  'gamomat': null,
  'blueprint gaming': null,
  'elk studios': null,
  'nolimit city': null,
  'booming games': null,
  'quickspin': null,
  'habanero': null,
  'gameart': null,
  'thunderkick': null,
  'betsoft': null,
  'big time gaming': null,
  'push gaming': null,
  'yggdrasil gaming': null,
  // Games Global sub-studios
  'triple edge studios': 'games global',
  'foxium': 'games global',
  'just for the win': 'games global',
  'stormcraft studios': 'games global',
  'gameburger studios': 'games global',
  'pearfiction studios': 'games global',
  'slingshot studios': 'games global',
  'all for one studios': 'games global',
  'fortune factory studios': 'games global',
  'alchemy gaming': 'games global',
  'gold coin studios': 'games global',
  'switch studios': 'games global',
  'neon valley studios': 'games global',
  'snowborn games': 'games global',
  'northern lights gaming': 'games global',
  'aurum signature studios': 'games global',
  'iron dog studio': 'games global',
  'reelplay': 'reel play',
};

function matchProviders(masterProv, srProv) {
  const mn = norm(masterProv);
  const sn = norm(srProv);
  if (mn === sn) return true;
  const mapped = SR_TO_MASTER_PROVIDER[sn];
  if (mapped && norm(mapped) === mn) return true;
  if (mn && sn && (sn.includes(mn.split(' ')[0]) || mn.includes(sn.split(' ')[0]))) return true;
  return false;
}

// ─── Main ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const master = JSON.parse(readFileSync(join(DATA_DIR, 'game_data_master.json'), 'utf8'));
const sr = JSON.parse(readFileSync(join(DATA_DIR, '_slot_report_data.json'), 'utf8'));

// Build SR lookup by normalized name
const srByNorm = new Map();
for (const g of sr.results) {
  if (!g.name) continue;
  const yr = parseSRYear(g);
  if (!yr) continue;
  const n = norm(g.name);
  if (!srByNorm.has(n)) srByNorm.set(n, []);
  srByNorm.get(n).push({ ...g, parsedYear: yr, parsedDate: parseSRDate(g) });
}

// Also build suffix-stripped lookup
const srByStripped = new Map();
for (const [n, games] of srByNorm) {
  const s = stripSuffix(n);
  if (s !== n && !srByStripped.has(s)) srByStripped.set(s, games);
}

console.log(`slot.report: ${sr.results.length} total, ${srByNorm.size} unique names with years`);

// ─── Match master games to slot.report ─────────────────────────

const matches = [];
const masterById = new Map();
master.forEach(g => masterById.set(g.id, g));

for (const game of master) {
  const n = norm(game.name || '');
  if (!n) continue;

  let candidates = srByNorm.get(n) || srByStripped.get(stripSuffix(n));
  if (!candidates) continue;

  // Pick best by provider match
  let best = candidates[0];
  let provMatch = false;
  for (const c of candidates) {
    if (matchProviders(game.provider || '', c.provider || '')) {
      best = c;
      provMatch = true;
      break;
    }
  }

  matches.push({
    id: game.id,
    name: game.name,
    provider: game.provider,
    nj_year: game.release_year,
    existing_year: game.original_release_year || null,
    existing_source: game.original_release_date_source || null,
    sr_year: best.parsedYear,
    sr_date: best.parsedDate || best.release_date,
    sr_provider: best.provider,
    sr_name: best.name,
    provider_match: provMatch,
  });
}

// Write matches file
const matchPath = join(DATA_DIR, '_slot_report_matches.json');
writeFileSync(matchPath, JSON.stringify(matches, null, 2) + '\n');
console.log(`\nMatches written: ${matchPath} (${matches.length} games)`);

if (args.includes('--match-only')) process.exit(0);

// ─── Cross-validation: SR vs existing master years ─────────────

const withExisting = matches.filter(m => m.existing_year && m.existing_year > 0);
const stripped = matches.filter(m => !m.existing_year || m.existing_year <= 0);
let exact = 0, off1 = 0, off2 = 0, offBig = 0;
const bigDisagreements = [];

for (const m of withExisting) {
  const diff = Math.abs(m.existing_year - m.sr_year);
  if (diff === 0) exact++;
  else if (diff === 1) off1++;
  else if (diff === 2) off2++;
  else {
    offBig++;
    if (bigDisagreements.length < 20) {
      bigDisagreements.push({
        name: m.name, prov: m.provider, src: m.existing_source,
        masterYr: m.existing_year, srYr: m.sr_year, srProv: m.sr_provider,
        diff,
      });
    }
  }
}

console.log('\n═══ CROSS-VALIDATION: slot.report vs existing master years ═══');
console.log(`  Matched with existing year: ${withExisting.length}`);
console.log(`  Exact match:     ${exact} (${(exact / withExisting.length * 100).toFixed(1)}%)`);
console.log(`  Off by 1 year:   ${off1}`);
console.log(`  Off by 2 years:  ${off2}`);
console.log(`  Off by 3+ years: ${offBig}`);
console.log(`  Stripped matched: ${stripped.length} (new years available)`);

if (bigDisagreements.length) {
  console.log('\n  Big disagreements (3+ years):');
  for (const d of bigDisagreements) {
    console.log(`    ${d.name} (${d.prov}): master=${d.masterYr} [${d.src}] vs SR=${d.srYr} [${d.srProv}] (diff=${d.diff})`);
  }
}

// ─── Cross-validation: SR vs SlotsLaunch ───────────────────────

if (existsSync(join(DATA_DIR, '_slotslaunch_scrape.json'))) {
  const slData = JSON.parse(readFileSync(join(DATA_DIR, '_slotslaunch_scrape.json'), 'utf8'));
  const slById = new Map();
  for (const r of slData) { if (r.sl_year && r.id) slById.set(r.id, r); }

  let slSrBoth = 0, slSrAgree = 0, slSrOff1 = 0, slSrDisagree = 0;
  const slSrDisagreements = [];

  for (const m of matches) {
    const sl = slById.get(m.id);
    if (!sl) continue;
    slSrBoth++;
    const diff = Math.abs(sl.sl_year - m.sr_year);
    if (diff === 0) slSrAgree++;
    else if (diff === 1) slSrOff1++;
    else {
      slSrDisagree++;
      if (slSrDisagreements.length < 10) {
        slSrDisagreements.push({
          name: m.name, prov: m.provider,
          slYr: sl.sl_year, srYr: m.sr_year, diff,
        });
      }
    }
  }

  if (slSrBoth > 0) {
    console.log('\n═══ CROSS-VALIDATION: slot.report vs SlotsLaunch ═══');
    console.log(`  Both sources: ${slSrBoth}`);
    console.log(`  Agree:        ${slSrAgree} (${(slSrAgree / slSrBoth * 100).toFixed(1)}%)`);
    console.log(`  Off by 1:     ${slSrOff1}`);
    console.log(`  Disagree:     ${slSrDisagree}`);
    if (slSrDisagreements.length) {
      console.log('  Disagreements:');
      for (const d of slSrDisagreements) {
        console.log(`    ${d.name} (${d.prov}): SL=${d.slYr} vs SR=${d.srYr} (diff=${d.diff})`);
      }
    }
  }
}

// ─── Cross-validation: SR vs SlotCatalog ───────────────────────

if (existsSync(join(DATA_DIR, '_sc_recovery.json'))) {
  const scData = JSON.parse(readFileSync(join(DATA_DIR, '_sc_recovery.json'), 'utf8'));
  const scById = new Map();
  for (const r of scData) { if (r.sc_year && r.id) scById.set(r.id, r); }

  let scSrBoth = 0, scSrAgree = 0, scSrOff1 = 0, scSrDisagree = 0;

  for (const m of matches) {
    const sc = scById.get(m.id);
    if (!sc) continue;
    scSrBoth++;
    const diff = Math.abs(sc.sc_year - m.sr_year);
    if (diff === 0) scSrAgree++;
    else if (diff === 1) scSrOff1++;
    else scSrDisagree++;
  }

  if (scSrBoth > 0) {
    console.log('\n═══ CROSS-VALIDATION: slot.report vs SlotCatalog ═══');
    console.log(`  Both sources: ${scSrBoth}`);
    console.log(`  Agree:        ${scSrAgree} (${(scSrAgree / scSrBoth * 100).toFixed(1)}%)`);
    console.log(`  Off by 1:     ${scSrOff1}`);
    console.log(`  Disagree:     ${scSrDisagree}`);
  }
}

// ─── Invalid games: global_year > NJ_year ──────────────────────

const invalids = master.filter(g =>
  g.original_release_year && g.release_year &&
  g.original_release_year > g.release_year
);

console.log('\n═══ INVALID GAMES: global_year > NJ_year ═══');
console.log(`  Count: ${invalids.length}`);

if (invalids.length) {
  console.log('\n  ID | Name | Provider | Global | NJ | Source | Delta');
  console.log('  ' + '-'.repeat(90));
  for (const g of invalids.sort((a, b) => (b.original_release_year - b.release_year) - (a.original_release_year - a.release_year))) {
    const delta = g.original_release_year - g.release_year;
    const srMatch = matches.find(m => m.id === g.id);
    const srInfo = srMatch ? ` | SR=${srMatch.sr_year}` : '';
    console.log(`  ${g.id} | ${g.name} | ${g.provider} | ${g.original_release_year} | ${g.release_year} | ${g.original_release_date_source} | +${delta}${srInfo}`);
  }
}

// ─── Provider-level agreement summary ──────────────────────────

const provStats = {};
for (const m of withExisting) {
  const p = m.provider;
  if (!provStats[p]) provStats[p] = { total: 0, exact: 0, off1: 0, big: 0 };
  provStats[p].total++;
  const diff = Math.abs(m.existing_year - m.sr_year);
  if (diff === 0) provStats[p].exact++;
  else if (diff === 1) provStats[p].off1++;
  else provStats[p].big++;
}

const provSorted = Object.entries(provStats)
  .filter(([, s]) => s.total >= 3)
  .sort((a, b) => b[1].total - a[1].total);

if (provSorted.length) {
  console.log('\n═══ PROVIDER-LEVEL AGREEMENT (SR vs master, ≥3 matches) ═══');
  console.log('  Provider | Count | Exact% | Off1 | Big');
  console.log('  ' + '-'.repeat(60));
  for (const [p, s] of provSorted) {
    console.log(`  ${p.padEnd(25)} | ${String(s.total).padStart(3)} | ${(s.exact / s.total * 100).toFixed(0).padStart(4)}% | ${String(s.off1).padStart(3)} | ${s.big}`);
  }
}

// ─── Summary ───────────────────────────────────────────────────

console.log('\n═══ SUMMARY ═══');
console.log(`  Total master games: ${master.length}`);
console.log(`  Matched to slot.report: ${matches.length} (${(matches.length / master.length * 100).toFixed(1)}%)`);
console.log(`  New years for stripped games: ${stripped.length}`);
console.log(`  Existing years validated: ${withExisting.length}`);
console.log(`  Agreement rate (exact): ${(exact / withExisting.length * 100).toFixed(1)}%`);
console.log(`  Agreement rate (±1yr): ${((exact + off1) / withExisting.length * 100).toFixed(1)}%`);
console.log(`  Invalid (global > NJ): ${invalids.length}`);
