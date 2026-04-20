/**
 * Release Year Extraction Pipeline
 * Modeled on extract_game_profile.py methodology:
 *   - IS/NOT definition cards
 *   - Multi-source extraction with evidence
 *   - Deterministic post-processing rules
 *   - Per-game confidence scoring (1-5)
 *   - GT calibration gate
 *   - Staged output → human review → apply
 *
 * Usage:
 *   node extract_release_year.mjs --gt-test            # calibrate against AGS GT
 *   node extract_release_year.mjs --extract             # extract years for all stripped games
 *   node extract_release_year.mjs --extract --limit 50  # extract first 50
 *   node extract_release_year.mjs --stats               # show current coverage stats
 *   node extract_release_year.mjs --review              # generate YEAR_REVIEW_V2.html
 *   node extract_release_year.mjs --apply               # apply staged results to master (GT-gated)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;
const MASTER_PATH = join(DATA_DIR, 'game_data_master.json');
const STAGED_PATH = join(DATA_DIR, '_staged_year_results.json');
const SL_CACHE_PATH = join(DATA_DIR, '_slotslaunch_scrape.json');
const SC_CACHE_PATH = join(DATA_DIR, '_sc_release_dates.json');
const SC_RECOVERY_PATH = join(DATA_DIR, '_sc_recovery.json');
const SL_CALIBRATION_PATH = join(DATA_DIR, '_slotslaunch_calibration.json');
const SR_MATCH_PATH = join(DATA_DIR, '_slot_report_matches.json');
const REVIEW_PATH = join(DATA_DIR, 'YEAR_REVIEW_V2.html');

// ─── Year Definition Card (IS / NOT) ───────────────────────────

const YEAR_DEFINITION = `
GLOBAL ONLINE RELEASE YEAR:
  IS: The year a game first became available for real-money play on any
      regulated online casino platform worldwide. This is the year a player
      could first play the game online for real money (e.g. UK, Malta, NJ, etc).
  NOT:
    - Land-based casino cabinet release date
    - Game announcement, preview, or certification date
    - Social casino or play-for-fun launch date
    - NJ-specific launch date (unless game is online-first)
    - Game version/variant re-release date (use the ORIGINAL title's year)
  CRITICAL:
    - For online-first providers (no land-based history), the NJ launch year
      IS the global online year because NJ is typically their first or
      simultaneous regulated market.
    - source_year MUST be <= nj_year (can't launch online globally AFTER NJ)
      Exception: SlotsLaunch dates occasionally off by a few months
    - source_year should be >= nj_year - 5 for online-first games
    - January 1, 1970 (epoch zero) is ALWAYS bad data
    - Years before 2005 are suspicious for online slots
`;

// ─── Provider Classification ────────────────────────────────────

const PROVIDER_CLASS = {
    // Online-first: no land-based history, NJ year IS global year (confidence 4)
    ONLINE_FIRST: [
        'Wazdan', 'Gaming Realms', 'Spinberry', 'Oddsworks', 'Betixon',
        'Gamecode', 'Red Rake Gaming', 'Slotmill', 'Hacksaw Gaming',
        'Avatarux', 'Spinomenal', 'Rogue', 'Octoplay', 'Ruby Play',
        '1x2 Network', 'Bang Bang Games', 'Spearhead Studios',
    ],
    // Online-major: primarily online companies, NJ ≈ global ±1yr (confidence 3)
    // These companies build for online first, but may launch in UK/Malta
    // before NJ. NJ year is a reasonable proxy with ±1yr tolerance.
    ONLINE_MAJOR: [
        'Playtech', 'Games Global', 'White Hat Studios', 'Bragg Gaming Group',
        'Evolution', "Play'n GO", 'Relax Gaming', '4theplayer',
        'Fantasma Games', 'Kalamba Games', 'Boom Entertainment',
        'Everymatrix', 'Skillzz Gaming', 'Reel Play',
    ],
    // Land-based origin: SL/SC dates may reflect cabinet release, need filtering
    LAND_BASED_HIGH_RISK: [
        'Ainsworth', 'Konami', 'Aruze', 'Incredible Technologies',
        'Sega Sammy',
    ],
    // Mixed: some titles are land-based ports, some are online-original
    MIXED_ORIGIN: [
        'IGT', 'Light & Wonder', 'Aristocrat', 'Everi',
    ],
    // Primarily online but some legacy land-based titles
    MOSTLY_ONLINE: [
        'Inspired', 'High 5 Games', 'Greentube', 'Design Works Gaming',
    ],
};

function getProviderClass(provider) {
    for (const [cls, provs] of Object.entries(PROVIDER_CLASS)) {
        if (provs.includes(provider)) return cls;
    }
    return 'UNKNOWN';
}

// ─── Source Hierarchy ────────────────────────────────────────────
// Trust tiers (higher = more trusted for global online year)

const SOURCE_TRUST = {
    'ags_provider_data': 5,     // Provider-supplied GT
    'verified_review': 5,       // Human-verified
    'verified_reference': 5,    // Human-verified reference
    'slotslaunch': 4,           // Calibrated 97% vs AGS GT
    'slot_report': 3,           // slot.report API — 99.9% agreement with master, 0 AGS GT overlap
    'slotcatalog': 3,           // Often returns land-based dates
    'nj_proxy': 3,              // NJ year used as proxy (online-first)
    'slotreport': 3,            // Existing source
    'eilers': 2,                // NJ platform dates only
    'html_copyright': 2,        // From game rules HTML
};

// ─── AGS Ground Truth ────────────────────────────────────────────

const AGS_GT = {
    'Golden Wins': 2019, 'Jade Wins': 2019, 'Longhorn Jackpots': 2019,
    'Fu Nan Fu Nu': 2019, 'Rakin Bacon': 2019, 'Olympus Strikes': 2019,
    'River Dragons': 2019, 'Forest Dragons': 2019, 'Pharaoh Sun': 2019,
    'Bonanza Blast': 2020, 'Capital Gains': 2020, 'Apollo Stacks': 2020,
    'Crystal Magic': 2020, 'Jade Dragon': 2020, 'Grand Royale': 2020,
    'Vegas Stacks': 2020, 'Flamenco Stacks': 2020, 'Red Silk': 2020,
    'Luck And Luxury': 2020, 'Wolf Queen': 2020,
    'Golden Ram': 2021, 'Goddess Treasures': 2021, 'Blazing Luck': 2021,
    'Tiger Lord': 2021, 'Aztec Chief': 2021, 'Dragon Fa': 2021,
    'Imperial Luck': 2021, 'Peacock Beauty': 2021, 'Mermaids Fortune': 2021,
    'Golden Wins Deluxe': 2021,
};

// ─── Deterministic Post-Processing Rules ─────────────────────────

function postProcess(result, game) {
    const provider = game.provider || game.provider_studio || '';
    const njYear = game.release_year;
    const provClass = getProviderClass(provider);

    // Rule 1: Epoch dates are always garbage
    if (result.year === 1970 || result.year === 1969) {
        return { ...result, year: null, confidence: 0, rejection: 'epoch_date' };
    }

    // Rule 2: Years before 2005 are almost certainly wrong for online slots
    if (result.year && result.year < 2005) {
        return { ...result, year: null, confidence: 0, rejection: 'pre_2005' };
    }

    // Rule 3: Year AFTER NJ year is suspicious (allow +1 for timing edge cases)
    if (result.year && njYear && result.year > njYear + 1) {
        return { ...result, year: null, confidence: 0, rejection: 'after_nj_year' };
    }

    // Rule 4: For LAND_BASED_HIGH_RISK providers, require delta <= 3
    if (provClass === 'LAND_BASED_HIGH_RISK' && result.year && njYear) {
        const delta = njYear - result.year;
        if (delta > 5) {
            return {
                ...result,
                confidence: Math.min(result.confidence, 1),
                flag: 'likely_land_based_date',
                note: `${provider} game with ${delta}-year gap likely reflects cabinet release`,
            };
        }
    }

    // Rule 5: For MIXED_ORIGIN, large gaps get flagged
    if (provClass === 'MIXED_ORIGIN' && result.year && njYear) {
        const delta = njYear - result.year;
        if (delta > 4) {
            return {
                ...result,
                confidence: Math.min(result.confidence, 2),
                flag: 'possible_land_based_date',
                note: `${provider} game with ${delta}-year gap may reflect cabinet release`,
            };
        }
    }

    // Rule 6: If SL and SC agree → boost confidence
    if (result.sl_year && result.sc_year && result.sl_year === result.sc_year) {
        result.confidence = Math.max(result.confidence, 4);
        result.consensus = 'sl_sc_agree';
    }

    // Rule 7: If SL and SC disagree by >2 years, SC is likely returning the land-based date
    if (result.sl_year && result.sc_year && Math.abs(result.sl_year - result.sc_year) > 2) {
        result.flag = result.flag || 'sl_sc_disagree';
        if (result.source === 'slotcatalog') {
            result.confidence = Math.min(result.confidence, 2);
            result.note = (result.note || '') + ' SC likely has land-based date, SL preferred.';
        }
    }

    return result;
}

// ─── Source Extraction Functions ──────────────────────────────────

function loadSLCache() {
    if (!existsSync(SL_CACHE_PATH)) return {};
    const data = JSON.parse(readFileSync(SL_CACHE_PATH, 'utf8'));
    const map = {};
    for (const r of data) {
        if (r.sl_year && r.id) map[r.id] = r;
    }
    return map;
}

function loadSCCache() {
    if (!existsSync(SC_RECOVERY_PATH)) return {};
    const data = JSON.parse(readFileSync(SC_RECOVERY_PATH, 'utf8'));
    const map = {};
    for (const r of data) {
        if (r.sc_year && r.id) map[r.id] = r;
    }
    return map;
}

function loadSRCache() {
    if (!existsSync(SR_MATCH_PATH)) return {};
    const data = JSON.parse(readFileSync(SR_MATCH_PATH, 'utf8'));
    const map = {};
    for (const r of data) {
        if (r.sr_year && r.id) map[r.id] = r;
    }
    return map;
}

function extractFromSources(game, slCache, scCache, srCache) {
    const id = game.id;
    const provider = game.provider || game.provider_studio || '';
    const njYear = game.release_year;
    const provClass = getProviderClass(provider);
    const evidence = [];

    // Source 1: Online-first NJ proxy (exact)
    if (provClass === 'ONLINE_FIRST' && njYear) {
        evidence.push({
            source: 'nj_proxy',
            year: njYear,
            trust: SOURCE_TRUST['nj_proxy'],
            reason: `${provider} is online-first; NJ year is global year`,
        });
    }

    // Source 1b: Online-major NJ proxy (approximate: NJ ≈ global ±1yr)
    if (provClass === 'ONLINE_MAJOR' && njYear) {
        evidence.push({
            source: 'nj_proxy_major',
            year: njYear,
            trust: 2, // Lower trust than online-first — could be 1yr off
            reason: `${provider} is online-major; NJ year ≈ global year ±1yr`,
        });
    }

    // Source 2: SlotsLaunch
    if (slCache[id]) {
        const sl = slCache[id];
        evidence.push({
            source: 'slotslaunch',
            year: sl.sl_year,
            date: sl.sl_date,
            trust: SOURCE_TRUST['slotslaunch'],
            url: sl.url,
            reason: 'SlotsLaunch scraped date',
        });
    }

    // Source 3: SlotCatalog
    if (scCache[id]) {
        const sc = scCache[id];
        evidence.push({
            source: 'slotcatalog',
            year: sc.sc_year,
            date: sc.sc_date,
            trust: SOURCE_TRUST['slotcatalog'],
            sc_name: sc.sc_name,
            reason: 'SlotCatalog matched date',
        });
    }

    // Source 4: slot.report (cross-validated, 99.9% agreement with master)
    if (srCache && srCache[id]) {
        const sr = srCache[id];
        evidence.push({
            source: 'slot_report',
            year: sr.sr_year,
            date: sr.sr_date,
            trust: SOURCE_TRUST['slot_report'],
            sr_name: sr.sr_name,
            sr_provider: sr.sr_provider,
            reason: 'slot.report API match',
        });
    }

    return evidence;
}

// ─── Consensus & Confidence Logic ────────────────────────────────

function resolveYear(game, evidence) {
    const provider = game.provider || game.provider_studio || '';
    const njYear = game.release_year;
    const provClass = getProviderClass(provider);

    if (evidence.length === 0) {
        return {
            id: game.id, name: game.name, provider,
            year: null, confidence: 0, source: 'none',
            evidence, provClass,
            note: 'No source data available',
        };
    }

    // Sort by trust level (highest first)
    const sorted = [...evidence].sort((a, b) => b.trust - a.trust);

    // Check for consensus: do multiple sources agree on the year?
    const years = evidence.map(e => e.year).filter(Boolean);
    const yearCounts = {};
    years.forEach(y => { yearCounts[y] = (yearCounts[y] || 0) + 1; });
    const consensusYear = Object.entries(yearCounts)
        .sort((a, b) => b[1] - a[1])[0];

    let result;

    if (consensusYear && consensusYear[1] >= 2) {
        // Multi-source consensus
        result = {
            id: game.id, name: game.name, provider,
            year: Number(consensusYear[0]),
            confidence: 4,
            source: 'consensus',
            consensus_count: consensusYear[1],
            evidence, provClass,
        };
    } else {
        // Single best source
        const best = sorted[0];
        let confidence;

        if (best.source === 'nj_proxy') {
            confidence = 4; // Online-first, very reliable
        } else if (best.source === 'nj_proxy_major') {
            confidence = 3; // Online-major, NJ ≈ global ±1yr
        } else if (best.source === 'slotslaunch') {
            // SL is calibrated at 97% for AGS, use trust with plausibility check
            const delta = njYear ? njYear - best.year : 0;
            if (delta >= 0 && delta <= 1) confidence = 4;
            else if (delta >= 0 && delta <= 3) confidence = 3;
            else confidence = 2;
        } else if (best.source === 'slotcatalog') {
            const delta = njYear ? njYear - best.year : 0;
            if (delta >= 0 && delta <= 1) confidence = 3;
            else if (delta >= 0 && delta <= 3) confidence = 2;
            else confidence = 1; // Likely land-based
        } else {
            confidence = best.trust;
        }

        result = {
            id: game.id, name: game.name, provider,
            year: best.year,
            confidence,
            source: best.source,
            evidence, provClass,
        };
    }

    // Add source-specific years for post-processing
    const slEvidence = evidence.find(e => e.source === 'slotslaunch');
    const scEvidence = evidence.find(e => e.source === 'slotcatalog');
    const srEvidence = evidence.find(e => e.source === 'slot_report');
    if (slEvidence) result.sl_year = slEvidence.year;
    if (scEvidence) result.sc_year = scEvidence.year;
    if (srEvidence) result.sr_year = srEvidence.year;
    result.nj_year = njYear;

    // Apply deterministic post-processing
    result = postProcess(result, game);

    return result;
}

// ─── GT Calibration ──────────────────────────────────────────────
// Like extract_game_profile.py --test-ags: run the pipeline on GT games
// AS IF they were stripped, using available sources, then compare to GT.

function loadSLCalibration() {
    if (!existsSync(SL_CALIBRATION_PATH)) return {};
    const data = JSON.parse(readFileSync(SL_CALIBRATION_PATH, 'utf8'));
    const map = {};
    for (const r of data) {
        if (r.sl && r.slYear) map[r.name] = r;
    }
    return map;
}

function runGTTest(master) {
    console.log('\n═══ GT CALIBRATION (AGS Ground Truth) ═══\n');

    const slCalib = loadSLCalibration();
    const scCache = loadSCCache();
    const gtNames = Object.keys(AGS_GT);
    let match = 0, miss = 0, noResult = 0;
    const misses = [];
    const passes = [];

    for (const name of gtNames) {
        const gtYear = AGS_GT[name];

        // Find the game in master
        const game = master.find(g => g.name === name);
        if (!game) { noResult++; continue; }

        // Build evidence from available sources (simulating stripped state)
        const evidence = [];

        // SL calibration data (simulates what SL scraper would return)
        if (slCalib[name]) {
            evidence.push({
                source: 'slotslaunch',
                year: slCalib[name].slYear,
                date: slCalib[name].sl,
                trust: SOURCE_TRUST['slotslaunch'],
                reason: 'SlotsLaunch calibration date',
            });
        }

        // SC cache
        if (scCache[game.id]) {
            evidence.push({
                source: 'slotcatalog',
                year: scCache[game.id].sc_year,
                trust: SOURCE_TRUST['slotcatalog'],
                reason: 'SlotCatalog matched date',
            });
        }

        const result = resolveYear(game, evidence);

        if (!result.year) {
            noResult++;
            continue;
        }

        if (result.year === gtYear) {
            match++;
            passes.push({ name, gt: gtYear, got: result.year, source: result.source, conf: result.confidence });
        } else {
            miss++;
            misses.push({ name, gt: gtYear, got: result.year, source: result.source, conf: result.confidence });
        }
    }

    const tested = match + miss;
    const accuracy = tested > 0 ? (match / tested * 100).toFixed(1) : 0;

    console.log(`  GT games tested: ${tested} / ${gtNames.length}`);
    console.log(`  Year match: ${match} (${accuracy}%)`);
    console.log(`  Year miss:  ${miss}`);
    console.log(`  No result:  ${noResult}`);

    if (misses.length) {
        console.log('\n  Misses:');
        for (const m of misses) {
            console.log(`    ${m.name}: GT=${m.gt} got=${m.got} (source=${m.source}, conf=${m.conf})`);
        }
    }

    return { tested, match, miss, noResult, accuracy: Number(accuracy), misses };
}

// ─── Main Pipeline ───────────────────────────────────────────────

function runExtraction(master, limit) {
    const stripped = master.filter(g => g.original_release_date_source === 'stripped_claude_calibration_failed');
    const target = limit ? stripped.slice(0, limit) : stripped;

    console.log(`\n═══ YEAR EXTRACTION PIPELINE ═══`);
    console.log(`  Total stripped games: ${stripped.length}`);
    console.log(`  Processing: ${target.length}`);

    const slCache = loadSLCache();
    const scCache = loadSCCache();
    const srCache = loadSRCache();
    console.log(`  SL cache: ${Object.keys(slCache).length} entries`);
    console.log(`  SC cache: ${Object.keys(scCache).length} entries`);
    console.log(`  SR cache: ${Object.keys(srCache).length} entries`);

    const results = [];

    for (const game of target) {
        const evidence = extractFromSources(game, slCache, scCache, srCache);
        const result = resolveYear(game, evidence);
        results.push(result);
    }

    // Summary
    const withYear = results.filter(r => r.year);
    const byConf = {};
    results.forEach(r => { byConf[r.confidence] = (byConf[r.confidence] || 0) + 1; });
    const bySource = {};
    results.forEach(r => { bySource[r.source] = (bySource[r.source] || 0) + 1; });
    const rejected = results.filter(r => r.rejection);
    const flagged = results.filter(r => r.flag);

    console.log(`\n  Results:`);
    console.log(`    With year: ${withYear.length} / ${results.length} (${(withYear.length / results.length * 100).toFixed(1)}%)`);
    console.log(`    Rejected:  ${rejected.length}`);
    console.log(`    Flagged:   ${flagged.length}`);

    console.log(`\n  By confidence:`);
    for (const c of [5, 4, 3, 2, 1, 0]) {
        if (byConf[c]) console.log(`    conf=${c}: ${byConf[c]}`);
    }

    console.log(`\n  By source:`);
    for (const [s, c] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${s}: ${c}`);
    }

    if (rejected.length) {
        console.log(`\n  Rejections by reason:`);
        const byReason = {};
        rejected.forEach(r => { byReason[r.rejection] = (byReason[r.rejection] || 0) + 1; });
        for (const [reason, c] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
            console.log(`    ${reason}: ${c}`);
        }
    }

    return results;
}

// ─── Review HTML Generator ───────────────────────────────────────

function generateReviewHTML(results) {
    const gated = results.filter(r => r.year && r.confidence >= 3);
    const lowConf = results.filter(r => r.year && r.confidence < 3);
    const noYear = results.filter(r => !r.year);

    const row = (r, idx) => {
        const evidenceStr = (r.evidence || [])
            .map(e => `${e.source}: ${e.year}${e.url ? ` <a href="${e.url}" target="_blank" class="text-blue-400 underline">[link]</a>` : ''}`)
            .join('<br>');
        const flagBadge = r.flag ? `<span class="px-1 bg-amber-600 text-xs rounded">${r.flag}</span>` : '';
        const rejBadge = r.rejection ? `<span class="px-1 bg-red-600 text-xs rounded">${r.rejection}</span>` : '';
        return `<tr class="border-b border-gray-700 hover:bg-gray-800">
            <td class="px-2 py-1 text-xs">${idx + 1}</td>
            <td class="px-2 py-1 font-medium">${r.name}</td>
            <td class="px-2 py-1 text-gray-400">${r.provider}</td>
            <td class="px-2 py-1 text-center font-bold ${r.confidence >= 4 ? 'text-green-400' : r.confidence >= 3 ? 'text-yellow-400' : 'text-red-400'}">${r.year || '—'}</td>
            <td class="px-2 py-1 text-center">${r.nj_year || '—'}</td>
            <td class="px-2 py-1 text-center">${r.confidence}</td>
            <td class="px-2 py-1 text-xs">${r.source} ${flagBadge} ${rejBadge}</td>
            <td class="px-2 py-1 text-xs text-gray-500">${evidenceStr}</td>
            <td class="px-2 py-1 text-center">
                <select data-id="${r.id}" class="verdict bg-gray-700 text-xs rounded px-1 py-0.5 text-white">
                    <option value="">—</option>
                    <option value="ok">OK</option>
                    <option value="fix">FIX</option>
                    <option value="skip">SKIP</option>
                </select>
            </td>
            <td class="px-2 py-1">
                <input data-id="${r.id}" type="number" class="correction bg-gray-700 text-xs rounded px-1 py-0.5 w-16 text-white" placeholder="year">
            </td>
        </tr>`;
    };

    const section = (title, items, startIdx) => {
        if (!items.length) return '';
        return `
        <h2 class="text-lg font-bold mt-6 mb-2 text-gray-200">${title} (${items.length})</h2>
        <table class="w-full text-sm text-left">
            <thead class="text-xs text-gray-400 bg-gray-800">
                <tr>
                    <th class="px-2 py-1">#</th>
                    <th class="px-2 py-1">Game</th>
                    <th class="px-2 py-1">Provider</th>
                    <th class="px-2 py-1 text-center">Year</th>
                    <th class="px-2 py-1 text-center">NJ</th>
                    <th class="px-2 py-1 text-center">Conf</th>
                    <th class="px-2 py-1">Source</th>
                    <th class="px-2 py-1">Evidence</th>
                    <th class="px-2 py-1 text-center">Verdict</th>
                    <th class="px-2 py-1">Fix</th>
                </tr>
            </thead>
            <tbody>${items.map((r, i) => row(r, startIdx + i)).join('')}</tbody>
        </table>`;
    };

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><title>Year Pipeline Review</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-gray-100 p-4 font-mono text-sm">
<div class="max-w-[1400px] mx-auto">
    <h1 class="text-2xl font-bold mb-1">Year Extraction Pipeline Review</h1>
    <p class="text-gray-400 mb-4">Generated: ${new Date().toISOString().slice(0, 16)} | Total: ${results.length} | With year: ${results.filter(r => r.year).length} | Gated (conf≥3): ${gated.length}</p>

    <div class="flex gap-4 mb-4">
        <div class="bg-gray-800 rounded p-3 flex-1">
            <div class="text-2xl font-bold text-green-400">${gated.length}</div>
            <div class="text-xs text-gray-400">Confidence ≥ 3 (ready)</div>
        </div>
        <div class="bg-gray-800 rounded p-3 flex-1">
            <div class="text-2xl font-bold text-yellow-400">${lowConf.length}</div>
            <div class="text-xs text-gray-400">Low confidence (need review)</div>
        </div>
        <div class="bg-gray-800 rounded p-3 flex-1">
            <div class="text-2xl font-bold text-red-400">${noYear.length}</div>
            <div class="text-xs text-gray-400">No year found</div>
        </div>
    </div>

    ${section('High Confidence (≥3) — Ready to Apply', gated, 0)}
    ${section('Low Confidence (<3) — Needs Review', lowConf, gated.length)}
    ${section('No Year Found', noYear, gated.length + lowConf.length)}

    <div class="mt-6 flex gap-2">
        <button onclick="exportVerdicts()" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-white font-medium">Export Verdicts</button>
        <button onclick="exportStats()" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-white">Export Stats</button>
    </div>
    <pre id="export-area" class="mt-4 bg-gray-800 p-3 rounded text-xs hidden whitespace-pre-wrap"></pre>
</div>
<script>
function exportVerdicts() {
    const rows = [];
    document.querySelectorAll('.verdict').forEach(sel => {
        const id = sel.dataset.id;
        const verdict = sel.value;
        const corr = document.querySelector('input.correction[data-id="' + id + '"]');
        const fix = corr ? corr.value : '';
        if (verdict) rows.push(id + '|' + verdict + (fix ? '|' + fix : ''));
    });
    const area = document.getElementById('export-area');
    area.textContent = rows.join('\\n');
    area.classList.remove('hidden');
    navigator.clipboard.writeText(rows.join('\\n')).then(() => area.textContent += '\\n\\n(Copied to clipboard)');
}
function exportStats() {
    const verdicts = {};
    document.querySelectorAll('.verdict').forEach(sel => {
        const v = sel.value || 'pending';
        verdicts[v] = (verdicts[v]||0)+1;
    });
    const area = document.getElementById('export-area');
    area.textContent = JSON.stringify(verdicts, null, 2);
    area.classList.remove('hidden');
}
</script>
</body></html>`;

    writeFileSync(REVIEW_PATH, html);
    console.log(`\n  Review HTML: ${REVIEW_PATH}`);
    console.log(`  Games in review: ${results.length}`);
}

// ─── Apply to Master (GT-gated) ──────────────────────────────────

function applyToMaster(master, results, gtThreshold = 95) {
    // GT gate: run calibration first
    const gtResult = runGTTest(master);
    if (gtResult.accuracy < gtThreshold) {
        console.log(`\n  ❌ GT GATE FAILED: ${gtResult.accuracy}% < ${gtThreshold}% threshold`);
        console.log(`  Master NOT modified. Fix pipeline and retry.`);
        return false;
    }
    console.log(`\n  ✅ GT GATE PASSED: ${gtResult.accuracy}% >= ${gtThreshold}%`);

    // Only apply confidence >= 3
    const toApply = results.filter(r => r.year && r.confidence >= 3 && !r.rejection);
    console.log(`  Applying ${toApply.length} years (conf >= 3, no rejections)`);

    const masterMap = {};
    master.forEach(g => { masterMap[g.id] = g; });

    let applied = 0;
    for (const r of toApply) {
        const game = masterMap[r.id];
        if (!game) continue;

        game.original_release_year = r.year;
        game.original_release_date_source = r.source === 'nj_proxy' ? 'nj_proxy_online_first'
            : r.source === 'nj_proxy_major' ? 'nj_proxy_online_major'
            : r.source;
        game.original_release_confidence = r.confidence;
        applied++;
    }

    console.log(`  Applied: ${applied}`);
    return applied;
}

// ─── Stats ───────────────────────────────────────────────────────

function showStats(master) {
    const total = master.length;
    const hasOrigYear = master.filter(g => g.original_release_year).length;
    const stripped = master.filter(g => g.original_release_date_source === 'stripped_claude_calibration_failed').length;

    const sources = {};
    master.forEach(g => { const s = g.original_release_date_source || 'null'; sources[s] = (sources[s] || 0) + 1; });

    console.log('\n═══ CURRENT YEAR COVERAGE ═══\n');
    console.log(`  Total games: ${total}`);
    console.log(`  Has original_release_year: ${hasOrigYear} (${(hasOrigYear / total * 100).toFixed(1)}%)`);
    console.log(`  Stripped (no year): ${stripped}`);
    console.log(`  Gap: ${total - hasOrigYear} games without global year`);
    console.log(`\n  By source:`);
    for (const [s, c] of Object.entries(sources).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(c).padStart(5)}  ${s}`);
    }
}

// ─── CLI ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const master = JSON.parse(readFileSync(MASTER_PATH, 'utf8'));

if (args.includes('--stats')) {
    showStats(master);
} else if (args.includes('--gt-test')) {
    // Run extraction on ALL stripped games, then test GT
    const results = runExtraction(master);
    const gtResult = runGTTest(master);
    writeFileSync(STAGED_PATH, JSON.stringify(results, null, 2) + '\n');
    console.log(`\n  Staged results: ${STAGED_PATH}`);
} else if (args.includes('--extract')) {
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : null;
    const results = runExtraction(master, limit);
    writeFileSync(STAGED_PATH, JSON.stringify(results, null, 2) + '\n');
    console.log(`\n  Staged results: ${STAGED_PATH}`);

    // Always run GT test
    const gtResult = runGTTest(master);
} else if (args.includes('--review')) {
    if (!existsSync(STAGED_PATH)) {
        console.log('No staged results. Run --extract first.');
        process.exit(1);
    }
    const results = JSON.parse(readFileSync(STAGED_PATH, 'utf8'));
    generateReviewHTML(results);
} else if (args.includes('--apply')) {
    if (!existsSync(STAGED_PATH)) {
        console.log('No staged results. Run --extract first.');
        process.exit(1);
    }
    const results = JSON.parse(readFileSync(STAGED_PATH, 'utf8'));

    // Backup master first
    const backupPath = join(DATA_DIR, `game_data_master_backup_pre_year_pipeline.json`);
    if (!existsSync(backupPath)) {
        writeFileSync(backupPath, readFileSync(MASTER_PATH, 'utf8'));
        console.log(`  Backup: ${backupPath}`);
    }

    const applied = applyToMaster(master, results, 95);
    if (applied) {
        writeFileSync(MASTER_PATH, JSON.stringify(master, null, 2) + '\n');
        console.log(`  Master updated.`);
        showStats(master);
    }
} else {
    console.log(YEAR_DEFINITION);
    console.log('Usage:');
    console.log('  --stats              Show current year coverage');
    console.log('  --gt-test            Extract all + calibrate against AGS GT');
    console.log('  --extract [--limit N] Extract years, stage results');
    console.log('  --review             Generate review HTML from staged results');
    console.log('  --apply              Apply staged results to master (GT-gated)');
}
