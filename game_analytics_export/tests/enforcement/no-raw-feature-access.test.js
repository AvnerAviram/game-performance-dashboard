/**
 * Enforcement: No Raw Feature Field Access
 *
 * All feature parsing must go through parseFeatures() from parse-features.js.
 * Raw patterns like Array.isArray(g.features), g.features.split(","),
 * or g.features.trim() bypass JSON-string handling and break when
 * DuckDB returns features as a VARCHAR string.
 *
 * Allowed files:
 *   - parse-features.js (defines the canonical parser)
 *   - duckdb-client.js (reads from raw JSON before DuckDB ingestion — always arrays)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

const ALLOWED_FILES = new Set(['lib/parse-features.js', 'lib/db/duckdb-client.js']);

const BANNED_PATTERNS = [
    { pattern: /\.features\.split\s*\(/g, name: '.features.split()' },
    { pattern: /\.features\.trim\s*\(/g, name: '.features.trim()' },
];

function getJsFiles(dir, base = '') {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            results.push(...getJsFiles(path.join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.js') && !ALLOWED_FILES.has(rel)) {
            results.push(rel);
        }
    }
    return results;
}

describe('No Raw Feature Field Access', () => {
    const jsFiles = getJsFiles(SRC_DIR);

    it('no .features.split() or .features.trim() outside allowed files', () => {
        const violations = [];
        for (const rel of jsFiles) {
            const content = fs.readFileSync(path.join(SRC_DIR, rel), 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                for (const { pattern, name } of BANNED_PATTERNS) {
                    pattern.lastIndex = 0;
                    if (pattern.test(lines[i])) {
                        violations.push(`${rel}:${i + 1} — ${name}: ${lines[i].trim().slice(0, 100)}`);
                    }
                }
            }
        }
        if (violations.length > 0) {
            expect.fail(
                `Found ${violations.length} raw feature access(es):\n` +
                    violations.map(v => `  ${v}`).join('\n') +
                    '\n\nUse parseFeatures(g.features) from lib/parse-features.js instead.'
            );
        }
    });
});
