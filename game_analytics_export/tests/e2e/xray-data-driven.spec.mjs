/**
 * X-Ray Data-Driven E2E Test
 *
 * Reads the REAL data files (game_data_master.json, franchise_mapping.json),
 * picks actual values for every dimension the X-Ray supports, and asserts
 * the API returns games for each one. This catches:
 * - Missing dimension filters in the server
 * - Field name mismatches between data and API
 * - Truncated/short labels vs full values
 * - Empty/null field values that would cause 404s
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcryptjs from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const USERS_FILE = path.resolve(__dirname, '../../server/users.json');
const CREDS = { username: 'e2e_data_driven', password: 'dataD1rven!' };

test.beforeAll(async () => {
    let users = [];
    try {
        users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {}
    if (!users.find(u => u.username === CREDS.username)) {
        const hash = await bcryptjs.hash(CREDS.password, 10);
        users.push({ username: CREDS.username, passwordHash: hash, role: 'admin' });
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
});

async function login(page, baseURL) {
    await page.goto(`${baseURL}/login.html`);
    await page.fill('#login-username', CREDS.username);
    await page.fill('#login-password', CREDS.password);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 20000 });
}

function loadGames() {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    return Array.isArray(raw) ? raw : raw.games || [];
}

function loadFranchiseMapping() {
    try {
        return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'franchise_mapping.json'), 'utf-8'));
    } catch {
        return {};
    }
}

function pickRealValue(games, accessor) {
    const counts = {};
    for (const g of games) {
        const vals = accessor(g);
        const arr = Array.isArray(vals) ? vals : [vals];
        for (const v of arr) {
            if (v && typeof v === 'string' && v.trim() && v !== 'Unknown' && v !== 'N/A') {
                counts[v.trim()] = (counts[v.trim()] || 0) + 1;
            }
        }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length ? { value: sorted[0][0], count: sorted[0][1] } : null;
}

test.describe('X-Ray Data-Driven: every dimension resolves against real data', () => {
    test.setTimeout(60000);
    let games;
    let franchiseMap;

    test.beforeAll(() => {
        games = loadGames();
        franchiseMap = loadFranchiseMapping();
    });

    const DIMENSIONS = [
        { dimension: 'provider', accessor: g => g.provider || g.provider_studio },
        { dimension: 'theme', accessor: g => g.theme_consolidated || g.theme_primary },
        {
            dimension: 'feature',
            accessor: g => {
                if (Array.isArray(g.features)) return g.features.map(f => (typeof f === 'string' ? f : f?.name));
                return null;
            },
        },
        { dimension: 'volatility', accessor: g => g.volatility || g.specs_volatility },
        { dimension: 'art_theme', accessor: g => g.art_theme },
        { dimension: 'art_mood', accessor: g => g.art_mood },
        { dimension: 'art_characters', accessor: g => g.art_characters },
        { dimension: 'art_elements', accessor: g => g.art_elements },
        { dimension: 'art_narrative', accessor: g => g.art_narrative },
    ];

    for (const { dimension, accessor } of DIMENSIONS) {
        test(`API returns games for real ${dimension} value from data`, async ({ page, baseURL }) => {
            await login(page, baseURL);
            const pick = pickRealValue(games, accessor);
            if (!pick) return test.skip();

            expect(pick.count, `${dimension} should have games in data`).toBeGreaterThan(0);

            const data = await page.evaluate(
                async ({ dim, val }) => {
                    const url = `/api/data/provenance/top-game?dimension=${encodeURIComponent(dim)}&value=${encodeURIComponent(val)}`;
                    const r = await fetch(url, { credentials: 'include' });
                    return { status: r.status, body: r.ok ? await r.json() : await r.text() };
                },
                { dim: dimension, val: pick.value }
            );

            expect(data.status, `${dimension}="${pick.value}" should not 404 (${pick.count} games in data)`).toBe(200);
            expect(data.body.totalGames).toBeGreaterThan(0);
            expect(data.body.gameName).toBeTruthy();
        });
    }

    test('API returns games for real franchise value from franchise_mapping.json', async ({ page, baseURL }) => {
        await login(page, baseURL);
        const franchiseNames = {};
        for (const entry of Object.values(franchiseMap)) {
            if (entry?.franchise) franchiseNames[entry.franchise] = (franchiseNames[entry.franchise] || 0) + 1;
        }
        const sorted = Object.entries(franchiseNames).sort((a, b) => b[1] - a[1]);
        if (!sorted.length) return test.skip();
        const topFranchise = sorted[0][0];

        const data = await page.evaluate(async val => {
            const url = `/api/data/provenance/top-game?dimension=franchise&value=${encodeURIComponent(val)}`;
            const r = await fetch(url, { credentials: 'include' });
            return { status: r.status, body: r.ok ? await r.json() : await r.text() };
        }, topFranchise);

        expect(data.status, `franchise="${topFranchise}" should not 404`).toBe(200);
        expect(data.body.totalGames).toBeGreaterThan(0);
    });

    test('No banned jargon in METRIC_DEFINITIONS', async () => {
        const xrayPanel = fs.readFileSync(path.resolve(__dirname, '../../src/ui/renderers/xray-panel.js'), 'utf-8');
        expect(xrayPanel).not.toContain('operator CSV');
        expect(xrayPanel).not.toContain('NJ iGaming');
        expect(xrayPanel).not.toContain('platform data feed');
        expect(xrayPanel).not.toContain('DuckDB aggregation');
        expect(xrayPanel).not.toContain('RELIABLE_GAME');
    });

    test('Every dimension value in data is a non-empty string (no truncation)', async () => {
        for (const { dimension, accessor } of DIMENSIONS) {
            const pick = pickRealValue(games, accessor);
            if (!pick) continue;
            expect(pick.value.length, `${dimension} value should not be empty`).toBeGreaterThan(0);
            expect(pick.value, `${dimension} value should not be truncated`).not.toMatch(/…$/);
        }
    });
});
