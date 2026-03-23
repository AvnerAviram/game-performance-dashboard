/**
 * Enforcement: No Raw Provider Field Access
 *
 * Ensures all provider name resolution goes through F.provider() from game-fields.js.
 * Raw access like `g.provider_studio` or `g.provider` bypasses normalization
 * and can cause ranking/grouping mismatches across pages.
 *
 * Allowed files:
 *   - game-fields.js (defines the accessor)
 *   - duckdb-client.js (SQL queries use the column name directly)
 *
 * The sort column header in ui-providers-games.js uses 'provider_studio' as a
 * DuckDB sort key string — that's allowed because it's a column name constant,
 * not a field access on a game object.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

const ALLOWED_FILES = new Set(['lib/game-fields.js', 'lib/db/duckdb-client.js']);

const BANNED_PATTERNS = [
    { pattern: /\.provider_studio/g, name: '.provider_studio' },
    { pattern: /g\.provider\b[^_P]/g, name: 'g.provider (raw)' },
    { pattern: /game\.provider\b[^_P]/g, name: 'game.provider (raw)' },
    { pattern: /gameObj\?\.provider\b/g, name: 'gameObj?.provider (raw)' },
];

const INLINE_EXCEPTIONS = {
    'ui/ui-providers-games.js': ['.provider_studio'],
};

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

describe('No Raw Provider Field Access', () => {
    const jsFiles = getJsFiles(SRC_DIR);

    it('should have found JS files to scan', () => {
        expect(jsFiles.length).toBeGreaterThan(10);
    });

    for (const bp of BANNED_PATTERNS) {
        it(`no file outside game-fields.js uses "${bp.name}"`, () => {
            const violations = [];
            for (const relPath of jsFiles) {
                const exceptions = INLINE_EXCEPTIONS[relPath] || [];
                if (exceptions.includes(bp.name)) continue;

                const content = fs.readFileSync(path.join(SRC_DIR, relPath), 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
                    if (bp.pattern.test(line)) {
                        violations.push(`${relPath}:${i + 1}: ${line.trim().slice(0, 100)}`);
                    }
                    bp.pattern.lastIndex = 0;
                }
            }
            if (violations.length > 0) {
                expect.fail(
                    `Found "${bp.name}" in ${violations.length} location(s) outside game-fields.js:\n` +
                        violations.map(v => `  ${v}`).join('\n') +
                        '\n\nUse F.provider(game) from src/lib/game-fields.js instead.'
                );
            }
        });
    }
});
