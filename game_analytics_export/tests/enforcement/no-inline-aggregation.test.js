/**
 * Enforcement: No Inline Aggregation
 *
 * Greps src/ files for aggregation patterns that MUST live in metrics.js.
 * Fails the build if any file outside the allowed list contains them.
 *
 * This test is the "Layer 2" defense — making it impossible to reintroduce
 * duplicated aggregation logic.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

const ALLOWED_FILES = new Set(['lib/metrics.js', 'lib/db/duckdb-client.js']);

const STAYS_INLINE_FILES = new Set([
    'features/idea-generator.js',
    'features/name-generator.js',
    'features/ai-assistant.js',
    'features/prediction.js',
    'features/trends.js',
    'lib/game-analytics-engine.js',
    'lib/symbol-utils.js',
    'ui/panel-details.js',
    'ui/ui-panels.js',
    'ui/renderers/blueprint-advisor.js',
    'ui/renderers/generate-insights-impl.js',
    'ui/renderers/insights-combos.js',
    'ui/renderers/insights-franchises.js',
    'ui/renderers/insights-providers.js',
    'ui/renderers/insights-recipes.js',
    'ui/renderers/overview-renderer.js',
    'ui/renderers/themes-renderer.js',
    'ui/renderers/art-renderer.js',
    'ui/chart-brands.js',
    'ui/filter-dropdowns.js',
]);

const BANNED_PATTERNS = [
    { pattern: /\bprovMap\s*\[/g, name: 'provMap[' },
    { pattern: /\bproviderMap\s*\[/g, name: 'providerMap[' },
    { pattern: /\bproviderStats\s*\[/g, name: 'providerStats[' },
    { pattern: /\bthemeMap\s*\[/g, name: 'themeMap[' },
    { pattern: /\bthemeCounts\s*\[/g, name: 'themeCounts[' },
    { pattern: /\bthemeStats\s*\[/g, name: 'themeStats[' },
    { pattern: /\bfeatureMap\s*\[/g, name: 'featureMap[' },
    { pattern: /\bfeatureCounts\s*\[/g, name: 'featureCounts[' },
    { pattern: /\bfeatureStats\s*\[/g, name: 'featureStats[' },
    { pattern: /\bvolMap\s*\[/g, name: 'volMap[' },
    { pattern: /\btotalTheo\b/g, name: 'totalTheo' },
    { pattern: /\btotalMkt\b/g, name: 'totalMkt' },
    { pattern: /\btotalMarketShare\b/g, name: 'totalMarketShare' },
];

function getJsFiles(dir, base = '') {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            results.push(...getJsFiles(path.join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.js') && !ALLOWED_FILES.has(rel) && !STAYS_INLINE_FILES.has(rel)) {
            results.push(rel);
        }
    }
    return results;
}

describe('No Inline Aggregation Enforcement', () => {
    const jsFiles = getJsFiles(SRC_DIR);

    it('should have found JS files to scan', () => {
        expect(jsFiles.length).toBeGreaterThan(10);
    });

    for (const pattern of BANNED_PATTERNS) {
        it(`no file outside metrics.js uses "${pattern.name}"`, () => {
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
                    `Found "${pattern.name}" in ${violations.length} location(s) outside metrics.js:\n` +
                        violations.map(v => `  ${v}`).join('\n') +
                        '\n\nMove this aggregation to src/lib/metrics.js and call the function instead.'
                );
            }
        });
    }
});
