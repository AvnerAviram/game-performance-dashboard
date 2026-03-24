import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';

async function main() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('#login-username', 'avner');
    await page.fill('#login-password', 'avner');
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 15000 });
    await page.waitForSelector('#overview-total-games', { state: 'visible', timeout: 30000 });
    console.log('=== LOGGED IN ===\n');

    // ============ TEST 1: TOP GAMES CHART ============
    console.log('--- TEST 1: TOP GAMES CHART LABELS ---');
    const gamesCanvas = await page.$('#chart-games');
    if (gamesCanvas) {
        await gamesCanvas.screenshot({ path: 'tests/e2e/final-top-games.png' });
        console.log('  ✅ Screenshot saved: final-top-games.png');
    } else {
        console.log('  ❌ #chart-games not found');
    }

    // ============ TEST 2: MARKET INSIGHTS ============
    console.log('\n--- TEST 2: MARKET INSIGHTS ---');
    await page.click('[data-page="insights"]');
    await page.waitForTimeout(5000);

    // Check all sections
    const sections = await page.evaluate(() => {
        const ids = ['insight-build-next','insight-avoid','insight-watch','provider-theme-matrix'];
        const result = {};
        ids.forEach(id => {
            const el = document.getElementById(id);
            result[id] = el ? { h: el.offsetHeight, children: el.children.length, empty: el.textContent.trim() === '' } : null;
        });
        const canvas = document.getElementById('chart-market-landscape');
        try {
            const chart = Chart.getChart(canvas);
            result.chart = chart ? { points: chart.data.datasets[0].data.length, xType: chart.scales.x.type } : 'no chart';
        } catch(e) { result.chart = e.message; }
        return result;
    });

    let insightsOk = true;
    for (const [id, data] of Object.entries(sections)) {
        if (!data) { console.log(`  ❌ ${id}: NOT FOUND`); insightsOk = false; continue; }
        if (data.points) { console.log(`  ✅ ${id}: ${data.points} pts, ${data.xType}`); continue; }
        if (typeof data === 'string') { console.log(`  ❌ ${id}: ${data}`); insightsOk = false; continue; }
        const ok = data.h > 0 && data.children > 0 && !data.empty;
        if (!ok) insightsOk = false;
        console.log(`  ${ok ? '✅' : '❌'} ${id}: h=${data.h}, children=${data.children}`);
    }

    // Canvas screenshot
    const chartCanvas = await page.$('#chart-market-landscape');
    if (chartCanvas) {
        await chartCanvas.screenshot({ path: 'tests/e2e/final-chart.png' });
        console.log('  ✅ Chart screenshot saved');
    }

    // Providers screenshot
    const provEl = await page.$('#provider-theme-matrix');
    if (provEl) {
        await provEl.screenshot({ path: 'tests/e2e/final-providers.png' });
    }

    // Full page
    await page.screenshot({ path: 'tests/e2e/final-insights-full.png', fullPage: true });

    // ============ TEST 3: FLYOUT Z-INDEX ============
    console.log('\n--- TEST 3: FLYOUT Z-INDEX ---');
    await page.click('[data-page="overview"]');
    await page.waitForTimeout(2000);

    // Collapse sidebar
    const collapseBtn = await page.$('.collapse-btn');
    if (collapseBtn) {
        await collapseBtn.click();
        await page.waitForTimeout(1000);
    }

    const isCollapsed = await page.evaluate(() => document.getElementById('sidebar')?.classList.contains('collapsed'));
    if (isCollapsed) {
        const gameLab = await page.$('[data-page="game-lab"]');
        if (gameLab) {
            await gameLab.hover();
            await page.waitForTimeout(800);

            const flyoutInfo = await page.evaluate(() => {
                const f = document.getElementById('gamelab-flyout');
                if (!f) return null;
                const style = window.getComputedStyle(f);
                const rect = f.getBoundingClientRect();
                const mainContent = document.getElementById('main-content');
                const mainZ = mainContent ? window.getComputedStyle(mainContent).zIndex : 'N/A';
                return {
                    visible: !f.classList.contains('hidden'),
                    zIndex: style.zIndex,
                    mainContentZ: mainZ,
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                };
            });
            console.log(`  Flyout: z=${flyoutInfo?.zIndex}, main-content z=${flyoutInfo?.mainContentZ}, visible=${flyoutInfo?.visible}`);
            console.log(`  Flyout box: ${flyoutInfo?.width}x${flyoutInfo?.height} at (${flyoutInfo?.x}, ${flyoutInfo?.y})`);
            
            const flyoutOk = flyoutInfo && flyoutInfo.visible && parseInt(flyoutInfo.zIndex) > parseInt(flyoutInfo.mainContentZ);
            console.log(`  ${flyoutOk ? '✅' : '❌'} Flyout z-index (${flyoutInfo?.zIndex}) > main content (${flyoutInfo?.mainContentZ})`);

            await page.screenshot({ path: 'tests/e2e/final-flyout.png' });
        }
    }

    // Summary
    console.log('\n--- ERRORS ---');
    const realErrors = errors.filter(e => !e.includes('501'));
    if (realErrors.length) realErrors.forEach(e => console.log(`  ❌ ${e}`));
    else console.log('  None');

    console.log(`\n=== ${insightsOk ? '✅' : '❌'} MARKET INSIGHTS: ${insightsOk ? 'ALL SECTIONS POPULATED' : 'ISSUES FOUND'} ===`);
    await browser.close();
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
