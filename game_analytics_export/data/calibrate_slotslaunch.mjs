import { writeFileSync } from 'fs';

const agsGT = {
    'golden-wins': { gt: '2019-03-19', year: 2019, name: 'Golden Wins' },
    'jade-wins': { gt: '2019-04-04', year: 2019, name: 'Jade Wins' },
    'longhorn-jackpots': { gt: '2019-05-07', year: 2019, name: 'Longhorn Jackpots' },
    'fu-nan-fu-nu': { gt: '2019-06-06', year: 2019, name: 'Fu Nan Fu Nu' },
    'rakin-bacon': { gt: '2019-06-20', year: 2019, name: "Rakin' Bacon" },
    'olympus-strikes': { gt: '2019-07-25', year: 2019, name: 'Olympus Strikes' },
    'river-dragons': { gt: '2019-10-03', year: 2019, name: 'River Dragons' },
    'forest-dragons': { gt: '2019-10-17', year: 2019, name: 'Forest Dragons' },
    'fire-wolf-ii': { gt: '2019-10-17', year: 2019, name: 'Fire Wolf II' },
    'pharaoh-sun': { gt: '2019-10-31', year: 2019, name: 'Pharaoh Sun' },
    'bonanza-blast': { gt: '2020-01-09', year: 2020, name: 'Bonanza Blast' },
    'wolf-queen': { gt: '2020-03-19', year: 2020, name: 'Wolf Queen' },
    'capital-gains': { gt: '2020-04-03', year: 2020, name: 'Capital Gains' },
    'apollo-stacks': { gt: '2020-05-15', year: 2020, name: 'Apollo Stacks' },
    'crystal-magic': { gt: '2020-07-01', year: 2020, name: 'Crystal Magic' },
    'jade-dragon': { gt: '2020-07-23', year: 2020, name: 'Jade Dragon' },
    'grand-royale': { gt: '2020-07-23', year: 2020, name: 'Grand Royale' },
    'vegas-stacks': { gt: '2020-08-17', year: 2020, name: 'Vegas Stacks' },
    'flamenco-stacks': { gt: '2020-10-01', year: 2020, name: 'Flamenco Stacks' },
    'hearts-horns': { gt: '2020-11-19', year: 2020, name: 'Hearts & Horns' },
    'red-silk': { gt: '2020-12-17', year: 2020, name: 'Red Silk' },
    'golden-ram': { gt: '2021-01-07', year: 2021, name: 'Golden Ram' },
    'goddess-treasures': { gt: '2021-02-11', year: 2021, name: 'Goddess Treasures' },
    'blazing-luck': { gt: '2021-04-09', year: 2021, name: 'Blazing Luck' },
    'tiger-lord': { gt: '2021-04-09', year: 2021, name: 'Tiger Lord' },
    'aztec-chief': { gt: '2021-04-29', year: 2021, name: 'Aztec Chief' },
    'dragon-fa': { gt: '2021-05-13', year: 2021, name: 'Dragon Fa' },
    'imperial-luck': { gt: '2021-06-16', year: 2021, name: 'Imperial Luck' },
    'luck-luxury': { gt: '2020-09-03', year: 2020, name: 'Luck & Luxury' },
    'peacock-beauty': { gt: '2021-06-24', year: 2021, name: 'Peacock Beauty' },
    'mermaids-fortune': { gt: '2021-07-29', year: 2021, name: "Mermaid's Fortune" },
    'golden-wins-deluxe': { gt: '2021-08-11', year: 2021, name: 'Golden Wins Deluxe' },
};

async function fetchSL(slug) {
    const url = `https://slotslaunch.com/ags/${slug}`;
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return { found: false, status: resp.status };
        const html = await resp.text();

        // Extract release date
        const m = html.match(/Release Date\s*\n\s*([\w]+ \d{1,2}, \d{4})/);
        if (m) return { found: true, date: m[1] };

        const m2 = html.match(/Release Date[^]*?(\w+ \d{1,2}, \d{4})/);
        if (m2) return { found: true, date: m2[1] };

        return { found: true, date: null };
    } catch (e) {
        return { found: false, error: e.message };
    }
}

function parseDate(str) {
    const d = new Date(str);
    return isNaN(d) ? null : d;
}

console.log('=== SlotsLaunch vs AGS Ground Truth ===\n');
console.log(`${'Game'.padEnd(22)} ${'GT Date'.padEnd(12)} ${'SL Date'.padEnd(18)} ${'Yr OK?'.padEnd(7)} ${'Days Off'}`);
console.log('-'.repeat(75));

const results = [];
let yearMatch = 0, yearMiss = 0, notFound = 0;

for (const [slug, gt] of Object.entries(agsGT)) {
    const sl = await fetchSL(slug);

    if (!sl.found) {
        // Try alternate slugs
        const alt = slug.replace(/-/g, '-').replace('hearts-horns', 'hearts-and-horns').replace('mermaids-fortune', 'mermaids-fortune');
        const sl2 = await fetchSL(alt);
        if (sl2.found && sl2.date) {
            Object.assign(sl, sl2);
        }
    }

    if (sl.found && sl.date) {
        const slDate = parseDate(sl.date);
        const gtDate = parseDate(gt.gt);
        const slYear = slDate ? slDate.getFullYear() : null;
        const daysDiff = slDate && gtDate ? Math.round((slDate - gtDate) / 86400000) : null;
        const yrOk = slYear === gt.year;
        if (yrOk) yearMatch++;
        else yearMiss++;

        results.push({ name: gt.name, gt: gt.gt, sl: sl.date, slYear, gtYear: gt.year, daysDiff, yrOk });
        console.log(`  ${gt.name.padEnd(20)} ${gt.gt.padEnd(12)} ${sl.date.padEnd(18)} ${yrOk ? 'YES' : 'NO '}    ${daysDiff !== null ? daysDiff : '?'}`);
    } else {
        notFound++;
        console.log(`  ${gt.name.padEnd(20)} ${gt.gt.padEnd(12)} ${'NOT FOUND'.padEnd(18)}`);
    }

    await new Promise(r => setTimeout(r, 300));
}

console.log(`\n=== RESULTS ===`);
console.log(`Found: ${results.length}/${Object.keys(agsGT).length}`);
console.log(`Year exact match: ${yearMatch}/${results.length} (${((yearMatch / results.length) * 100).toFixed(0)}%)`);
console.log(`Not found: ${notFound}`);

const avgDays = results.filter(r => r.daysDiff !== null).map(r => Math.abs(r.daysDiff));
if (avgDays.length) {
    console.log(`Avg days off: ${(avgDays.reduce((s, d) => s + d, 0) / avgDays.length).toFixed(0)}`);
    console.log(`Max days off: ${Math.max(...avgDays)}`);
    console.log(`Within 30 days: ${avgDays.filter(d => d <= 30).length}/${avgDays.length}`);
    console.log(`Within 90 days: ${avgDays.filter(d => d <= 90).length}/${avgDays.length}`);
}

writeFileSync('_slotslaunch_calibration.json', JSON.stringify(results, null, 2) + '\n');
console.log('\nSaved _slotslaunch_calibration.json');
