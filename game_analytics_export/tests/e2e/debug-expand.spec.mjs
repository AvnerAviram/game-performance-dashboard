import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcryptjs from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.resolve(__dirname, '../../server/users.json');
const CREDS = { username: 'e2e_expand_test', password: 'expandTest42!' };

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

test('Theme expand toggle actually works', async ({ page, baseURL }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    await login(page, baseURL);
    await page.waitForLoadState('networkidle');

    // Navigate to Themes page
    await page.click('[data-page="themes"]');
    await page.waitForTimeout(2000);

    // Check themes table is visible
    const tbody = page.locator('#themes-table tbody');
    await expect(tbody).toBeVisible({ timeout: 10000 });

    // Check rows exist
    const rowCount = await tbody.locator('tr').count();
    console.log(`Found ${rowCount} theme rows`);
    expect(rowCount).toBeGreaterThan(0);

    // Find the first expand toggle
    const firstExpand = tbody.locator('.expand-toggle').first();
    const expandExists = await firstExpand.count();
    console.log(`expand-toggle elements found: ${expandExists}`);

    if (expandExists === 0) {
        const firstRowHTML = await tbody.locator('tr').first().innerHTML();
        console.log('First row HTML (first 500 chars):', firstRowHTML.substring(0, 500));
        throw new Error('No .expand-toggle elements found in themes table');
    }

    // Check the expand icon text
    const iconText = await firstExpand.locator('.expand-icon').textContent();
    console.log(`Expand icon text: "${iconText}"`);
    expect(iconText.trim()).toBe('▶');

    // Get the first theme name
    const firstThemeName = await tbody.locator('tr').first().locator('td:nth-child(2)').textContent();
    console.log(`First theme: "${firstThemeName?.trim()}"`);

    // Count art-drill elements before click
    const drillsBefore = await page.locator('[id^="art-drill-"]').count();
    console.log(`Art drill elements before click: ${drillsBefore}`);

    // Click the expand toggle
    await firstExpand.click();
    await page.waitForTimeout(1000);

    // Check art-drill element appeared
    const drillsAfter = await page.locator('[id^="art-drill-"]').count();
    console.log(`Art drill elements after click: ${drillsAfter}`);

    // Check expand icon changed
    const iconAfter = await firstExpand.locator('.expand-icon').textContent();
    console.log(`Expand icon after click: "${iconAfter}"`);

    // Report JS errors
    if (errors.length > 0) {
        console.log('JS Errors captured:', JSON.stringify(errors, null, 2));
    }

    // Final assertions
    expect(drillsAfter, 'Art drill-down row should appear after clicking expand').toBeGreaterThan(
        drillsBefore
    );
    expect(iconAfter.trim(), 'Expand icon should change to down arrow').toBe('▼');
});
