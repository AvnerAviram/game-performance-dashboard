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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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

const DATA_FILES = [
    'games.parquet',
    'games_processed.json',
    'game_data_master.json',
    'theme_consolidation_map.json',
    'art_theme_consolidation_map.json',
    'franchise_mapping.json',
    'confidence_map.json',
    'staged_art_characterization.json',
];

mkdirSync(join(ROOT, 'public', 'data'), { recursive: true });

for (const file of DATA_FILES) {
    const src = join(ROOT, 'data', file);
    const dest = join(ROOT, 'public', 'data', file);
    if (!existsSync(src)) {
        console.warn(`   ⚠️  ${file} not found in data/ — skipping`);
        continue;
    }
    cpSync(src, dest);
    const size = (statSync(dest).size / 1024).toFixed(0);
    console.log(`   ✓ ${file} (${size} KB)`);
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
