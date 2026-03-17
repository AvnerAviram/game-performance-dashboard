import { test, expect } from '@playwright/test';

/**
 * Consolidated Playwright tests - one visit per page.
 * Each page is loaded once; screenshot (visual) + alignment + loading checks run on the same DOM.
 */

const PAGES = [
  { id: 'overview', name: 'Overview', sticky: false },
  { id: 'themes', name: 'Themes', sticky: true },
  { id: 'mechanics', name: 'Mechanics', sticky: true },
  { id: 'games', name: 'Games', sticky: true },
  { id: 'providers', name: 'Providers', sticky: true },
  { id: 'anomalies', name: 'Anomalies', sticky: false },
  { id: 'insights', name: 'Insights', sticky: false },
  { id: 'trends', name: 'Trends', sticky: false },
  { id: 'prediction', name: 'Prediction', sticky: false },
  { id: 'ai-assistant', name: 'AI Assistant', sticky: false },
];

async function seedAuth(page) {
  // App requires login - pre-seed auth so dashboard loads (no redirect to login)
  await page.goto('/login.html');
  await page.evaluate(() => {
    localStorage.setItem('game-dashboard-auth', JSON.stringify({ username: 'e2e-test', loggedInAt: Date.now() }));
  });
}

async function waitForAppReady(page) {
  await page.waitForLoadState('networkidle');
  await page.locator('#overview-total-games').waitFor({ state: 'visible', timeout: 10000 });
}

async function gotoDashboard(page) {
  await seedAuth(page);
  await page.goto('/dashboard.html');
  await waitForAppReady(page);
}

test.describe('Consolidated: Load, Visual, Alignment, E2E', () => {
  test('all pages: one visit each - screenshot + alignment + content checks', async ({ page }) => {
    await gotoDashboard(page);

    // E2E: initial load checks (we're on overview)
    await expect(page).toHaveTitle(/Game Analytics Dashboard/);
    await expect(page.locator('[data-page="overview"]')).toBeVisible();
    await expect(page.locator('[data-page="themes"]')).toBeVisible();
    await expect(page.locator('[data-page="mechanics"]')).toBeVisible();
    await expect(page.locator('[data-page="prediction"]')).toBeVisible();
    await expect(page.locator('[data-page="overview"]')).toHaveClass(/indigo-600|indigo-50|font-semibold/);

    // E2E: overview data
    const gamesText = await page.locator('#overview-total-games').textContent();
    expect(parseInt(gamesText)).toBeGreaterThan(100);
    const themesText = await page.locator('#overview-total-themes').textContent();
    expect(parseInt(themesText)).toBeGreaterThan(50);

    const alignmentMeasurements = [];
    const paddingRef = { left: null, right: null, bottom: null };

    // Per page: showPage ONCE → screenshot + alignment + content (all same DOM)
    for (const { id, name, sticky } of PAGES) {
      await page.evaluate((pageId) => window.showPage(pageId), id);
      await page.waitForTimeout(400);

      // Visual: screenshot (light mode)
      await expect(page).toHaveScreenshot(`${id}-light.png`, { fullPage: true, maxDiffPixels: 100 });

      // Alignment: h2 X position (page content is in #page-container)
      const h2Left = await page.evaluate(() => {
        const pc = document.getElementById('page-container');
        const h2 = pc?.querySelector('h2');
        return h2?.getBoundingClientRect().left ?? 0;
      });
      alignmentMeasurements.push({ id, h2Left });

      // Alignment: padding consistency (use page-container, always exists)
      const padding = await page.evaluate(() => {
        const div = document.getElementById('page-container');
        if (!div) return null;
        const s = window.getComputedStyle(div);
        return { left: s.paddingLeft, right: s.paddingRight, bottom: s.paddingBottom };
      });
      expect(padding).not.toBeNull();
      if (!paddingRef.left) Object.assign(paddingRef, padding);
      expect(padding.left).toBe(paddingRef.left);
      expect(padding.right).toBe(paddingRef.right);
      expect(padding.bottom).toBe(paddingRef.bottom);

      // Component: page-container exists
      expect(await page.locator('#page-container').count()).toBeGreaterThan(0);

      // E2E: page has expected content
      const h2Text = await page.locator('h2').first().textContent();
      expect(h2Text?.length).toBeGreaterThan(0);
      if (id === 'themes') {
        await page.locator('#themes-table tbody tr').first().waitFor({ state: 'visible', timeout: 5000 });
        const rows = await page.locator('#themes-table tbody tr').count();
        expect(rows).toBeGreaterThanOrEqual(50);
      }
      if (id === 'mechanics') {
        const rows = await page.locator('#mechanics-table tbody tr').count();
        expect(rows).toBeGreaterThan(15);
      }
    }

    // Alignment: all headers same X
    const refLeft = alignmentMeasurements[0].h2Left;
    for (const m of alignmentMeasurements) {
      expect(Math.abs(m.h2Left - refLeft)).toBeLessThanOrEqual(1);
    }
    console.log('✓ Per-page: visual + alignment + content (light)');
  });

  test('all pages: dark mode screenshots (one visit each)', async ({ page }) => {
    await gotoDashboard(page);
    await page.evaluate(() => document.documentElement.classList.add('dark'));

    for (const { id } of PAGES) {
      await page.evaluate((pageId) => window.showPage(pageId), id);
      await page.waitForTimeout(400);
      await expect(page).toHaveScreenshot(`${id}-dark.png`, { fullPage: true, maxDiffPixels: 100 });
    }
    console.log('✓ Per-page: dark screenshots');
  });

  test('sticky headers: alignment when scrolling', async ({ page }) => {
    await gotoDashboard(page);

    for (const { id } of PAGES.filter((p) => p.sticky)) {
      await page.evaluate((pageId) => window.showPage(pageId), id);
      await page.waitForTimeout(300);

      const initialLeft = await page.evaluate(() => {
        const pc = document.getElementById('page-container');
        const h2 = pc?.querySelector('h2');
        return h2?.getBoundingClientRect().left ?? 0;
      });

      await page.evaluate(() => {
        const pc = document.getElementById('page-container');
        pc?.scrollTo(0, 500);
      });
      await page.waitForTimeout(200);

      const scrolledLeft = await page.evaluate(() => {
        const pc = document.getElementById('page-container');
        const h2 = pc?.querySelector('h2');
        return h2?.getBoundingClientRect().left ?? 0;
      });
      expect(Math.abs(scrolledLeft - initialLeft)).toBeLessThanOrEqual(1);
    }
    console.log('✓ Sticky header alignment');
  });

  test('component consistency: sticky and simple headers', async ({ page }) => {
    await gotoDashboard(page);

    const stickyPages = ['themes', 'mechanics', 'games', 'providers'];
    for (const pageId of stickyPages) {
      await page.evaluate((id) => window.showPage(id), pageId);
      await page.waitForTimeout(200);
      const hasSticky = await page.evaluate(() => {
        const pc = document.getElementById('page-container');
        return (pc?.querySelector('.sticky-header') || pc?.querySelector('.sticky.top-0')) !== null;
      });
      expect(hasSticky).toBeTruthy();
    }

    const simplePages = ['overview', 'anomalies', 'insights', 'trends', 'prediction', 'ai-assistant'];
    for (const pageId of simplePages) {
      await page.evaluate((id) => window.showPage(id), pageId);
      await page.waitForTimeout(200);
      const hasSimple = await page.evaluate(() => {
        const pc = document.getElementById('page-container');
        return pc?.querySelector('.page-header-simple') !== null || pc?.querySelector('.sticky.top-0') !== null;
      });
      expect(hasSimple).toBeTruthy();
    }
    console.log('✓ Component classes');
  });

  test('z-index: tooltips, panels, sidebar, buttons follow scale', async ({ page }) => {
    await gotoDashboard(page);

    // Sidebar: z-[500]
    const sidebarZ = await page.locator('#sidebar').evaluate((el) => parseInt(window.getComputedStyle(el).zIndex, 10) || 0);
    expect(sidebarZ).toBeGreaterThanOrEqual(500);

    // Side panels (game, provider, theme, mechanic): z-[1100]
    for (const id of ['game-panel', 'provider-panel', 'theme-panel', 'mechanic-panel']) {
      const panel = page.locator(`#${id}`);
      if ((await panel.count()) > 0) {
        const z = await panel.evaluate((el) => parseInt(window.getComputedStyle(el).zIndex, 10) || 0);
        expect(z).toBeGreaterThanOrEqual(1100);
      }
    }

    // Backdrop: z-[1000]
    const backdropZ = await page.locator('#mechanic-backdrop').evaluate((el) => parseInt(window.getComputedStyle(el).zIndex, 10) || 0);
    expect(backdropZ).toBeGreaterThanOrEqual(1000);

    // Themes page: filter tabs z-[50], tooltips z-[400]
    await page.evaluate(() => window.showPage('themes'));
    await page.waitForTimeout(400);

    const filterTabs = page.locator('.filter-tabs-container');
    if ((await filterTabs.count()) > 0) {
      const tabsZ = await filterTabs.first().evaluate((el) => parseInt(window.getComputedStyle(el).zIndex, 10) || 0);
      expect(tabsZ).toBeGreaterThanOrEqual(50);
    }

    const tooltip = page.locator('.info-tooltip, .filter-tooltip').first();
    if ((await tooltip.count()) > 0) {
      const tipZ = await tooltip.evaluate((el) => parseInt(window.getComputedStyle(el).zIndex, 10) || 0);
      expect(tipZ).toBeGreaterThanOrEqual(400);
    }

    // Sticky header (from page template): z-[100]
    const stickyHeader = page.locator('#page-container .sticky.top-0, #page-container .sticky-header');
    if ((await stickyHeader.count()) > 0) {
      const headerZ = await stickyHeader.first().evaluate((el) => parseInt(window.getComputedStyle(el).zIndex, 10) || 0);
      expect(headerZ).toBeGreaterThanOrEqual(100);
    }

    // Hamburger dropdown: z-[150]
    const hamburger = page.locator('#hamburger-dropdown');
    if ((await hamburger.count()) > 0) {
      const dropZ = await hamburger.evaluate((el) => parseInt(window.getComputedStyle(el).zIndex, 10) || 0);
      expect(dropZ).toBeGreaterThanOrEqual(150);
    }

    console.log('✓ Z-index scale');
  });

  test('E2E: nav click + table sort + search + filter', async ({ page }) => {
    await gotoDashboard(page);

    // Nav click
    await page.click('[data-page="themes"]');
    await expect(page.locator('[data-page="themes"]')).toHaveClass(/indigo-600|indigo-50|font-semibold/);
    await expect(page.locator('h2')).toContainText(/Themes/i);
    await page.locator('#themes-table tbody tr').first().waitFor({ state: 'visible', timeout: 5000 });

    // Sort
    await page.click('#themes-table thead th:nth-child(2)');
    await page.waitForTimeout(300);
    const rowsAfter = await page.locator('#themes-table tbody tr').count();
    expect(rowsAfter).toBeGreaterThan(10);

    // Search
    await page.locator('#theme-search').fill('Asian');
    await page.waitForTimeout(400);
    const searchRows = await page.locator('#themes-table tbody tr').count();
    expect(searchRows).toBeGreaterThan(0);

    // Filter
    await page.click('[data-filter="leaders"]');
    await page.waitForTimeout(300);
    expect(await page.locator('[data-filter="leaders"]').count()).toBeGreaterThan(0);
    console.log('✓ Nav, sort, search, filter');
  });

  test('E2E: dark mode toggle + CSV export', async ({ page }) => {
    await gotoDashboard(page);

    const htmlClass = await page.locator('html').getAttribute('class');
    const wasDark = htmlClass?.includes('dark');
    await page.click('#dark-mode-toggle');
    await page.waitForTimeout(200);
    const afterClass = await page.locator('html').getAttribute('class');
    expect(afterClass?.includes('dark')).toBe(!wasDark);

    await page.click('[data-page="themes"]');
    await page.waitForLoadState('networkidle');
    const exportBtn = page.locator('#export-themes');
    if ((await exportBtn.count()) > 0) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 5000 }),
        exportBtn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/game-analytics-themes.*\.csv/);
    }
    console.log('✓ Dark toggle + CSV export');
  });
});
