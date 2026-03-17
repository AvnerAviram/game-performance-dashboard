const { test, expect } = require('@playwright/test');

/**
 * Header Alignment Test Suite
 * Ensures all 10 pages have consistent header alignment at X=272px
 */

test.describe('Header Alignment: All Pages', () => {
    const EXPECTED_X = 272;
    const TOLERANCE = 1;
    
    const pages = [
        { id: 'overview', name: 'Overview' },
        { id: 'themes', name: 'Themes' },
        { id: 'mechanics', name: 'Mechanics' },
        { id: 'games', name: 'Games' },
        { id: 'providers', name: 'Providers' },
        { id: 'anomalies', name: 'Anomalies' },
        { id: 'insights', name: 'Insights' },
        { id: 'trends', name: 'Trends' },
        { id: 'prediction', name: 'Prediction' },
        { id: 'ai-assistant', name: 'AI Assistant' }
    ];
    
    test.beforeEach(async ({ page, context }) => {
        await context.clearCookies();
        await page.goto('http://localhost:8000/game_analytics_export/');
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
    });
    
    test('All pages align consistently at X=272px', async ({ page }) => {
        console.log('\n🔍 Testing All Page Alignment\n');
        
        const measurements = [];
        let allPassed = true;
        
        for (const pageInfo of pages) {
            await page.evaluate((id) => window.showPage(id), pageInfo.id);
            await page.waitForTimeout(300);
            
            const h2Left = await page.evaluate((id) => {
                const pageDiv = document.getElementById(id);
                const h2 = pageDiv?.querySelector('h2');
                return h2?.getBoundingClientRect().left || 0;
            }, pageInfo.id);
            
            measurements.push({ page: pageInfo.name, h2Left });
            
            const diff = Math.abs(h2Left - EXPECTED_X);
            const passed = diff <= TOLERANCE;
            
            if (!passed) allPassed = false;
            
            const status = passed ? '✅' : '❌';
            console.log(`${status} ${pageInfo.name.padEnd(15)} → ${h2Left}px (diff: ${diff}px)`);
            
            expect(diff).toBeLessThanOrEqual(TOLERANCE);
        }
        
        console.log(`\n${allPassed ? '🎉 All pages aligned!' : '⚠️  Some pages misaligned'}\n`);
    });
});
