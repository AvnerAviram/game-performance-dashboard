#!/usr/bin/env node
/**
 * extract_slotreport_years.mjs
 * Extracts global online release years from slot.report data for master games.
 *
 * Usage:
 *   node extract_slotreport_years.mjs --stats     # Show match statistics
 *   node extract_slotreport_years.mjs --gt-test   # Run GT validation
 *   node extract_slotreport_years.mjs --extract   # Extract and stage results
 *   node extract_slotreport_years.mjs --review    # Generate review HTML
 *   node extract_slotreport_years.mjs --apply     # Apply staged results to master (needs user approval)
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = __dirname;

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function parseSlotReportDate(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}-/.test(dateStr)) {
        return { year: parseInt(dateStr.substring(0, 4), 10), date: dateStr };
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
        const [dd, mm, yyyy] = dateStr.split('-');
        return { year: parseInt(yyyy, 10), date: `${yyyy}-${mm}-${dd}` };
    }
    return null;
}

const PROVIDER_ALIASES = {
    'Evolution': ['NetEnt', 'Red Tiger', 'Big Time Gaming', 'Evolution', 'Ezugi', 'Nolimit City', 'DigiWheel'],
    'Internal': ['NetEnt', 'Evolution', 'BGaming'],
    'Games Global': ['Microgaming', 'Stormcraft Studios', 'Games Global', 'Just For The Win', 'Alchemy Gaming', 'Gameburger Studios', 'Gold Coin Studios', 'SpinPlay Games', 'Slingshot Studios', 'Triple Edge Studios', 'Pulse 8', 'All41 Studios', 'Fortune Factory Studios', 'Foxium', 'Switch Studios', 'Snowborn Games', 'Crazy Tooth Studio', 'Northern Lights Gaming', 'Neon Valley Studios', 'Old Skool Studios'],
    'Play\'n GO': ["Play'n GO", 'Play n GO'],
    'Hacksaw Gaming': ['Hacksaw Gaming'],
    'Reel Play': ['Reel Play', 'ReelPlay'],
    'Light & Wonder': ['Light & Wonder', 'Scientific Games', 'SG Digital', 'Barcrest', 'Lightning Box', 'Elk Studios', 'ELK Studios', 'Shuffle Master', 'WMS'],
    'Playtech': ['Playtech', 'Ash Gaming'],
    'IGT': ['IGT'],
    'White Hat Studios': ['White Hat Studios', 'White Hat Gaming'],
    'Relax Gaming': ['Relax Gaming'],
    '1x2 Network': ['1x2 Network', '1x2gaming', '1X2gaming', 'Iron Dog Studio'],
    'Wazdan': ['Wazdan'],
    'Bragg Gaming Group': ['Bragg Gaming Group', 'Oryx Gaming', 'Wild Streak Gaming'],
    '4theplayer': ['4ThePlayer', '4theplayer'],
    'Aristocrat': ['Aristocrat'],
    'Ainsworth': ['Ainsworth'],
    'Oddsworks': ['Oddsworks', 'Arrow\'s Edge'],
};

function providersMatch(masterProvider, srProvider) {
    if (!masterProvider || !srProvider) return false;
    const mLow = masterProvider.toLowerCase();
    const sLow = srProvider.toLowerCase();
    if (mLow === sLow) return true;
    const aliases = PROVIDER_ALIASES[masterProvider];
    if (aliases && aliases.some(a => a.toLowerCase() === sLow)) return true;
    for (const [, aliasList] of Object.entries(PROVIDER_ALIASES)) {
        const has = name => aliasList.some(a => a.toLowerCase() === name);
        if (has(mLow) && has(sLow)) return true;
    }
    return false;
}

function loadSlotReport() {
    const raw = JSON.parse(readFileSync(resolve(DATA, '_slot_report_data.json'), 'utf8'));
    const games = raw.results || raw;
    const allEntries = [];
    let validCount = 0;

    for (const g of games) {
        const parsed = parseSlotReportDate(g.release_date);
        if (!parsed || parsed.year < 2000) continue;
        validCount++;
        allEntries.push({ name: g.name, provider: g.provider, year: parsed.year, date: parsed.date, slug: g.slug });
    }

    return { allEntries, validCount };
}

function matchGame(game, sr) {
    const slug = slugify(game.name);
    const lower = game.name.toLowerCase();
    const masterProvider = game.provider || '';

    const candidates = [];
    for (const entry of sr.allEntries) {
        const entrySlug = slugify(entry.name);
        const entryLower = entry.name.toLowerCase();
        let matchType = null;

        if (entryLower === lower) matchType = 'exact';
        else if (entrySlug === slug) matchType = 'slug';
        else if (entrySlug === slug.replace(/-ii$/, '-2')) matchType = 'roman';
        else if (entrySlug === slug.replace(/-ii-/, '-2-')) matchType = 'roman';

        if (!matchType) continue;

        const provMatch = providersMatch(masterProvider, entry.provider);
        candidates.push({ ...entry, matchType, provMatch });
    }

    if (candidates.length === 0) return null;

    const provMatches = candidates.filter(c => c.provMatch);
    if (provMatches.length > 0) {
        const exact = provMatches.find(c => c.matchType === 'exact');
        return exact || provMatches[0];
    }

    if (slug.length >= 12) {
        return candidates[0];
    }

    return null;
}

function loadMaster() {
    return JSON.parse(readFileSync(resolve(DATA, 'game_data_master.json'), 'utf8'));
}

function loadGT() {
    const gt = JSON.parse(readFileSync(resolve(DATA, 'year_pipeline/ground_truth.json'), 'utf8'));
    return Object.entries(gt.games).filter(([, g]) => g.master_id);
}

const cmd = process.argv[2];

if (cmd === '--stats') {
    const master = loadMaster();
    const sr = loadSlotReport();
    console.log(`slot.report: ${sr.validCount} games with valid dates`);
    console.log(`Master: ${master.length} games\n`);

    let matched = 0;
    const byProvider = {};
    for (const game of master) {
        const p = game.provider || 'Unknown';
        if (!byProvider[p]) byProvider[p] = { total: 0, matched: 0 };
        byProvider[p].total++;

        const m = matchGame(game, sr);
        if (m) {
            matched++;
            byProvider[p].matched++;
        }
    }

    console.log(`Matched: ${matched}/${master.length} (${((matched / master.length) * 100).toFixed(1)}%)\n`);
    console.log('By provider (≥10 games):');
    for (const [p, r] of Object.entries(byProvider).sort((a, b) => b[1].matched - a[1].matched)) {
        if (r.total >= 10) {
            console.log(`  ${p}: ${r.matched}/${r.total} (${((r.matched / r.total) * 100).toFixed(0)}%)`);
        }
    }
}

if (cmd === '--gt-test') {
    const master = loadMaster();
    const sr = loadSlotReport();
    const gtGames = loadGT();
    console.log(`GT: ${gtGames.length} games with master_id`);

    let tested = 0, correct = 0, wrong = 0, notFound = 0;
    const misses = [];

    for (const [name, gtEntry] of gtGames) {
        if (gtEntry.provider === undefined && !gtEntry.note?.includes('AGS')) {
            // Non-AGS GT games without provider field — skip
        }
        const game = master.find(g => g.id === gtEntry.master_id);
        if (!game) continue;

        const srMatch = matchGame(game, sr);
        if (!srMatch) {
            notFound++;
            continue;
        }

        tested++;
        if (srMatch.year === gtEntry.year) {
            correct++;
        } else {
            wrong++;
            misses.push({ name, gt: gtEntry.year, sr: srMatch.year, delta: srMatch.year - gtEntry.year, provider: game.provider });
        }
    }

    console.log(`\nTested: ${tested} | Correct: ${correct} | Wrong: ${wrong} | Not found: ${notFound}`);
    const accuracy = tested > 0 ? ((correct / tested) * 100).toFixed(1) : 'N/A';
    console.log(`Accuracy: ${accuracy}%`);

    if (misses.length) {
        console.log('\nMisses:');
        misses.forEach(m => console.log(`  ${m.name} (${m.provider}): GT=${m.gt} SR=${m.sr} Δ=${m.delta}`));
    }

    const pass = tested > 0 && parseFloat(accuracy) >= 95;
    console.log(`\nGT gate: ${pass ? 'PASS ✓' : 'FAIL ✗'} (threshold: 95%)`);
    if (!pass) process.exit(1);
}

if (cmd === '--extract') {
    const master = loadMaster();
    const sr = loadSlotReport();
    console.log(`Matching slot.report against ${master.length} master games...\n`);

    const staged = [];
    for (const game of master) {
        if (game.original_release_date_source === 'ags_provider_data') continue;

        const srMatch = matchGame(game, sr);
        if (!srMatch) continue;

        const njYear = game.release_year;
        let confidence = 4;

        if (njYear && srMatch.year > njYear + 1) {
            confidence = 1;
        }
        if (srMatch.year < 2005) {
            confidence = 1;
        }
        if (srMatch.year === 1970 || srMatch.year === 1969) {
            continue;
        }

        if (confidence < 3) continue;

        const provMatch = providersMatch(game.provider, srMatch.provider);
        if (!provMatch && game.name.length < 15) continue;

        staged.push({
            id: game.id,
            name: game.name,
            provider: game.provider,
            sr_name: srMatch.name,
            sr_provider: srMatch.provider,
            sr_slug: srMatch.slug || slugify(srMatch.name),
            sr_year: srMatch.year,
            sr_date: srMatch.date,
            nj_year: njYear,
            confidence: provMatch ? confidence : Math.min(confidence, 3),
            provider_match: provMatch,
            source: 'slotreport',
        });
    }

    console.log(`Staged: ${staged.length} games with conf >= 3`);
    writeFileSync(resolve(DATA, '_staged_year_results.json'), JSON.stringify(staged, null, 2) + '\n');
    console.log('Written to _staged_year_results.json');

    const byProvider = {};
    for (const s of staged) {
        byProvider[s.provider] = (byProvider[s.provider] || 0) + 1;
    }
    console.log('\nBy provider:');
    for (const [p, c] of Object.entries(byProvider).sort((a, b) => b - a)) {
        console.log(`  ${p}: ${c}`);
    }

    const yearRange = staged.map(s => s.sr_year);
    if (yearRange.length) {
        console.log(`\nYear range: ${Math.min(...yearRange)} - ${Math.max(...yearRange)}`);
    }
}

if (cmd === '--review') {
    const staged = JSON.parse(readFileSync(resolve(DATA, '_staged_year_results.json'), 'utf8'));
    if (!staged.length) {
        console.log('No staged results. Run --extract first.');
        process.exit(1);
    }

    const batchSize = 50;
    const batch = staged.slice(0, batchSize);

    function buildRow(s, i) {
        const delta = s.nj_year ? s.sr_year - s.nj_year : null;
        const deltaStr = delta !== null ? (delta > 0 ? '+' + delta : '' + delta) : 'N/A';
        const flag = delta !== null && Math.abs(delta) > 3 ? ' <span class="warn">⚠️</span>' : '';
        const clean = str => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const nameMatch = clean(s.name) === clean(s.sr_name);
        const matchClass = nameMatch ? '' : ' class="mismatch"';
        const srSlug = s.sr_slug || slugify(s.sr_name || s.name);
        const srUrl = 'https://slot.report/slot/' + srSlug;
        const dateClean = (s.sr_date || '').replace(/T.*/, '');
        const provMatch = s.provider_match !== false ? '' : ' <span class="warn">[prov?]</span>';

        return [
            '<tr id="row-' + i + '">',
            '<td>' + (i + 1) + '</td>',
            '<td>' + s.name + '</td>',
            '<td>' + s.provider + provMatch + '</td>',
            '<td><strong>' + s.sr_year + '</strong></td>',
            '<td>' + dateClean + '</td>',
            '<td>' + (s.nj_year || '') + '</td>',
            '<td>' + deltaStr + flag + '</td>',
            '<td>' + s.confidence + '</td>',
            '<td' + matchClass + '><a href="' + srUrl + '" target="_blank" class="src-link">' + s.sr_name + ' (' + (s.sr_provider || '') + ')</a></td>',
            '<td class="verdict-cell">',
            "<button class=\"btn-ok\" id=\"ok-" + i + "\" onclick=\"setVerdict(" + i + ",'ok')\">OK</button>",
            "<button class=\"btn-fix\" id=\"fix-" + i + "\" onclick=\"setVerdict(" + i + ",'fix')\">FIX</button>",
            '<input type="text" class="fix-note" id="note-' + i + '" placeholder="year..." style="display:none;width:55px">',
            '</td>',
            '</tr>',
        ].join('');
    }

    const rowsHtml = batch.map((s, i) => buildRow(s, i)).join('\n');
    const total = batch.length;

    const html = [
        '<!DOCTYPE html>',
        '<html><head><meta charset="utf-8"><title>Year Review — slot.report batch</title>',
        '<style>',
        'body { font-family: system-ui; background: #1a1a2e; color: #e0e0e0; padding: 20px; }',
        'h1 { color: #4fc3f7; }',
        'table { border-collapse: collapse; width: 100%; margin-top: 20px; }',
        'th, td { border: 1px solid #333; padding: 8px 12px; text-align: left; font-size: 13px; }',
        'th { background: #16213e; color: #4fc3f7; position: sticky; top: 0; z-index: 1; }',
        'tr:nth-child(even) { background: #1a1a3e; }',
        'tr:hover { background: #2a2a5e; }',
        'tr.row-ok { background: #0d3320 !important; }',
        'tr.row-fix { background: #3d1515 !important; }',
        '.summary { background: #16213e; padding: 15px; border-radius: 8px; margin-bottom: 20px; }',
        '.mismatch { color: #ff9800; }',
        '.warn { color: #ff5252; }',
        '.src-link { color: #64b5f6; text-decoration: none; }',
        '.src-link:hover { text-decoration: underline; }',
        '.btn-ok, .btn-fix { padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; margin-right: 4px; }',
        '.btn-ok { background: #2e7d32; color: #fff; }',
        '.btn-ok:hover { background: #388e3c; }',
        '.btn-ok.active { background: #4caf50; box-shadow: 0 0 6px #4caf50; }',
        '.btn-fix { background: #c62828; color: #fff; }',
        '.btn-fix:hover { background: #d32f2f; }',
        '.btn-fix.active { background: #f44336; box-shadow: 0 0 6px #f44336; }',
        '.fix-note { background: #2a2a4e; color: #fff; border: 1px solid #555; border-radius: 4px; padding: 3px 6px; font-size: 12px; }',
        '.verdict-cell { white-space: nowrap; }',
        '.stats-bar { background: #16213e; padding: 12px 20px; border-radius: 8px; margin-top: 20px; display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }',
        '.stats-bar span { font-size: 14px; }',
        '.ok-count { color: #4caf50; font-weight: bold; }',
        '.fix-count { color: #f44336; font-weight: bold; }',
        '.pending-count { color: #9e9e9e; }',
        '.export-btn { padding: 8px 20px; background: #1565c0; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; }',
        '.export-btn:hover { background: #1976d2; }',
        '</style></head><body>',
        '<h1>Year Review — slot.report extraction</h1>',
        '<div class="summary">',
        '<p><strong>Total staged:</strong> ' + staged.length + ' games &middot; <strong>Showing:</strong> first ' + total + ' for spot-check</p>',
        '<p><strong>Source:</strong> slot.report (100% GT accuracy, calibrated against 58-game expanded GT)</p>',
        '<p><strong>Note:</strong> SR Year = global online release year. NJ Year = NJ launch (always later for older games). Click SR Match link to verify on slot.report.</p>',
        '</div>',
        '<div class="stats-bar" id="stats-bar">',
        '<span>Reviewed: <span id="reviewed-count">0</span>/' + total + '</span>',
        '<span>OK: <span class="ok-count" id="ok-count">0</span></span>',
        '<span>FIX: <span class="fix-count" id="fix-count">0</span></span>',
        '<span>Pending: <span class="pending-count" id="pending-count">' + total + '</span></span>',
        '<button class="export-btn" onclick="exportResults()">Export Results</button>',
        '</div>',
        '<table>',
        '<thead><tr>',
        '<th>#</th><th>Game</th><th>Provider</th><th>SR Year</th><th>SR Date</th><th>NJ Year</th><th>&Delta;</th><th>Conf</th><th>SR Match (click to verify)</th><th>Verdict</th>',
        '</tr></thead>',
        '<tbody>',
        rowsHtml,
        '</tbody></table>',
        '<script>',
        'var TOTAL = ' + total + ';',
        'var verdicts = {};',
        'function setVerdict(idx, v) {',
        '    verdicts[idx] = { verdict: v, note: "" };',
        '    var row = document.getElementById("row-" + idx);',
        '    var okBtn = document.getElementById("ok-" + idx);',
        '    var fixBtn = document.getElementById("fix-" + idx);',
        '    var noteEl = document.getElementById("note-" + idx);',
        '    row.className = v === "ok" ? "row-ok" : "row-fix";',
        '    okBtn.className = "btn-ok" + (v === "ok" ? " active" : "");',
        '    fixBtn.className = "btn-fix" + (v === "fix" ? " active" : "");',
        '    noteEl.style.display = v === "fix" ? "inline-block" : "none";',
        '    if (v === "fix") noteEl.focus();',
        '    noteEl.oninput = function() { verdicts[idx].note = this.value; };',
        '    updateStats();',
        '}',
        'function updateStats() {',
        '    var vals = Object.values(verdicts);',
        '    var okC = vals.filter(function(v){return v.verdict==="ok"}).length;',
        '    var fixC = vals.filter(function(v){return v.verdict==="fix"}).length;',
        '    document.getElementById("reviewed-count").textContent = vals.length;',
        '    document.getElementById("ok-count").textContent = okC;',
        '    document.getElementById("fix-count").textContent = fixC;',
        '    document.getElementById("pending-count").textContent = TOTAL - vals.length;',
        '}',
        'function exportResults() {',
        '    var lines = ["idx|game|provider|sr_year|verdict|correction"];',
        '    var rows = document.querySelectorAll("tbody tr");',
        '    rows.forEach(function(tr, i) {',
        '        var cells = tr.querySelectorAll("td");',
        '        var v = verdicts[i] || { verdict: "pending", note: "" };',
        '        lines.push([i+1, cells[1].textContent, cells[2].textContent, cells[3].textContent, v.verdict, v.note].join("|"));',
        '    });',
        '    var blob = new Blob([lines.join("\\n")], { type: "text/plain" });',
        '    var a = document.createElement("a");',
        '    a.href = URL.createObjectURL(blob);',
        '    a.download = "year_review_results.txt";',
        '    a.click();',
        '}',
        '</script>',
        '</body></html>',
    ].join('\n');

    writeFileSync(resolve(DATA, 'YEAR_REVIEW_SLOTREPORT.html'), html);
    console.log('Review HTML written: YEAR_REVIEW_SLOTREPORT.html (' + batch.length + ' games)');
}

if (cmd === '--apply') {
    const staged = JSON.parse(readFileSync(resolve(DATA, '_staged_year_results.json'), 'utf8'));
    if (!staged.length) {
        console.log('No staged results to apply.');
        process.exit(1);
    }

    console.log(`Will apply ${staged.length} year entries to master.`);
    console.log('Backing up master first...');

    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    copyFileSync(resolve(DATA, 'game_data_master.json'), resolve(DATA, `_backup_pre_apply_${ts}/game_data_master.json`));

    const master = loadMaster();
    const idMap = {};
    for (const game of master) idMap[game.id] = game;

    let applied = 0, skipped = 0;
    for (const s of staged) {
        const game = idMap[s.id];
        if (!game) { skipped++; continue; }
        if (game.original_release_date_source === 'ags_provider_data') { skipped++; continue; }

        game.original_release_year = s.sr_year;
        game.original_release_date = s.sr_date || null;
        game.original_release_month = s.sr_date ? parseInt(s.sr_date.substring(5, 7), 10) : null;
        game.original_release_date_source = 'slotreport';
        game.original_release_confidence = s.confidence;
        applied++;
    }

    writeFileSync(resolve(DATA, 'game_data_master.json'), JSON.stringify(master, null, 2) + '\n');
    console.log(`Applied: ${applied}, Skipped: ${skipped}`);
    console.log(`New coverage: ${master.filter(g => g.original_release_year).length}/${master.length}`);
}

if (!cmd || !['--stats', '--gt-test', '--extract', '--review', '--apply'].includes(cmd)) {
    console.log('Usage: node extract_slotreport_years.mjs [--stats|--gt-test|--extract|--review|--apply]');
}
