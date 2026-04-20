import { readFileSync, writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const dotenv = readFileSync('.env', 'utf8');
const apiKey = dotenv.match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) throw new Error('No ANTHROPIC_API_KEY in .env');

const client = new Anthropic({ apiKey });

// AGS ground truth: first online release dates from provider Excel
const agsGroundTruth = {
    'Golden Wins': { year: 2019, date: '2019-03-19', market: 'GIB & EU' },
    'Jade Wins': { year: 2019, date: '2019-04-04', market: 'GIB' },
    'Longhorn Jackpots': { year: 2019, date: '2019-05-07', market: 'GIB & EU' },
    'Fu Nan Fu Nu': { year: 2019, date: '2019-06-06', market: 'GIB' },
    "Rakin' Bacon!": { year: 2019, date: '2019-06-20', market: 'GIB' },
    'Olympus Strikes': { year: 2019, date: '2019-07-25', market: 'GIB' },
    'River Dragons': { year: 2019, date: '2019-10-03', market: 'GIB' },
    'Forest Dragons': { year: 2019, date: '2019-10-17', market: 'GIB' },
    'Fire Wolf II': { year: 2019, date: '2019-10-17', market: 'GIB' },
    'Pharaoh Sun': { year: 2019, date: '2019-10-31', market: 'GIB' },
    'Bonanza Blast': { year: 2020, date: '2020-01-09', market: 'GIB' },
    'Wolf Queen': { year: 2020, date: '2020-03-19', market: 'operator' },
    'Capital Gains': { year: 2020, date: '2020-04-03', market: 'operator' },
    'Apollo Stacks': { year: 2020, date: '2020-05-15', market: 'operator' },
    'Crystal Magic': { year: 2020, date: '2020-07-01', market: 'operator' },
    'Jade Dragon': { year: 2020, date: '2020-07-23', market: 'operator' },
    'Grand Royale': { year: 2020, date: '2020-07-23', market: 'operator' },
    'Vegas Stacks': { year: 2020, date: '2020-08-17', market: 'operator' },
    'Flamenco Stacks': { year: 2020, date: '2020-10-01', market: 'operator' },
    'Hearts & Horns': { year: 2020, date: '2020-11-19', market: 'operator' },
    'Red Silk': { year: 2020, date: '2020-12-17', market: 'operator' },
    'Golden Ram': { year: 2021, date: '2021-01-07', market: 'operator' },
    'Goddess Treasures': { year: 2021, date: '2021-02-11', market: 'operator' },
    'Blazing Luck': { year: 2021, date: '2021-04-09', market: 'operator' },
    'Tiger Lord': { year: 2021, date: '2021-04-09', market: 'operator' },
    'Aztec Chief': { year: 2021, date: '2021-04-29', market: 'operator' },
    'Dragon Fa': { year: 2021, date: '2021-05-13', market: 'operator' },
    'Imperial Luck': { year: 2021, date: '2021-06-16', market: 'operator' },
    'Luck & Luxury': { year: 2020, date: '2020-09-03', market: 'operator' },
    'Peacock Beauty': { year: 2021, date: '2021-06-24', market: 'operator' },
    "Mermaid's Fortune": { year: 2021, date: '2021-07-29', market: 'operator' },
    'Golden Wins Deluxe': { year: 2021, date: '2021-08-11', market: 'operator' },
};

// Test games: pick 10 diverse ones for the calibration run
const testGames = [
    { name: 'Golden Wins', provider: 'AGS' },
    { name: 'Rakin Bacon', provider: 'AGS' },
    { name: 'River Dragons', provider: 'AGS' },
    { name: 'Tiger Lord', provider: 'AGS' },
    { name: 'Apollo Stacks', provider: 'AGS' },
    { name: 'Blazing Luck', provider: 'AGS' },
    { name: 'Red Silk', provider: 'AGS' },
    { name: 'Vegas Stacks', provider: 'AGS' },
    { name: 'Olympus Strikes', provider: 'AGS' },
    { name: 'Crystal Magic', provider: 'AGS' },
];

function findGT(name) {
    const n = name.toLowerCase().replace(/[''!]/g, '').trim();
    for (const [k, v] of Object.entries(agsGroundTruth)) {
        if (k.toLowerCase().replace(/[''!]/g, '').trim() === n) return v;
        if (k.toLowerCase().replace(/[''!]/g, '').trim().includes(n)) return v;
        if (n.includes(k.toLowerCase().replace(/[''!]/g, '').trim())) return v;
    }
    return null;
}

// ===== METHOD 1: Claude API with better prompt =====
async function tryClaudeOnline(gameName, provider) {
    const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [
            {
                role: 'user',
                content: `When did the slot game "${gameName}" by ${provider} first launch ONLINE at internet casinos? 

IMPORTANT: I need the ONLINE/iGaming release date, NOT the land-based casino cabinet release date. Many slot games are first released as physical cabinet games in land-based casinos years before they are adapted for online play.

Reply with ONLY a JSON object: {"online_year": YYYY, "confidence": "high"|"medium"|"low", "reasoning": "brief explanation"}

If you don't know the online release date specifically, say so in reasoning and give your best estimate with low confidence.`,
            },
        ],
    });

    const text = response.content[0].text;
    try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
    } catch {}
    return { online_year: null, confidence: 'failed', reasoning: text };
}

// ===== METHOD 2: Web search via Claude =====
async function tryClaudeWebSearch(gameName, provider) {
    const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [
            {
                role: 'user',
                content: `I need the year when "${gameName}" slot game by ${provider} was first available to play at online casinos (iGaming / internet gambling sites), NOT when it was released as a land-based physical slot machine.

For context: ${provider} is primarily a land-based slot manufacturer. Their games often launch in physical casinos first, then get adapted for online play years later.

Reply with ONLY: {"online_year": YYYY, "confidence": "high"|"medium"|"low", "note": "brief source/reasoning"}`,
            },
        ],
    });

    const text = response.content[0].text;
    try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
    } catch {}
    return { online_year: null, confidence: 'failed', note: text };
}

// ===== RUN CALIBRATION =====
console.log('=== Year Source Calibration ===');
console.log(`Testing ${testGames.length} AGS games against ground truth\n`);

const results = [];

for (const game of testGames) {
    const gt = findGT(game.name);
    if (!gt) {
        console.log(`  SKIP: ${game.name} - no ground truth`);
        continue;
    }

    console.log(`Testing: ${game.name} (GT: ${gt.year})...`);

    // Method 1: Claude online-specific prompt
    let claude1;
    try {
        claude1 = await tryClaudeOnline(game.name, game.provider);
    } catch (e) {
        claude1 = { online_year: null, confidence: 'error', reasoning: e.message };
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));

    // Method 2: Claude with context about land-based-first
    let claude2;
    try {
        claude2 = await tryClaudeWebSearch(game.name, game.provider);
    } catch (e) {
        claude2 = { online_year: null, confidence: 'error', note: e.message };
    }

    await new Promise(r => setTimeout(r, 500));

    const result = {
        name: game.name,
        provider: game.provider,
        gt_year: gt.year,
        gt_date: gt.date,
        method1_year: claude1.online_year,
        method1_confidence: claude1.confidence,
        method1_reasoning: claude1.reasoning || claude1.note,
        method2_year: claude2.online_year,
        method2_confidence: claude2.confidence,
        method2_reasoning: claude2.note,
        method1_delta: claude1.online_year ? claude1.online_year - gt.year : null,
        method2_delta: claude2.online_year ? claude2.online_year - gt.year : null,
    };

    results.push(result);

    const m1ok = result.method1_delta !== null && Math.abs(result.method1_delta) <= 1 ? 'OK' : 'MISS';
    const m2ok = result.method2_delta !== null && Math.abs(result.method2_delta) <= 1 ? 'OK' : 'MISS';
    console.log(`  M1(online prompt): ${claude1.online_year} [${m1ok}] ${claude1.confidence}`);
    console.log(`  M2(context prompt): ${claude2.online_year} [${m2ok}] ${claude2.confidence}`);
    console.log();
}

// Summary
console.log('=== CALIBRATION RESULTS ===\n');
const m1correct = results.filter(r => r.method1_delta !== null && Math.abs(r.method1_delta) === 0).length;
const m1within1 = results.filter(r => r.method1_delta !== null && Math.abs(r.method1_delta) <= 1).length;
const m2correct = results.filter(r => r.method2_delta !== null && Math.abs(r.method2_delta) === 0).length;
const m2within1 = results.filter(r => r.method2_delta !== null && Math.abs(r.method2_delta) <= 1).length;

console.log(`Method 1 (online prompt):   exact=${m1correct}/${results.length}  within1yr=${m1within1}/${results.length}`);
console.log(`Method 2 (context prompt):  exact=${m2correct}/${results.length}  within1yr=${m2within1}/${results.length}`);

console.log('\nDetailed results:');
console.log(`${'Game'.padEnd(25)} ${'GT'.padEnd(6)} ${'M1'.padEnd(6)} ${'M1Δ'.padEnd(6)} ${'M2'.padEnd(6)} ${'M2Δ'.padEnd(6)}`);
console.log('-'.repeat(70));
for (const r of results) {
    const m1 = r.method1_year || '-';
    const m2 = r.method2_year || '-';
    const d1 = r.method1_delta !== null ? `${r.method1_delta > 0 ? '+' : ''}${r.method1_delta}` : '-';
    const d2 = r.method2_delta !== null ? `${r.method2_delta > 0 ? '+' : ''}${r.method2_delta}` : '-';
    console.log(`${r.name.padEnd(25)} ${String(r.gt_year).padEnd(6)} ${String(m1).padEnd(6)} ${d1.padEnd(6)} ${String(m2).padEnd(6)} ${d2.padEnd(6)}`);
}

writeFileSync('_calibration_results.json', JSON.stringify(results, null, 2) + '\n');
console.log('\nSaved to _calibration_results.json');
