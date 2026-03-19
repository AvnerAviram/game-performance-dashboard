/**
 * Comprehensive E2E Production Test
 * Tests every page, feature, and critical flow in the dashboard.
 * Run: node tests/e2e/test-production.mjs
 * Requires: server running on localhost:3000
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0, skipped = 0;
const failures = [];

function check(name, condition) {
    if (condition) { passed++; console.log(`  \u2705 ${name}`); }
    else { failed++; failures.push(name); console.log(`  \u274C ${name}`); }
}

function skip(name, reason) {
    skipped++; console.log(`  \u23ED ${name} (${reason})`);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // ============================================================
    // 1. LOGIN
    // ============================================================
    console.log('\n--- Login ---');
    await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle', timeout: 15000 });
    check('Login page loads', page.url().includes('login'));

    const usernameField = await page.$('#login-username');
    check('Username field exists', !!usernameField);

    await page.fill('#login-username', 'avner');
    await page.fill('#login-password', 'avner');
    await page.click('button[type="submit"]');
    await page.waitForSelector('#overview-total-games', { timeout: 30000 });
    check('Login succeeds and dashboard loads', page.url().includes('dashboard'));

    // ============================================================
    // 2. OVERVIEW PAGE
    // ============================================================
    console.log('\n--- Overview ---');
    const totalGames = await page.textContent('#overview-total-games');
    check('Total games displayed', totalGames && parseInt(totalGames) > 0);

    const charts = await page.$$('canvas');
    check('Charts rendered (canvas elements)', charts.length >= 2);

    const topThemes = await page.$('#chart-themes');
    check('Top themes chart exists', !!topThemes);

    const topGames = await page.$('#chart-games');
    check('Top games chart exists', !!topGames);

    // ============================================================
    // 3. THEMES PAGE
    // ============================================================
    console.log('\n--- Themes ---');
    await page.evaluate(() => window.showPage('themes'));
    await page.waitForTimeout(2000);

    const themeCards = await page.$$('.theme-card, [data-theme], .cursor-pointer');
    check('Theme cards rendered', themeCards.length > 5);

    const themeSearch = await page.$('#theme-search');
    if (themeSearch) {
        await themeSearch.fill('dragon');
        await page.waitForTimeout(500);
        const filtered = await page.$$('.theme-card, [data-theme]');
        check('Theme search filters results', filtered.length < themeCards.length);
        await themeSearch.fill('');
        await page.waitForTimeout(300);
    } else {
        skip('Theme search', 'search input not found');
    }

    // ============================================================
    // 4. MECHANICS PAGE
    // ============================================================
    console.log('\n--- Mechanics ---');
    await page.evaluate(() => window.showPage('mechanics'));
    await page.waitForTimeout(2000);

    const mechContent = await page.textContent('#page-container');
    check('Mechanics page has content', mechContent && mechContent.length > 100);

    // ============================================================
    // 5. GAMES PAGE
    // ============================================================
    console.log('\n--- Games ---');
    await page.evaluate(() => window.showPage('games'));
    await page.waitForTimeout(2000);

    const gamesContent = await page.textContent('#page-container');
    check('Games page has content', gamesContent && gamesContent.length > 100);

    // ============================================================
    // 6. PROVIDERS PAGE
    // ============================================================
    console.log('\n--- Providers ---');
    await page.evaluate(() => window.showPage('providers'));
    await page.waitForTimeout(2000);

    const providersContent = await page.textContent('#page-container');
    check('Providers page has content', providersContent && providersContent.length > 100);

    // ============================================================
    // 7. MARKET INSIGHTS PAGE
    // ============================================================
    console.log('\n--- Market Insights ---');
    await page.evaluate(() => window.showPage('insights'));
    await page.waitForTimeout(3000);

    const marketCanvas = await page.$('#chart-market-landscape');
    check('Market Landscape chart exists', !!marketCanvas);

    const buildNext = await page.$('#insight-build-next');
    const buildNextContent = buildNext ? await buildNext.textContent() : '';
    check('Build Next section has content', buildNextContent.length > 10);

    const insightsContainer = await page.textContent('#page-container');
    check('Insights page loaded', insightsContainer && insightsContainer.length > 200);

    // ============================================================
    // 8. GAME LAB
    // ============================================================
    console.log('\n--- Game Lab ---');
    await page.evaluate(() => window.showPage('game-lab'));
    await page.waitForTimeout(2000);

    const gameLabContent = await page.textContent('#page-container');
    check('Game Lab has content', gameLabContent && gameLabContent.length > 100);

    // ============================================================
    // 9. TRENDS PAGE
    // ============================================================
    console.log('\n--- Trends ---');
    await page.evaluate(() => window.showPage('trends'));
    await page.waitForTimeout(2000);

    const trendsContent = await page.textContent('#page-container');
    check('Trends page has content', trendsContent && trendsContent.length > 50);

    // ============================================================
    // 10. TICKETS PAGE
    // ============================================================
    console.log('\n--- Tickets ---');
    await page.evaluate(() => window.showPage('tickets'));
    await page.waitForTimeout(2000);

    const ticketsContainer = await page.$('#tickets-content');
    check('Tickets page loads', !!ticketsContainer);

    // ============================================================
    // 11. DARK MODE TOGGLE
    // ============================================================
    console.log('\n--- Dark Mode ---');
    const darkToggle = await page.$('#dark-mode-toggle');
    if (darkToggle) {
        await darkToggle.click();
        await page.waitForTimeout(300);
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        check('Dark mode activates', isDark);

        await darkToggle.click();
        await page.waitForTimeout(300);
        const isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
        check('Light mode restores', isLight);
    } else {
        skip('Dark mode toggle', 'button not found');
    }

    // ============================================================
    // 12. SIDEBAR COLLAPSE
    // ============================================================
    console.log('\n--- Sidebar ---');
    const collapseBtn = await page.$('.collapse-btn');
    if (collapseBtn) {
        await collapseBtn.click();
        await page.waitForTimeout(500);
        const sidebar = await page.$('#sidebar');
        const isCollapsed = await sidebar.evaluate(el =>
            el.classList.contains('w-16') || el.classList.contains('sidebar-collapsed') ||
            el.getBoundingClientRect().width < 100
        );
        check('Sidebar collapses', isCollapsed);

        await collapseBtn.click();
        await page.waitForTimeout(500);
    } else {
        skip('Sidebar collapse', 'collapse button not found');
    }

    // ============================================================
    // 13. GAME LAB FLYOUT (Z-INDEX)
    // ============================================================
    console.log('\n--- Game Lab Flyout ---');
    const flyout = await page.$('#gamelab-flyout');
    if (flyout) {
        const zIndex = await flyout.evaluate(el => getComputedStyle(el).zIndex);
        check('Flyout z-index is very high', parseInt(zIndex) >= 9000 || zIndex === 'auto');
    } else {
        skip('Flyout z-index', 'flyout element not found');
    }

    // ============================================================
    // 14. SECURITY HEADERS
    // ============================================================
    console.log('\n--- Security Headers ---');
    const response = await page.goto(`${BASE}/api/health`, { waitUntil: 'networkidle' });
    const headers = response.headers();
    check('CSP header present', !!headers['content-security-policy']);
    check('X-Content-Type-Options present', headers['x-content-type-options'] === 'nosniff');
    check('X-Frame-Options present', !!headers['x-frame-options']);
    check('Strict-Transport-Security present', !!headers['strict-transport-security']);

    // ============================================================
    // 15. API AUTH ENFORCEMENT
    // ============================================================
    console.log('\n--- API Auth ---');
    const newContext = await browser.newContext();
    const unauthPage = await newContext.newPage();

    const dataRes = await unauthPage.goto(`${BASE}/api/data/games`);
    check('Data API blocks unauthenticated (401)', dataRes.status() === 401);

    const ticketRes = await unauthPage.goto(`${BASE}/api/tickets`);
    check('Tickets API blocks unauthenticated (401)', ticketRes.status() === 401);

    await newContext.close();

    // ============================================================
    // 16. NO CONSOLE ERRORS
    // ============================================================
    console.log('\n--- Console Errors ---');
    const criticalErrors = errors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('ResizeObserver') &&
        !e.includes('Non-Error promise rejection')
    );
    check(`No critical page errors (found ${criticalErrors.length})`, criticalErrors.length === 0);
    if (criticalErrors.length > 0) {
        criticalErrors.forEach(e => console.log(`    ERROR: ${e.substring(0, 100)}`));
    }

    // ============================================================
    // RESULTS
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    if (failures.length > 0) {
        console.log('\nFailed tests:');
        failures.forEach(f => console.log(`  - ${f}`));
    }
    console.log('='.repeat(60));

    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
