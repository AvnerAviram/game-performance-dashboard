import { chromium, webkit } from '@playwright/test';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3000';
const CREDS = { username: 'e2e_test_user', password: 'e2eTestPass123!' };
const SHOT_DIR = 'tests/screenshots/sim';

const PAGES = [
    { id: 'overview', name: 'Overview' },
    { id: 'games', name: 'Games' },
    { id: 'providers', name: 'Providers' },
    { id: 'themes', name: 'Themes' },
    { id: 'mechanics', name: 'Mechanics' },
    { id: 'insights', name: 'Market Insights' },
    { id: 'trends', name: 'Trends' },
    { id: 'game-lab', name: 'Game Lab' },
];

const DEVICES = [
    {
        name: 'iPhone-15-Pro',
        engine: 'webkit',
        vp: { width: 393, height: 852 },
        landscape: { width: 852, height: 393 },
        isMobile: true,
        hasTouch: true,
        dpr: 3,
    },
    {
        name: 'Pixel-7',
        engine: 'chromium',
        vp: { width: 412, height: 915 },
        landscape: { width: 915, height: 412 },
        isMobile: true,
        hasTouch: true,
        dpr: 2.625,
    },
    {
        name: 'iPad-Pro-11',
        engine: 'webkit',
        vp: { width: 834, height: 1194 },
        landscape: { width: 1194, height: 834 },
        isMobile: true,
        hasTouch: true,
        dpr: 2,
    },
];

async function login(page) {
    await page.goto(`${BASE}/login.html`);
    await page.fill('#login-username', CREDS.username);
    await page.fill('#login-password', CREDS.password);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 15000 });
    await page.waitForTimeout(3000);
}

async function runMobileDevice(device) {
    const browserType = device.engine === 'webkit' ? webkit : chromium;
    const browser = await browserType.launch();
    let pass = 0,
        fail = 0;
    const isTablet = device.vp.width >= 768;

    function check(label, ok) {
        console.log((ok ? '    OK' : '    FAIL') + ': ' + label);
        ok ? pass++ : fail++;
    }

    console.log(`\n  === ${device.name} (${device.engine}${isTablet ? ', desktop-layout' : ''}) ===`);

    const ctx = await browser.newContext({
        viewport: device.vp,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
        deviceScaleFactor: device.dpr,
    });
    const page = await ctx.newPage();
    await login(page);

    if (isTablet) {
        const sb = await page.evaluate(() => document.getElementById('sidebar').offsetWidth);
        check(`Sidebar visible at full width (${sb}px)`, sb >= 200);
        const noMobile = await page.evaluate(() => !document.getElementById('mobile-menu-btn'));
        check('No mobile hamburger', noMobile);
        await page.screenshot({ path: `${SHOT_DIR}/${device.name}-overview-portrait.png` });
    } else {
        // Sidebar collapsed at 64px
        const sb = await page.evaluate(() => {
            const s = document.getElementById('sidebar');
            return { w: s.offsetWidth, collapsed: s.classList.contains('collapsed') };
        });
        check(`Sidebar at 64px (actual: ${sb.w})`, sb.w === 64);
        check('Sidebar has collapsed class', sb.collapsed);

        // No floating hamburger
        const noBtn = await page.evaluate(() => !document.getElementById('mobile-menu-btn'));
        check('No floating hamburger button', noBtn);

        // Account menu accessible
        const hamb = await page.evaluate(() => {
            const b = document.getElementById('hamburger-btn');
            return b ? getComputedStyle(b).display !== 'none' : false;
        });
        check('Account hamburger visible', hamb);

        // Nav icons visible
        const icons = await page.evaluate(() => {
            let c = 0;
            document.querySelectorAll('#sidebar .nav-icon').forEach(i => {
                const r = i.getBoundingClientRect();
                if (r.width > 0 && r.left >= 0 && r.right <= 70) c++;
            });
            return c;
        });
        check(`Nav icons visible (${icons})`, icons >= 6);

        // Main content margin
        const ml = await page.evaluate(() => getComputedStyle(document.getElementById('main-content')).marginLeft);
        check(`Content margin-left: 64px (actual: ${ml})`, ml === '64px');

        // Screenshot overview
        await page.screenshot({ path: `${SHOT_DIR}/${device.name}-overview-portrait.png` });

        // Sidebar expand/collapse
        await page.evaluate(() => window.toggleSidebar());
        await page.waitForTimeout(400);
        const exp = await page.evaluate(() => document.getElementById('sidebar').offsetWidth);
        check(`Sidebar expands to 240px (actual: ${exp})`, exp === 240);
        await page.screenshot({ path: `${SHOT_DIR}/${device.name}-sidebar-open.png` });

        await page.evaluate(() => window.toggleSidebar());
        await page.waitForTimeout(400);
        const col = await page.evaluate(() => document.getElementById('sidebar').offsetWidth);
        check(`Sidebar collapses to 64px (actual: ${col})`, col === 64);
    }

    // All pages: screenshot + no-overflow check
    for (const pg of PAGES) {
        await page.evaluate(id => window.showPage(id), pg.id);
        await page.waitForTimeout(1200);

        const noScroll = await page.evaluate(() => {
            const pc = document.getElementById('page-container');
            return pc ? pc.scrollWidth <= pc.clientWidth + 5 : true;
        });
        if (!noScroll) {
            console.log(`    FAIL: ${pg.name} has horizontal scroll`);
            fail++;
        } else {
            pass++;
        }

        await page.screenshot({ path: `${SHOT_DIR}/${device.name}-${pg.id}-portrait.png` });
    }

    // Landscape for key pages
    if (!isTablet) {
        await page.setViewportSize(device.landscape);
        await page.waitForTimeout(300);
    }
    for (const pgId of ['overview', 'games', 'insights']) {
        await page.evaluate(id => window.showPage(id), pgId);
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${SHOT_DIR}/${device.name}-${pgId}-landscape.png` });
    }

    await ctx.close();
    await browser.close();
    console.log(`    Total: ${pass} passed, ${fail} failed`);
    return { pass, fail };
}

async function runDesktop() {
    const browser = await chromium.launch();
    let pass = 0,
        fail = 0;

    function check(label, ok) {
        console.log((ok ? '    OK' : '    FAIL') + ': ' + label);
        ok ? pass++ : fail++;
    }

    console.log('\n  === Desktop (1280x800, Chromium) ===');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await login(page);

    const sb = await page.evaluate(() => document.getElementById('sidebar').offsetWidth);
    check(`Sidebar at 240px (actual: ${sb})`, sb === 240);
    const noMobile = await page.evaluate(() => !document.getElementById('mobile-menu-btn'));
    check('No mobile hamburger', noMobile);
    const hamb = await page.evaluate(() => {
        const b = document.getElementById('hamburger-btn');
        return b ? getComputedStyle(b).display !== 'none' : false;
    });
    check('Account hamburger visible', hamb);

    for (const pg of PAGES) {
        await page.evaluate(id => window.showPage(id), pg.id);
        await page.waitForTimeout(800);
        const noScroll = await page.evaluate(() => {
            const pc = document.getElementById('page-container');
            return pc ? pc.scrollWidth <= pc.clientWidth + 5 : true;
        });
        if (!noScroll) {
            console.log(`    FAIL: ${pg.name} has horizontal scroll`);
            fail++;
        } else {
            pass++;
        }
    }

    await page.evaluate(() => window.showPage('overview'));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOT_DIR}/desktop-overview.png` });

    await ctx.close();
    await browser.close();
    console.log(`    Total: ${pass} passed, ${fail} failed`);
    return { pass, fail };
}

async function main() {
    mkdirSync(SHOT_DIR, { recursive: true });
    console.log('\n======================================');
    console.log(' FULL MOBILE SIMULATION TEST SUITE');
    console.log('======================================');

    let totalPass = 0,
        totalFail = 0;

    for (const d of DEVICES) {
        const r = await runMobileDevice(d);
        totalPass += r.pass;
        totalFail += r.fail;
    }

    const dr = await runDesktop();
    totalPass += dr.pass;
    totalFail += dr.fail;

    console.log('\n======================================');
    console.log(` TOTAL: ${totalPass} passed, ${totalFail} failed`);
    console.log('======================================\n');
    console.log('Screenshots: tests/screenshots/sim/');
    process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
