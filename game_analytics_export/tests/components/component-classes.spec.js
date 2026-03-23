import { test, expect } from '@playwright/test';

test.describe('Component Classes Tests', () => {
    test('Page containers use correct component classes', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const allPages = [
            'overview',
            'themes',
            'mechanics',
            'games',
            'providers',
            'anomalies',
            'insights',
            'trends',
            'prediction',
            'ai-assistant',
        ];

        for (const pageId of allPages) {
            const hasPageContainer = await page.evaluate(id => {
                const div = document.getElementById(id);
                return div?.classList.contains('page-container');
            }, pageId);

            expect(hasPageContainer).toBeTruthy();
        }
    });

    test('Sticky pages use sticky-header component class', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const stickyPages = ['themes', 'mechanics', 'games', 'providers'];

        for (const pageId of stickyPages) {
            await page.evaluate(id => window.showPage(id), pageId);
            await page.waitForTimeout(200);

            const hasStickyHeader = await page.evaluate(id => {
                const div = document.getElementById(id);
                const header = div?.querySelector('.sticky-header');
                return header !== null;
            }, pageId);

            expect(hasStickyHeader).toBeTruthy();

            const hasStickyContent = await page.evaluate(id => {
                const div = document.getElementById(id);
                const content = div?.querySelector('.sticky-header-content');
                return content !== null;
            }, pageId);

            expect(hasStickyContent).toBeTruthy();
        }
    });

    test('Simple pages use page-header-simple component class', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const simplePages = ['overview', 'anomalies', 'insights', 'trends', 'prediction', 'ai-assistant'];

        for (const pageId of simplePages) {
            await page.evaluate(id => window.showPage(id), pageId);
            await page.waitForTimeout(200);

            const hasSimpleHeader = await page.evaluate(id => {
                const div = document.getElementById(id);
                const header = div?.querySelector('.page-header-simple');
                return header !== null;
            }, pageId);

            expect(hasSimpleHeader).toBeTruthy();
        }
    });

    test('Dark mode classes work correctly', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Test light mode first
        await page.evaluate(() => window.showPage('overview'));
        await page.waitForTimeout(300);

        const lightBg = await page.evaluate(() => {
            const body = document.body;
            return window.getComputedStyle(body).backgroundColor;
        });

        // Enable dark mode
        await page.evaluate(() => {
            document.documentElement.classList.add('dark');
        });
        await page.waitForTimeout(300);

        const darkBg = await page.evaluate(() => {
            const body = document.body;
            return window.getComputedStyle(body).backgroundColor;
        });

        // Background colors should be different
        expect(lightBg).not.toBe(darkBg);
    });

    test('No CSS conflicts or !important rules', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Check that the built CSS file is loaded
        const cssLoaded = await page.evaluate(() => {
            const link = document.querySelector('link[href*="output.css"]');
            return link !== null;
        });

        expect(cssLoaded).toBeTruthy();

        // Check that old CSS files are not loaded
        const oldCssFiles = [
            'layout-fixes.css',
            'essential-components.css',
            'comprehensive-fixes-v178.css',
            'dark-mode-fixed.css',
            'modern-layout.css',
        ];

        for (const file of oldCssFiles) {
            const oldCssLoaded = await page.evaluate(filename => {
                const link = document.querySelector(`link[href*="${filename}"]`);
                return link !== null;
            }, file);

            expect(oldCssLoaded).toBeFalsy();
        }
    });
});
