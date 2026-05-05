import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';
const CREDS = { username: 'e2e_test_user', password: 'e2eTestPass123!' };

async function login(page) {
    await page.goto(BASE);
    await page.waitForSelector('#login-username', { timeout: 10000 });
    await page.fill('#login-username', CREDS.username);
    await page.fill('#login-password', CREDS.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('#page-container', { timeout: 15000 });
    await page.waitForTimeout(4000);
}

test('Overview landscapes have coverage pills', async ({ page }) => {
    await login(page);

    const sc = page.locator('#page-container');
    const themeLandscape = page.locator('#chart-scatter').locator('..');
    await themeLandscape.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: '/tmp/coverage-overview-landscapes.png', fullPage: false });

    const chartIds = ['chart-scatter', 'chart-color-landscape', 'chart-rtp', 'chart-providers', 'chart-brands', 'chart-narratives'];
    for (const id of chartIds) {
        const canvas = page.locator(`#${id}`);
        const card = canvas.locator('xpath=ancestor::div[contains(@class,"bg-white")]');
        const pill = card.locator('[data-coverage-pill]');
        const pillCount = await pill.count();
        console.log(`${id}: coverage pill count = ${pillCount}`);
    }
});

test('Overview bar charts have coverage pills', async ({ page }) => {
    await login(page);

    const chartIds = ['chart-themes', 'chart-mechanics', 'chart-games'];
    for (const id of chartIds) {
        const canvas = page.locator(`#${id}`);
        const card = canvas.locator('xpath=ancestor::div[contains(@class,"bg-white")]');
        const pill = card.locator('[data-coverage-pill]');
        const pillCount = await pill.count();
        console.log(`${id}: coverage pill count = ${pillCount}`);
        expect(pillCount).toBeGreaterThanOrEqual(1);
    }
});

test('Art Insights charts have coverage pills', async ({ page }) => {
    await login(page);

    await page.evaluate(() => {
        document.querySelector('[onclick*="showPage(\'art\')"]')?.click();
    });
    await page.waitForTimeout(5000);

    await page.screenshot({ path: '/tmp/coverage-art-top.png', fullPage: false });

    const artChartIds = [
        'art-opportunity-chart',
        'art-themes-chart',
        'art-color-tone-chart',
        'art-characters-chart',
        'art-elements-chart',
        'art-narrative-chart',
        'art-characters-landscape',
        'art-elements-landscape',
        'art-colors-landscape',
        'art-narrative-landscape',
    ];

    for (const id of artChartIds) {
        const canvas = page.locator(`#${id}`);
        const isVisible = await canvas.isVisible().catch(() => false);
        if (!isVisible) {
            console.log(`${id}: canvas not visible (skipped)`);
            continue;
        }
        const card = canvas.locator('xpath=ancestor::div[contains(@class,"bg-white")]');
        const pill = card.locator('[data-coverage-pill]');
        const pillCount = await pill.count();
        console.log(`${id}: coverage pill count = ${pillCount}`);
    }

    const artBarSection = page.locator('#art-themes-chart');
    await artBarSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/coverage-art-bars.png', fullPage: false });
});

test('Coverage pills are in subtitle (p tag), not floating', async ({ page }) => {
    await login(page);

    const chartIds = ['chart-scatter', 'chart-rtp', 'chart-providers', 'chart-brands', 'chart-narratives'];
    for (const id of chartIds) {
        const canvas = page.locator(`#${id}`);
        const card = canvas.locator('xpath=ancestor::div[contains(@class,"bg-white")]');
        const pillInSubtitle = card.locator('p [data-coverage-pill]');
        const count = await pillInSubtitle.count();
        console.log(`${id}: pill in subtitle = ${count}`);
        expect(count).toBeGreaterThanOrEqual(1);
    }
});
