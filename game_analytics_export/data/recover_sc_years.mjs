import { readFileSync, writeFileSync } from 'fs';

const master = JSON.parse(readFileSync('game_data_master.json', 'utf8'));
const stripped = master.filter(g => g.original_release_date_source === 'stripped_claude_calibration_failed');

const scData = JSON.parse(readFileSync('_sc_release_dates.json', 'utf8'));
console.log(`SC entries: ${Object.keys(scData).length}`);
console.log(`Stripped games to match: ${stripped.length}`);

function normalize(name) {
    return (name || '')
        .toLowerCase()
        .replace(/[™®©]/g, '')
        .replace(/[''\u2019\u2018!]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripSuffix(n) {
    return n
        .replace(/\b(deluxe|hd|online|slot|slots)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const scKeys = Object.keys(scData);

function findSC(gameName) {
    const gn = normalize(gameName);

    // Exact match
    if (scData[gn]) return { key: gn, ...scData[gn] };

    // Without suffix
    const gs = stripSuffix(gn);
    if (gs !== gn && scData[gs]) return { key: gs, ...scData[gs] };

    // SC key contains game name or vice versa
    for (const sk of scKeys) {
        if (gn.length >= 5 && (sk.includes(gn) || gn.includes(sk))) {
            return { key: sk, ...scData[sk] };
        }
    }

    // Token overlap (at least 80% of game name tokens in SC key)
    const gTokens = gn.split(' ').filter(t => t.length > 2);
    if (gTokens.length >= 2) {
        for (const sk of scKeys) {
            const sTokens = sk.split(' ');
            const overlap = gTokens.filter(t => sTokens.includes(t)).length;
            if (overlap >= gTokens.length * 0.8 && overlap >= 2) {
                return { key: sk, ...scData[sk] };
            }
        }
    }

    return null;
}

let matched = 0;
let unmatched = 0;
const recovered = [];
const notFound = [];

for (const game of stripped) {
    const sc = findSC(game.name);

    if (sc && sc.release_date) {
        const year = parseInt(sc.release_date.slice(0, 4));
        if (year >= 2005 && year <= 2026) {
            matched++;
            recovered.push({
                id: game.id,
                name: game.name,
                provider: game.provider || game.provider_studio,
                sc_name: sc.key,
                sc_year: year,
                sc_date: sc.release_date,
                nj_year: game.release_year,
                delta: game.release_year ? year - game.release_year : null,
            });
            continue;
        }
    }

    unmatched++;
    notFound.push({ name: game.name, provider: game.provider || game.provider_studio });
}

console.log(`\nMatched: ${matched} / ${stripped.length}`);
console.log(`Unmatched: ${unmatched}`);

// Group recovered by provider
const byProv = {};
for (const r of recovered) {
    byProv[r.provider] = byProv[r.provider] || [];
    byProv[r.provider].push(r);
}

console.log('\nRecoveries by provider:');
for (const [p, games] of Object.entries(byProv).sort((a, b) => b[1].length - a[1].length)) {
    const deltas = games.filter(g => g.delta !== null).map(g => g.delta);
    const avgDelta = deltas.length ? (deltas.reduce((s, d) => s + d, 0) / deltas.length).toFixed(1) : 'n/a';
    console.log(`  ${String(games.length).padStart(4)}  ${p}  (avg SC-NJ delta: ${avgDelta})`);
}

// Unmatched by provider
const uf = {};
for (const r of notFound) {
    uf[r.provider] = (uf[r.provider] || 0) + 1;
}
console.log('\nStill unmatched by provider:');
for (const [p, c] of Object.entries(uf).sort((a, b) => b - a).slice(0, 15)) {
    console.log(`  ${String(c).padStart(4)}  ${p}`);
}

// Show suspicious matches
console.log('\nSuspicious (|SC - NJ| > 3):');
for (const r of recovered.filter(r => Math.abs(r.delta || 0) > 3).slice(0, 10)) {
    console.log(`  ${r.name} [${r.provider}]: SC=${r.sc_year} NJ=${r.nj_year} (Δ${r.delta})`);
}

writeFileSync('_sc_recovery.json', JSON.stringify(recovered, null, 2) + '\n');
writeFileSync('_sc_not_found.json', JSON.stringify(notFound, null, 2) + '\n');
console.log('\nSaved files');
