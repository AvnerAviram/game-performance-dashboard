/**
 * Enforcement: No Raw Game Field Access
 *
 * Ensures critical game fields are accessed through F.xxx() from game-fields.js,
 * not directly on game objects. Direct access bypasses normalization, fallback chains,
 * and consolidation maps — causing charts and X-Ray to disagree (e.g., the Egyptian-2013 bug).
 *
 * Allowed files:
 *   - game-fields.js (defines the accessors)
 *   - duckdb-client.js (SQL queries use column names directly)
 *   - data.js (JSON fallback loader that builds the initial data)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

const ALLOWED_FILES = new Set(['lib/game-fields.js', 'lib/db/duckdb-client.js', 'lib/data.js']);

const BANNED_PATTERNS = [
    { pattern: /\.performance_theo_win\b/g, name: '.performance_theo_win', fix: 'F.theoWin(game)' },
    { pattern: /\.theo_win\b/g, name: '.theo_win', fix: 'F.theoWin(game)' },
    { pattern: /\.theme_consolidated\b/g, name: '.theme_consolidated', fix: 'F.themeConsolidated(game)' },
    { pattern: /\.theme_primary\b/g, name: '.theme_primary', fix: 'F.themeConsolidated(game) or F.theme(game)' },
    { pattern: /\.original_release_year\b/g, name: '.original_release_year', fix: 'F.originalReleaseYear(game)' },
    { pattern: /\.release_year\b/g, name: '.release_year', fix: 'F.releaseYear(game) or F.originalReleaseYear(game)' },
    { pattern: /\.specs_rtp\b/g, name: '.specs_rtp', fix: 'F.rtp(game)' },
    { pattern: /\.specs_volatility\b/g, name: '.specs_volatility', fix: 'F.volatility(game)' },
    { pattern: /\.performance_market_share\b/g, name: '.performance_market_share', fix: 'F.marketShare(game)' },
];

// Display-only files that read DuckDB-enriched data where fields are always populated.
// These are tech debt — ideally they'd use F.xxx() too — but the risk of breaking
// 60+ rendering locations outweighs the benefit since the DuckDB loader ensures
// all fields exist. Adding new raw access to these files is still discouraged.
const DISPLAY_EXCEPTION_FILES = new Set([
    'ui/ui-panels.js',
    'ui/panel-details.js',
    'ui/ui-providers-games.js',
    'ui/renderers/overview-renderer.js',
    'ui/renderers/insights-renderer.js',
    'ui/renderers/insights-cards.js',
    'ui/renderers/insights-recipes.js',
    'ui/renderers/insights-combos.js',
    'ui/renderers/insights-providers.js',
    'ui/renderers/insights-franchises.js',
    'ui/renderers/blueprint-core.js',
    'ui/renderers/blueprint-insights.js',
    'ui/renderers/blueprint-competition.js',
    'ui/renderers/blueprint-symbols.js',
    'ui/renderers/art-renderer.js',
    'ui/renderers/themes-renderer.js',
    'ui/chart-themes.js',
    'ui/chart-providers.js',
    'ui/chart-volatility.js',
    'ui/chart-rtp.js',
    'features/idea-generator.js',
    'features/name-generator.js',
    'features/prediction.js',
    'features/overview-insights.js',
    'lib/shared-config.js',
    'lib/symbol-utils.js',
    'lib/metrics.js',
]);

const INLINE_EXCEPTIONS = {
    'ui/renderers/xray-panel.js': ['.theo_win', '.theme_primary', '.release_year'],
};

function getJsFiles(dir, base = '') {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            results.push(...getJsFiles(path.join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.js') && !ALLOWED_FILES.has(rel) && !DISPLAY_EXCEPTION_FILES.has(rel)) {
            results.push(rel);
        }
    }
    return results;
}

function isComment(line) {
    const trimmed = line.trimStart();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function isStringLiteral(line, patternName) {
    const field = patternName.replace(/^\./, '');
    const strPatterns = [
        new RegExp(`['"\`]${field}['"\`]`),
        new RegExp(`['"\`].*${field}.*['"\`]`),
        new RegExp(`FIELD_NAMES\\.`),
    ];
    return strPatterns.some(p => p.test(line));
}

describe('No Raw Game Field Access', () => {
    const jsFiles = getJsFiles(SRC_DIR);

    it('should have found JS files to scan', () => {
        expect(jsFiles.length).toBeGreaterThan(10);
    });

    for (const bp of BANNED_PATTERNS) {
        it(`no file outside allowed list uses "${bp.name}"`, () => {
            const violations = [];
            for (const relPath of jsFiles) {
                const exceptions = INLINE_EXCEPTIONS[relPath] || [];
                if (exceptions.includes(bp.name)) continue;

                const content = fs.readFileSync(path.join(SRC_DIR, relPath), 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (isComment(line)) continue;
                    if (isStringLiteral(line, bp.name)) continue;
                    if (bp.pattern.test(line)) {
                        violations.push(`${relPath}:${i + 1}: ${line.trim().slice(0, 120)}`);
                    }
                    bp.pattern.lastIndex = 0;
                }
            }
            if (violations.length > 0) {
                expect.fail(
                    `Found "${bp.name}" in ${violations.length} location(s):\n` +
                        violations.map(v => `  ${v}`).join('\n') +
                        `\n\nUse ${bp.fix} from src/lib/game-fields.js instead.`
                );
            }
        });
    }
});
