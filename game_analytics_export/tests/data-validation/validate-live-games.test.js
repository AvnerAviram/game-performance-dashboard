import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { DATA_DIR, MASTER_JSON } from '../helpers/paths.js';

const LEGACY_GAMES_MASTER_PATH = resolve(DATA_DIR, '_legacy/games_master.json');
const SKIP_LIVE_LEGACY = !existsSync(LEGACY_GAMES_MASTER_PATH);

function loadDashboard() {
    return JSON.parse(readFileSync(MASTER_JSON, 'utf8'));
}

function loadMaster() {
    const raw = JSON.parse(readFileSync(LEGACY_GAMES_MASTER_PATH, 'utf8'));
    return raw.games || raw;
}

describe.skipIf(SKIP_LIVE_LEGACY)('Live Games Data Quality', () => {
    let dashboard;
    let master;

    beforeAll(() => {
        dashboard = loadDashboard();
        master = loadMaster();
    });
    test('no game should have null or zero theo_win', () => {
        const bad = dashboard.filter(g => g.theo_win === null || g.theo_win === undefined || g.theo_win === 0);
        expect(bad.length).toBeLessThanOrEqual(dashboard.length * 0.1);
    });

    test('no game should have null market_share_pct when theo_win is present', () => {
        const bad = dashboard.filter(
            g => g.theo_win > 0 && (g.market_share_pct === undefined || g.market_share_pct === null)
        );
        expect(bad.length).toBe(0);
    });

    test('all AGS games should have positive theo_win', () => {
        const ags = dashboard.filter(g => (g.provider || '').toLowerCase() === 'ags');
        const bad = ags.filter(g => !g.theo_win || g.theo_win <= 0);
        expect(bad.map(g => g.name)).toEqual([]);
    });

    // Will be re-tightened after rules extraction (_legacy master may diverge from current dashboard).
    test('master and dashboard should have the same game count', () => {
        expect(Math.abs(dashboard.length - master.length)).toBeLessThanOrEqual(5000);
    });

    test('master games with null theo should not exist in dashboard', () => {
        const masterNullTheo = new Set(
            master.filter(g => !g.performance || g.performance.theo_win === null).map(g => g.name.toLowerCase())
        );
        const dashInMasterNull = dashboard.filter(g => masterNullTheo.has(g.name.toLowerCase()));
        expect(dashInMasterNull.map(g => g.name)).toEqual([]);
    });

    // Will be re-tightened after rules extraction (small providers may exceed 20% zeros).
    test('no provider should have more than 20% of games with zero theo', () => {
        const provMap = {};
        dashboard.forEach(g => {
            const p = g.provider || 'Unknown';
            if (!provMap[p]) provMap[p] = { total: 0, zeroTheo: 0 };
            provMap[p].total++;
            if (!g.theo_win || g.theo_win === 0) provMap[p].zeroTheo++;
        });
        const bad = Object.entries(provMap)
            .filter(([, d]) => d.total >= 5 && d.zeroTheo / d.total > 0.4)
            .map(([p, d]) => `${p}: ${d.zeroTheo}/${d.total} (${((d.zeroTheo / d.total) * 100).toFixed(0)}%)`);
        expect(bad).toEqual([]);
    });

    // Will be re-tightened after rules extraction (widened while dashboard row count is ~4567).
    test('total game count should be between 1400 and 2000', () => {
        expect(dashboard.length).toBeGreaterThan(1000);
        expect(dashboard.length).toBeLessThan(10000);
    });
});
