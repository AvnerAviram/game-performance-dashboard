/**
 * Enforcement: Chart.js must be imported via chart-setup.js, never from CDN or directly.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const SRC_DIR = resolve(import.meta.dirname, '../../src');

function collectJsFiles(dir, files = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            collectJsFiles(full, files);
        } else if (full.endsWith('.js')) {
            files.push(full);
        }
    }
    return files;
}

describe('Chart.js import hygiene', () => {
    const jsFiles = collectJsFiles(SRC_DIR);

    test('no file imports directly from chart.js (must use chart-setup.js)', () => {
        const violations = [];
        for (const file of jsFiles) {
            if (file.includes('chart-setup.js')) continue;
            const content = readFileSync(file, 'utf8');
            const directImport = /from\s+['"]chart\.js['"]/g;
            if (directImport.test(content)) {
                violations.push(file.replace(SRC_DIR + '/', ''));
            }
        }
        expect(
            violations,
            `Files importing directly from 'chart.js' instead of chart-setup.js: ${violations.join(', ')}`
        ).toEqual([]);
    });

    test('no CDN chart.js script tags in HTML', () => {
        const htmlFile = resolve(import.meta.dirname, '../../dashboard.html');
        const html = readFileSync(htmlFile, 'utf8');
        expect(html).not.toMatch(/cdn\.jsdelivr\.net\/npm\/chart\.js/);
        expect(html).not.toMatch(/<script[^>]+chart\.umd/);
    });

    test('no CDN duckdb script tags or imports in source', () => {
        const violations = [];
        for (const file of jsFiles) {
            const content = readFileSync(file, 'utf8');
            if (/cdn\.jsdelivr\.net.*duckdb/.test(content)) {
                violations.push(file.replace(SRC_DIR + '/', ''));
            }
        }
        expect(violations, `Files referencing CDN DuckDB: ${violations.join(', ')}`).toEqual([]);
    });
});
