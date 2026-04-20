import { readFileSync, writeFileSync } from 'fs';

const master = JSON.parse(readFileSync('game_data_master.json', 'utf8'));

let stripped = 0;
const strippedGames = [];

for (const g of master) {
    const src = g.original_release_date_source || '';
    if (src.startsWith('claude_lookup')) {
        strippedGames.push({
            id: g.id,
            name: g.name,
            provider: g.provider,
            old_year: g.original_release_year,
            old_source: g.original_release_date_source,
            nj_fallback: g.release_year,
        });

        g.original_release_year = null;
        g.original_release_month = null;
        g.original_release_date = null;
        g.original_release_date_source = 'stripped_claude_calibration_failed';
        stripped++;
    }
}

writeFileSync('game_data_master.json', JSON.stringify(master, null, 2) + '\n');
writeFileSync('_stripped_claude_years.json', JSON.stringify(strippedGames, null, 2) + '\n');

const withYear = master.filter(g => g.original_release_year).length;
console.log(`Stripped ${stripped} claude_lookup games`);
console.log(`Saved old values to _stripped_claude_years.json for reference`);
console.log(`Coverage: ${withYear}/${master.length} (${((100 * withYear) / master.length).toFixed(1)}%) now have original_release_year`);
