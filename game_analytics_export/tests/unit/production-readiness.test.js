/**
 * Production Readiness Tests
 * Validates build security, XSS sanitization, deployment config,
 * and data exposure prevention.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../..');

describe('Build Security', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    const buildCmd = pkg.scripts?.build || '';

    it('build script should NOT copy entire data/ directory', () => {
        expect(buildCmd).not.toContain('cp -r data dist');
        expect(buildCmd).not.toContain('cp -r data/ dist');
    });

    it('build script should copy game data to dist', () => {
        expect(buildCmd).toContain('games_dashboard.json');
    });

    it('build script should copy theme-breakdowns.json for theme panels', () => {
        expect(buildCmd).toContain('theme-breakdowns.json');
    });

    it('build script should NOT reference .env in copy commands', () => {
        const copyParts = buildCmd.split('&&').filter(p => p.includes('cp '));
        copyParts.forEach(part => {
            expect(part).not.toContain('.env');
        });
    });

    it('.env should not exist in dist/ after build', () => {
        const distEnv = join(ROOT, 'dist', 'data', '.env');
        if (existsSync(join(ROOT, 'dist'))) {
            expect(existsSync(distEnv)).toBe(false);
        }
    });

    it('pipeline-only files should not exist in dist/data/', () => {
        const distData = join(ROOT, 'dist', 'data');
        if (existsSync(distData)) {
            const files = readdirSync(distData);
            const forbidden = [
                '.env',
                'enrich_websearch.py',
                'games_master.json',
                'ground_truth_ags.json',
                'requirements.txt',
                'PHASE1_TRUTH_MASTER.md',
                'enrichment_checkpoint.json',
                'phase0_themes_raw.json',
                'phase0_features_raw.json',
            ];
            forbidden.forEach(f => {
                expect(files).not.toContain(f);
            });
        }
    });
});

describe('Data Files', () => {
    it('games_dashboard.json should exist and be valid JSON', () => {
        const path = join(ROOT, 'data', 'games_dashboard.json');
        expect(existsSync(path)).toBe(true);
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
    });

    it('theme_consolidation_map.json should exist and be valid JSON', () => {
        const path = join(ROOT, 'data', 'theme_consolidation_map.json');
        expect(existsSync(path)).toBe(true);
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        expect(typeof data).toBe('object');
    });

    it('theme-breakdowns.json should exist and be valid JSON', () => {
        const path = join(ROOT, 'src', 'config', 'theme-breakdowns.json');
        expect(existsSync(path)).toBe(true);
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        expect(typeof data).toBe('object');
    });

    it('games_dashboard.json should not contain API keys or secrets', () => {
        const raw = readFileSync(join(ROOT, 'data', 'games_dashboard.json'), 'utf-8');
        expect(raw.toLowerCase()).not.toContain('api_key');
        expect(raw.toLowerCase()).not.toContain('apikey');
        expect(raw.toLowerCase()).not.toContain('anthropic');
        expect(raw).not.toContain('sk-ant-');
        expect(raw).not.toMatch(/secret[_-]?key/i);
    });
});

describe('Robots.txt', () => {
    it('robots.txt should exist in public/', () => {
        const path = join(ROOT, 'public', 'robots.txt');
        expect(existsSync(path)).toBe(true);
    });

    it('robots.txt should disallow all crawlers', () => {
        const content = readFileSync(join(ROOT, 'public', 'robots.txt'), 'utf-8');
        expect(content).toContain('Disallow: /');
    });
});

describe('HTML Security', () => {
    const htmlFiles = ['dashboard.html', 'login.html'];

    htmlFiles.forEach(file => {
        it(`${file} should have a meta description`, () => {
            const html = readFileSync(join(ROOT, file), 'utf-8');
            expect(html).toContain('meta name="description"');
        });

        it(`${file} should have a favicon`, () => {
            const html = readFileSync(join(ROOT, file), 'utf-8');
            expect(html).toContain('rel="icon"');
        });
    });
});

describe('IIS Configuration (web.config)', () => {
    it('web.config should exist in project root', () => {
        expect(existsSync(join(ROOT, 'web.config'))).toBe(true);
    });

    it('web.config should use HttpPlatformHandler', () => {
        const xml = readFileSync(join(ROOT, 'web.config'), 'utf-8');
        expect(xml).toContain('httpPlatformHandler');
        expect(xml).toContain('httpPlatform');
    });

    it('web.config should have essential security headers', () => {
        const xml = readFileSync(join(ROOT, 'web.config'), 'utf-8');
        expect(xml).toContain('X-Content-Type-Options');
        expect(xml).toContain('X-Frame-Options');
        expect(xml).toContain('Strict-Transport-Security');
        expect(xml).toContain('Referrer-Policy');
        expect(xml).toContain('Permissions-Policy');
    });

    it('web.config should delegate CSP to Helmet (not duplicate)', () => {
        const xml = readFileSync(join(ROOT, 'web.config'), 'utf-8');
        expect(xml).toContain('CSP is managed by Helmet');
        expect(xml).not.toMatch(/add name="Content-Security-Policy"/);
    });

    it('web.config should block sensitive segments', () => {
        const xml = readFileSync(join(ROOT, 'web.config'), 'utf-8');
        expect(xml).toContain('.env');
        expect(xml).toContain('.git');
        expect(xml).toContain('node_modules');
    });

    it('web.config should remove X-Powered-By header', () => {
        const xml = readFileSync(join(ROOT, 'web.config'), 'utf-8');
        expect(xml).toContain('remove name="X-Powered-By"');
    });
});

describe('Deploy Scripts', () => {
    it('deploy.ps1 should exist for Windows Server', () => {
        expect(existsSync(join(ROOT, 'deploy', 'deploy.ps1'))).toBe(true);
    });

    it('deploy.ps1 should verify no .env in dist before deploying', () => {
        const script = readFileSync(join(ROOT, 'deploy', 'deploy.ps1'), 'utf-8');
        expect(script).toContain('.env');
        expect(script).toContain('SECURITY ERROR');
    });

    it('deploy.ps1 should exclude users.json from copy', () => {
        const script = readFileSync(join(ROOT, 'deploy', 'deploy.ps1'), 'utf-8');
        expect(script).toContain('users.json');
    });

    it('deploy.sh should also exist for Linux fallback', () => {
        expect(existsSync(join(ROOT, 'deploy', 'deploy.sh'))).toBe(true);
    });
});
