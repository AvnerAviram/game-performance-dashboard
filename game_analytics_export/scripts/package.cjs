#!/usr/bin/env node
/**
 * Release packaging script.
 *
 * Bumps the patch version, runs the production build, and assembles
 * a clean release/ folder ready to zip and deploy.
 *
 * Usage: npm run release
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RELEASE = path.join(ROOT, 'release');
const PKG_PATH = path.join(ROOT, 'package.json');

// ── 1. Bump patch version ───────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = newVersion;
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 4) + '\n');
console.log(`\n  ⬆  Version bumped: ${major}.${minor}.${patch} → ${newVersion}\n`);

// ── 2. Run production build ─────────────────────────────────────────────
console.log('  🔨 Running production build...\n');
try {
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
} catch {
    console.error('\n  ❌ Build failed. Version was already bumped to ' + newVersion);
    process.exit(1);
}

// ── 3. Clean and create release/ ────────────────────────────────────────
if (fs.existsSync(RELEASE)) {
    fs.rmSync(RELEASE, { recursive: true, force: true });
}
fs.mkdirSync(RELEASE, { recursive: true });

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function copyFile(src, dest) {
    const destDir = path.dirname(dest);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
}

// ── 4. Copy files into release/ ─────────────────────────────────────────

// dist/ (entire directory)
copyDir(path.join(ROOT, 'dist'), path.join(RELEASE, 'dist'));

// server/ (excluding users.json, tickets.json, .sessions/)
const SERVER_EXCLUDE = new Set(['users.json', 'tickets.json', '.sessions']);
function copyServerDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (SERVER_EXCLUDE.has(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyServerDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
copyServerDir(path.join(ROOT, 'server'), path.join(RELEASE, 'server'));

// data/ (only the 3 API JSON files)
const DATA_FILES = [
    'game_data_master.json',
    'theme_consolidation_map.json',
    'franchise_mapping.json',
];
for (const f of DATA_FILES) {
    copyFile(path.join(ROOT, 'data', f), path.join(RELEASE, 'data', f));
}

// src/config/theme-breakdowns.json
copyFile(
    path.join(ROOT, 'src', 'config', 'theme-breakdowns.json'),
    path.join(RELEASE, 'src', 'config', 'theme-breakdowns.json')
);

// logs/ directory (empty placeholder so Node logging works immediately)
fs.mkdirSync(path.join(RELEASE, 'logs'), { recursive: true });

// Root files
copyFile(PKG_PATH, path.join(RELEASE, 'package.json'));
const lockPath = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lockPath)) {
    copyFile(lockPath, path.join(RELEASE, 'package-lock.json'));
}
copyFile(path.join(ROOT, 'web.config'), path.join(RELEASE, 'web.config'));
copyFile(path.join(ROOT, '.env.example'), path.join(RELEASE, '.env.example'));
copyFile(path.join(ROOT, 'deploy', 'install.ps1'), path.join(RELEASE, 'install.ps1'));

// ── 5. Safety checks ───────────────────────────────────────────────────
const envLeak = path.join(RELEASE, 'data', '.env');
if (fs.existsSync(envLeak)) {
    console.error('  ❌ SECURITY: .env found in release/data/ — aborting.');
    fs.rmSync(RELEASE, { recursive: true, force: true });
    process.exit(1);
}

const releaseDataFiles = fs.readdirSync(path.join(RELEASE, 'data'));
if (releaseDataFiles.length > DATA_FILES.length) {
    console.error(`  ⚠  release/data/ has ${releaseDataFiles.length} files (expected ${DATA_FILES.length}):`);
    releaseDataFiles.forEach(f => console.error(`     - ${f}`));
    process.exit(1);
}

// ── 6. Remove old release zips and create new one ───────────────────────
for (const f of fs.readdirSync(ROOT)) {
    if (/^release-v[\d.]+\.zip$/.test(f)) {
        fs.unlinkSync(path.join(ROOT, f));
    }
}

const zipName = `release-v${newVersion}.zip`;
const zipPath = path.join(ROOT, zipName);
try {
    execSync(`zip -r "${zipPath}" .`, { cwd: RELEASE, stdio: 'pipe' });
} catch (e) {
    console.error('  ⚠  zip command failed — release/ folder is still ready but no zip was created.');
    console.error('     ' + (e.stderr || e.message));
}

// ── 7. Summary ──────────────────────────────────────────────────────────
let totalFiles = 0;
let totalBytes = 0;
function countDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            countDir(p);
        } else {
            totalFiles++;
            totalBytes += fs.statSync(p).size;
        }
    }
}
countDir(RELEASE);

const sizeMB = (totalBytes / 1024 / 1024).toFixed(1);
const zipExists = fs.existsSync(zipPath);
const zipSizeMB = zipExists ? (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1) : '?';
console.log(`
  ✅ Release v${newVersion} packaged successfully!

     📁 release/           ${totalFiles} files, ${sizeMB} MB
        dist/              Built frontend
        server/            Express server
        data/              ${DATA_FILES.length} API JSON files
        src/config/        theme-breakdowns.json
        logs/              Log output directory
        install.ps1        Run on server after extraction
        package.json       For npm install --omit=dev
        web.config         IIS config
        .env.example       Env reference
${zipExists ? `\n     📦 ${zipName}   ${zipSizeMB} MB — ready to upload` : ''}
`);
