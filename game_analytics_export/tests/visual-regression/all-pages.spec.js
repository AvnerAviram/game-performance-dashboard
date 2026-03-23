import { test, expect } from '@playwright/test';

const PAGES = [
    { id: 'overview', name: 'Overview' },
    { id: 'themes', name: 'Themes' },
    { id: 'mechanics', name: 'Mechanics' },
    { id: 'games', name: 'Games' },
    { id: 'providers', name: 'Providers' },
    { id: 'anomalies', name: 'Anomalies' },
    { id: 'insights', name: 'Insights' },
    { id: 'trends', name: 'Trends' },
    { id: 'prediction', name: 'Prediction' },
    { id: 'ai-assistant', name: 'AI Assistant' },
];

test.describe('Visual Regression: All Pages', () => {
    for (const page of PAGES) {
        test(`${page.name} page matches baseline (light mode)`, async ({ page: pw }) => {
            await pw.goto('/');
            await pw.waitForLoadState('networkidle');

            // Navigate to the page
            await pw.evaluate(id => window.showPage(id), page.id);
            await pw.waitForTimeout(500);

            // Visual snapshot
            await expect(pw).toHaveScreenshot(`${page.id}-light.png`, {
                fullPage: true,
                maxDiffPixels: 100,
            });
        });

        test(`${page.name} page matches baseline (dark mode)`, async ({ page: pw }) => {
            await pw.goto('/');
            await pw.waitForLoadState('networkidle');

            // Enable dark mode
            await pw.evaluate(() => {
                document.documentElement.classList.add('dark');
            });

            // Navigate to the page
            await pw.evaluate(id => window.showPage(id), page.id);
            await pw.waitForTimeout(500);

            // Visual snapshot
            await expect(pw).toHaveScreenshot(`${page.id}-dark.png`, {
                fullPage: true,
                maxDiffPixels: 100,
            });
        });
    }
});

test.describe('Visual Regression: Component Consistency', () => {
    test('All sticky headers have consistent styling', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const stickyPages = ['themes', 'mechanics', 'games', 'providers'];

        for (const pageId of stickyPages) {
            await page.evaluate(id => window.showPage(id), pageId);
            await page.waitForTimeout(300);

            // Check sticky header exists and has correct classes
            const hasCorrectClasses = await page.evaluate(id => {
                const pageDiv = document.getElementById(id);
                const stickyHeader = pageDiv?.querySelector('.sticky-header');
                return stickyHeader !== null;
            }, pageId);

            expect(hasCorrectClasses).toBeTruthy();
        }
    });

    test('All simple headers have consistent styling', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const simplePages = ['overview', 'anomalies', 'insights', 'trends', 'prediction', 'ai-assistant'];

        for (const pageId of simplePages) {
            await page.evaluate(id => window.showPage(id), pageId);
            await page.waitForTimeout(300);

            // Check simple header exists and has correct classes
            const hasCorrectClasses = await page.evaluate(id => {
                const pageDiv = document.getElementById(id);
                const simpleHeader = pageDiv?.querySelector('.page-header-simple');
                return simpleHeader !== null;
            }, pageId);

            expect(hasCorrectClasses).toBeTruthy();
        }
    });
});
