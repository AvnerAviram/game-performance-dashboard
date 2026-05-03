/**
 * Dedicated search and filter E2E tests on the Games page.
 *
 * Validates search by name, provider filter, combined filters, and pagination.
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

test.describe('Search & Filter Games', () => {
    let errors;

    test.beforeEach(async ({ page, baseURL }) => {
        errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await login(page, baseURL);
        await page.evaluate(() => window.showPage('games'));
        await page.waitForSelector('#games-table', { timeout: 15000 });
        await page.waitForTimeout(1000);
    });

    test('search by name filters results', async ({ page }) => {
        const search = page.locator('#games-search');
        const allRows = await page.locator('#games-table tbody tr').count();
        expect(allRows).toBeGreaterThan(0);

        await search.fill('cash eruption');
        await page.waitForTimeout(2000);

        const filteredRows = await page.locator('#games-table tbody tr').count();
        expect(filteredRows).toBeLessThan(allRows);
        expect(filteredRows).toBeGreaterThan(0);

        expect(errors).toHaveLength(0);
    });

    test('clear search restores full list', async ({ page }) => {
        const search = page.locator('#games-search');
        const allRows = await page.locator('#games-table tbody tr').count();

        await search.fill('cash eruption');
        await page.waitForTimeout(2000);

        await search.fill('');
        await page.waitForTimeout(2000);

        const restoredRows = await page.locator('#games-table tbody tr').count();
        expect(restoredRows).toBe(allRows);
    });

    test('filter by provider', async ({ page }) => {
        const provFilter = page.locator('#games-filter-provider');
        if ((await provFilter.count()) === 0) return;

        const options = await provFilter.locator('option').allTextContents();
        if (options.length < 2) return;

        const allRows = await page.locator('#games-table tbody tr').count();

        await provFilter.selectOption({ index: 1 });
        await page.waitForTimeout(2000);

        const filteredRows = await page.locator('#games-table tbody tr').count();
        expect(filteredRows).toBeLessThan(allRows);
        expect(filteredRows).toBeGreaterThan(0);

        const selectedProvider = options[1];
        const firstProvCell = await page.locator('#games-table tbody tr td').nth(2).textContent();
        expect(firstProvCell.toLowerCase()).toContain(selectedProvider.toLowerCase().slice(0, 4));

        await provFilter.selectOption({ index: 0 });
        await page.waitForTimeout(1500);

        expect(errors).toHaveLength(0);
    });

    test('combined filter + search', async ({ page }) => {
        const provFilter = page.locator('#games-filter-provider');
        const search = page.locator('#games-search');
        if ((await provFilter.count()) === 0) return;

        const options = await provFilter.locator('option').count();
        if (options < 2) return;

        await provFilter.selectOption({ index: 1 });
        await page.waitForTimeout(2000);
        const provFilteredRows = await page.locator('#games-table tbody tr').count();

        await search.fill('a');
        await page.waitForTimeout(1500);
        const combinedRows = await page.locator('#games-table tbody tr').count();
        expect(combinedRows).toBeLessThanOrEqual(provFilteredRows);

        await search.fill('');
        await provFilter.selectOption({ index: 0 });
        await page.waitForTimeout(1500);
    });

    test('pagination after filter', async ({ page }) => {
        const nextBtn = page.locator('#games-next-btn');
        if ((await nextBtn.count()) === 0) return;
        if (await nextBtn.isDisabled()) return;

        const pageBefore = await page.locator('#games-current-page').textContent();
        await nextBtn.click();
        await page.waitForTimeout(1000);

        const pageAfter = await page.locator('#games-current-page').textContent();
        expect(pageAfter).not.toBe(pageBefore);

        const prevBtn = page.locator('#games-prev-btn');
        if ((await prevBtn.count()) > 0 && !(await prevBtn.isDisabled())) {
            await prevBtn.click();
            await page.waitForTimeout(1000);
            const pageRestored = await page.locator('#games-current-page').textContent();
            expect(pageRestored).toBe(pageBefore);
        }

        expect(errors).toHaveLength(0);
    });
});
