/**
 * Dedicated art page interaction E2E tests.
 *
 * Validates chart rendering, heatmap data, and dimension picker interactions.
 */
import { test, expect } from '@playwright/test';

const CREDS = { username: 'avner', password: 'avner' };

async function login(page, baseURL) {
    await page.goto(`${baseURL}/login.html`);
    await page.fill('#login-username', CREDS.username);
    await page.fill('#login-password', CREDS.password);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 30000 });
    await page.waitForFunction(
        () => {
            const o = document.getElementById('loading-overlay');
            return !o || o.style.opacity === '0' || !o.offsetParent;
        },
        { timeout: 30000 },
    );
    await page.waitForTimeout(2000);
}

test.describe('Art Interactions', () => {
    let errors;

    test.beforeEach(async ({ page, baseURL }) => {
        errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await login(page, baseURL);
        await page.evaluate(() => window.showPage('art'));
        await page.waitForTimeout(4000);
    });

    test('all chart sections render (6+ canvases)', async ({ page }) => {
        const canvases = page.locator('#page-container canvas');
        const count = await canvases.count();
        expect(count).toBeGreaterThanOrEqual(6);

        for (let i = 0; i < Math.min(count, 6); i++) {
            const width = await canvases.nth(i).evaluate(el => el.width);
            expect(width, `Canvas ${i} should have width`).toBeGreaterThan(0);
        }
    });

    test('combo heatmap has data', async ({ page }) => {
        const heatmap = page.locator('#art-combo-heatmap');
        if ((await heatmap.count()) === 0) return;

        const rows = page.locator('#art-combo-heatmap table tr, #art-combo-heatmap tr');
        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThanOrEqual(3);
    });

    test('dimension picker changes heatmap', async ({ page }) => {
        const picker = page.locator('#art-combo-dim-picker');
        if ((await picker.count()) === 0) return;

        const options = await picker.locator('option').count();
        if (options < 2) return;

        const beforeHtml = await page.locator('#art-combo-heatmap').innerHTML();
        await picker.selectOption({ index: 1 });
        await page.waitForTimeout(2500);

        const afterHtml = await page.locator('#art-combo-heatmap').innerHTML();
        expect(afterHtml).not.toBe(beforeHtml);

        expect(errors).toHaveLength(0);
    });

    test('art trend dimension picker', async ({ page }) => {
        const picker = page.locator('#art-trend-dimension');
        if ((await picker.count()) === 0) return;

        const options = await picker.locator('option').count();
        if (options < 2) return;

        await picker.selectOption({ index: 1 });
        await page.waitForTimeout(2500);

        const canvas = page.locator('#art-trend-chart');
        if ((await canvas.count()) > 0) {
            const width = await canvas.evaluate(el => el.width);
            expect(width).toBeGreaterThan(0);
        }

        expect(errors).toHaveLength(0);
    });

    test('opportunity chart renders', async ({ page }) => {
        const canvas = page.locator('#art-opportunity-chart');
        if ((await canvas.count()) === 0) return;

        const width = await canvas.evaluate(el => el.width);
        expect(width).toBeGreaterThan(0);

        expect(errors).toHaveLength(0);
    });
});
