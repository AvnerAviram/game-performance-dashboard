import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3000';
async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('#login-username', 'avner');
    await page.fill('#login-password', 'avner');
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 15000 });
    await page.waitForSelector('#overview-total-games', { state: 'visible', timeout: 30000 });
    await page.click('[data-page="insights"]');
    await page.waitForTimeout(6000);
    const canvas = page.locator('#chart-market-landscape');
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    const box = await canvas.boundingBox();

    // 1. Hover "Classic" bubble directly (big bubble, ~85% x, ~24% y)
    await page.mouse.move(box.x + box.width * 0.84, box.y + box.height * 0.24);
    await page.waitForTimeout(600);
    await canvas.screenshot({ path: 'tests/e2e/screenshots/tt-1-bubble.png' });
    console.log('1. Bubble tooltip');

    await page.mouse.move(box.x + 300, box.y + 300);
    await page.waitForTimeout(400);

    // 2. Hover "Animals" label text (~90% x, ~28% y)
    await page.mouse.move(box.x + 954, box.y + 218);
    await page.waitForTimeout(600);
    await canvas.screenshot({ path: 'tests/e2e/screenshots/tt-2-label.png' });
    console.log('2. Label tooltip');

    await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
