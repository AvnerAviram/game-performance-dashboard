import { test, expect } from '@playwright/test';

const PAGES = [
    { id: 'overview', name: 'Overview' },
    { id: 'themes', name: 'Themes' },
    { id: 'mechanics', name: 'Mechanics' },
    { id: 'games', name: 'Games' },
    { id: 'providers', name: 'Providers' },
    { id: 'insights', name: 'Insights' },
    { id: 'trends', name: 'Trends' },
    { id: 'game-lab', name: 'Game Lab' },
];

const LANDSCAPE_VIEWPORTS = {
    'mobile-chrome': { width: 915, height: 412 },
    'mobile-safari': { width: 844, height: 390 },
    tablet: { width: 1194, height: 834 },
};

test.describe('Mobile Visual Regression: All Pages', () => {
    for (const pg of PAGES) {
        test(`${pg.name} - portrait`, async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
            await page.evaluate(id => window.showPage(id), pg.id);
            await page.waitForTimeout(800);

            await expect(page).toHaveScreenshot(`mobile-${pg.id}-portrait.png`, {
                fullPage: true,
                maxDiffPixels: 150,
            });
        });

        test(`${pg.name} - landscape`, async ({ page, browserName }, testInfo) => {
            const projectName = testInfo.project.name;
            const vp = LANDSCAPE_VIEWPORTS[projectName];
            if (vp) await page.setViewportSize(vp);

            await page.goto('/');
            await page.waitForLoadState('networkidle');
            await page.evaluate(id => window.showPage(id), pg.id);
            await page.waitForTimeout(800);

            await expect(page).toHaveScreenshot(`mobile-${pg.id}-landscape.png`, {
                fullPage: true,
                maxDiffPixels: 150,
            });
        });
    }
});

test.describe('Mobile Visual Regression: Sidebar Drawer', () => {
    test('sidebar opens and closes', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);

        const menuBtn = page.locator('#mobile-menu-btn');
        if (await menuBtn.isVisible()) {
            await menuBtn.click();
            await page.waitForTimeout(400);

            await expect(page).toHaveScreenshot('mobile-sidebar-open.png', {
                maxDiffPixels: 150,
            });

            const overlay = page.locator('#sidebar-overlay');
            if (await overlay.isVisible()) {
                await overlay.click();
                await page.waitForTimeout(400);
            }

            await expect(page).toHaveScreenshot('mobile-sidebar-closed.png', {
                maxDiffPixels: 150,
            });
        }
    });
});

test.describe('Mobile Visual Regression: Filter Bars', () => {
    const FILTER_PAGES = ['themes', 'mechanics', 'games', 'providers'];

    for (const pg of FILTER_PAGES) {
        test(`${pg} filter bar wraps correctly`, async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
            await page.evaluate(id => window.showPage(id), pg);
            await page.waitForTimeout(800);

            const stickyHeader = page.locator('.sticky').first();
            await expect(stickyHeader).toHaveScreenshot(`mobile-${pg}-filter-bar.png`, {
                maxDiffPixels: 100,
            });
        });
    }
});

test.describe('Mobile Visual Regression: Dark Mode', () => {
    for (const pg of PAGES) {
        test(`${pg.name} - dark mode`, async ({ page }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => document.documentElement.classList.add('dark'));
            await page.evaluate(id => window.showPage(id), pg.id);
            await page.waitForTimeout(800);

            await expect(page).toHaveScreenshot(`mobile-${pg.id}-dark.png`, {
                fullPage: true,
                maxDiffPixels: 150,
            });
        });
    }
});
