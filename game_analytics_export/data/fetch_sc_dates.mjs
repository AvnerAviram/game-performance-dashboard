import { readFileSync, writeFileSync, existsSync } from 'fs';

const notFound = JSON.parse(readFileSync('_sc_not_found.json', 'utf8'));
console.log(`Games to look up on SlotCatalog: ${notFound.length}`);

function slugify(name) {
    return name
        .replace(/['''\u2019\u2018]/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

async function fetchSCDate(gameName) {
    const slug = slugify(gameName);
    const url = `https://slotcatalog.com/en/slots/${slug}`;

    try {
        const resp = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SlotResearch/1.0)' },
            signal: AbortSignal.timeout(8000),
        });

        if (!resp.ok) return { found: false, url, status: resp.status };

        const html = await resp.text();

        // Extract release date from page
        const dateMatch = html.match(/Release Date:\s*<\/td>\s*<td[^>]*>(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch) {
            const altMatch = html.match(/(\d{4}-\d{2}-\d{2})\s*<\/td>/);
            if (altMatch) return { found: true, date: altMatch[1], url };
            return { found: true, date: null, url };
        }

        return { found: true, date: dateMatch[1], url };
    } catch (e) {
        return { found: false, error: e.message, url };
    }
}

// Test with 20 games from different providers
const testGames = [];
const provSeen = {};
for (const g of notFound) {
    if (!provSeen[g.provider]) provSeen[g.provider] = 0;
    if (provSeen[g.provider] < 2 && testGames.length < 20) {
        testGames.push(g);
        provSeen[g.provider]++;
    }
}

console.log(`\nTesting ${testGames.length} games...`);

const results = [];
for (const g of testGames) {
    const result = await fetchSCDate(g.name);
    results.push({ name: g.name, provider: g.provider, ...result });

    const status = result.found
        ? result.date
            ? `DATE: ${result.date}`
            : 'PAGE FOUND, NO DATE'
        : `NOT FOUND (${result.status || result.error})`;
    console.log(`  ${g.name.padEnd(45)} ${g.provider.padEnd(20)} ${status}`);

    await new Promise(r => setTimeout(r, 300));
}

const found = results.filter(r => r.found).length;
const withDate = results.filter(r => r.date).length;
console.log(`\nResults: ${found}/${results.length} pages found, ${withDate} with dates`);
console.log('Hit rate:', ((found / results.length) * 100).toFixed(0) + '%');
console.log('Date rate:', ((withDate / results.length) * 100).toFixed(0) + '%');
