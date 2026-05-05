/**
 * Enforcement: Chart Sort Consistency with Ranking Mode
 *
 * Ensures that all chart and table ranking sorts use the shared
 * getDefaultSort / theoIndexSort / marketShareSort from filters.js
 * rather than hardcoded inline comparators.
 *
 * Allowed exceptions:
 *   - metrics.js / data.js / duckdb-client.js — metric computation happens here
 *   - Lexicographic sorts for dropdown options
 *   - Game-level sorts by theoWin (individual games, not aggregates)
 *   - Chart axis/median calculations (not ranking)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

const ALLOWED_FILES = new Set(['lib/metrics.js', 'lib/data.js', 'lib/db/duckdb-client.js', 'lib/filters.js']);

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

describe('Chart Sort Consistency Enforcement', () => {
    it('chart-themes.js imports getDefaultSort from filters.js', () => {
        const src = fs.readFileSync(path.join(SRC_DIR, 'ui/chart-themes.js'), 'utf-8');
        expect(src).toContain('import');
        expect(src).toContain('getDefaultSort');
        expect(src).toContain("from '../lib/filters.js'");
    });

    it('chart-providers.js imports getDefaultSort from filters.js', () => {
        const src = fs.readFileSync(path.join(SRC_DIR, 'ui/chart-providers.js'), 'utf-8');
        expect(src).toContain('getDefaultSort');
        expect(src).toContain("from '../lib/filters.js'");
    });

    it('consolidateMechanicsByCanonicalName uses getDefaultSort(), not hardcoded sort', () => {
        const src = fs.readFileSync(path.join(SRC_DIR, 'ui/chart-themes.js'), 'utf-8');
        const fnStart = src.indexOf('function consolidateMechanicsByCanonicalName');
        const fnEnd = src.indexOf('\n}', fnStart) + 2;
        const fn = src.slice(fnStart, fnEnd);

        expect(fn).toContain('getDefaultSort()');
        expect(fn).not.toMatch(/\.sort\(\(a,\s*b\)\s*=>\s*\(b\['Market Share %'\]/);
        expect(fn).not.toMatch(/\.sort\(\(a,\s*b\)\s*=>\s*b\['Game Count'\]/);
    });

    it('createThemesChart sorts using getDefaultSort() or getActiveThemes pre-sorted', () => {
        const src = fs.readFileSync(path.join(SRC_DIR, 'ui/chart-themes.js'), 'utf-8');
        const fnStart = src.indexOf('export function createThemesChart');
        const fnEnd = src.indexOf('\nexport function createMechanicsChart');
        const fn = src.slice(fnStart, fnEnd);

        expect(fn).toContain('getDefaultSort()');
    });

    it('createProvidersChart sorts providers using getDefaultSort()', () => {
        const src = fs.readFileSync(path.join(SRC_DIR, 'ui/chart-providers.js'), 'utf-8');
        const fnStart = src.indexOf('export async function createProvidersChart');
        const fnEnd = src.indexOf('\nexport async function createProviderLandscapeChart');
        const fn = src.slice(fnStart, fnEnd);

        expect(fn).toContain('getDefaultSort()');
    });

    it('chart-config.js refreshCharts handles race conditions with pendingRefresh', () => {
        const src = fs.readFileSync(path.join(SRC_DIR, 'ui/chart-config.js'), 'utf-8');
        expect(src).toContain('pendingRefresh');
        expect(src).toMatch(/if\s*\(isRefreshing\)\s*\{/);
        expect(src).toContain('pendingRefresh = true');
    });

    it('switchRankingMode triggers refreshCharts()', () => {
        const src = fs.readFileSync(path.join(SRC_DIR, 'lib/filters.js'), 'utf-8');
        const fnStart = src.indexOf('window.switchRankingMode');
        const fnEnd = src.indexOf('};', fnStart) + 2;
        const fn = src.slice(fnStart, fnEnd);

        expect(fn).toContain('refreshCharts');
    });

    it('No ranking sort by raw Game Count in display code (outside allowed files)', () => {
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

    it('overview.html does NOT have ranking toggle (uses default sort)', () => {
        const htmlDir = path.resolve(SRC_DIR, 'pages');
        const overview = fs.readFileSync(path.join(htmlDir, 'overview.html'), 'utf-8');
        expect(overview).not.toContain('data-ranking-mode="indexing"');
        expect(overview).not.toContain('switchRankingMode');
    });

    it('Detail pages with charts have ranking toggle', () => {
        const htmlDir = path.resolve(SRC_DIR, 'pages');
        const pagesToCheck = ['themes.html', 'mechanics.html', 'providers.html'];
        for (const page of pagesToCheck) {
            const src = fs.readFileSync(path.join(htmlDir, page), 'utf-8');
            expect(src).toContain('data-ranking-mode');
            expect(src).toContain('switchRankingMode');
        }
    });

    it('data.js uses SQL-based theme/mechanic loading (DuckDB) and local Smart Index (JSON fallback)', () => {
        const dataPath = path.join(SRC_DIR, 'lib/data.js');
        const src = fs.readFileSync(dataPath, 'utf-8');

        expect(src).toContain('getThemeMetrics');
        expect(src).toContain('getFeatureMetrics');
        expect(src).toContain('mapSqlThemes');
        expect(src).toContain('mapSqlMechanics');
        expect(src).toContain('applySmartIndexToGameData');
    });
});
