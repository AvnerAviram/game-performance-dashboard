#!/usr/bin/env node
/**
 * Merge art classification results into game_data_master.json.
 *
 * Maps art pipeline slugs (e.g. "10001-Nights.html") to master game names
 * (e.g. "10001 Nights") via normalization. Handles comma-formatted numbers,
 * provider suffixes, and trademark symbols.
 *
 * Usage: node scripts/merge-art-data.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MASTER_PATH = path.join(DATA_DIR, 'game_data_master.json');
const RESULTS_PATH = path.join(DATA_DIR, 'art_pipeline', 'results.json');

const dryRun = process.argv.includes('--dry-run');

function normalize(name) {
    return name
        .toLowerCase()
        .replace(/[,™®©]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

const PROVIDER_SUFFIXES = ['ainsworth', 'playtech', 'igt', 'high 5 games', 'wazdan', 'ags'];

function main() {
    const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
    const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));

    const masterGames = Object.values(master);
    const artEntries = Object.entries(results.games);

    const masterByNorm = new Map();
    for (const g of masterGames) {
        masterByNorm.set(normalize(g.name), g);
    }

    const FIELDS_TO_COPY = [
        'art_theme', 'art_theme_secondary', 'art_color_tone',
        'art_characters', 'art_character_categories', 'art_elements',
        'art_narrative', 'background_description', 'is_branded',
        'screenshot_quality',
    ];

    let matched = 0;
    let unmatched = 0;
    let cleaned = 0;
    const unmatchedList = [];

    for (const [key, artGame] of artEntries) {
        const slug = key.replace('.html', '');
        let norm = normalize(slug.replace(/-/g, ' '));

        let masterGame = masterByNorm.get(norm);

        if (!masterGame) {
            for (const suffix of PROVIDER_SUFFIXES) {
                const stripped = norm.replace(new RegExp('\\s+' + suffix + '$'), '').trim();
                if (stripped !== norm) {
                    masterGame = masterByNorm.get(stripped);
                    if (masterGame) break;
                }
            }
        }

        if (!masterGame) {
            const ltStripped = norm.replace(/\s+luckytap$/, '').trim();
            if (ltStripped !== norm) {
                masterGame = masterByNorm.get(ltStripped);
                if (!masterGame) {
                    masterGame = masterByNorm.get(ltStripped + ' luckytap ');
                    if (!masterGame) {
                        for (const g of masterGames) {
                            if (normalize(g.name).startsWith(ltStripped) && normalize(g.name).includes('luckytap')) {
                                masterGame = g;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (!masterGame) {
            unmatched++;
            unmatchedList.push(slug);
            continue;
        }

        matched++;
        for (const field of FIELDS_TO_COPY) {
            if (artGame[field] !== undefined) {
                masterGame[field] = artGame[field];
            }
        }

        const conf = artGame.confidence;
        if (conf) {
            masterGame.art_confidence = conf;
        }
    }

    for (const g of masterGames) {
        if (g.art_theme) {
            if (g.art_setting) { delete g.art_setting; cleaned++; }
            if (g.art_mood) { delete g.art_mood; cleaned++; }
            if (g.art_style) { delete g.art_style; cleaned++; }
        }
    }

    console.log(`\nMerge summary:`);
    console.log(`  Art games:     ${artEntries.length}`);
    console.log(`  Matched:       ${matched}`);
    console.log(`  Unmatched:     ${unmatched}`);
    console.log(`  Stale fields removed: ${cleaned}`);
    if (unmatchedList.length > 0) {
        console.log(`  Unmatched games: ${unmatchedList.join(', ')}`);
    }

    const withArtTheme = masterGames.filter(g => g.art_theme).length;
    const withOldSetting = masterGames.filter(g => g.art_setting).length;
    console.log(`\n  Master games with art_theme:   ${withArtTheme}`);
    console.log(`  Master games with art_setting: ${withOldSetting} (unmerged games only)`);

    if (dryRun) {
        console.log('\n  --dry-run: no file written.');
    } else {
        fs.writeFileSync(MASTER_PATH, JSON.stringify(master, null, 2) + '\n');
        console.log(`\n  Written: ${MASTER_PATH}`);
    }
}

main();
