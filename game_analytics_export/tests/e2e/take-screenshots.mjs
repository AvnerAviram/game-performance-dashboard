/**
 * Screenshot verification script — logs into production server, captures UI screenshots.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const BASE = 'http://localhost:3000';
const SS_DIR = new URL('./screenshots/', import.meta.url).pathname;
if (!existsSync(SS_DIR)) mkdirSync(SS_DIR, { recursive: true });

async function run() {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    try {
        // Login via API to get a session cookie
        const loginResp = await page.request.post(`${BASE}/api/login`, {
            data: { username: 'e2e_test_user', password: 'e2eTestPass123!' },
        });
        console.log(`API login: ${loginResp.ok() ? 'OK' : 'FAILED ' + loginResp.status()}`);

        await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
        await sleep(4000);

        // Check if we're past login
        const isLogin = await page
            .locator('#login-form')
            .isVisible()
            .catch(() => false);
        if (isLogin) {
            console.log('Still on login page — form login...');
            await page.fill('#login-username', 'e2e_test_user');
            await page.fill('#login-password', 'e2eTestPass123!');
            await page.click('#login-submit');
            await sleep(4000);
        }

        // Full page
        await page.screenshot({ path: `${SS_DIR}01-full-page.png`, fullPage: false });
        console.log('[1] Full page');

        // Check elements
        const elements = {
            'dark-mode-toggle': '#dark-mode-toggle',
            'hamburger-btn': '#hamburger-btn',
            'collapse-btn': '.collapse-btn',
            sidebar: '#sidebar',
        };

        for (const [name, sel] of Object.entries(elements)) {
            const visible = await page
                .locator(sel)
                .isVisible()
                .catch(() => false);
            console.log(`  ${name}: ${visible ? 'VISIBLE' : 'NOT FOUND'}`);
            if (visible) {
                const box = await page.locator(sel).boundingBox();
                if (box) console.log(`    position: x=${Math.round(box.x)} y=${Math.round(box.y)}`);
            }
        }

        // Header area clip
        await page.screenshot({
            path: `${SS_DIR}02-header-top-right.png`,
            clip: { x: 800, y: 0, width: 640, height: 120 },
        });
        console.log('[2] Header top-right');

        // Sidebar area
        await page.screenshot({ path: `${SS_DIR}03-sidebar.png`, clip: { x: 0, y: 0, width: 280, height: 200 } });
        console.log('[3] Sidebar');

        // Open hamburger if visible
        const hambVisible = await page
            .locator('#hamburger-btn')
            .isVisible()
            .catch(() => false);
        if (hambVisible) {
            await page.locator('#hamburger-btn').click();
            await sleep(500);
            await page.screenshot({ path: `${SS_DIR}04-hamburger-open.png`, fullPage: false });
            console.log('[4] Hamburger open');

            const xrayVisible = await page
                .locator('#xray-menu-btn')
                .isVisible()
                .catch(() => false);
            console.log(`  X-Ray in menu: ${xrayVisible ? 'YES' : 'NO'}`);
        }

        console.log('\nDone. Screenshots in tests/e2e/screenshots/');
    } finally {
        await browser.close();
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
