#!/usr/bin/env node
/**
 * Build-time script: pre-processes game data and generates games.parquet.
 *
 * Replicates the transformations done by duckdb-client.js loadGamesData()
 * so the browser can load a single Parquet file instead of 5 JSON files
 * + 4500 sequential INSERT statements.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PROVIDER_NORMALIZATION_MAP } from '../src/lib/shared-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

function normalizeProvider(raw) {
    if (!raw) return 'Unknown';
    return PROVIDER_NORMALIZATION_MAP[raw] || raw;
}

function readJSON(filename) {
    try {
        return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
    } catch {
        console.warn(`⚠️  Could not read ${filename}, using empty fallback`);
        return filename.endsWith('.json') && !filename.includes('master') ? {} : [];
    }
}

async function main() {
    console.log('📦 Building games.parquet...');

    const games = readJSON('game_data_master.json');
    const themeMap = readJSON('theme_consolidation_map.json');
    const franchiseMap = readJSON('franchise_mapping.json');
    const confidenceMap = readJSON('confidence_map.json');
    const artMap = readJSON('staged_art_characterization.json');

    console.log(`   ${games.length} games, ${Object.keys(themeMap).length} theme mappings`);

    const validGames = games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');
    const sorted = [...validGames].sort((a, b) => (b.theo_win || 0) - (a.theo_win || 0));

    const isReliable = game => {
        const c = confidenceMap[game.name] || {};
        const specReliable = ['rtp', 'volatility', 'reels', 'paylines', 'max_win', 'min_bet', 'max_bet'].some(
            f => c[`${f}_confidence`] === 'verified' || c[`${f}_confidence`] === 'extracted'
        );
        const hasFeatures = Array.isArray(game.features) && game.features.length > 0;
        return specReliable || hasFeatures;
    };

    let reliableRank = 0;
    const rows = sorted.map(game => {
        const rank = isReliable(game) ? ++reliableRank : null;
        const name = String(game.name || '');
        const nameNorm = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const themePrimary = String(game.theme_primary || 'Unknown');
        const themeSecondary = String(game.theme_secondary || '');
        const themeConsolidated = themeMap[game.theme_primary] || game.theme_primary || 'Unknown';
        const paylines = game.paylines_count
            ? `${game.paylines_count}${game.paylines_kind ? ' ' + game.paylines_kind : ''}`
            : null;
        const rawStudio = game.studio || game.provider || '';
        const studioOrParent =
            !rawStudio || /^unknown$/i.test(rawStudio) ? game.parent_company || rawStudio : rawStudio;
        const normalizedStudio = normalizeProvider(studioOrParent);
        const featuresJson =
            Array.isArray(game.features) && game.features.length > 0 ? JSON.stringify(game.features) : null;
        const themesAllJson =
            Array.isArray(game.themes_all) && game.themes_all.length > 0 ? JSON.stringify(game.themes_all) : null;
        const themesRawJson =
            Array.isArray(game.themes_raw) && game.themes_raw.length > 0 ? JSON.stringify(game.themes_raw) : null;
        const symbolsJson =
            Array.isArray(game.symbols) && game.symbols.length > 0 ? JSON.stringify(game.symbols) : null;

        const conf = confidenceMap[game.name] || {};
        const art = artMap[game.name] || {};

        const safeNum = val => {
            if (val === null || val === undefined) return null;
            const num = Number(val);
            return isNaN(num) ? null : num;
        };

        return {
            id: game.id || '',
            name,
            name_normalized: nameNorm,
            theme_primary: themePrimary,
            theme_secondary: themeSecondary,
            theme_consolidated: themeConsolidated,
            provider_studio: normalizedStudio || null,
            provider_parent: game.parent_company || null,
            specs_reels: safeNum(game.reels),
            specs_rows: safeNum(game.rows),
            specs_paylines: paylines,
            specs_rtp: safeNum(game.rtp),
            specs_volatility: game.volatility || null,
            performance_theo_win: safeNum(game.theo_win) || 0,
            performance_rank: rank,
            performance_anomaly: game.anomaly || null,
            performance_market_share_percent:
                typeof safeNum(game.market_share_pct) === 'number' ? safeNum(game.market_share_pct) * 100 : 0,
            performance_percentile: game.percentile || null,
            release_year: safeNum(game.release_year),
            release_month: safeNum(game.release_month),
            original_release_year: safeNum(game.original_release_year),
            original_release_month: safeNum(game.original_release_month),
            features: featuresJson,
            themes_all: themesAllJson,
            themes_raw: themesRawJson,
            symbols: symbolsJson,
            description: game.description || null,
            demo_url: game.demo_url || null,
            data_quality: game.data_quality || null,
            sites: safeNum(game.sites),
            avg_bet: safeNum(game.avg_bet),
            median_bet: safeNum(game.median_bet),
            games_played_index: safeNum(game.games_played_index),
            coin_in_index: safeNum(game.coin_in_index),
            max_win: safeNum(game.max_win),
            min_bet: safeNum(game.min_bet),
            max_bet: safeNum(game.max_bet),
            franchise: franchiseMap[game.id]?.franchise || null,
            franchise_type: franchiseMap[game.id]?.franchise_type || null,
            game_category: game.game_category || null,
            game_sub_category: game.game_sub_category || null,
            rtp_confidence: conf.rtp_confidence || null,
            volatility_confidence: conf.volatility_confidence || null,
            reels_confidence: conf.reels_confidence || null,
            paylines_confidence: conf.paylines_confidence || null,
            max_win_confidence: conf.max_win_confidence || null,
            min_bet_confidence: conf.min_bet_confidence || null,
            max_bet_confidence: conf.max_bet_confidence || null,
            art_setting: art.art_setting || null,
            art_characters: art.art_characters ? JSON.stringify(art.art_characters) : null,
            art_elements: art.art_elements ? JSON.stringify(art.art_elements) : null,
            art_mood: art.art_mood || null,
            art_narrative: art.art_narrative || null,
        };
    });

    // Write pre-processed JSON (used as DuckDB fallback & for Parquet generation)
    const processedPath = join(DATA_DIR, 'games_processed.json');
    writeFileSync(processedPath, JSON.stringify(rows));
    const jsonSizeMB = (Buffer.byteLength(JSON.stringify(rows)) / 1024 / 1024).toFixed(1);
    console.log(`   ✅ games_processed.json: ${rows.length} rows, ${jsonSizeMB} MB`);

    // Generate Parquet via DuckDB (Node.js native)
    try {
        const duckdb = await import('duckdb');
        const db = new duckdb.default.Database(':memory:');
        const conn = db.connect();

        await new Promise((resolve, reject) => {
            conn.run(
                `CREATE TABLE games AS SELECT * FROM read_json_auto('${processedPath.replace(/\\/g, '/')}')`,
                err => (err ? reject(err) : resolve())
            );
        });

        const parquetPath = join(DATA_DIR, 'games.parquet');
        await new Promise((resolve, reject) => {
            conn.run(`COPY games TO '${parquetPath.replace(/\\/g, '/')}' (FORMAT PARQUET, COMPRESSION ZSTD)`, err =>
                err ? reject(err) : resolve()
            );
        });

        const { statSync } = await import('fs');
        const parquetSize = (statSync(parquetPath).size / 1024).toFixed(0);
        console.log(`   ✅ games.parquet: ${parquetSize} KB`);

        conn.close();
        db.close();
    } catch (err) {
        console.error('   ⚠️  Parquet generation failed (games_processed.json still available):', err.message);
    }

    console.log('📦 Build complete.');
}

main().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
