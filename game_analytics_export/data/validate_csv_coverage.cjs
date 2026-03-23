#!/usr/bin/env node
/**
 * Validates games_dashboard.json against the Eilers CSV source of truth.
 *
 * Checks:
 *  1. No game in the JSON has null/0 theo_win while the CSV has a positive value
 *  2. No game in the JSON is absent from the CSV (potential non-live entry)
 *  3. No game with a provider + name but null theo_win exists at all
 *
 * Usage:
 *   node validate_csv_coverage.cjs [--csv /path/to/csv]
 *
 * Defaults to /Users/avner/Downloads/Data Download Theme (4).csv
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
const DASHBOARD_PATH = path.join(DATA_DIR, 'games_dashboard.json');

const csvArg = process.argv.indexOf('--csv');
const CSV_PATH =
    csvArg !== -1 && process.argv[csvArg + 1] ? process.argv[csvArg + 1] : path.join(DATA_DIR, 'eilers_source.csv');

function norm(n) {
    return (n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCSV(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split('\n');
    const map = {};
    for (let i = 1; i < lines.length; i++) {
        const parts = [];
        let field = '',
            inQuotes = false;
        for (const ch of lines[i]) {
            if (ch === '"') inQuotes = !inQuotes;
            else if (ch === ',' && !inQuotes) {
                parts.push(field);
                field = '';
            } else field += ch;
        }
        parts.push(field);
        const name = (parts[3] || '').trim();
        if (!name) continue;
        const theo = parseFloat(parts[12]) || 0;
        const key = norm(name);
        if (!map[key] || theo > map[key].theo) {
            map[key] = { name, supplier: (parts[4] || '').trim(), theo };
        }
    }
    return map;
}

function run() {
    if (!fs.existsSync(CSV_PATH)) {
        console.error('CSV not found at:', CSV_PATH);
        process.exit(1);
    }

    const csvMap = parseCSV(CSV_PATH);
    const dashboard = JSON.parse(fs.readFileSync(DASHBOARD_PATH, 'utf8'));

    let errors = 0;
    const issues = { missingTheo: [], notInCsv: [], nullTheo: [] };

    for (const g of dashboard) {
        const key = norm(g.name);
        const csvEntry = csvMap[key];
        const theo = g.theo_win;

        if (csvEntry && csvEntry.theo > 0 && (!theo || theo === 0)) {
            issues.missingTheo.push({
                name: g.name,
                provider: g.provider,
                csvTheo: csvEntry.theo,
            });
            errors++;
        }

        if (!csvEntry) {
            issues.notInCsv.push({ name: g.name, provider: g.provider });
        }

        if (g.provider && g.name && (theo === null || theo === undefined)) {
            issues.nullTheo.push({ name: g.name, provider: g.provider });
            errors++;
        }
    }

    console.log(`\n=== CSV Coverage Validation ===`);
    console.log(`Dashboard games: ${dashboard.length}`);
    console.log(`CSV games:       ${Object.keys(csvMap).length}`);
    console.log();

    if (issues.missingTheo.length) {
        console.log(`FAIL: ${issues.missingTheo.length} games have null/0 theo but CSV has data:`);
        issues.missingTheo.forEach(g => console.log(`  ${g.name} (${g.provider}) — CSV theo: ${g.csvTheo.toFixed(2)}`));
        console.log();
    }

    if (issues.nullTheo.length) {
        console.log(`FAIL: ${issues.nullTheo.length} games have null theo_win:`);
        issues.nullTheo.forEach(g => console.log(`  ${g.name} (${g.provider})`));
        console.log();
    }

    if (issues.notInCsv.length) {
        console.log(`WARN: ${issues.notInCsv.length} games not found in CSV (may be non-live):`);
        const byProv = {};
        issues.notInCsv.forEach(g => {
            const p = g.provider || 'Unknown';
            if (!byProv[p]) byProv[p] = 0;
            byProv[p]++;
        });
        Object.entries(byProv)
            .sort((a, b) => b[1] - a[1])
            .forEach(([p, c]) => console.log(`  ${p}: ${c}`));
        console.log();
    }

    if (errors === 0) {
        console.log('PASS: All games have valid theo_win data.\n');
        process.exit(0);
    } else {
        console.log(`FAILED: ${errors} issue(s) found.\n`);
        process.exit(1);
    }
}

run();
