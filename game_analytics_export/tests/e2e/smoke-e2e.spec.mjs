/**
 * Comprehensive E2E smoke test.
 *
 * Logs in ONCE, then exercises every major interactive feature across the
 * dashboard in a real Chromium browser. Catches runtime TypeErrors, missing
 * DOM elements, broken click handlers, and field-name mismatches that
 * source-level Vitest tests cannot.
 *
 * Target: < 45 seconds total.
 */
import { test, expect } from '@playwright/test';

const CREDS = { username: 'e2e_test_user', password: 'e2eTestPass123!' };

async function panelIsOpen(page, panelId) {
    return page.locator(`#${panelId}`).evaluate(el => el.style.right === '0px');
}

test('Dashboard smoke test – all interactive features', async ({ page, baseURL }) => {
    test.setTimeout(120000);

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // ──────────────────────────────────────────────
    // LOGIN
    // ──────────────────────────────────────────────
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
    await page.waitForTimeout(2000);
    expect(errors, 'JS errors during initial load').toHaveLength(0);

    // ──────────────────────────────────────────────
    // 1. ALL PAGES LOAD WITHOUT ERRORS
    // ──────────────────────────────────────────────
    const pages = ['overview', 'themes', 'mechanics', 'providers', 'games', 'insights'];
    for (const p of pages) {
        await page.evaluate(name => window.showPage(name), p);
        await page.waitForTimeout(800);
    }
    expect(errors, `JS errors while navigating pages: ${errors.join('; ')}`).toHaveLength(0);

    // ──────────────────────────────────────────────
    // 2. THEME PANEL – click .theme-link on Themes page
    // ──────────────────────────────────────────────
    await page.evaluate(() => window.showPage('themes'));
    await page.waitForSelector('#themes-table tbody tr', { timeout: 10000 });

    const themeLink = page.locator('#themes-table .theme-link').first();
    const firstThemeName = await themeLink.getAttribute('data-theme');
    expect(firstThemeName).toBeTruthy();
    await themeLink.click();
    await page.waitForTimeout(500);

    expect(await panelIsOpen(page, 'theme-panel'), 'Theme panel should slide in').toBe(true);
    const themePanelHtml = await page.locator('#theme-panel-content').innerHTML();
    expect(themePanelHtml.length, 'Theme panel should have content').toBeGreaterThan(100);
    expect(themePanelHtml).toContain('Top Games');

    await page.evaluate(() => window.closeThemePanel());
    await page.waitForTimeout(300);

    // ──────────────────────────────────────────────
    // 3. MECHANIC PANEL – click .mechanic-link
    // ──────────────────────────────────────────────
    await page.evaluate(() => window.showPage('mechanics'));
    await page.waitForSelector('#mechanics-table tbody tr', { timeout: 10000 });

    const mechLink = page.locator('#mechanics-table .mechanic-link').first();
    if ((await mechLink.count()) > 0) {
        await mechLink.click();
        await page.waitForTimeout(500);
        expect(await panelIsOpen(page, 'mechanic-panel'), 'Mechanic panel should slide in').toBe(true);
        const mechHtml = await page.locator('#mechanic-panel-content').innerHTML();
        expect(mechHtml.length).toBeGreaterThan(100);
        await page.evaluate(() => window.closeMechanicPanel());
        await page.waitForTimeout(300);
    }

    // ──────────────────────────────────────────────
    // 4. PROVIDER PANEL – click provider name
    // ──────────────────────────────────────────────
    await page.evaluate(() => window.showPage('providers'));
    await page.waitForTimeout(1000);

    const providerLink = page.locator('[onclick*="showProviderDetails"]').first();
    if ((await providerLink.count()) > 0) {
        await providerLink.click();
        await page.waitForTimeout(500);
        expect(await panelIsOpen(page, 'provider-panel'), 'Provider panel should slide in').toBe(true);
        const provHtml = await page.locator('#provider-panel-content').innerHTML();
        expect(provHtml.length).toBeGreaterThan(100);
        await page.evaluate(() => window.closeProviderPanel());
        await page.waitForTimeout(300);
    }

    // ──────────────────────────────────────────────
    // 5. GAME PANEL – click game name on Games page
    // ──────────────────────────────────────────────
    await page.evaluate(() => window.showPage('games'));
    await page.waitForTimeout(1000);

    const gameLink = page.locator('[onclick*="showGameDetails"]').first();
    if ((await gameLink.count()) > 0) {
        await gameLink.click();
        await page.waitForTimeout(1000);
        expect(await panelIsOpen(page, 'game-panel'), 'Game panel should slide in').toBe(true);
        const gamePerf = await page.locator('#game-performance').innerHTML();
        expect(gamePerf.length, 'Game performance section should have content').toBeGreaterThan(50);
    }

    await page.evaluate(() => window.closeAllPanels());
    await page.waitForTimeout(300);

    // ──────────────────────────────────────────────
    // 6. CROSS-PANEL: game→theme (via JS call, guaranteed valid theme)
    // ──────────────────────────────────────────────
    if (firstThemeName) {
        await page.evaluate(name => window.showThemeDetails(name), firstThemeName);
        await page.waitForTimeout(500);
        expect(await panelIsOpen(page, 'theme-panel'), 'Theme panel should open via JS').toBe(true);
    }

    // ──────────────────────────────────────────────
    // 7. CROSS-PANEL: theme panel → click provider → provider panel
    // ──────────────────────────────────────────────
    const provInTheme = page.locator('#theme-panel-content [onclick*="showProviderDetails"]').first();
    if ((await provInTheme.count()) > 0) {
        const provName = await provInTheme.textContent();
        await provInTheme.click();
        await page.waitForTimeout(1000);
        expect(await panelIsOpen(page, 'provider-panel'), `Provider panel should open from theme (clicked "${provName?.trim()}")`).toBe(true);

        // ──────────────────────────────────────
        // 8. Provider panel → click scoped theme → scoped title with clickable breadcrumb
        // ──────────────────────────────────────
        const themeInProv = page.locator('#provider-panel-content [onclick*="showTheme"]').first();
        if ((await themeInProv.count()) > 0) {
            await themeInProv.click();
            await page.waitForTimeout(1000);
            expect(await panelIsOpen(page, 'theme-panel'), 'Scoped theme panel should open').toBe(true);
            const titleHtml = await page.locator('#theme-panel-title').innerHTML();
            expect(titleHtml, 'Scoped title should contain breadcrumb separator').toContain('\u203a');

            // 8b. Click the theme name in scoped title → removes scope
            const titleLink = page.locator('#theme-panel-title [onclick*="showThemeDetails"]');
            if ((await titleLink.count()) > 0) {
                await titleLink.click();
                await page.waitForTimeout(1000);
                const unscopedTitle = await page.locator('#theme-panel-title').textContent();
                expect(unscopedTitle, 'Title should no longer contain breadcrumb').not.toContain('\u203a');
            }
        }
    }

    await page.evaluate(() => window.closeAllPanels());
    await page.waitForTimeout(300);

    // ──────────────────────────────────────────────
    // 9. OVERVIEW – clickable theme cards
    // ──────────────────────────────────────────────
    await page.evaluate(() => window.showPage('overview'));
    await page.waitForTimeout(1000);

    const overviewThemeCard = page.locator('#main-content [onclick*="showThemeDetails"]').first();
    if ((await overviewThemeCard.count()) > 0) {
        await overviewThemeCard.click();
        await page.waitForTimeout(500);
        expect(await panelIsOpen(page, 'theme-panel'), 'Theme panel should open from overview').toBe(true);
        await page.evaluate(() => window.closeThemePanel());
        await page.waitForTimeout(300);
    }

    // ──────────────────────────────────────────────
    // 10. INSIGHTS – strategic cards theme clickable
    // ──────────────────────────────────────────────
    await page.evaluate(() => window.showPage('insights'));
    await page.waitForTimeout(2000);

    const insightTheme = page.locator('#main-content [onclick*="showThemeDetails"]').first();
    if ((await insightTheme.count()) > 0) {
        await insightTheme.click();
        await page.waitForTimeout(500);
        expect(await panelIsOpen(page, 'theme-panel'), 'Theme panel should open from insights').toBe(true);
        await page.evaluate(() => window.closeThemePanel());
        await page.waitForTimeout(300);
    }

    // ──────────────────────────────────────────────
    // 11. THEMES VIEW FILTER – switch view without crash
    // ──────────────────────────────────────────────
    await page.evaluate(() => window.showPage('themes'));
    await page.waitForTimeout(500);

    const viewBtn = page.locator('[onclick*="switchThemeView"]').nth(1);
    if ((await viewBtn.count()) > 0) {
        await viewBtn.click();
        await page.waitForTimeout(500);
        const rowCount = await page.locator('#themes-table tbody tr').count();
        expect(rowCount, 'Table should have rows after filter switch').toBeGreaterThan(0);
    }

    // ──────────────────────────────────────────────
    // 12. TABLE SORT – sort themes table without crash
    // ──────────────────────────────────────────────
    const sortHeader = page.locator('#themes-table thead th').nth(2);
    if ((await sortHeader.count()) > 0) {
        await sortHeader.click();
        await page.waitForTimeout(500);
        const rowsAfterSort = await page.locator('#themes-table tbody tr').count();
        expect(rowsAfterSort).toBeGreaterThan(0);
    }

    // ──────────────────────────────────────────────
    // FINAL: no JS errors across entire run
    // ──────────────────────────────────────────────
    expect(errors, `JS errors during smoke test: ${errors.join('; ')}`).toHaveLength(0);
});
