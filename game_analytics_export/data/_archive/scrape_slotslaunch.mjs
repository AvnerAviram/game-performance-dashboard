import { readFileSync, writeFileSync, existsSync } from 'fs';

const master = JSON.parse(readFileSync('game_data_master.json', 'utf8'));
const stripped = master.filter(g => g.original_release_date_source === 'stripped_claude_calibration_failed');

const provSlugMap = {
    'Light & Wonder': 'light-and-wonder',
    'IGT': 'igt',
    'Aristocrat': 'aristocrat',
    'High 5 Games': 'high-5-games',
    'White Hat Studios': 'white-hat-studios',
    'Inspired': 'inspired-gaming',
    'Games Global': 'games-global',
    'Playtech': 'playtech',
    'Everi': 'everi',
    'Konami': 'konami',
    'Ainsworth': 'ainsworth',
    'Greentube': 'greentube',
    'Bragg Gaming Group': 'bragg-gaming',
    'Evolution': 'evolution',
    'Wazdan': 'wazdan',
    'AGS': 'ags',
    'Gaming Realms': 'gaming-realms',
    'Oddsworks': 'oddsworks',
    'Spinberry': 'spinberry',
    'Aruze': 'aruze',
    'Incredible Technologies': 'incredible-technologies',
    'Design Works Gaming': 'design-works-gaming',
    '1x2 Network': '1x2-network',
    'Octoplay': 'octoplay',
    'Ruby Play': 'ruby-play',
    'Gamecode': 'gamecode',
    'Betixon': 'betixon',
    'Red Rake Gaming': 'red-rake-gaming',
    'Playson': 'playson',
    'Slotmill': 'slotmill',
    'Hacksaw Gaming': 'hacksaw-gaming',
    'Bang Bang Games': 'bang-bang-games',
    'Avatarux': 'avatarux',
    "Play'n GO": 'playngo',
    'Spearhead Studios': 'spearhead-studios',
    'Spinomenal': 'spinomenal',
    'Rogue': 'rogue',
};

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[''\u2019\u2018]/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// Load checkpoint if exists
let results = [];
let processedIds = new Set();
if (existsSync('_slotslaunch_scrape.json')) {
    results = JSON.parse(readFileSync('_slotslaunch_scrape.json', 'utf8'));
    processedIds = new Set(results.map(r => r.id));
    console.log(`Resuming: ${results.length} already processed`);
}

const remaining = stripped.filter(g => !processedIds.has(g.id));
console.log(`Total stripped: ${stripped.length}, Remaining: ${remaining.length}`);

let batchCount = 0;
const BATCH_SIZE = 100;
const DELAY_MS = 250;

for (const game of remaining) {
    const provider = game.provider || game.provider_studio || '';
    const provSlug = provSlugMap[provider];

    if (!provSlug) {
        results.push({
            id: game.id,
            name: game.name,
            provider,
            status: 'no_provider_slug',
            sl_date: null,
            nj_year: game.release_year,
        });
        batchCount++;
        if (batchCount % BATCH_SIZE === 0) {
            writeFileSync('_slotslaunch_scrape.json', JSON.stringify(results, null, 2) + '\n');
            process.stdout.write(`\r  Processed: ${batchCount}/${remaining.length}`);
        }
        continue;
    }

    const slug = slugify(game.name);
    const url = `https://slotslaunch.com/${provSlug}/${slug}`;

    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (resp.ok) {
            const html = await resp.text();
            const m = html.match(/Release Date[^]*?(\w+ \d{1,2}, \d{4})/);
            results.push({
                id: game.id,
                name: game.name,
                provider,
                status: m ? 'found_with_date' : 'found_no_date',
                sl_date: m ? m[1] : null,
                sl_year: m ? new Date(m[1]).getFullYear() : null,
                nj_year: game.release_year,
                url,
            });
        } else {
            results.push({
                id: game.id,
                name: game.name,
                provider,
                status: 'not_found',
                sl_date: null,
                nj_year: game.release_year,
                url,
            });
        }
    } catch (e) {
        results.push({
            id: game.id,
            name: game.name,
            provider,
            status: 'error',
            sl_date: null,
            nj_year: game.release_year,
            error: e.message,
        });
    }

    batchCount++;
    if (batchCount % BATCH_SIZE === 0) {
        writeFileSync('_slotslaunch_scrape.json', JSON.stringify(results, null, 2) + '\n');
        const found = results.filter(r => r.status === 'found_with_date').length;
        console.log(`  Processed: ${batchCount}/${remaining.length} | Found with date: ${found}`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
}

// Final save
writeFileSync('_slotslaunch_scrape.json', JSON.stringify(results, null, 2) + '\n');

// Summary
const byStatus = {};
for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
}
console.log('\n\n=== FINAL RESULTS ===');
for (const [s, c] of Object.entries(byStatus).sort((a, b) => b - a)) {
    console.log(`  ${s}: ${c}`);
}

const withDate = results.filter(r => r.sl_date);
console.log(`\nTotal with dates: ${withDate.length}/${results.length}`);

// Provider breakdown for games with dates
const byProv = {};
for (const r of withDate) {
    byProv[r.provider] = (byProv[r.provider] || 0) + 1;
}
console.log('\nDates found by provider:');
for (const [p, c] of Object.entries(byProv).sort((a, b) => b - a)) {
    console.log(`  ${String(c).padStart(4)}  ${p}`);
}
