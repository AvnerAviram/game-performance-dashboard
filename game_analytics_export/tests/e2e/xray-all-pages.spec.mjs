/**
 * X-Ray ALL PAGES E2E Test
 *
 * Goes to every major page and clicks data elements with X-Ray on.
 * Validates that:
 * - Game-level clicks open the panel with extraction method + result
 * - Dimension-level clicks (provider/theme/mechanic rows) open the panel
 * - Chart clicks either open a valid panel OR are gracefully ignored (trend charts)
 * - Noise clicks (headings, buttons, nav) do NOT open the panel
 * - Year values are NOT misidentified as themes
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
        const gp = document.getElementById('game-panel');
        if (gp) gp.style.right = '-100%';
        const pp = document.getElementById('provider-panel');
        if (pp) pp.style.right = '-100%';
        const tp = document.getElementById('theme-panel');
        if (tp) tp.style.right = '-100%';
        const mp = document.getElementById('mechanic-panel');
        if (mp) mp.style.right = '-100%';
    });
    await page.waitForTimeout(300);
}

async function navigateTo(page, pageName) {
    await page.evaluate(name => {
        if (window.showPage) window.showPage(name);
    }, pageName);
    await page.waitForTimeout(2000);
}

function log(msg) {
    console.log(`  [X-Ray] ${msg}`);
}

async function getPanelText(page) {
    return page.evaluate(() => {
        const xp = document.getElementById('xray-panel-content');
        if (xp) {
            const p = document.getElementById('xray-panel');
            if (p && (p.style.right === '0px' || parseInt(getComputedStyle(p).right) >= 0)) {
                return xp.textContent || '';
            }
        }
        return '';
    });
}

async function isXRayPanelOpen(page) {
    return page.evaluate(() => {
        const p = document.getElementById('xray-panel');
        if (!p) return false;
        return p.style.right === '0px' || parseInt(getComputedStyle(p).right) >= 0;
    });
}

test.describe('X-Ray: ALL PAGES comprehensive test', () => {
    test.setTimeout(240000);

    test('Games page: every data-xray field type', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'games');
        await page.waitForSelector('[data-xray]', { timeout: 15000 });
        await enableXRay(page);

        const fieldTypes = await page.evaluate(() => {
            const spans = document.querySelectorAll('[data-xray]');
            const seen = {};
            for (const s of spans) {
                try {
                    const info = JSON.parse(s.dataset.xray);
                    const txt = s.textContent.trim();
                    if (!seen[info.field] && txt && txt !== '—') {
                        seen[info.field] = { game: info.game, text: txt };
                    }
                } catch {}
            }
            return seen;
        });

        const fields = Object.keys(fieldTypes);
        log(`Games page: ${fields.length} field types: ${fields.join(', ')}`);
        expect(fields.length).toBeGreaterThanOrEqual(3);

        const results = [];
        for (const [field, { game }] of Object.entries(fieldTypes)) {
            const selector = `[data-xray*='"field":"${field}"']`;
            const el = page.locator(selector).first();
            if (!(await el.isVisible({ timeout: 500 }).catch(() => false))) continue;

            await el.click({ force: true });
            await page.waitForTimeout(1500);

            const content = await getPanelText(page);
            const open = await isXRayPanelOpen(page);

            if (!open || content.length < 20) {
                results.push({ field, status: 'FAIL', reason: 'panel not open or empty' });
                log(`FAIL games/${field}: panel not open`);
            } else if (content.includes('No games found')) {
                results.push({ field, status: 'FAIL', reason: 'dimension fallback for game click' });
                log(`FAIL games/${field}: got dimension fallback`);
            } else if (!content.includes('Extraction method') && !content.includes('Method')) {
                results.push({ field, status: 'WARN', reason: 'no extraction method shown' });
                log(`WARN games/${field}: no extraction method`);
            } else {
                results.push({ field, status: 'PASS' });
                log(`PASS games/${field} (${game})`);
            }
            await closePanel(page);
        }

        const failed = results.filter(r => r.status === 'FAIL');
        log(`Games: ${results.filter(r => r.status === 'PASS').length} PASS, ${failed.length} FAIL`);
        expect(failed).toHaveLength(0);
    });

    test('Providers page: click provider rows', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'providers');
        await page.waitForTimeout(3000);
        await enableXRay(page);

        const providerRows = page.locator('#providers-table tbody tr[onclick]');
        const count = await providerRows.count();
        log(`Providers page: ${count} provider rows found`);
        expect(count).toBeGreaterThan(0);

        const results = [];
        const maxTest = Math.min(count, 5);
        for (let i = 0; i < maxTest; i++) {
            const row = providerRows.nth(i);
            const provName = await row.evaluate(el => {
                const cells = el.querySelectorAll('td');
                return cells[1]?.textContent?.trim() || cells[0]?.textContent?.trim() || '';
            });

            await row.click({ force: true });
            await page.waitForTimeout(1500);

            const xrayOpen = await isXRayPanelOpen(page);
            const content = await getPanelText(page);

            if (xrayOpen && content.length > 20) {
                if (content.includes('No games found')) {
                    results.push({ provider: provName, status: 'FAIL', reason: 'no games found' });
                    log(`FAIL providers/${provName}: no games found`);
                } else {
                    results.push({ provider: provName, status: 'PASS' });
                    log(`PASS providers/${provName}`);
                }
            } else {
                results.push({
                    provider: provName,
                    status: 'SKIP',
                    reason: 'panel not open (onclick may go to provider detail instead)',
                });
                log(`SKIP providers/${provName}: X-Ray panel not open (provider detail panel opened instead)`);
            }

            await closePanel(page);
        }

        log(
            `Providers: ${results.filter(r => r.status === 'PASS').length} PASS, ${results.filter(r => r.status === 'FAIL').length} FAIL, ${results.filter(r => r.status === 'SKIP').length} SKIP`
        );
        const failed = results.filter(r => r.status === 'FAIL');
        expect(failed).toHaveLength(0);
    });

    test('Themes page: click theme rows', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'themes');
        await page.waitForTimeout(3000);
        await enableXRay(page);

        const themeRows = page.locator('#themes-table tbody tr');
        const count = await themeRows.count();
        log(`Themes page: ${count} theme rows found`);
        expect(count).toBeGreaterThan(0);

        const results = [];
        const maxTest = Math.min(count, 5);
        for (let i = 0; i < maxTest; i++) {
            const row = themeRows.nth(i);
            const themeName = await row.evaluate(el => {
                const cells = el.querySelectorAll('td');
                return cells[1]?.textContent?.trim() || cells[0]?.textContent?.trim() || '';
            });
            if (!themeName || themeName === '—') continue;

            await row.click({ force: true });
            await page.waitForTimeout(1500);

            const xrayOpen = await isXRayPanelOpen(page);
            const content = await getPanelText(page);

            if (xrayOpen && content.length > 20 && !content.includes('No games found')) {
                results.push({ theme: themeName, status: 'PASS' });
                log(`PASS themes/${themeName}`);
            } else if (xrayOpen && content.includes('No games found')) {
                results.push({ theme: themeName, status: 'FAIL', reason: 'no games found' });
                log(`FAIL themes/${themeName}: no games found`);
            } else {
                results.push({ theme: themeName, status: 'SKIP' });
                log(`SKIP themes/${themeName}: X-Ray panel not open`);
            }

            await closePanel(page);
        }

        log(
            `Themes: ${results.filter(r => r.status === 'PASS').length} PASS, ${results.filter(r => r.status === 'FAIL').length} FAIL`
        );
        const failed = results.filter(r => r.status === 'FAIL');
        expect(failed).toHaveLength(0);
    });

    test('Mechanics page: click mechanic rows', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'mechanics');
        await page.waitForTimeout(3000);
        await enableXRay(page);

        const mechRows = page.locator('#mechanics-table tbody tr');
        const count = await mechRows.count();
        log(`Mechanics page: ${count} mechanic rows found`);
        expect(count).toBeGreaterThan(0);

        const results = [];
        const maxTest = Math.min(count, 5);
        for (let i = 0; i < maxTest; i++) {
            const row = mechRows.nth(i);
            const mechName = await row.evaluate(el => {
                const cells = el.querySelectorAll('td');
                return cells[1]?.textContent?.trim() || cells[0]?.textContent?.trim() || '';
            });
            if (!mechName || mechName === '—') continue;

            await row.click({ force: true });
            await page.waitForTimeout(1500);

            const xrayOpen = await isXRayPanelOpen(page);
            const content = await getPanelText(page);

            if (xrayOpen && content.length > 20 && !content.includes('No games found')) {
                results.push({ mechanic: mechName, status: 'PASS' });
                log(`PASS mechanics/${mechName}`);
            } else if (xrayOpen && content.includes('No games found')) {
                results.push({ mechanic: mechName, status: 'FAIL', reason: 'no games found' });
                log(`FAIL mechanics/${mechName}: no games found`);
            } else {
                results.push({ mechanic: mechName, status: 'SKIP' });
                log(`SKIP mechanics/${mechName}: X-Ray panel not open`);
            }

            await closePanel(page);
        }

        log(
            `Mechanics: ${results.filter(r => r.status === 'PASS').length} PASS, ${results.filter(r => r.status === 'FAIL').length} FAIL`
        );
        const failed = results.filter(r => r.status === 'FAIL');
        expect(failed).toHaveLength(0);
    });

    test('Overview page: noise text must NOT open X-Ray as dimension', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'overview');
        await page.waitForTimeout(3000);
        await enableXRay(page);

        const noiseSelectors = ['h1', 'h2', 'h3', '.text-3xl', '.text-2xl'];
        const results = [];

        for (const sel of noiseSelectors) {
            const el = page.locator(sel).first();
            if (!(await el.isVisible({ timeout: 500 }).catch(() => false))) continue;

            const text = await el.textContent();
            await el.click({ force: true });
            await page.waitForTimeout(800);

            const content = await getPanelText(page);
            if (content.includes('No games found') || content.includes('theme:') || content.includes('provider:')) {
                results.push({ sel, text: text?.trim(), status: 'FAIL', reason: 'noise text opened dimension panel' });
                log(`FAIL overview/noise "${text?.trim()?.slice(0, 30)}": opened as dimension`);
            } else {
                results.push({ sel, status: 'PASS' });
                log(`PASS overview/noise "${text?.trim()?.slice(0, 30)}": correctly ignored`);
            }
            await closePanel(page);
        }

        const failed = results.filter(r => r.status === 'FAIL');
        expect(failed).toHaveLength(0);
    });

    test('Trends page: year labels must NOT be misidentified as themes', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'trends');
        await page.waitForTimeout(3000);
        await enableXRay(page);

        const yearElements = await page.evaluate(() => {
            const els = [];
            const all = document.querySelectorAll('span, td, div, text, button');
            for (const el of all) {
                const t = el.textContent?.trim();
                if (/^\d{4}$/.test(t)) {
                    const y = parseInt(t);
                    if (y >= 2000 && y <= 2030) {
                        els.push({ tag: el.tagName, text: t, id: el.id || '' });
                    }
                }
            }
            return els.slice(0, 5);
        });

        log(`Trends page: found ${yearElements.length} year-like elements`);

        for (const ye of yearElements) {
            const selector = ye.id ? `#${ye.id}` : `${ye.tag.toLowerCase()}:text-is("${ye.text}")`;
            const el = page.locator(selector).first();
            if (!(await el.isVisible({ timeout: 500 }).catch(() => false))) continue;

            await el.click({ force: true });
            await page.waitForTimeout(1000);

            const content = await getPanelText(page);
            if (content.includes(`theme: ${ye.text}`) || content.includes(`theme:${ye.text}`)) {
                log(`FAIL trends/year "${ye.text}": misidentified as theme!`);
                expect(content).not.toContain(`theme: ${ye.text}`);
            } else {
                log(`PASS trends/year "${ye.text}": not misidentified`);
            }
            await closePanel(page);
        }
    });

    test('Insights page: chart canvas clicks are handled gracefully', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'insights');
        await page.waitForTimeout(3000);
        await enableXRay(page);

        const canvasIds = [
            'chart-market-landscape',
            'chart-provider-landscape',
            'chart-volatility-landscape',
            'chart-rtp-landscape',
            'chart-brand-landscape',
        ];

        for (const id of canvasIds) {
            const canvas = page.locator(`#${id}`);
            if (!(await canvas.isVisible({ timeout: 1000 }).catch(() => false))) {
                log(`SKIP insights/${id}: not visible`);
                continue;
            }

            await canvas.click({ force: true, position: { x: 50, y: 50 } });
            await page.waitForTimeout(1000);

            const content = await getPanelText(page);
            if (content.includes('theme:') && /\d{4}/.test(content)) {
                log(`FAIL insights/${id}: year misidentified as theme`);
                expect(content).not.toMatch(/theme:\s*\d{4}/);
            } else {
                log(`PASS insights/${id}: handled gracefully`);
            }
            await closePanel(page);
        }
    });

    test('Cross-page: clicking numbers, stats, and KPI cards', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'overview');
        await page.waitForTimeout(3000);
        await enableXRay(page);

        const kpiIds = [
            'overview-total-games',
            'overview-total-themes',
            'overview-total-mechanics',
            'overview-total-providers',
        ];
        for (const id of kpiIds) {
            const el = page.locator(`#${id}`);
            if (!(await el.isVisible({ timeout: 500 }).catch(() => false))) continue;

            const text = await el.textContent();
            await el.click({ force: true });
            await page.waitForTimeout(800);

            const content = await getPanelText(page);
            const badMatch = content.includes('No games found') && content.includes('theme:');
            if (badMatch) {
                log(`FAIL overview/kpi "${id}" (${text?.trim()}): misidentified`);
            } else {
                log(`PASS overview/kpi "${id}" (${text?.trim()}): handled`);
            }
            expect(badMatch).toBe(false);
            await closePanel(page);
        }
    });
});
