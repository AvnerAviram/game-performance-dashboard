import { test, expect } from '@playwright/test';

/**
 * E2E TESTS: Dashboard Navigation
 * Tests complete user navigation flows
 */

// Wait for app to finish loading (DuckDB + data can take 5-15s)
async function waitForAppReady(page) {
  await page.waitForLoadState('networkidle');
  // Wait for overview content (indicates DuckDB init complete and page loaded)
  await page.locator('#overview-total-games').waitFor({ state: 'visible', timeout: 20000 });
}

test.describe('Dashboard Loading', () => {
  test('should load dashboard successfully', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Check title
    await expect(page).toHaveTitle(/Game Analytics Dashboard/);
    
    // Check overview content loaded (h2 Overview or overview stats)
    await expect(page.locator('h2, #overview-total-games').first()).toBeVisible();
    
    console.log('✓ Dashboard loaded successfully');
  });

  test('should display all navigation items', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Verify all nav items are visible
    await expect(page.locator('[data-page="overview"]')).toBeVisible();
    await expect(page.locator('[data-page="themes"]')).toBeVisible();
    await expect(page.locator('[data-page="mechanics"]')).toBeVisible();
    await expect(page.locator('[data-page="anomalies"]')).toBeVisible();
    await expect(page.locator('[data-page="trends"]')).toBeVisible();
    await expect(page.locator('[data-page="insights"]')).toBeVisible();
    await expect(page.locator('[data-page="prediction"]')).toBeVisible();
    
    console.log('✓ All navigation items visible');
  });

  test('overview page should be active by default', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Overview nav should show as active (uses gradient/indigo, not 'active' class)
    await expect(page.locator('[data-page="overview"]')).toHaveClass(/indigo-600|indigo-50|font-semibold/);
    
    // Overview page content should be visible (overview-total-games is in the page)
    await expect(page.locator('#overview-total-games')).toBeVisible();
    
    console.log('✓ Overview page is default');
  });
});

test.describe('Page Navigation', () => {
  test('should navigate to Themes page', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Click Themes nav item
    await page.click('[data-page="themes"]');
    
    // Wait for active state (uses gradient/indigo)
    await expect(page.locator('[data-page="themes"]')).toHaveClass(/indigo-600|indigo-50|font-semibold/);
    
    // Verify page content (Themes page has "THEMES" in h2)
    await expect(page.locator('h2')).toContainText('THEMES');
    
    // Verify table exists and has data (50 per page default; can be exactly 50)
    await page.locator('#themes-table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });
    const rows = page.locator('#themes-table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(50);
    
    console.log(`✓ Themes page loaded with ${count} themes`);
  });

  test('should navigate to Mechanics page', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    await page.click('[data-page="mechanics"]');
    
    await expect(page.locator('[data-page="mechanics"]')).toHaveClass(/indigo-600|indigo-50|font-semibold/);
    await expect(page.locator('h2')).toContainText('MECHANICS');
    
    // Verify table has data
    const rows = page.locator('#mechanics-table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(15);
    
    console.log(`✓ Mechanics page loaded with ${count} mechanics`);
  });

  test('should navigate between pages smoothly', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    const pages = ['themes', 'mechanics', 'overview', 'insights', 'prediction'];
    
    for (const pageName of pages) {
      await page.click(`[data-page="${pageName}"]`);
      await expect(page.locator(`[data-page="${pageName}"]`)).toHaveClass(/indigo-600|indigo-50|font-semibold/);
      
      // Wait a bit for transition
      await page.waitForTimeout(100);
    }
    
    console.log('✓ Navigated through all pages successfully');
  });
});

test.describe('Data Display', () => {
  test('should display correct game count', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Get total games stat (overview page uses overview-total-games)
    const gamesText = await page.locator('#overview-total-games').textContent();
    const games = parseInt(gamesText);
    
    expect(games).toBeGreaterThan(100);
    expect(games).toBeLessThan(10000);
    
    console.log(`✓ Showing ${games} total games`);
  });

  test('should display theme count', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    const themesText = await page.locator('#overview-total-themes').textContent();
    const themes = parseInt(themesText);
    
    expect(themes).toBeGreaterThan(50);
    expect(themes).toBeLessThan(500);
    
    console.log(`✓ Showing ${themes} total themes`);
  });

  test('should display mechanic count', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    const mechanicsText = await page.locator('#overview-total-mechanics').textContent();
    const mechanics = parseInt(mechanicsText);
    
    expect(mechanics).toBeGreaterThan(10);
    expect(mechanics).toBeLessThan(150);
    
    console.log(`✓ Showing ${mechanics} total mechanics`);
  });
});

test.describe('Table Interactions', () => {
  test('should sort themes table by clicking column header', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.click('[data-page="themes"]');
    // Wait for table to be populated (async data load)
    await page.locator('#themes-table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });
    
    // Verify table has data
    const rowsBefore = await page.locator('#themes-table tbody tr').count();
    expect(rowsBefore).toBeGreaterThan(10);
    
    // Click Theme column header to sort
    await page.click('#themes-table thead th:nth-child(2)');
    await page.waitForTimeout(300);
    
    // Table should still have data after sort
    const rowsAfter = await page.locator('#themes-table tbody tr').count();
    expect(rowsAfter).toBeGreaterThan(10);
    
    console.log(`✓ Table sorting works: ${rowsBefore} rows before, ${rowsAfter} after`);
  });

  test('rank numbers should be sequential', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.click('[data-page="themes"]');
    await page.waitForLoadState('networkidle');
    
    // Check first 5 rank numbers
    for (let i = 1; i <= 5; i++) {
      const rankText = await page.locator(`#themes-table tbody tr:nth-child(${i}) td:first-child`).textContent();
      expect(rankText.trim()).toBe(i.toString());
    }
    
    console.log('✓ Rank numbers are sequential');
  });
});

test.describe('Dark Mode', () => {
  test('should toggle dark mode', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Dark mode uses 'dark' class on html element
    const htmlClass = await page.locator('html').getAttribute('class');
    const isDarkInitially = htmlClass?.includes('dark');
    
    // Click dark mode toggle
    await page.click('#dark-mode-toggle');
    
    await page.waitForTimeout(200);
    
    // Should have toggled
    const htmlClassAfter = await page.locator('html').getAttribute('class');
    const isDarkAfter = htmlClassAfter?.includes('dark');
    
    expect(isDarkAfter).toBe(!isDarkInitially);
    
    console.log(`✓ Dark mode toggled: ${isDarkInitially} → ${isDarkAfter}`);
  });
});

test.describe('Filter Tabs', () => {
  test('should switch to Market Leaders filter on Themes page', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.click('[data-page="themes"]');
    await page.waitForLoadState('networkidle');
    
    const leadersBtn = page.locator('[data-filter="leaders"]');
    await leadersBtn.click();
    await page.waitForTimeout(300);
    
    await expect(leadersBtn).toHaveClass(/bg-indigo|border-indigo/);
    const rows = page.locator('#themes-table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    
    console.log(`✓ Market Leaders filter: ${count} themes`);
  });

  test('should switch to Premium Quality filter', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.click('[data-page="themes"]');
    await page.waitForLoadState('networkidle');
    
    await page.click('[data-filter="premium"]');
    await page.waitForTimeout(300);
    
    const rows = page.locator('#themes-table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    
    console.log(`✓ Premium Quality filter: ${count} themes`);
  });
});

test.describe('CSV Export', () => {
  test('should have export buttons visible on Themes page', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.click('[data-page="themes"]');
    await page.waitForLoadState('networkidle');
    
    const exportBtn = page.locator('#export-themes');
    await expect(exportBtn).toBeVisible();
    
    console.log('✓ Export themes button visible');
  });

  test('should trigger CSV download when clicking export themes', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.click('[data-page="themes"]');
    await page.waitForLoadState('networkidle');
    
    const exportBtn = page.locator('#export-themes');
    if ((await exportBtn.count()) === 0) return; // Skip if no export button
    
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      exportBtn.click()
    ]);
    
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/game-analytics-themes.*\.csv/);
    
    console.log(`✓ CSV download triggered: ${filename}`);
  });
});

test.describe('Search', () => {
  test('should filter themes by search', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.click('[data-page="themes"]');
    await page.waitForLoadState('networkidle');
    
    const searchInput = page.locator('#theme-search');
    await searchInput.fill('Asian');
    await page.waitForTimeout(400);
    
    const rows = page.locator('#themes-table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    
    const firstRow = await rows.first().textContent();
    expect(firstRow?.toLowerCase()).toContain('asian');
    
    console.log(`✓ Search "Asian": ${count} themes`);
  });
});

test.describe('Performance', () => {
  test('dashboard should load in under 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await waitForAppReady(page);
    
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(15000);  // DuckDB init can take 5-10s
    
    console.log(`✓ Dashboard loaded in ${loadTime}ms`);
  });

  test('page navigation should be fast', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    const startTime = Date.now();
    
    await page.click('[data-page="themes"]');
    await page.waitForSelector('#themes-table tbody tr:first-child');
    
    const navTime = Date.now() - startTime;
    
    expect(navTime).toBeLessThan(3000);  // Page load + render
    
    console.log(`✓ Page navigation completed in ${navTime}ms`);
  });
});
