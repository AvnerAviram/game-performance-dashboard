/**
 * Deployment Readiness Tests
 *
 * Validates production configuration BEFORE deploying.
 * Catches CSP mismatches, missing build artifacts, and config drift.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '../..');

let vercelConfig;
let cspValue;
let packageJson;
let dashboardHtml;

beforeAll(() => {
    vercelConfig = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf-8'));
    packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    dashboardHtml = readFileSync(resolve(ROOT, 'dashboard.html'), 'utf-8');

    const cspHeader = vercelConfig.headers?.flatMap(h => h.headers)?.find(h => h.key === 'Content-Security-Policy');
    cspValue = cspHeader?.value || '';
});

describe('CSP allows all required external domains', () => {
    test('extensions.duckdb.org is in connect-src (DuckDB auto-loads parquet extension)', () => {
        expect(cspValue).toContain('extensions.duckdb.org');
    });

    test('blob: is in worker-src (DuckDB WASM workers)', () => {
        expect(cspValue).toMatch(/worker-src[^;]*blob:/);
    });

    test('unsafe-eval is in script-src (DuckDB WASM requires it)', () => {
        expect(cspValue).toMatch(/script-src[^;]*'unsafe-eval'/);
    });

    test('no CDN domains in CSP that are not actually used', () => {
        expect(cspValue).not.toContain('cdn.jsdelivr.net');
        expect(cspValue).not.toContain('cdnjs.cloudflare.com');
        expect(cspValue).not.toContain('unpkg.com');
    });
});

describe('vercel.json configuration', () => {
    test('buildCommand is npm run build', () => {
        expect(vercelConfig.buildCommand).toBe('npm run build');
    });

    test('outputDirectory is dist', () => {
        expect(vercelConfig.outputDirectory).toBe('dist');
    });

    test('security headers are present', () => {
        const headerMap = {};
        vercelConfig.headers
            ?.flatMap(h => h.headers)
            ?.forEach(h => {
                headerMap[h.key] = h.value;
            });
        expect(headerMap['X-Content-Type-Options']).toBe('nosniff');
        expect(headerMap['X-Frame-Options']).toBe('DENY');
    });
});

describe('Build pipeline completeness', () => {
    test('build script runs build:data before vite build', () => {
        const build = packageJson.scripts?.build || '';
        const dataPos = build.indexOf('build:data');
        const vitePos = build.indexOf('vite build');
        expect(dataPos).toBeGreaterThan(-1);
        expect(vitePos).toBeGreaterThan(dataPos);
    });

    test('build script copies games.parquet and games_processed.json to dist', () => {
        const build = packageJson.scripts?.build || '';
        expect(build).toContain('games.parquet');
        expect(build).toContain('games_processed.json');
    });

    test('build script copies sw.js to dist', () => {
        const build = packageJson.scripts?.build || '';
        expect(build).toContain('cp sw.js dist/');
    });

    test('postinstall copies DuckDB WASM files', () => {
        const postinstall = packageJson.scripts?.postinstall || '';
        expect(postinstall).toContain('duckdb-eh.wasm');
        expect(postinstall).toContain('duckdb-browser-eh.worker.js');
    });

    test('source data files exist', () => {
        expect(existsSync(resolve(ROOT, 'data/game_data_master.json'))).toBe(true);
        expect(existsSync(resolve(ROOT, 'data/theme_consolidation_map.json'))).toBe(true);
    });
});

describe('HTML integrity', () => {
    test('no duplicate meta description tags', () => {
        const matches = dashboardHtml.match(/<meta\s+name="description"/g) || [];
        expect(matches.length).toBeLessThanOrEqual(1);
    });

    test('no CDN references for DuckDB WASM', () => {
        expect(dashboardHtml).not.toContain('cdn.jsdelivr.net');
    });

    test('no CDN script tags for Chart.js or DuckDB', () => {
        expect(dashboardHtml).not.toMatch(/cdn\.jsdelivr\.net.*chart/i);
        expect(dashboardHtml).not.toMatch(/cdn\.jsdelivr\.net.*duckdb/i);
    });

    test('service worker registration present', () => {
        expect(dashboardHtml).toContain("register('/sw.js')");
    });
});

describe('Express server CSP matches vercel.json', () => {
    let serverContent;

    beforeAll(() => {
        serverContent = readFileSync(resolve(ROOT, 'server', 'server.cjs'), 'utf-8');
    });

    test('server allows extensions.duckdb.org in connectSrc', () => {
        expect(serverContent).toContain('extensions.duckdb.org');
    });

    test('server does not reference cdn.jsdelivr.net', () => {
        expect(serverContent).not.toContain('cdn.jsdelivr.net');
    });

    test('server allows blob: in workerSrc', () => {
        expect(serverContent).toMatch(/workerSrc.*blob:/s);
    });
});

describe('Service worker configuration', () => {
    let swContent;

    beforeAll(() => {
        swContent = readFileSync(resolve(ROOT, 'sw.js'), 'utf-8');
    });

    test('caches DuckDB WASM assets', () => {
        expect(swContent).toContain('/duckdb/');
    });

    test('has stale-while-revalidate for game data', () => {
        expect(swContent).toContain('games.parquet');
        expect(swContent).toContain('games_processed.json');
    });

    test('no CDN references', () => {
        expect(swContent).not.toContain('cdn.jsdelivr.net');
    });
});
