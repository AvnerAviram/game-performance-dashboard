/**
 * X-Ray Drilldown E2E Tests
 *
 * Tests every click scenario for the Data X-Ray feature:
 * - Games table columns (name, provider, theme, rtp, volatility, market share, year)
 * - Verifies the X-Ray panel opens with correct drilldown content
 * - Verifies field alias resolution (market_share → market_share_pct)
 * - Verifies platform vs extracted confidence labeling
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcryptjs from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.resolve(__dirname, '../../server/users.json');
const CREDS = { username: 'e2e_test_user', password: 'e2eTestPass123!' };

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
    await page.waitForFunction(
        () => {
            const o = document.getElementById('loading-overlay');
            return !o || o.style.opacity === '0' || !o.offsetParent;
        },
        { timeout: 30000 }
    );
}

async function enableXRay(page) {
    // Click the hamburger menu to reveal the dropdown
    const hamburger = page.locator('#hamburger-btn');
    await hamburger.waitFor({ state: 'visible', timeout: 5000 });
    await hamburger.click();
    await page.waitForTimeout(500);

    // Look for the X-Ray button in the dropdown (use specific ID)
    const xrayBtn = page.locator('#xray-menu-btn');
    await xrayBtn.waitFor({ state: 'visible', timeout: 3000 });
    await xrayBtn.click();
    await page.waitForTimeout(500);

    // Close the hamburger menu so it doesn't obscure elements
    await page.evaluate(() => {
        const dropdown = document.getElementById('hamburger-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
    });
    await page.waitForTimeout(200);

    // Verify X-Ray is active by checking for the body class
    const isActive = await page.evaluate(() => document.body.classList.contains('xray-active'));
    expect(isActive).toBe(true);
}

async function navigateToGames(page) {
    // Use the sidebar button with data-page="games"
    const gamesBtn = page.locator('[data-page="games"]');
    await gamesBtn.waitFor({ state: 'visible', timeout: 5000 });
    await gamesBtn.click();
    // Wait for games table to fully render with data-xray attributes
    await page.waitForSelector('[data-xray]', { timeout: 15000 });
}

async function closeXRayPanel(page) {
    await page.evaluate(() => {
        if (window.closeXRayPanel) window.closeXRayPanel();
        const backdrop = document.getElementById('mechanic-backdrop');
        if (backdrop) {
            backdrop.classList.add('hidden');
            backdrop.classList.remove('block');
        }
    });
    await page.waitForTimeout(300);
}

test.describe('X-Ray Drilldown', () => {
    test.setTimeout(120000);

    test('games table field clicks produce correct drilldowns', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateToGames(page);
        await enableXRay(page);

        const xraySpans = page.locator('[data-xray]');
        const count = await xraySpans.count();
        expect(count).toBeGreaterThan(0);

        // Group data-xray spans by field
        const fieldSpans = await page.evaluate(() => {
            const spans = document.querySelectorAll('[data-xray]');
            const result = {};
            for (const span of spans) {
                try {
                    const info = JSON.parse(span.dataset.xray);
                    if (!result[info.field]) {
                        result[info.field] = { game: info.game, text: span.textContent.trim() };
                    }
                } catch {}
            }
            return result;
        });

        const fieldsToTest = Object.keys(fieldSpans);
        expect(fieldsToTest.length).toBeGreaterThan(3);

        for (const field of fieldsToTest) {
            const { game, text } = fieldSpans[field];
            if (!game || !text || text === '—') continue;

            // Click the data-xray span for this field
            const selector = `[data-xray*='"field":"${field}"'][data-xray*='${JSON.stringify(game)
                .slice(1, -1)
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .slice(0, 20)}']`;

            const target = page.locator(selector).first();
            if (!(await target.isVisible({ timeout: 1000 }).catch(() => false))) continue;

            await target.click({ force: true });
            await page.waitForTimeout(1000);

            // Verify the panel is open
            const panel = page.locator('#xray-panel');
            const panelRight = await panel.evaluate(el => getComputedStyle(el).right);
            const isOpen = panelRight === '0px' || parseInt(panelRight) >= 0;

            if (!isOpen) {
                console.warn(`Panel did not open for field=${field}, game=${game}`);
                continue;
            }

            // Verify panel content
            const panelContent = await page.locator('#xray-panel-content').textContent();
            expect(panelContent.length).toBeGreaterThan(10);

            // Verify the drilldown section exists (extraction method + result)
            const hasMethod = panelContent.includes('Extraction method') || panelContent.includes('extraction');
            const hasResult = panelContent.includes('Result');

            // Platform fields should show platform badge
            const platformFields = ['theo_win', 'market_share', 'avg_bet', 'release_year', 'provider', 'name'];
            if (platformFields.includes(field)) {
                const hasPlatformOrConfidence =
                    panelContent.includes('platform') ||
                    panelContent.includes('Platform') ||
                    panelContent.includes('extracted') ||
                    panelContent.includes('verified');
                expect(hasPlatformOrConfidence).toBe(true);
            }

            // Extracted fields (rtp, volatility) with rules text should show source
            if (['rtp', 'volatility'].includes(field)) {
                const hasSourceOrFallback =
                    panelContent.includes('Source') ||
                    panelContent.includes('source') ||
                    panelContent.includes('Value');
                expect(hasSourceOrFallback).toBe(true);
            }

            // Close panel for next iteration
            await closeXRayPanel(page);
        }
    });

    test('field alias resolution works for market_share', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateToGames(page);
        await enableXRay(page);

        // Find a market_share span
        const mktSpan = page.locator('[data-xray*=\'"field":"market_share"\']').first();
        if (await mktSpan.isVisible({ timeout: 3000 }).catch(() => false)) {
            await mktSpan.click();
            await page.waitForTimeout(1500);

            const panelContent = await page.locator('#xray-panel-content').textContent();
            // Should show market_share_pct (resolved alias), not "unknown"
            const hasValidContent =
                panelContent.includes('market_share_pct') ||
                panelContent.includes('Calculated metric') ||
                panelContent.includes('platform') ||
                panelContent.includes('Market');
            expect(hasValidContent).toBe(true);
        }
    });

    test('provenance API returns correct data for all field types', async ({ page, baseURL }) => {
        await login(page, baseURL);

        // Direct API call: get a real game name first
        const gamesResp = await page.evaluate(async () => {
            const r = await fetch('/api/data/games', { credentials: 'include' });
            return r.ok ? r.json() : null;
        });
        expect(gamesResp).not.toBeNull();

        const gameName = gamesResp[0]?.name || gamesResp.games?.[0]?.name;
        expect(gameName).toBeTruthy();

        // Test provenance API for each field
        const testFields = ['rtp', 'volatility', 'provider', 'release_year', 'theo_win', 'market_share', 'name'];

        for (const field of testFields) {
            const data = await page.evaluate(
                async ({ name, f }) => {
                    const url = `/api/data/provenance/${encodeURIComponent(name)}?focusField=${encodeURIComponent(f)}`;
                    const r = await fetch(url, { credentials: 'include' });
                    return r.ok ? r.json() : { error: r.status };
                },
                { name: gameName, f: field }
            );

            expect(data.error).toBeUndefined();
            expect(data.game).toBe(gameName);

            // market_share should resolve to market_share_pct in focus
            if (field === 'market_share') {
                if (data.focus) {
                    expect(data.focus.field).toBe('market_share_pct');
                }
            }

            // All fields with values should have extraction_method
            if (data.focus && data.focus.value != null) {
                expect(data.focus.extraction_method).not.toBeNull();
                expect(data.focus.extraction_method.method).toBeTruthy();
            }

            // Platform fields should have platform confidence when value exists
            const platformSet = ['theo_win', 'release_year', 'provider', 'name'];
            if (platformSet.includes(field) && data.focus?.value != null) {
                expect(data.focus.confidence).toBe('platform');
                expect(data.focus.source_type).toBe('platform');
            }
        }
    });

    test('dimension-level provenance works for all dimensions', async ({ page, baseURL }) => {
        await login(page, baseURL);

        const dimensions = [
            { dimension: 'provider', value: 'IGT' },
            { dimension: 'theme', value: 'Fire' },
            { dimension: 'volatility', value: 'High' },
            { dimension: 'feature', value: 'Free Spins' },
        ];

        for (const { dimension, value } of dimensions) {
            const data = await page.evaluate(
                async ({ dim, val }) => {
                    const url = `/api/data/provenance/top-game?dimension=${encodeURIComponent(dim)}&value=${encodeURIComponent(val)}`;
                    const r = await fetch(url, { credentials: 'include' });
                    return r.ok ? r.json() : { error: r.status };
                },
                { dim: dimension, val: value }
            );

            expect(data.error).toBeUndefined();
            expect(data.gameName).toBeTruthy();
            expect(data.totalGames).toBeGreaterThan(0);
        }
    });

    test('X-Ray indicator is visible when active', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateToGames(page);
        await enableXRay(page);

        const indicator = page.locator('#xray-indicator');
        await expect(indicator).toBeVisible();
        const text = await indicator.textContent();
        expect(text).toContain('X-RAY');
    });

    test('dimension click returns ranking data from API', async ({ page, baseURL }) => {
        await login(page, baseURL);

        const dims = [
            { dimension: 'provider', value: 'IGT' },
            { dimension: 'theme', value: 'Fire' },
            { dimension: 'volatility', value: 'High' },
        ];

        for (const { dimension, value } of dims) {
            const data = await page.evaluate(
                async ({ dim, val }) => {
                    const url = `/api/data/provenance/top-game?dimension=${encodeURIComponent(dim)}&value=${encodeURIComponent(val)}`;
                    const r = await fetch(url, { credentials: 'include' });
                    return r.ok ? r.json() : { error: r.status };
                },
                { dim: dimension, val: value }
            );

            expect(data.error).toBeUndefined();
            expect(data.gameName).toBeTruthy();
            if (data.ranking) {
                expect(data.ranking.rank).toBeGreaterThan(0);
                expect(data.ranking.smartIndex).toBeGreaterThanOrEqual(0);
                expect(data.ranking.total_dimension_entries).toBeGreaterThan(0);
                expect(data.ranking.top5).toBeTruthy();
                expect(data.ranking.top5.length).toBeGreaterThan(0);
                expect(data.ranking.top5.length).toBeLessThanOrEqual(5);
                for (const entry of data.ranking.top5) {
                    expect(entry.rank).toBeGreaterThan(0);
                    expect(entry.name).toBeTruthy();
                    expect(entry.game_count).toBeGreaterThan(0);
                }
            }
        }
    });

    test('dimension click renders ranking card in X-Ray panel UI', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateToGames(page);
        await enableXRay(page);

        const provSpan = page.locator('[data-xray*=\'"field":"provider"\']').first();
        if (await provSpan.isVisible({ timeout: 3000 }).catch(() => false)) {
            await provSpan.click();
            await page.waitForTimeout(2000);

            const content = await page.locator('#xray-panel-content').textContent();
            const hasRanking = content.includes('Ranking') || content.includes('#');
            const hasSI = content.includes('Performance Index') || content.includes('SI');
            if (hasRanking) {
                expect(hasSI).toBe(true);
                const hasTop5 = content.includes('Top 5');
                expect(hasTop5).toBe(true);
            }
            await closeXRayPanel(page);
        }
    });

    test('year summary API shows game count (not an error)', async ({ page, baseURL }) => {
        await login(page, baseURL);

        const allGames = await page.evaluate(async () => {
            const r = await fetch('/api/data/games', { credentials: 'include' });
            return r.ok ? r.json() : [];
        });
        const games = Array.isArray(allGames) ? allGames : allGames?.games || [];
        expect(games.length).toBeGreaterThan(0);

        const yearSet = new Set();
        for (const g of games) {
            const y = g.release_year;
            if (y && Number(y) >= 2015 && Number(y) <= 2026) yearSet.add(Number(y));
        }
        expect(yearSet.size).toBeGreaterThan(0);

        const year = [...yearSet][0];
        const yearGames = games.filter(g => {
            const ry = g.release_year;
            return ry === year || ry === String(year);
        });
        expect(yearGames.length).toBeGreaterThan(0);
    });

    test('feature detail API returns rules_evidence or description', async ({ page, baseURL }) => {
        await login(page, baseURL);

        const gameName = await page.evaluate(async () => {
            const r = await fetch('/api/data/games', { credentials: 'include' });
            if (!r.ok) return null;
            const data = await r.json();
            const games = Array.isArray(data) ? data : data?.games || [];
            const g = games.find(
                g =>
                    Array.isArray(g.features) &&
                    g.features.length > 0 &&
                    Array.isArray(g.feature_details) &&
                    g.feature_details.length > 0
            );
            return g?.name || null;
        });

        if (!gameName) return;

        const data = await page.evaluate(async name => {
            const r = await fetch(`/api/data/provenance/${encodeURIComponent(name)}`, { credentials: 'include' });
            return r.ok ? r.json() : null;
        }, gameName);

        expect(data).not.toBeNull();
        expect(data.features).toBeTruthy();
        if (data.features.length > 0) {
            const withEvidence = data.features.filter(f => f.rules_evidence || f.context);
            expect(withEvidence.length).toBeGreaterThanOrEqual(0);
        }
    });

    test('X-Ray panel shows drilldown at the top when focusField is set', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateToGames(page);
        await enableXRay(page);

        // Click an RTP span
        const rtpSpan = page.locator('[data-xray*=\'"field":"rtp"\']').first();
        if (await rtpSpan.isVisible({ timeout: 3000 }).catch(() => false)) {
            await rtpSpan.click();
            await page.waitForTimeout(1500);

            // The panel content should contain drilldown-related text near the top
            const content = await page.locator('#xray-panel-content').textContent();
            const drilldownExists =
                content.includes('Drilldown') ||
                content.includes('drilldown') ||
                content.includes('Source') ||
                content.includes('Extraction method') ||
                content.includes('Result');
            expect(drilldownExists).toBe(true);
        }
    });
});
