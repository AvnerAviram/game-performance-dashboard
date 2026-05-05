/**
 * Build Pipeline Tests
 *
 * Validates that scripts/build.mjs is correctly structured, that
 * package.json delegates to it, and that the release script is compatible.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '../..');
const buildScript = readFileSync(resolve(ROOT, 'scripts/build.mjs'), 'utf-8');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

describe('Build script (scripts/build.mjs)', () => {
    test('exists', () => {
        expect(existsSync(resolve(ROOT, 'scripts/build.mjs'))).toBe(true);
    });

    test('package.json build delegates to build.mjs', () => {
        expect(pkg.scripts.build).toContain('scripts/build.mjs');
    });

    test('runs build:data before vite build', () => {
        const dataPos = buildScript.indexOf('build:data');
        const vitePos = buildScript.indexOf('vite build');
        expect(dataPos).toBeGreaterThan(-1);
        expect(vitePos).toBeGreaterThan(dataPos);
    });

    test('copies all required data files to public/data', () => {
        const required = [
            'games.parquet',
            'games_processed.json',
            'game_data_master.json',
            'theme_consolidation_map.json',
            'art_theme_consolidation_map.json',
            'franchise_mapping.json',
            'confidence_map.json',
            'staged_art_characterization.json',
        ];
        for (const file of required) {
            expect(buildScript).toContain(file);
        }
    });

    test('copies theme-breakdowns.json config', () => {
        expect(buildScript).toContain('theme-breakdowns.json');
    });

    test('stamps sw.js with build timestamp', () => {
        expect(buildScript).toContain('sw.js');
        expect(buildScript).toContain('gad-');
    });

    test('writes health.json', () => {
        expect(buildScript).toContain('health.json');
    });

    test('verifies required artifacts after build', () => {
        expect(buildScript).toContain('REQUIRED_ARTIFACTS');
        expect(buildScript).toContain('dist/data/games.parquet');
        expect(buildScript).toContain('dist/data/games_processed.json');
        expect(buildScript).toContain('dist/src/config/theme-breakdowns.json');
        expect(buildScript).toContain('dist/sw.js');
        expect(buildScript).toContain('dist/health.json');
    });

    test('exits with error if artifacts are missing', () => {
        expect(buildScript).toContain('process.exit(1)');
    });

    test('does NOT copy .env or secrets', () => {
        const dataFilesMatch = buildScript.match(/DATA_FILES\s*=\s*\[([\s\S]*?)\]/);
        expect(dataFilesMatch).not.toBeNull();
        const dataFilesList = dataFilesMatch[1];
        expect(dataFilesList).not.toContain('.env');
        expect(dataFilesList).not.toContain('users.json');
    });
});

describe('CSS pipeline via Vite', () => {
    test('no build:css or watch:css scripts in package.json', () => {
        expect(pkg.scripts['build:css']).toBeUndefined();
        expect(pkg.scripts['watch:css']).toBeUndefined();
    });

    test('app.js imports input.css', () => {
        const appJs = readFileSync(resolve(ROOT, 'src/app.js'), 'utf-8');
        expect(appJs).toContain("import './input.css'");
    });

    test('login-page.js imports input.css', () => {
        const loginJs = readFileSync(resolve(ROOT, 'src/pages/login-page.js'), 'utf-8');
        expect(loginJs).toContain("import '../input.css'");
    });

    test('dashboard.html does NOT link output.css', () => {
        const html = readFileSync(resolve(ROOT, 'dashboard.html'), 'utf-8');
        expect(html).not.toContain('output.css');
    });

    test('login.html does NOT link output.css', () => {
        const html = readFileSync(resolve(ROOT, 'login.html'), 'utf-8');
        expect(html).not.toContain('output.css');
    });

    test('server PUBLIC_PATHS does NOT include output.css', () => {
        const server = readFileSync(resolve(ROOT, 'server/server.cjs'), 'utf-8');
        expect(server).not.toContain('output.css');
    });

    test('tailwind.config.js includes login.html in content', () => {
        const config = readFileSync(resolve(ROOT, 'tailwind.config.js'), 'utf-8');
        expect(config).toContain('login.html');
    });

    test('postcss.config.js includes autoprefixer', () => {
        const config = readFileSync(resolve(ROOT, 'postcss.config.js'), 'utf-8');
        expect(config).toContain('autoprefixer');
    });
});

describe('Release script compatibility', () => {
    test('package.cjs exists', () => {
        expect(existsSync(resolve(ROOT, 'scripts/package.cjs'))).toBe(true);
    });

    test('release script uses npm run build', () => {
        const release = readFileSync(resolve(ROOT, 'scripts/package.cjs'), 'utf-8');
        expect(release).toContain('npm run build');
    });

    test('npm start does not depend on build:css', () => {
        expect(pkg.scripts.start).not.toContain('build:css');
    });

    test('npm start runs server directly', () => {
        expect(pkg.scripts.start).toContain('server/server.cjs');
    });
});
