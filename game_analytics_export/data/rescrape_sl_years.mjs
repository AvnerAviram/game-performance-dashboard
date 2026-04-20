/**
 * Re-scrape SlotsLaunch for "found_no_date" games.
 * The original scraper only matched "Month Day, Year" format,
 * but many SL pages show just a plain year (e.g. "2022").
 * This fixes that extraction gap.
 */

import { readFileSync, writeFileSync } from 'fs';

const sl = JSON.parse(readFileSync('_slotslaunch_scrape.json', 'utf8'));
const noDate = sl.filter(r => r.status === 'found_no_date' && r.url);
console.log(`Re-scraping ${noDate.length} "found_no_date" games from SlotsLaunch...\n`);

let fixed = 0, still_no = 0, errors = 0;
const DELAY_MS = 200;
const BATCH_LOG = 25;

for (let i = 0; i < noDate.length; i++) {
    const entry = noDate[i];
    try {
        const resp = await fetch(entry.url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) { errors++; continue; }
        const html = await resp.text();

        // Pattern 1: Full date — "Month Day, Year"
        const m1 = html.match(/Release Date[\s\S]*?(\w+ \d{1,2}, \d{4})/);
        // Pattern 2: Year only — just digits in the value div
        const m2 = html.match(/Release Date[\s\S]*?sl-attribute-value[\s\S]*?(\d{4})\s*</);
        // Pattern 3: Broader year-only
        const m3 = html.match(/Release Date[^]*?>\s*(20\d{2})\s*</);

        if (m1) {
            const origEntry = sl.find(r => r.id === entry.id);
            origEntry.sl_date = m1[1];
            origEntry.sl_year = new Date(m1[1]).getFullYear();
            origEntry.status = 'found_with_date';
            origEntry.date_format = 'full';
            fixed++;
        } else if (m2) {
            const year = parseInt(m2[1]);
            if (year >= 2005 && year <= 2027) {
                const origEntry = sl.find(r => r.id === entry.id);
                origEntry.sl_date = null;
                origEntry.sl_year = year;
                origEntry.status = 'found_with_date';
                origEntry.date_format = 'year_only';
                fixed++;
            } else {
                still_no++;
            }
        } else if (m3) {
            const year = parseInt(m3[1]);
            if (year >= 2005 && year <= 2027) {
                const origEntry = sl.find(r => r.id === entry.id);
                origEntry.sl_date = null;
                origEntry.sl_year = year;
                origEntry.status = 'found_with_date';
                origEntry.date_format = 'year_only';
                fixed++;
            } else {
                still_no++;
            }
        } else {
            still_no++;
        }
    } catch (e) {
        errors++;
    }

    if ((i + 1) % BATCH_LOG === 0 || i === noDate.length - 1) {
        process.stdout.write(`\r  ${i + 1}/${noDate.length} | fixed=${fixed} still_no=${still_no} errors=${errors}`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
}

writeFileSync('_slotslaunch_scrape.json', JSON.stringify(sl, null, 2) + '\n');
console.log(`\n\n=== RESULTS ===`);
console.log(`  Fixed: ${fixed}`);
console.log(`  Still no date: ${still_no}`);
console.log(`  Errors: ${errors}`);

const withDate = sl.filter(r => r.sl_year);
console.log(`  Total SL entries with dates: ${withDate.length}/${sl.length}`);
