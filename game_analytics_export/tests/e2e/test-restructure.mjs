import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;

function check(name, condition) {
    if (condition) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name}`); }
}

async function main() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Login
    await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('#login-username', 'avner');
    await page.fill('#login-password', 'avner');
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 15000 });
    await page.waitForSelector('#overview-total-games', { state: 'visible', timeout: 30000 });
    console.log('=== LOGGED IN ===\n');

    // Test 1: Overview page loads
    console.log('--- Overview ---');
    const totalGames = await page.$eval('#overview-total-games', el => el.textContent);
    check('Total games visible', totalGames && parseInt(totalGames) > 0);
    check('Charts loaded', await page.$$eval('canvas', els => els.length) > 0);

    // Test 2: Navigate to Themes
    console.log('\n--- Themes ---');
    await page.click('[data-page="themes"]');
    await page.waitForTimeout(2000);
    const themesContent = await page.$eval('#page-container', el => el.textContent.length);
    check('Themes page has content', themesContent > 100);

    // Test 3: Navigate to Mechanics
    console.log('\n--- Mechanics ---');
    await page.click('[data-page="mechanics"]');
    await page.waitForTimeout(2000);
    const mechContent = await page.$eval('#page-container', el => el.textContent.length);
    check('Mechanics page has content', mechContent > 100);

    // Test 4: Navigate to Games
    console.log('\n--- Games ---');
    await page.click('[data-page="games"]');
    await page.waitForTimeout(3000);
    const gamesContent = await page.$eval('#page-container', el => el.textContent.length);
    check('Games page has content', gamesContent > 100);

    // Test 5: Navigate to Providers
    console.log('\n--- Providers ---');
    await page.click('[data-page="providers"]');
    await page.waitForTimeout(3000);
    const providersContent = await page.$eval('#page-container', el => el.textContent.length);
    check('Providers page has content', providersContent > 100);

    // Test 6: Market Insights
    console.log('\n--- Market Insights ---');
    await page.click('[data-page="insights"]');
    await page.waitForTimeout(5000);
    const chartExists = await page.evaluate(() => {
        const canvas = document.getElementById('chart-market-landscape');
        try { return !!Chart.getChart(canvas); } catch(e) { return false; }
    });
    check('Market Landscape chart exists', chartExists);
    const buildNext = await page.$eval('#insight-build-next', el => el.children.length);
    check('Build Next has content', buildNext > 0);

    // Test 7: Game Lab
    console.log('\n--- Game Lab ---');
    await page.click('[data-page="game-lab"]');
    await page.waitForTimeout(4000);
    const gameLabContent = await page.$eval('#page-container', el => el.textContent.length);
    check('Game Lab has content', gameLabContent > 100);
    const themeChips = await page.$$eval('.theme-chip', els => els.length);
    check('Blueprint theme chips populated', themeChips > 0);
    const mechChips = await page.$$eval('.mechanic-chip', els => els.length);
    check('Blueprint mechanic chips populated', mechChips > 0);

    // Test 8: Trends
    console.log('\n--- Trends ---');
    await page.click('[data-page="trends"]');
    await page.waitForTimeout(3000);
    const trendsContent = await page.$eval('#page-container', el => el.textContent.length);
    check('Trends page has content', trendsContent > 50);

    // Test 9: Dark Mode
    console.log('\n--- Dark Mode ---');
    await page.click('#dark-mode-toggle');
    await page.waitForTimeout(500);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    check('Dark mode toggled', isDark);
    await page.click('#dark-mode-toggle');

    // Test 10: Sidebar collapse + flyout
    console.log('\n--- Sidebar ---');
    const collapseBtn = await page.$('.collapse-btn');
    if (collapseBtn) {
        await collapseBtn.click();
        await page.waitForTimeout(800);
        const collapsed = await page.evaluate(() => document.getElementById('sidebar')?.classList.contains('collapsed'));
        check('Sidebar collapses', collapsed);
        
        const gameLab = await page.$('[data-page="game-lab"]');
        if (gameLab) {
            await gameLab.hover();
            await page.waitForTimeout(600);
            const flyout = await page.$('#gamelab-flyout');
            const flyoutVisible = flyout && await flyout.isVisible();
            check('Flyout visible on hover', flyoutVisible);
        }
        await collapseBtn.click();
        await page.waitForTimeout(500);
    }

    // Test 11: Tickets page
    console.log('\n--- Tickets ---');
    await page.evaluate(() => showPage('tickets'));
    await page.waitForTimeout(2000);
    const ticketsExists = await page.$('#tickets-content');
    check('Tickets page loads', !!ticketsExists);

    // Summary
    console.log('\n=== ERRORS ===');
    if (errors.length) errors.forEach(e => console.log(`  ${e}`));
    else console.log('  None');

    console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
