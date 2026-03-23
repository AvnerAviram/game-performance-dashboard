/**
 * Enforcement: No Inline Field Access Fallback Chains
 *
 * Greps src/ files for raw nested field access patterns that MUST use
 * game-fields.js F.xxx() accessors instead.
 *
 * Catches patterns like:
 *   game.performance?.theo_win
 *   game.performance?.market_share_percent
 *   game.provider?.studio
 *   game.theme?.primary
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../src');

const ALLOWED_FILES = new Set(['lib/game-fields.js', 'lib/db/duckdb-client.js', 'features/compat.js']);

const BANNED_PATTERNS = [
    { pattern: /performance\?\.theo_win/g, name: 'performance?.theo_win' },
    { pattern: /performance\?\.market_share/g, name: 'performance?.market_share' },
    { pattern: /provider\?\.studio/g, name: 'provider?.studio' },
    { pattern: /theme\?\.primary/g, name: 'theme?.primary' },
    { pattern: /theme\?\.consolidated/g, name: 'theme?.consolidated' },
    { pattern: /theme\?\.secondary/g, name: 'theme?.secondary' },
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

describe('No Inline Field Access Enforcement', () => {
    const jsFiles = getJsFiles(SRC_DIR);

    it('should have found JS files to scan', () => {
        expect(jsFiles.length).toBeGreaterThan(10);
    });

    for (const pattern of BANNED_PATTERNS) {
        it(`no file outside game-fields.js uses "${pattern.name}"`, () => {
            const violations = [];
            for (const relPath of jsFiles) {
                const content = fs.readFileSync(path.join(SRC_DIR, relPath), 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
                    if (pattern.pattern.test(line)) {
                        violations.push(`${relPath}:${i + 1}: ${line.trim().slice(0, 80)}`);
                    }
                    pattern.pattern.lastIndex = 0;
                }
            }
            if (violations.length > 0) {
                expect.fail(
                    `Found "${pattern.name}" in ${violations.length} location(s) outside game-fields.js:\n` +
                        violations.map(v => `  ${v}`).join('\n') +
                        '\n\nUse F.xxx(game) from src/lib/game-fields.js instead.'
                );
            }
        });
    }
});
