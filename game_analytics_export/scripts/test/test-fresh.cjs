const { chromium } = require('playwright');

async function testFresh() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    
    // Aggressive cache clearing
    await context.clearCookies();
    await context.clearPermissions();
    
    await page.goto('http://localhost:8000/game_analytics_export/?nocache=' + Date.now(), {
        waitUntil: 'networkidle'
    });
    
    // Hard reload
    await page.evaluate(() => location.reload(true));
    await page.waitForTimeout(2000);
    
    console.log('\n🔬 Fresh Test with Cache Clear\n');
    
    const testPages = ['trends', 'prediction', 'ai-assistant', 'anomalies', 'insights'];
    
    for (const pageId of testPages) {
        await page.evaluate((id) => window.showPage(id), pageId);
        await page.waitForTimeout(500);
        
        const measure = await page.evaluate((id) => {
            const pageDiv = document.getElementById(id);
            const h2 = pageDiv?.querySelector('h2');
            const pageRect = pageDiv?.getBoundingClientRect();
            const h2Rect = h2?.getBoundingClientRect();
            
            return {
                pageLeft: pageRect?.left || 0,
                h2Left: h2Rect?.left || 0
            };
        }, pageId);
        
        const expected = 272;
        const diff = Math.abs(measure.h2Left - expected);
        const status = diff <= 1 ? '✅' : '❌';
        
        console.log(`${status} ${pageId.padEnd(15)} → Page: ${measure.pageLeft}px, H2: ${measure.h2Left}px (diff: ${diff}px)`);
    }
    
    await browser.close();
}

testFresh().catch(console.error);
