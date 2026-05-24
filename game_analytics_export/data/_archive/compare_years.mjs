import { readFileSync, writeFileSync } from 'fs';

const master = JSON.parse(readFileSync('game_data_master.json', 'utf8'));
const srCache = JSON.parse(readFileSync('_slot_report_data.json', 'utf8'));
const scDates = JSON.parse(readFileSync('_sc_release_dates.json', 'utf8'));
const srMatches = JSON.parse(readFileSync('_release_date_matches.json', 'utf8'));

function norm(name) {
    return (name || '')
        .toLowerCase()
        .trim()
        .replace(/[™®©''!:.\-–—]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Build SR lookup by normalized name
const srByName = new Map();
for (const g of srCache.results) {
    if (g.year) {
        const key = norm(g.name);
        if (!srByName.has(key) || g.release_date) {
            srByName.set(key, { year: g.year, date: g.release_date, name: g.name, slug: g.slug });
        }
    }
}

// Build SC lookup by normalized name
const scByName = new Map();
for (const [k, v] of Object.entries(scDates)) {
    if (v.release_date) {
        try {
            const year = parseInt(v.release_date.substring(0, 4));
            if (year >= 1990 && year <= 2030) {
                scByName.set(norm(k), { year, date: v.release_date, sc_file: v.sc_file });
            }
        } catch {}
    }
}

// Fetch fresh slot.report API
let slotReportApi = [];
try {
    console.log('Fetching fresh slot.report API...');
    const res = await fetch('https://slot.report/api/v1/slots.json');
    const data = await res.json();
    slotReportApi = data.results || [];
    console.log(`  Got ${slotReportApi.length} games from slot.report API`);
} catch (e) {
    console.log(`  slot.report API fetch failed: ${e.message}`);
}

const sraByName = new Map();
for (const g of slotReportApi) {
    if (g.year) {
        const key = norm(g.name);
        if (!sraByName.has(key)) {
            sraByName.set(key, {
                year: g.year,
                date: g.release_date,
                name: g.name,
                slug: g.slug,
                provider: g.provider,
            });
        }
    }
}

// Process each master game
const comparison = [];
let recovered = 0;
let alreadyGood = 0;
let noSource = 0;
let stripped = 0;

for (const g of master) {
    const src = g.original_release_date_source || '';
    const n = norm(g.name);

    const srMatch = srByName.get(n);
    const scMatch = scByName.get(n);
    const sraMatch = sraByName.get(n);
    const srIdMatch = srMatches[g.id];

    const row = {
        id: g.id,
        name: g.name,
        provider: g.provider,
        our_year: g.original_release_year,
        our_source: src,
        nj_year: g.release_year,
        sr_year: srMatch?.year || srIdMatch?.release_year || null,
        sr_date: srMatch?.date || null,
        sr_slug: srMatch?.slug || null,
        sc_year: scMatch?.year || null,
        sc_date: scMatch?.date || null,
        sra_year: sraMatch?.year || null,
        sra_date: sraMatch?.date || null,
        sra_slug: sraMatch?.slug || null,
    };

    // Determine status
    if (src === 'stripped_claude_calibration_failed') {
        // Can we recover a year from any source?
        const candidates = [row.sr_year, row.sc_year, row.sra_year].filter(Boolean);
        if (candidates.length > 0) {
            // Use mode (most common year) or first available
            const yearCounts = {};
            for (const y of candidates) yearCounts[y] = (yearCounts[y] || 0) + 1;
            const bestYear = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0];
            row.recovered_year = parseInt(bestYear[0]);
            row.recovered_sources = candidates.length;
            row.status = 'RECOVERED';
            recovered++;
        } else {
            row.status = 'STRIPPED_NO_RECOVERY';
            stripped++;
        }
    } else if (!src || src === 'NULL') {
        row.status = 'NO_SOURCE';
        noSource++;
    } else if (src === 'ags_provider_data') {
        row.status = 'AGS_VERIFIED';
        alreadyGood++;
    } else {
        row.status = 'EXISTING_SOURCE';
        alreadyGood++;
    }

    comparison.push(row);
}

writeFileSync('year_comparison.json', JSON.stringify(comparison, null, 2) + '\n');

const byStatus = {};
for (const r of comparison) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
}

console.log('\n=== Year Comparison Results ===');
for (const [s, c] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s}: ${c}`);
}
console.log(`\nTotal: ${comparison.length}`);
console.log(`Recovered from external sources: ${recovered}`);

if (recovered > 0) {
    console.log('\nSample recoveries:');
    const samples = comparison.filter(r => r.status === 'RECOVERED').slice(0, 15);
    for (const r of samples) {
        console.log(
            `  ${r.name} (${r.provider}) -> ${r.recovered_year} [SR=${r.sr_year} SC=${r.sc_year} SRA=${r.sra_year}]`
        );
    }
}
