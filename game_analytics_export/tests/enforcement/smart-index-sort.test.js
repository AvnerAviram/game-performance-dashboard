/**
 * Enforcement: Smart Index Sort Order
 *
 * Ensures that ranking/display sorts for themes, mechanics (features),
 * and providers always use Smart Index — never raw Game Count, avgTheo,
 * ggrShare, or market share as the primary ranking criterion.
 *
 * Allowed exceptions:
 *   - metrics.js / data.js — Smart Index is computed here
 *   - Threshold calculations that pick a cutoff value (not display order)
 *   - Lexicographic sorts for dropdown options
 *   - Game-level sorts by theoWin (games don't have Smart Index)
 *   - Filter logic that re-sorts by Smart Index after filtering
 *   - Chart axis/warp/median calculations (not ranking)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

const ALLOWED_FILES = new Set(['lib/metrics.js', 'lib/data.js', 'lib/db/duckdb-client.js']);

function getJsFiles(dir, base = '') {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            results.push(...getJsFiles(path.join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.js')) {
            results.push(rel);
        }
    }
    return results;
}

describe('Smart Index Sort Enforcement', () => {
    it('metrics.js functions return Smart Index-sorted data', () => {
        const metricsPath = path.join(SRC_DIR, 'lib/metrics.js');
        const src = fs.readFileSync(metricsPath, 'utf-8');

        expect(src).toContain('export function getThemeMetrics');
        expect(src).toContain('export function getFeatureMetrics');
        expect(src).toContain('export function getProviderMetrics');

        const themeBlock = src.slice(
            src.indexOf('export function getThemeMetrics'),
            src.indexOf('export function getGamesByTheme')
        );
        const featureBlock = src.slice(
            src.indexOf('export function getFeatureMetrics'),
            src.indexOf('export function getFeatureLift')
        );
        const providerBlock = src.slice(
            src.indexOf('export function getProviderMetrics'),
            src.indexOf('export function getProvidersPerTheme')
        );

        expect(themeBlock).toContain('addSmartIndex');
        expect(featureBlock).toContain('addSmartIndex');
        expect(providerBlock).toContain('addSmartIndex');

        expect(themeBlock).not.toMatch(/\.sort\(\(a,\s*b\)\s*=>\s*b\.count/);
        expect(featureBlock).not.toMatch(/\.sort\(\(a,\s*b\)\s*=>\s*b\.avgTheo/);
        expect(providerBlock).not.toMatch(/\.sort\(\(a,\s*b\)\s*=>\s*b\.ggrShare/);
    });

    it('Overview mechanics chart uses Smart Index sort, not Game Count', () => {
        const chartPath = path.join(SRC_DIR, 'ui/chart-themes.js');
        const src = fs.readFileSync(chartPath, 'utf-8');

        const fnStart = src.indexOf('function consolidateMechanicsByCanonicalName');
        const fnEnd = src.indexOf('\n}', fnStart) + 2;
        const fn = src.slice(fnStart, fnEnd);

        expect(fn).toContain('Smart Index');
        expect(fn).not.toMatch(/\.sort\(\(a,\s*b\)\s*=>\s*b\['Game Count'\]/);
    });

    it('Providers page sorts by Smart Index, not provider_score/market share', () => {
        const provPath = path.join(SRC_DIR, 'ui/ui-providers-games.js');
        const src = fs.readFileSync(provPath, 'utf-8');

        expect(src).toContain("'Smart Index'");
        expect(src).not.toMatch(/providers\.sort\(\(a,\s*b\)\s*=>\s*\(b\.provider_score/);
    });

    it('No ranking sort by raw Game Count in display code', () => {
        const files = getJsFiles(SRC_DIR);
        const violations = [];

        const RANKING_SORT_BY_COUNT =
            /\.sort\(\(a,\s*b\)\s*=>\s*b\['Game Count'\]\s*-\s*a\['Game Count'\]\)(?:\s*\.slice)/;

        for (const relPath of files) {
            if (ALLOWED_FILES.has(relPath)) continue;
            const src = fs.readFileSync(path.join(SRC_DIR, relPath), 'utf-8');
            if (RANKING_SORT_BY_COUNT.test(src)) {
                violations.push(relPath);
            }
        }

        expect(violations).toEqual([]);
    });

    it('data.js applySmartIndex covers themes and mechanics', () => {
        const dataPath = path.join(SRC_DIR, 'lib/data.js');
        const src = fs.readFileSync(dataPath, 'utf-8');

        expect(src).toContain('gameData.themes = applySmartIndex(gameData.themes)');
        expect(src).toContain('gameData.mechanics = applySmartIndex(gameData.mechanics)');
    });
});
