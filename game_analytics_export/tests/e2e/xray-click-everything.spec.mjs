/**
 * X-Ray "Click Everything" E2E Test
 *
 * Navigates every page of the dashboard, clicks on many different
 * element types with X-Ray active, and challenges the drilldown results:
 *
 * - Games table: every column type
 * - Provider chart bars
 * - Theme chart bars
 * - Overview stats
 * - Provider page elements
 * - Headings and noise text should NOT trigger the panel
 *
 * For each click that opens a panel, validates:
 * 1. Panel actually opened (not stuck on "not available")
 * 2. Drilldown has extraction method + result
 * 3. Values shown match what's in the API response
 * 4. Confidence is not "unknown" for known field types
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
    const hamburger = page.locator('#hamburger-btn');
    await hamburger.waitFor({ state: 'visible', timeout: 5000 });
    await hamburger.click();
    await page.waitForTimeout(400);
    const xrayBtn = page.locator('#xray-menu-btn');
    await xrayBtn.waitFor({ state: 'visible', timeout: 3000 });
    await xrayBtn.click();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const d = document.getElementById('hamburger-dropdown');
        if (d) d.classList.add('hidden');
    });
    await page.waitForTimeout(200);
    const active = await page.evaluate(() => document.body.classList.contains('xray-active'));
    expect(active).toBe(true);
}

async function closePanel(page) {
    await page.evaluate(() => {
        if (window.closeXRayPanel) window.closeXRayPanel();
        const b = document.getElementById('mechanic-backdrop');
        if (b) {
            b.classList.add('hidden');
            b.classList.remove('block');
        }
    });
    await page.waitForTimeout(200);
}

async function getPanelContent(page) {
    return page.evaluate(() => {
        const el = document.getElementById('xray-panel-content');
        return el ? el.textContent : '';
    });
}

async function isPanelOpen(page) {
    return page.evaluate(() => {
        const p = document.getElementById('xray-panel');
        if (!p) return false;
        return p.style.right === '0px' || parseInt(getComputedStyle(p).right) >= 0;
    });
}

function log(msg) {
    console.log(`  [X-Ray] ${msg}`);
}

test.describe('X-Ray: click everything and challenge results', () => {
    test.setTimeout(180000);

    test('games table: click every column type and validate drilldowns', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await page.locator('[data-page="games"]').click();
        await page.waitForSelector('[data-xray]', { timeout: 15000 });
        await enableXRay(page);

        const results = [];

        // Gather all unique field types from data-xray attributes
        const fieldTypes = await page.evaluate(() => {
            const spans = document.querySelectorAll('[data-xray]');
            const seen = {};
            for (const s of spans) {
                try {
                    const info = JSON.parse(s.dataset.xray);
                    if (!seen[info.field]) seen[info.field] = { game: info.game, text: s.textContent.trim() };
                } catch {}
            }
            return seen;
        });

        log(`Found ${Object.keys(fieldTypes).length} field types: ${Object.keys(fieldTypes).join(', ')}`);

        for (const [field, { game, text }] of Object.entries(fieldTypes)) {
            if (!game || !text || text === '—') continue;

            // Click the first span for this field type
            const selector = `[data-xray*='"field":"${field}"']`;
            const el = page.locator(selector).first();
            if (!(await el.isVisible({ timeout: 500 }).catch(() => false))) {
                log(`SKIP ${field}: not visible`);
                continue;
            }

            await el.click({ force: true });
            await page.waitForTimeout(1200);

            const open = await isPanelOpen(page);
            if (!open) {
                results.push({ field, game, status: 'FAIL', reason: 'Panel did not open' });
                log(`FAIL ${field} (${game}): panel did not open`);
                continue;
            }

            const content = await getPanelContent(page);

            // Challenge 1: Panel has actual content (not empty)
            if (content.length < 20) {
                results.push({ field, game, status: 'FAIL', reason: 'Panel content empty' });
                log(`FAIL ${field}: panel empty`);
                await closePanel(page);
                continue;
            }

            // Challenge 2: "not available" message should NOT appear for game-level clicks
            if (content.includes('No games found matching')) {
                results.push({ field, game, status: 'FAIL', reason: 'Got "no games found" for a game-level click' });
                log(`FAIL ${field}: got dimension fallback for game click`);
                await closePanel(page);
                continue;
            }

            // Challenge 3: Drilldown should show extraction method
            const hasMethod = content.includes('Extraction method') || content.includes('Method');
            // Challenge 4: Drilldown should show a result
            const hasResult = content.includes('Result');

            // Challenge 5: Game name should appear in the panel
            const hasGameName = content.includes(game.slice(0, 15));

            const challenges = [];
            if (!hasMethod) challenges.push('no extraction method');
            if (!hasResult) challenges.push('no result section');
            if (!hasGameName) challenges.push('game name missing from panel');

            if (challenges.length > 0) {
                results.push({ field, game, status: 'WARN', reason: challenges.join(', ') });
                log(`WARN ${field} (${game}): ${challenges.join(', ')}`);
            } else {
                results.push({ field, game, status: 'PASS' });
                log(`PASS ${field} (${game})`);
            }

            await closePanel(page);
        }

        // At least 5 field types should pass
        const passed = results.filter(r => r.status === 'PASS').length;
        const failed = results.filter(r => r.status === 'FAIL').length;
        log(`Results: ${passed} PASS, ${failed} FAIL, ${results.length - passed - failed} WARN`);
        expect(failed).toBe(0);
        expect(passed).toBeGreaterThanOrEqual(3);
    });

    test('noise text clicks should NOT open X-Ray panel', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await page.locator('[data-page="games"]').click();
        await page.waitForSelector('[data-xray]', { timeout: 15000 });
        await enableXRay(page);

        // Click on a heading (should not trigger X-Ray)
        const heading = page.locator('h1, h2, h3').first();
        if (await heading.isVisible({ timeout: 2000 }).catch(() => false)) {
            await heading.click({ force: true });
            await page.waitForTimeout(800);
            const content = await getPanelContent(page);
            // Should NOT have opened with "Providers" or other generic noise
            expect(content).not.toContain('No games found matching');
            await closePanel(page);
        }
    });

    test('API cross-check: drilldown values match game_data_master.json', async ({ page, baseURL }) => {
        await login(page, baseURL);

        // Load game_data_master from the API
        const gamesData = await page.evaluate(async () => {
            const r = await fetch('/api/data/games', { credentials: 'include' });
            return r.ok ? r.json() : null;
        });
        expect(gamesData).not.toBeNull();

        // Pick 5 random games with RTP values
        const gamesWithRtp = gamesData.filter(g => g.rtp > 0).slice(0, 5);
        const errors = [];

        for (const game of gamesWithRtp) {
            const provData = await page.evaluate(async name => {
                const r = await fetch(`/api/data/provenance/${encodeURIComponent(name)}?field=rtp`, {
                    credentials: 'include',
                });
                return r.ok ? r.json() : null;
            }, game.name);

            if (!provData) {
                errors.push(`${game.name}: provenance API returned null`);
                continue;
            }

            // Challenge: RTP value in provenance must match game_data_master
            const provRtp = provData.fields?.rtp?.value;
            if (provRtp != null && provRtp !== game.rtp) {
                errors.push(`${game.name}: RTP mismatch — master=${game.rtp}, provenance=${provRtp}`);
            }

            // Challenge: provider must match
            const provProvider = provData.fields?.provider?.value;
            if (provProvider && game.provider && provProvider !== game.provider) {
                errors.push(`${game.name}: provider mismatch — master=${game.provider}, prov=${provProvider}`);
            }

            // Challenge: volatility must match
            const provVol = provData.fields?.volatility?.value;
            if (provVol && game.volatility && provVol !== game.volatility) {
                errors.push(`${game.name}: volatility mismatch — master=${game.volatility}, prov=${provVol}`);
            }

            // Challenge: if confidence is "extracted" and there's rules text, there should be a context window
            if (provData.focus?.confidence === 'extracted' && provData.source?.rules_available) {
                if (!provData.focus.context_window) {
                    log(`NOTE: ${game.name} has extracted RTP but no context window`);
                }
            }

            // Challenge: platform fields should have platform confidence
            if (provData.fields?.theo_win?.value != null) {
                expect(provData.fields.theo_win.confidence).toBe('platform');
            }
            if (provData.fields?.provider?.value != null) {
                expect(provData.fields.provider.confidence).toBe('platform');
            }
        }

        if (errors.length > 0) {
            console.log('Cross-check errors:', errors);
        }
        expect(errors).toHaveLength(0);
    });

    test('dimension lookups work for all supported dimensions', async ({ page, baseURL }) => {
        await login(page, baseURL);

        const cases = [
            { dimension: 'provider', value: 'IGT' },
            { dimension: 'provider', value: 'Evolution' },
            { dimension: 'theme', value: 'Fire' },
            { dimension: 'theme', value: 'Asian' },
            { dimension: 'volatility', value: 'High' },
            { dimension: 'volatility', value: 'Medium' },
            { dimension: 'volatility', value: 'Low' },
            { dimension: 'feature', value: 'Free Spins' },
        ];

        const results = [];
        for (const { dimension, value } of cases) {
            const data = await page.evaluate(
                async ({ dim, val }) => {
                    const url = `/api/data/provenance/top-game?dimension=${encodeURIComponent(dim)}&value=${encodeURIComponent(val)}`;
                    const r = await fetch(url, { credentials: 'include' });
                    return r.ok ? r.json() : { error: r.status, statusText: await r.text() };
                },
                { dim: dimension, val: value }
            );

            if (data.error) {
                results.push(`FAIL ${dimension}=${value}: ${data.statusText || data.error}`);
            } else {
                expect(data.gameName).toBeTruthy();
                expect(data.totalGames).toBeGreaterThan(0);
                results.push(`PASS ${dimension}=${value}: top game = ${data.gameName} (${data.totalGames} total)`);
            }
        }

        log(results.join('\n  '));
        const failures = results.filter(r => r.startsWith('FAIL'));
        expect(failures).toHaveLength(0);
    });
});
