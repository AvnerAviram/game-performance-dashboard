#!/usr/bin/env node
/**
 * calibrate_all_sources.mjs
 * Tests all year data sources against expanded ground truth (61 games, 6 providers).
 * Outputs per-source accuracy, per-provider breakdown, and updates source_calibration.json.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = __dirname;

const gt = JSON.parse(readFileSync(resolve(DATA, 'year_pipeline/ground_truth.json'), 'utf8'));
const master = JSON.parse(readFileSync(resolve(DATA, 'game_data_master.json'), 'utf8'));

const gtGames = Object.entries(gt.games).filter(([, g]) => g.master_id);
console.log(`Ground truth: ${gtGames.length} games with master_id\n`);

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function calibrateSource(sourceName, lookupFn) {
    const results = { found: 0, notFound: 0, correct: 0, wrong: 0, misses: [], byProvider: {} };

    for (const [name, gtEntry] of gtGames) {
        const provider = gtEntry.provider || 'AGS';
        if (!results.byProvider[provider]) {
            results.byProvider[provider] = { found: 0, correct: 0, wrong: 0, total: 0 };
        }
        results.byProvider[provider].total++;

        const sourceYear = lookupFn(name, gtEntry);
        if (sourceYear === null) {
            results.notFound++;
            continue;
        }

        results.found++;
        results.byProvider[provider].found++;

        if (sourceYear === gtEntry.year) {
            results.correct++;
            results.byProvider[provider].correct++;
        } else {
            results.wrong++;
            results.byProvider[provider].wrong++;
            results.misses.push({
                name,
                provider,
                gt_year: gtEntry.year,
                source_year: sourceYear,
                delta: sourceYear - gtEntry.year,
            });
        }
    }

    results.accuracy = results.found > 0 ? ((results.correct / results.found) * 100).toFixed(1) : 'N/A';
    return results;
}

// --- Source 1: SlotsLaunch scrape ---
console.log('=== SlotsLaunch Scrape ===');
const slData = JSON.parse(readFileSync(resolve(DATA, '_slotslaunch_scrape.json'), 'utf8'));
const slBySlug = {};
const slByExactName = {};
for (const entry of slData) {
    if (entry.sl_year) {
        slBySlug[slugify(entry.name)] = entry;
        slByExactName[entry.name.toLowerCase()] = entry;
    }
}

const slResults = calibrateSource('slotslaunch', (name, gtEntry) => {
    const lower = name.toLowerCase();
    if (slByExactName[lower]) return slByExactName[lower].sl_year;
    const slug = slugify(name);
    if (slBySlug[slug]) return slBySlug[slug].sl_year;
    const alts = [slug.replace(/-ii$/, '-2'), slug.replace(/-ii-/, '-2-')];
    for (const alt of alts) {
        if (slBySlug[alt]) return slBySlug[alt].sl_year;
    }
    return null;
});
console.log(`  Found: ${slResults.found}/${gtGames.length} | Correct: ${slResults.correct} | Wrong: ${slResults.wrong} | Accuracy: ${slResults.accuracy}%`);
if (slResults.misses.length) {
    console.log('  Misses:');
    slResults.misses.forEach(m => console.log(`    ${m.name} (${m.provider}): GT=${m.gt_year} SL=${m.source_year} Δ=${m.delta}`));
}
console.log('  By provider:');
for (const [p, r] of Object.entries(slResults.byProvider)) {
    if (r.found > 0) console.log(`    ${p}: ${r.found}/${r.total} found, ${r.correct}/${r.found} correct (${((r.correct/r.found)*100).toFixed(0)}%)`);
    else console.log(`    ${p}: 0/${r.total} found`);
}

// --- Source 2: SlotCatalog cache ---
console.log('\n=== SlotCatalog Cache ===');
const scData = JSON.parse(readFileSync(resolve(DATA, '_sc_release_dates.json'), 'utf8'));
const scBySlug = {};
for (const [key, val] of Object.entries(scData)) {
    if (val.release_date) {
        const year = parseInt(val.release_date.substring(0, 4), 10);
        if (year > 1970) scBySlug[key] = year;
    }
}

const scResults = calibrateSource('slotcatalog', (name, gtEntry) => {
    const slug = slugify(name);
    if (scBySlug[slug] !== undefined) return scBySlug[slug];
    const alts = [
        slug.replace(/-ii$/, '-2'),
        slug.replace(/-ii-/, '-2-'),
        slug.replace(/gonzos/, "gonzo-s"),
    ];
    for (const alt of alts) {
        if (scBySlug[alt] !== undefined) return scBySlug[alt];
    }
    return null;
});
console.log(`  Found: ${scResults.found}/${gtGames.length} | Correct: ${scResults.correct} | Wrong: ${scResults.wrong} | Accuracy: ${scResults.accuracy}%`);
if (scResults.misses.length) {
    console.log('  Misses:');
    scResults.misses.forEach(m => console.log(`    ${m.name} (${m.provider}): GT=${m.gt_year} SC=${m.source_year} Δ=${m.delta}`));
}
console.log('  By provider:');
for (const [p, r] of Object.entries(scResults.byProvider)) {
    if (r.found > 0) console.log(`    ${p}: ${r.found}/${r.total} found, ${r.correct}/${r.found} correct (${((r.correct/r.found)*100).toFixed(0)}%)`);
    else console.log(`    ${p}: 0/${r.total} found`);
}

// --- Source 3: slot.report ---
console.log('\n=== slot.report ===');
const srRaw = JSON.parse(readFileSync(resolve(DATA, '_slot_report_data.json'), 'utf8'));
const srGames = srRaw.results || srRaw;
const srBySlug = {};
const srByExactName = {};
for (const g of srGames) {
    if (!g.release_date && !g.year) continue;
    let year = g.year;
    if (!year && g.release_date) {
        // Handle both YYYY-MM-DD and DD-MM-YYYY formats
        const d = g.release_date;
        if (/^\d{4}-/.test(d)) {
            year = parseInt(d.substring(0, 4), 10);
        } else if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
            year = parseInt(d.substring(6, 10), 10);
        }
    }
    if (!year || year < 2000) continue;
    const slug = slugify(g.name);
    srBySlug[slug] = year;
    srByExactName[g.name.toLowerCase()] = year;
}

const srResults = calibrateSource('slotreport', (name, gtEntry) => {
    const slug = slugify(name);
    // Exact slug match
    if (srBySlug[slug] !== undefined) return srBySlug[slug];
    // Try lowercase exact name
    const lower = name.toLowerCase();
    if (srByExactName[lower] !== undefined) return srByExactName[lower];
    // Handle "II" -> "2" and "Gonzos" -> "gonzo-s"
    const altNames = [
        slug.replace(/-ii$/, '-2'),
        slug.replace(/-ii-/, '-2-'),
        slug + 's',
        slug.replace(/s$/, ''),
    ];
    for (const alt of altNames) {
        if (srBySlug[alt] !== undefined) return srBySlug[alt];
    }
    // Try prefix match (handle "Rich Wilde and the Book of Dead" matching "book-of-dead")
    for (const [key, year] of Object.entries(srBySlug)) {
        if (key.includes(slug) && !key.includes(slug + '-go-collect') && !key.includes(slug + '-mega-moolah')) {
            return year;
        }
    }
    return null;
});
console.log(`  Found: ${srResults.found}/${gtGames.length} | Correct: ${srResults.correct} | Wrong: ${srResults.wrong} | Accuracy: ${srResults.accuracy}%`);
if (srResults.misses.length) {
    console.log('  Misses:');
    srResults.misses.forEach(m => console.log(`    ${m.name} (${m.provider}): GT=${m.gt_year} SR=${m.source_year} Δ=${m.delta}`));
}
console.log('  By provider:');
for (const [p, r] of Object.entries(srResults.byProvider)) {
    if (r.found > 0) console.log(`    ${p}: ${r.found}/${r.total} found, ${r.correct}/${r.found} correct (${((r.correct/r.found)*100).toFixed(0)}%)`);
    else console.log(`    ${p}: 0/${r.total} found`);
}

// --- Source 4: NJ proxy (release_year from master = NJ year) ---
console.log('\n=== NJ Proxy (release_year = NJ year as global proxy) ===');
const njResults = calibrateSource('nj_proxy', (name, gtEntry) => {
    const game = master.find(g => g.id === gtEntry.master_id);
    if (!game || !game.release_year) return null;
    return game.release_year;
});
console.log(`  Found: ${njResults.found}/${gtGames.length} | Correct: ${njResults.correct} | Wrong: ${njResults.wrong} | Accuracy: ${njResults.accuracy}%`);
if (njResults.misses.length) {
    console.log('  Misses:');
    njResults.misses.forEach(m => console.log(`    ${m.name} (${m.provider}): GT=${m.gt_year} NJ=${m.source_year} Δ=${m.delta}`));
}
console.log('  By provider:');
for (const [p, r] of Object.entries(njResults.byProvider)) {
    if (r.found > 0) console.log(`    ${p}: ${r.found}/${r.total} found, ${r.correct}/${r.found} correct (${((r.correct/r.found)*100).toFixed(0)}%)`);
    else console.log(`    ${p}: 0/${r.total} found`);
}

// --- Summary ---
console.log('\n========== CALIBRATION SUMMARY ==========');
console.log(`GT size: ${gtGames.length} games, ${Object.keys(slResults.byProvider).length} providers`);
console.log(`SlotsLaunch: ${slResults.found} found, ${slResults.accuracy}% accurate`);
console.log(`SlotCatalog: ${scResults.found} found, ${scResults.accuracy}% accurate`);
console.log(`slot.report: ${srResults.found} found, ${srResults.accuracy}% accurate`);
console.log(`NJ proxy:    ${njResults.found} found, ${njResults.accuracy}% accurate`);

// Update source_calibration.json
const cal = JSON.parse(readFileSync(resolve(DATA, 'year_pipeline/source_calibration.json'), 'utf8'));
cal._updated = new Date().toISOString().split('T')[0];

cal.sources.slotslaunch_scrape = {
    ...cal.sources.slotslaunch_scrape,
    status: 'CALIBRATED',
    tested_date: cal._updated,
    gt_games_found: slResults.found,
    gt_games_total: gtGames.length,
    year_correct: slResults.correct,
    year_wrong: slResults.wrong,
    accuracy_pct: parseFloat(slResults.accuracy),
    misses: slResults.misses,
    by_provider: Object.fromEntries(Object.entries(slResults.byProvider).map(([p, r]) => [p, {
        found: r.found, total: r.total, correct: r.correct, accuracy: r.found > 0 ? parseFloat(((r.correct/r.found)*100).toFixed(1)) : null
    }])),
};

cal.sources.slotcatalog_cache = {
    ...cal.sources.slotcatalog_cache,
    status: 'CALIBRATED',
    tested_date: cal._updated,
    gt_games_found: scResults.found,
    gt_games_total: gtGames.length,
    year_correct: scResults.correct,
    year_wrong: scResults.wrong,
    accuracy_pct: parseFloat(scResults.accuracy),
    misses: scResults.misses,
    by_provider: Object.fromEntries(Object.entries(scResults.byProvider).map(([p, r]) => [p, {
        found: r.found, total: r.total, correct: r.correct, accuracy: r.found > 0 ? parseFloat(((r.correct/r.found)*100).toFixed(1)) : null
    }])),
};

cal.sources.slot_report_api = {
    ...cal.sources.slot_report_api,
    status: 'CALIBRATED',
    tested_date: cal._updated,
    gt_games_found: srResults.found,
    gt_games_total: gtGames.length,
    year_correct: srResults.correct,
    year_wrong: srResults.wrong,
    accuracy_pct: parseFloat(srResults.accuracy),
    misses: srResults.misses,
    by_provider: Object.fromEntries(Object.entries(srResults.byProvider).map(([p, r]) => [p, {
        found: r.found, total: r.total, correct: r.correct, accuracy: r.found > 0 ? parseFloat(((r.correct/r.found)*100).toFixed(1)) : null
    }])),
};

cal.sources.nj_proxy = {
    status: 'CALIBRATED',
    tested_date: cal._updated,
    gt_games_found: njResults.found,
    gt_games_total: gtGames.length,
    year_correct: njResults.correct,
    year_wrong: njResults.wrong,
    accuracy_pct: parseFloat(njResults.accuracy),
    misses: njResults.misses,
    by_provider: Object.fromEntries(Object.entries(njResults.byProvider).map(([p, r]) => [p, {
        found: r.found, total: r.total, correct: r.correct, accuracy: r.found > 0 ? parseFloat(((r.correct/r.found)*100).toFixed(1)) : null
    }])),
    notes: 'Uses NJ release_year from master as proxy for global year. Only accurate for online-first providers where NJ launch ≈ global launch. Terrible for older games (pre-NJ era).',
    trust_level: 1,
};

writeFileSync(resolve(DATA, 'year_pipeline/source_calibration.json'), JSON.stringify(cal, null, 2) + '\n');
console.log('\nUpdated year_pipeline/source_calibration.json');
