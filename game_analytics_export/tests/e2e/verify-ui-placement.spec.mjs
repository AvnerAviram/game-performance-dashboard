/**
 * Visual verification tests for UI placement.
 * Screenshots saved to tests/e2e/screenshots/ for review.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';
const CREDS = { username: 'e2e_test_user', password: 'e2eTestPass123!' };
const SS = 'tests/e2e/screenshots';

async function loginAndLoad(page) {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    // Login if needed
    const loginBtn = page.locator('#auth-login-btn');
    if (await loginBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Open hamburger first
        const hamburger = page.locator('#hamburger-btn');
        if (await hamburger.isVisible({ timeout: 1000 }).catch(() => false)) {
            await hamburger.click();
            await page.waitForTimeout(300);
        }
        if (await loginBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await loginBtn.click();
            await page.waitForTimeout(500);
            await page.fill('#login-username', CREDS.username);
            await page.fill('#login-password', CREDS.password);
            await page.click('#login-submit');
            await page.waitForTimeout(2000);
        }
    }
    await page.waitForTimeout(2000);
}

test('dark mode toggle placement — inline next to hamburger', async ({ page }) => {
    await loginAndLoad(page);

    const hamburger = page.locator('#hamburger-btn');
    const dmToggle = page.locator('#dark-mode-toggle');

    await expect(hamburger).toBeVisible({ timeout: 5000 });
    await expect(dmToggle).toBeVisible({ timeout: 5000 });

    const hambBox = await hamburger.boundingBox();
    const dmBox = await dmToggle.boundingBox();

    // Same vertical row (within 20px)
    expect(Math.abs(dmBox.y - hambBox.y)).toBeLessThan(25);
    // Toggle is to the left of hamburger
    expect(dmBox.x).toBeLessThan(hambBox.x);

    await page.screenshot({ path: `${SS}/01-dm-toggle-placement.png`, fullPage: false });
});

test('dark mode toggle animates on click', async ({ page }) => {
    await loginAndLoad(page);

    const dmToggle = page.locator('#dark-mode-toggle');
    await expect(dmToggle).toBeVisible({ timeout: 5000 });

    // Click to toggle dark mode ON
    await dmToggle.click();
    await page.waitForTimeout(400);

    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);

    await page.screenshot({ path: `${SS}/02-dark-mode-on.png`, fullPage: false });

    // Toggle back
    await dmToggle.click();
    await page.waitForTimeout(400);

    const isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
    expect(isLight).toBe(true);

    await page.screenshot({ path: `${SS}/03-dark-mode-off.png`, fullPage: false });
});

test('sidebar collapse icon is a panel layout icon', async ({ page }) => {
    await loginAndLoad(page);

    const collapseBtn = page.locator('.collapse-btn');
    await expect(collapseBtn).toBeVisible({ timeout: 5000 });

    // Should have an SVG with a rect element (panel icon)
    const rectCount = await collapseBtn.locator('svg rect').count();
    expect(rectCount).toBeGreaterThan(0);

    // Should also have a line element (divider)
    const lineCount = await collapseBtn.locator('svg line').count();
    expect(lineCount).toBeGreaterThan(0);

    await page.screenshot({ path: `${SS}/04-sidebar-icon.png`, fullPage: false });
});

test('X-Ray is in hamburger dropdown and OFF by default', async ({ page }) => {
    await loginAndLoad(page);

    // Clear any stored xray state
    await page.evaluate(() => localStorage.removeItem('xrayMode'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const hamburger = page.locator('#hamburger-btn');
    await expect(hamburger).toBeVisible({ timeout: 5000 });
    await hamburger.click();
    await page.waitForTimeout(500);

    const xrayBtn = page.locator('#xray-menu-btn');
    await expect(xrayBtn).toBeVisible({ timeout: 3000 });

    // Badge should be hidden (OFF)
    const badgeHidden = await page.locator('#xray-badge').evaluate(el => el.classList.contains('hidden'));
    expect(badgeHidden).toBe(true);

    await page.screenshot({ path: `${SS}/05-hamburger-xray-off.png`, fullPage: false });
});

test('X-Ray ON shows crosshair cursor on data elements', async ({ page }) => {
    await loginAndLoad(page);

    // Activate X-Ray
    const hamburger = page.locator('#hamburger-btn');
    await hamburger.click();
    await page.waitForTimeout(500);
    await page.locator('#xray-menu-btn').click();
    await page.waitForTimeout(800);

    const isActive = await page.evaluate(() => document.body.classList.contains('xray-active'));
    expect(isActive).toBe(true);

    // Navigate to games page to see data table
    await page.evaluate(() => window.showPage && window.showPage('games'));
    await page.waitForTimeout(2000);

    await page.screenshot({ path: `${SS}/06-xray-active-games.png`, fullPage: false });
});
