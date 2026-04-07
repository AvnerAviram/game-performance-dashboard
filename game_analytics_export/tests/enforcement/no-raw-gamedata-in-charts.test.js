/**
 * Enforcement: No raw gameData.allGames / .themes / .mechanics in chart & renderer files.
 *
 * UI chart and renderer files MUST use the centralized getters:
 *   getActiveGames(), getActiveThemes(), getActiveMechanics()
 *
 * This prevents the category filter from silently being ignored when
 * a new chart or renderer reads directly from the unfiltered store.
 *
 * Allowed exceptions (files that legitimately need the full, unfiltered dataset):
 *   - chart-config.js     — builds the category filter dropdown
 *   - ui-panels.js        — game detail lookups by name
 *   - panel-details.js    — theme/mechanic detail panels
 *   - filter-dropdowns.js — populates dropdown options
 *   - ui-providers-games.js — has its own independent filter system
 *   - themes-renderer.js  — mutates gameData.themes for formula switch
 *   - insights-renderer.js — anomaly theme lookup (uses unfiltered for consistency)
 *   - generate-insights-impl.js — log statement only
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/ui');

const EXEMPT_FILES = new Set([
    'chart-config.js',
    'ui-panels.js',
    'panel-details.js',
    'filter-dropdowns.js',
    'ui-providers-games.js',
    'pagination-state.js',
]);

const EXEMPT_RENDERER_FILES = new Set(['themes-renderer.js', 'insights-renderer.js', 'generate-insights-impl.js']);

const BANNED = [
    { pattern: /gameData\.allGames\b/, name: 'gameData.allGames', fix: 'getActiveGames()' },
    { pattern: /gameData\.themes\b/, name: 'gameData.themes', fix: 'getActiveThemes()' },
    { pattern: /gameData\.mechanics\b/, name: 'gameData.mechanics', fix: 'getActiveMechanics()' },
];

function collectFiles(dir, base = '') {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectFiles(path.join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.js')) {
            const topFile = rel.split(path.sep).pop();
            if (EXEMPT_FILES.has(topFile)) continue;
            if (base.includes('renderers') && EXEMPT_RENDERER_FILES.has(topFile)) continue;
            out.push({ rel, abs: path.join(dir, entry.name) });
        }
    }
    return out;
}

describe('Category filter enforcement: no raw gameData in chart/renderer files', () => {
    const files = collectFiles(SRC_UI);

    it('should scan at least 5 chart/renderer files', () => {
        expect(files.length).toBeGreaterThan(5);
    });

    for (const { pattern, name, fix } of BANNED) {
        it(`no chart/renderer file uses "${name}" (use ${fix} instead)`, () => {
            const violations = [];
            for (const { rel, abs } of files) {
                const lines = fs.readFileSync(abs, 'utf-8').split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
                    if (pattern.test(line)) {
                        violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
                    }
                }
            }
            if (violations.length > 0) {
                expect.fail(
                    `Found "${name}" in ${violations.length} chart/renderer file(s):\n` +
                        violations.map(v => `  ${v}`).join('\n') +
                        `\n\nUse ${fix} from src/lib/data.js instead.`
                );
            }
        });
    }
});
