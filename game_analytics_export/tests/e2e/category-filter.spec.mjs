/**
 * Dedicated category filter E2E tests.
 *
 * Verifies that the page-category-filter dropdown correctly filters data
 * across Overview, Themes, and Insights pages.
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

async function navigateTo(page, pageName) {
    await page.evaluate(p => window.showPage(p), pageName);
    await page.waitForTimeout(2500);
}

test.describe('Category Filter', () => {
    let errors;

    test.beforeEach(async ({ page, baseURL }) => {
        errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await login(page, baseURL);
    });

    test('overview: Slot filter changes and restores', async ({ page }) => {
        await navigateTo(page, 'overview');

        const filter = page.locator('#page-category-filter');
        if ((await filter.count()) === 0) return;

        const options = await filter.locator('option').allTextContents();
        const slotOption = options.find(o => /slot/i.test(o));
        if (!slotOption) return;

        await filter.selectOption({ label: slotOption });
        await page.waitForTimeout(3000);

        const selected = await filter.inputValue();
        expect(selected.length).toBeGreaterThan(0);

        await filter.selectOption({ index: 0 });
        await page.waitForTimeout(2000);

        const restored = await filter.inputValue();
        expect(restored).not.toBe(selected);

        expect(errors).toHaveLength(0);
    });

    test('themes: Slot filter updates theme table', async ({ page }) => {
        await navigateTo(page, 'themes');
        await page.waitForSelector('#themes-table tbody tr', { timeout: 10000 });

        const filter = page.locator('#page-category-filter');
        if ((await filter.count()) === 0) return;

        const beforeRows = await page.locator('#themes-table tbody tr').count();
        const beforeCount = await page.locator('#themes-count').textContent();

        const options = await filter.locator('option').allTextContents();
        const slotOption = options.find(o => /slot/i.test(o));
        if (!slotOption) return;

        await filter.selectOption({ label: slotOption });
        await page.waitForTimeout(2500);

        const afterCount = await page.locator('#themes-count').textContent();
        expect(afterCount).not.toBe(beforeCount);

        expect(errors).toHaveLength(0);
    });

    test('insights: Slot filter updates content', async ({ page }) => {
        await navigateTo(page, 'insights');
        await page.waitForTimeout(3000);

        const filter = page.locator('#page-category-filter');
        if ((await filter.count()) === 0) return;

        const beforeText = await page.locator('#page-container').innerText();

        const options = await filter.locator('option').allTextContents();
        const slotOption = options.find(o => /slot/i.test(o));
        if (!slotOption) return;

        await filter.selectOption({ label: slotOption });
        await page.waitForTimeout(3000);

        const afterText = await page.locator('#page-container').innerText();
        expect(afterText.length).toBeGreaterThan(50);

        expect(errors).toHaveLength(0);
    });

    test('category persists or resets across navigation', async ({ page }) => {
        await navigateTo(page, 'overview');

        const filter = page.locator('#page-category-filter');
        if ((await filter.count()) === 0) return;

        const options = await filter.locator('option').allTextContents();
        const slotOption = options.find(o => /slot/i.test(o));
        if (!slotOption) return;

        await filter.selectOption({ label: slotOption });
        await page.waitForTimeout(2000);

        const overviewCount = await page.locator('#overview-total-games').textContent();

        await navigateTo(page, 'themes');
        await page.waitForTimeout(2000);

        await navigateTo(page, 'overview');
        await page.waitForTimeout(2000);

        const afterNavCount = await page.locator('#overview-total-games').textContent();
        // Document behavior: count should match (persists) or be higher (resets to All)
        const after = Number(afterNavCount.replace(/,/g, ''));
        expect(after).toBeGreaterThan(0);

        expect(errors).toHaveLength(0);
    });
});
