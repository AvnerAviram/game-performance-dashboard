/**
 * Enforcement: Page Loading Safety
 *
 * Page HTML is bundled into the Vite build via ?raw imports (lazy chunks).
 * This eliminates fragile runtime fetch() calls that broke on Vercel.
 *
 * 1. Router must use ?raw imports, not fetch()
 * 2. Every VALID_PAGES entry must have a corresponding HTML file + loader
 * 3. dashboard.html must have <base href="/"> for safety
 * 4. vercel.json must disable cleanUrls and trailingSlash
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = path.join(ROOT, 'src');

describe('Page Loading Safety', () => {
    it('router uses ?raw imports for page HTML, not fetch()', () => {
        const routerPath = path.join(SRC_DIR, 'ui', 'router.js');
        const content = fs.readFileSync(routerPath, 'utf-8');

        expect(content).toContain('?raw');
        expect(content).toContain('PAGE_HTML');

        const fetchPagePattern = /fetch\([^)]*pages\//;
        if (fetchPagePattern.test(content)) {
            expect.fail(
                'Router still uses fetch() to load page HTML.\n' +
                    'Use Vite ?raw imports instead: import("../pages/page.html?raw")'
            );
        }
    });

    it('all pages in VALID_PAGES have corresponding HTML files and loaders', () => {
        const routerPath = path.join(SRC_DIR, 'ui', 'router.js');
        const content = fs.readFileSync(routerPath, 'utf-8');

        const pagesMatch = content.match(/VALID_PAGES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
        expect(pagesMatch).not.toBeNull();

        const pageNames = pagesMatch[1].match(/'([^']+)'/g).map(p => p.replace(/'/g, ''));
        const pagesDir = path.join(SRC_DIR, 'pages');

        const aliased = new Set(['anomalies', 'prediction', 'name-generator']);

        for (const page of pageNames) {
            if (aliased.has(page)) continue;

            const htmlFile = path.join(pagesDir, `${page}.html`);
            expect(fs.existsSync(htmlFile), `Missing HTML file: src/pages/${page}.html`).toBe(true);

            const escaped = page.replace(/-/g, '[-]');
            const loaderPattern = new RegExp(`['"]?${escaped}['"]?\\s*:\\s*\\(\\)\\s*=>\\s*import`);
            expect(loaderPattern.test(content), `Missing PAGE_HTML loader for: ${page}`).toBe(true);
        }
    });

    it('dashboard.html has <base href="/"> for URL resolution safety', () => {
        const dashboardPath = path.join(ROOT, 'dashboard.html');
        const content = fs.readFileSync(dashboardPath, 'utf-8');
        expect(content).toContain('<base href="/"');
    });

    it('vercel.json disables cleanUrls and trailingSlash', () => {
        const vercelPath = path.join(ROOT, 'vercel.json');
        const config = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));
        expect(config.cleanUrls).toBe(false);
        expect(config.trailingSlash).toBe(false);
    });
});
