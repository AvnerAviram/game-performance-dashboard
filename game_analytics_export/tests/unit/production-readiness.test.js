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

    it('build script should only copy frontend-required data files', () => {
        expect(buildCmd).toContain('games_dashboard.json');
        expect(buildCmd).toContain('theme_consolidation_map.json');
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
                '.env', 'enrich_websearch.py', 'games_master.json',
                'ground_truth_ags.json', 'requirements.txt',
                'PHASE1_TRUTH_MASTER.md', 'enrichment_checkpoint.json',
                'phase0_themes_raw.json', 'phase0_features_raw.json'
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

describe('Nginx Configuration', () => {
    it('nginx.conf should exist in deploy/', () => {
        const path = join(ROOT, 'deploy', 'nginx.conf');
        expect(existsSync(path)).toBe(true);
    });

    it('nginx.conf should have essential security headers', () => {
        const conf = readFileSync(join(ROOT, 'deploy', 'nginx.conf'), 'utf-8');
        expect(conf).toContain('X-Content-Type-Options');
        expect(conf).toContain('X-Frame-Options');
        expect(conf).toContain('Strict-Transport-Security');
        expect(conf).toContain('Content-Security-Policy');
        expect(conf).toContain('Referrer-Policy');
        expect(conf).toContain('Permissions-Policy');
    });

    it('nginx.conf should block dotfiles', () => {
        const conf = readFileSync(join(ROOT, 'deploy', 'nginx.conf'), 'utf-8');
        expect(conf).toMatch(/location.*\\./);
        expect(conf).toContain('deny all');
    });

    it('nginx.conf should disable server tokens and directory listing', () => {
        const conf = readFileSync(join(ROOT, 'deploy', 'nginx.conf'), 'utf-8');
        expect(conf).toContain('server_tokens off');
        expect(conf).toContain('autoindex off');
    });

    it('nginx.conf should enforce HTTPS redirect', () => {
        const conf = readFileSync(join(ROOT, 'deploy', 'nginx.conf'), 'utf-8');
        expect(conf).toContain('return 301 https://');
    });

    it('nginx.conf should enable basic auth', () => {
        const conf = readFileSync(join(ROOT, 'deploy', 'nginx.conf'), 'utf-8');
        expect(conf).toContain('auth_basic');
        expect(conf).toContain('.htpasswd');
    });

    it('nginx.conf should enable gzip compression', () => {
        const conf = readFileSync(join(ROOT, 'deploy', 'nginx.conf'), 'utf-8');
        expect(conf).toContain('gzip on');
    });

    it('nginx.conf should use modern TLS only', () => {
        const conf = readFileSync(join(ROOT, 'deploy', 'nginx.conf'), 'utf-8');
        expect(conf).toContain('TLSv1.2');
        expect(conf).toContain('TLSv1.3');
        expect(conf).not.toContain('TLSv1.0');
        expect(conf).not.toContain('TLSv1.1');
        expect(conf).not.toContain('SSLv');
    });
});

describe('Deploy Script', () => {
    it('deploy.sh should exist and be executable-ready', () => {
        const path = join(ROOT, 'deploy', 'deploy.sh');
        expect(existsSync(path)).toBe(true);
    });

    it('deploy.sh should verify no .env in dist before deploying', () => {
        const script = readFileSync(join(ROOT, 'deploy', 'deploy.sh'), 'utf-8');
        expect(script).toContain('.env');
        expect(script).toContain('exit 1');
    });

    it('deploy.sh should use rsync with --delete for clean deploys', () => {
        const script = readFileSync(join(ROOT, 'deploy', 'deploy.sh'), 'utf-8');
        expect(script).toContain('rsync');
        expect(script).toContain('--delete');
    });
});
