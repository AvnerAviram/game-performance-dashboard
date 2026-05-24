#!/usr/bin/env node
/**
 * Production build script.
 *
 * Steps:
 *   1. Generate data (build:data -> data/games.parquet + data/games_processed.json)
 *   2. Copy data + config into public/ so Vite includes them in dist/
 *   3. Run vite build (bundles JS/HTML, processes CSS via PostCSS, copies public/ -> dist/)
 *   4. Stamp dist/sw.js with build timestamp for cache busting
 *   5. Write dist/health.json
 *   6. Verify all expected artifacts exist
 */
import { execSync } from 'child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ROOT, DATA_DIR, MASTER_JSON, MAPPINGS, STAGING } = require('../src/lib/data-paths.cjs');

function run(cmd, label) {
    console.log(`\n▶ ${label}`);
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function step(label) {
    console.log(`\n● ${label}`);
}

// ─── Step 1: Generate data ───────────────────────────────────────────────────
run('npm run build:data', 'Generating game data (parquet + JSON)');

// ─── Step 2: Copy data + config into public/ for Vite ────────────────────────
step('Copying data files to public/data/');

/** Each entry copies from `src` to public/data/`destFile` (flat URLs for the frontend). */
const DATA_FILES = [
    { destFile: 'games.parquet', src: join(DATA_DIR, 'games.parquet') },
    { destFile: 'games_processed.json', src: join(DATA_DIR, 'games_processed.json') },
    { destFile: 'game_data_master.json', src: MASTER_JSON },
    { destFile: 'theme_consolidation_map.json', src: MAPPINGS.theme },
    { destFile: 'art_theme_consolidation_map.json', src: MAPPINGS.artTheme },
    { destFile: 'franchise_mapping.json', src: MAPPINGS.franchise },
    { destFile: 'confidence_map.json', src: MAPPINGS.confidence },
    { destFile: 'staged_art_characterization.json', src: STAGING.art },
];

mkdirSync(join(ROOT, 'public', 'data'), { recursive: true });

for (const { destFile, src } of DATA_FILES) {
    const dest = join(ROOT, 'public', 'data', destFile);
    if (!existsSync(src)) {
        console.warn(`   ⚠️  ${destFile} (${src}) not found — skipping`);
        continue;
    }
    cpSync(src, dest);
    const size = (statSync(dest).size / 1024).toFixed(0);
    console.log(`   ✓ ${destFile} (${size} KB)`);
}

step('Copying config files to public/src/config/');
mkdirSync(join(ROOT, 'public', 'src', 'config'), { recursive: true });
cpSync(
    join(ROOT, 'src', 'config', 'theme-breakdowns.json'),
    join(ROOT, 'public', 'src', 'config', 'theme-breakdowns.json')
);
console.log('   ✓ theme-breakdowns.json');

// ─── Step 3: Vite build ──────────────────────────────────────────────────────
run('npx vite build', 'Running Vite build (JS + CSS + HTML → dist/)');

// ─── Step 4: Stamp service worker ───────────────────────────────────────────
step('Stamping sw.js with build timestamp');
const swSrc = join(ROOT, 'sw.js');
const swDest = join(ROOT, 'dist', 'sw.js');
if (existsSync(swSrc)) {
    let sw = readFileSync(swSrc, 'utf8');
    sw = sw.replace(/gad-v\d+/, 'gad-' + Date.now());
    writeFileSync(swDest, sw);
    console.log('   ✓ sw.js copied and stamped');
} else {
    console.warn('   ⚠️  sw.js not found at project root');
}

// ─── Step 5: Write health.json ───────────────────────────────────────────────
step('Writing health.json');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
writeFileSync(
    join(ROOT, 'dist', 'health.json'),
    JSON.stringify({ status: 'ok', version: pkg.version, built: new Date().toISOString() })
);
console.log('   ✓ health.json');

// ─── Step 6: Verify artifacts ────────────────────────────────────────────────
step('Verifying build artifacts');
const REQUIRED_ARTIFACTS = [
    'dist/data/games.parquet',
    'dist/data/games_processed.json',
    'dist/data/game_data_master.json',
    'dist/src/config/theme-breakdowns.json',
    'dist/sw.js',
    'dist/health.json',
    'dist/duckdb/duckdb-mvp.wasm',
    'dist/duckdb/duckdb-browser-mvp.worker.js',
];

let allGood = true;
for (const rel of REQUIRED_ARTIFACTS) {
    const full = join(ROOT, rel);
    if (existsSync(full)) {
        console.log(`   ✓ ${rel}`);
    } else {
        console.error(`   ✗ MISSING: ${rel}`);
        allGood = false;
    }
}

if (!allGood) {
    console.error('\n❌ Build verification failed — some artifacts are missing!');
    process.exit(1);
}

console.log('\n✅ Build complete!\n');
