/**
 * Enforcement: Consistent User-Facing Labels
 *
 * Ensures deprecated label terms are not reintroduced into user-facing strings.
 * Canonical terms:
 *   - "Mechanic(s)" not "Feature(s)" for slot game mechanics
 *   - "Performance Index" not "Smart Index"
 *   - "Theme Landscape" not "Market Landscape" (for theme scatter)
 *
 * Allowed exceptions:
 *   - Data values like "Gamble Feature", "Pick Feature" (canonical mechanic names)
 *   - Internal code: variable names, function names, import paths, field names
 *   - "Feature Request" (ticket type)
 *   - Comments
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const PAGES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/pages');
const ROOT_HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dashboard.html');

function getAllFiles(dir, ext, base = '') {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            results.push(...getAllFiles(path.join(dir, entry.name), ext, rel));
        } else if (entry.name.endsWith(ext)) {
            results.push({ rel, abs: path.join(dir, entry.name) });
        }
    }
    return results;
}

const FEATURE_LABEL_RE = /['"`>]Feature Analysis['"`<]/;
const MARKET_LANDSCAPE_RE = /['"`>]Market Landscape['"`<]/;

// Match "Smart Index" as a user-facing label, not as a data property key.
// Excluded patterns:
//   t['Smart Index']  — data property read
//   'Smart Index':    — data property assignment
//   'Smart Index']    — data property read (closing bracket)
const SMART_INDEX_LABEL_RE = /(?<!\[)['"]Smart Index['"](?!\]|:)|>Smart Index</;

const FEATURE_EXCEPTIONS = [
    'Gamble Feature',
    'Pick Feature',
    'Collect Feature',
    'Feature Request',
    'feature_',
    'parseFeatures',
    'CANONICAL_FEATURES',
    'getFeatureMetrics',
    'featureMetrics',
    'topFeatures',
    'featuresHtml',
    'featureMap',
    'featureColors',
    'SHORT_FEATURE_LABELS',
];

function isException(line) {
    return FEATURE_EXCEPTIONS.some(exc => line.includes(exc));
}

describe('Label Consistency', () => {
    it('no "Feature Analysis" in nav labels', () => {
        const violations = [];
        const allFiles = [{ rel: 'dashboard.html', abs: ROOT_HTML }, ...getAllFiles(PAGES_DIR, '.html')];
        for (const { rel, abs } of allFiles) {
            const lines = fs.readFileSync(abs, 'utf-8').split('\n');
            lines.forEach((line, i) => {
                if (FEATURE_LABEL_RE.test(line)) {
                    violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
                }
            });
        }
        if (violations.length > 0) {
            expect.fail(
                `Found "Feature Analysis" label(s):\n${violations.join('\n')}\n\nUse "Mechanic Analysis" instead.`
            );
        }
    });

    it('no "Smart Index" in user-facing strings', () => {
        const violations = [];
        const jsFiles = getAllFiles(SRC_DIR, '.js');
        const htmlFiles = [{ rel: 'dashboard.html', abs: ROOT_HTML }, ...getAllFiles(PAGES_DIR, '.html')];
        for (const { rel, abs } of [...jsFiles, ...htmlFiles]) {
            const lines = fs.readFileSync(abs, 'utf-8').split('\n');
            lines.forEach((line, i) => {
                if (SMART_INDEX_LABEL_RE.test(line)) {
                    violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
                }
            });
        }
        if (violations.length > 0) {
            expect.fail(`Found "Smart Index" label(s):\n${violations.join('\n')}\n\nUse "Performance Index" instead.`);
        }
    });

    it('no "Market Landscape" for theme scatter charts', () => {
        const violations = [];
        const htmlFiles = [{ rel: 'dashboard.html', abs: ROOT_HTML }, ...getAllFiles(PAGES_DIR, '.html')];
        for (const { rel, abs } of htmlFiles) {
            const lines = fs.readFileSync(abs, 'utf-8').split('\n');
            lines.forEach((line, i) => {
                if (MARKET_LANDSCAPE_RE.test(line)) {
                    violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
                }
            });
        }
        if (violations.length > 0) {
            expect.fail(
                `Found "Market Landscape" label(s):\n${violations.join('\n')}\n\nUse "Theme Landscape" instead.`
            );
        }
    });
});
