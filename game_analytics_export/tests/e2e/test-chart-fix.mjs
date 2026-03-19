import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';

async function main() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });

    await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('#login-username', 'avner');
    await page.fill('#login-password', 'avner');
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 15000 });
    await page.waitForSelector('#overview-total-games', { state: 'visible', timeout: 30000 });

    await page.click('[data-page="insights"]');
    await page.waitForTimeout(6000);

    // Scroll the page-container to put chart in view
    const scrollInfo = await page.evaluate(() => {
        const container = document.getElementById('page-container');
        const chart = document.getElementById('market-landscape-chart');
        const canvas = document.getElementById('chart-market-landscape');
        const outerCard = chart?.parentElement;
        
        return {
            pageContainerScroll: container ? { scrollTop: container.scrollTop, scrollHeight: container.scrollHeight, clientHeight: container.clientHeight } : null,
            chartRect: chart?.getBoundingClientRect(),
            canvasRect: canvas?.getBoundingClientRect(),
            outerCardRect: outerCard?.getBoundingClientRect(),
            outerCardClasses: outerCard?.className,
            outerCardOverflow: outerCard ? window.getComputedStyle(outerCard).overflow : null,
            chartOverflow: chart ? window.getComputedStyle(chart).overflow : null,
            chartHeight: chart?.offsetHeight,
            canvasHeight: canvas?.offsetHeight,
            outerCardHeight: outerCard?.offsetHeight,
        };
    });

    console.log('=== LAYOUT ANALYSIS ===');
    console.log(`  Page container: scrollTop=${scrollInfo.pageContainerScroll?.scrollTop}, scrollH=${scrollInfo.pageContainerScroll?.scrollHeight}, clientH=${scrollInfo.pageContainerScroll?.clientHeight}`);
    console.log(`  Chart container rect: top=${scrollInfo.chartRect?.top?.toFixed(0)}, bottom=${scrollInfo.chartRect?.bottom?.toFixed(0)}, h=${scrollInfo.chartRect?.height?.toFixed(0)}`);
    console.log(`  Canvas rect: top=${scrollInfo.canvasRect?.top?.toFixed(0)}, bottom=${scrollInfo.canvasRect?.bottom?.toFixed(0)}, h=${scrollInfo.canvasRect?.height?.toFixed(0)}`);
    console.log(`  Outer card rect: top=${scrollInfo.outerCardRect?.top?.toFixed(0)}, bottom=${scrollInfo.outerCardRect?.bottom?.toFixed(0)}, h=${scrollInfo.outerCardRect?.height?.toFixed(0)}`);
    console.log(`  Outer card overflow: ${scrollInfo.outerCardOverflow}`);
    console.log(`  Chart overflow: ${scrollInfo.chartOverflow}`);
    console.log(`  Chart offsetHeight: ${scrollInfo.chartHeight}`);
    console.log(`  Canvas offsetHeight: ${scrollInfo.canvasHeight}`);
    console.log(`  Outer card offsetHeight: ${scrollInfo.outerCardHeight}`);

    // Scroll page-container to the chart
    await page.evaluate(() => {
        const container = document.getElementById('page-container');
        const chart = document.getElementById('market-landscape-chart');
        if (container && chart) {
            const chartTop = chart.offsetTop - container.offsetTop;
            container.scrollTop = chartTop - 20;
        }
    });
    await page.waitForTimeout(1000);

    // Take viewport screenshot showing the chart
    await page.screenshot({ path: 'tests/e2e/fix-chart-scrolled.png' });

    // Try canvas-only screenshot
    const canvasEl = await page.$('#chart-market-landscape');
    if (canvasEl) {
        await canvasEl.screenshot({ path: 'tests/e2e/fix-canvas-only.png' });
        console.log('  Canvas-only screenshot saved');
    }

    await browser.close();
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
