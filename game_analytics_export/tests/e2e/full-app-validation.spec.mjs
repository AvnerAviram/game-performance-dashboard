/**
 * Comprehensive E2E validation — every page and interactive element.
 *
 * Uses the root playwright.config.js which starts webServer on port 8000.
 * Login as existing user "avner" / "avner".
 */
import { test, expect } from '@playwright/test';

const CREDS = { username: 'avner', password: 'avner' };

/** Shared page errors collected per test.describe block */
let pageErrors = [];

async function login(page, baseURL) {
    await page.goto(`${baseURL}/login.html`);
    await page.fill('#login-username', CREDS.username);
    await page.fill('#login-password', CREDS.password);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 30000 });
    await page.waitForFunction(
        () => {
            const o = document.getElementById('loading-overlay');
            return !o || o.style.opacity === '0' || !o.offsetParent;
        },
        { timeout: 30000 }
    );
    await page.waitForTimeout(2000);
}

async function navigateTo(page, pageName) {
    await page.evaluate(p => window.showPage(p), pageName);
    await page.waitForTimeout(2000);
}

function panelVisible(page, panelId) {
    return page.locator(`#${panelId}`).evaluate(el => el.style.right === '0px');
}

// ═══════════════════════════════════════════════════════════════
//  OVERVIEW PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Overview Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'overview');
    });

    test('page loads with data', async ({ page }) => {
        const totalGames = await page.locator('#overview-total-games').textContent();
        expect(Number(totalGames.replace(/,/g, ''))).toBeGreaterThan(0);
        await expect(page.locator('#overview-total-providers')).toBeVisible();
    });

    test('KPI stat cards render', async ({ page }) => {
        const stats = page.locator(
            '#overview-total-games, #overview-total-themes, #overview-total-mechanics, #overview-total-providers'
        );
        const count = await stats.count();
        expect(count).toBeGreaterThanOrEqual(4);
        for (let i = 0; i < count; i++) {
            const text = await stats.nth(i).textContent();
            expect(text.trim().length).toBeGreaterThan(0);
        }
    });

    test('charts render', async ({ page }) => {
        const chartIds = ['chart-providers', 'chart-volatility', 'chart-rtp', 'chart-art-themes'];
        for (const id of chartIds) {
            const canvas = page.locator(`#${id}`);
            if ((await canvas.count()) > 0) {
                const width = await canvas.evaluate(el => el.width);
                expect(width, `${id} should have non-zero width`).toBeGreaterThan(0);
            }
        }
    });

    test('category filter works', async ({ page }) => {
        const filter = page.locator('#page-category-filter');
        if ((await filter.count()) === 0) return;

        const options = await filter.locator('option').allTextContents();
        const nonAll = options.find(o => !/all/i.test(o));
        if (!nonAll) return;

        await filter.selectOption({ label: nonAll });
        await page.waitForTimeout(3000);

        const selected = await filter.inputValue();
        expect(selected).not.toBe('');

        await filter.selectOption({ index: 0 });
        await page.waitForTimeout(2000);
    });

    test('theme card click opens panel', async ({ page }) => {
        const card = page.locator('#main-content [onclick*="showThemeDetails"]').first();
        if ((await card.count()) === 0) return;

        await card.click();
        await page.waitForTimeout(1000);
        expect(await panelVisible(page, 'theme-panel')).toBe(true);

        const content = await page.locator('#theme-panel-content').innerHTML();
        expect(content.length).toBeGreaterThan(50);

        await page.evaluate(() => window.closeAllPanels());
        await page.waitForTimeout(300);
    });

    test('shortcut cards navigate', async ({ page }) => {
        const shortcut = page.locator('#main-content button[onclick*="showPage"]:visible').first();
        if ((await shortcut.count()) === 0) return;

        await shortcut.click();
        await page.waitForTimeout(1500);
    });

    test('zero console errors', async () => {
        expect(pageErrors, `Errors: ${pageErrors.join('; ')}`).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════
//  THEMES PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Themes Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'themes');
        await page.waitForSelector('#themes-table tbody tr', { timeout: 10000 });
    });

    test('page loads with table rows', async ({ page }) => {
        const rows = await page.locator('#themes-table tbody tr').count();
        expect(rows).toBeGreaterThan(10);
    });

    test('view tabs work', async ({ page }) => {
        const beforeRows = await page.locator('#themes-table tbody tr').count();

        const leaderBtn = page.locator('[onclick*="switchThemeView"][onclick*="leaders"]').first();
        if ((await leaderBtn.count()) > 0) {
            await leaderBtn.click();
            await page.waitForTimeout(1000);
            const afterRows = await page.locator('#themes-table tbody tr').count();
            expect(afterRows).toBeGreaterThan(0);
        }

        const allBtn = page.locator('[onclick*="switchThemeView"][onclick*="all"]').first();
        if ((await allBtn.count()) > 0) {
            await allBtn.click();
            await page.waitForTimeout(1000);
            const restoredRows = await page.locator('#themes-table tbody tr').count();
            expect(restoredRows).toBe(beforeRows);
        }
    });

    test('search works', async ({ page }) => {
        const search = page.locator('#theme-search');
        const beforeRows = await page.locator('#themes-table tbody tr').count();

        await search.fill('adventure');
        await page.waitForTimeout(1000);
        const filteredRows = await page.locator('#themes-table tbody tr').count();
        expect(filteredRows).toBeLessThan(beforeRows);

        await search.fill('');
        await page.waitForTimeout(1000);
        const restoredRows = await page.locator('#themes-table tbody tr').count();
        expect(restoredRows).toBe(beforeRows);
    });

    test('sort works', async ({ page }) => {
        const header = page.locator('#themes-table thead th').nth(2);
        await header.click();
        await page.waitForTimeout(1000);
        const rows = await page.locator('#themes-table tbody tr').count();
        expect(rows).toBeGreaterThan(0);

        await header.click();
        await page.waitForTimeout(1000);
        const rows2 = await page.locator('#themes-table tbody tr').count();
        expect(rows2).toBeGreaterThan(0);
    });

    test('theme expand/drill-down', async ({ page }) => {
        const toggle = page.locator('.expand-toggle').first();
        if ((await toggle.count()) === 0) return;

        await toggle.click();
        await page.waitForTimeout(1000);
        const drillRow = page.locator('tr[id^="art-drill-"]').first();
        expect(await drillRow.count()).toBeGreaterThan(0);

        await toggle.click();
        await page.waitForTimeout(500);
    });

    test('theme click opens panel', async ({ page }) => {
        const link = page.locator('#themes-table .theme-link').first();
        if ((await link.count()) === 0) return;

        await link.click();
        await page.waitForTimeout(1000);
        expect(await panelVisible(page, 'theme-panel')).toBe(true);

        const content = await page.locator('#theme-panel-content').innerHTML();
        expect(content.length).toBeGreaterThan(100);

        await page.evaluate(() => window.closeAllPanels());
        await page.waitForTimeout(300);
    });

    test('filter dropdowns', async ({ page }) => {
        const provFilter = page.locator('#themes-filter-provider');
        if ((await provFilter.count()) === 0) return;

        const options = await provFilter.locator('option').count();
        if (options < 2) return;

        const beforeRows = await page.locator('#themes-table tbody tr').count();
        await provFilter.selectOption({ index: 1 });
        await page.waitForTimeout(1500);
        const afterRows = await page.locator('#themes-table tbody tr').count();
        expect(afterRows).toBeLessThanOrEqual(beforeRows);

        await provFilter.selectOption({ index: 0 });
        await page.waitForTimeout(1000);
    });

    test('mechanic filter filters table', async ({ page }) => {
        const mechFilter = page.locator('#themes-filter-mechanic');
        if ((await mechFilter.count()) === 0) return;

        const options = await mechFilter.locator('option').count();
        if (options < 2) return;

        const beforeCount = await page.locator('#themes-count').textContent();
        await mechFilter.selectOption({ index: 1 });
        await page.waitForTimeout(1500);
        const afterCount = await page.locator('#themes-count').textContent();
        expect(parseInt(afterCount)).toBeLessThan(parseInt(beforeCount));

        const rows = await page.locator('#themes-table tbody tr').count();
        expect(rows).toBeGreaterThan(0);

        await mechFilter.selectOption({ index: 0 });
        await page.waitForTimeout(1000);
        const resetCount = await page.locator('#themes-count').textContent();
        expect(parseInt(resetCount)).toBeGreaterThanOrEqual(parseInt(afterCount));
    });

    test('pagination', async ({ page }) => {
        const nextBtn = page.locator('#themes-next-btn');
        if ((await nextBtn.count()) === 0) return;
        if (await nextBtn.isDisabled()) return;

        const pageBefore = await page.locator('#themes-current-page').textContent();
        await nextBtn.click();
        await page.waitForTimeout(500);
        const pageAfter = await page.locator('#themes-current-page').textContent();
        expect(pageAfter).not.toBe(pageBefore);
    });
});

// ═══════════════════════════════════════════════════════════════
//  MECHANICS PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Mechanics Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'mechanics');
        await page.waitForSelector('#mechanics-table tbody tr', { timeout: 10000 });
    });

    test('page loads with table rows', async ({ page }) => {
        const rows = await page.locator('#mechanics-table tbody tr').count();
        expect(rows).toBeGreaterThan(0);
    });

    test('view tabs', async ({ page }) => {
        const popularBtn = page.locator('[onclick*="switchMechanicView"][onclick*="popular"]').first();
        if ((await popularBtn.count()) > 0) {
            await popularBtn.click();
            await page.waitForTimeout(1000);
            const rows = await page.locator('#mechanics-table tbody tr').count();
            expect(rows).toBeGreaterThan(0);
        }

        const allBtn = page.locator('[onclick*="switchMechanicView"][onclick*="all"]').first();
        if ((await allBtn.count()) > 0) {
            await allBtn.click();
            await page.waitForTimeout(1000);
        }
    });

    test('search', async ({ page }) => {
        const search = page.locator('#mechanic-search');
        const beforeRows = await page.locator('#mechanics-table tbody tr').count();

        await search.fill('free');
        await page.waitForTimeout(1000);
        const filteredRows = await page.locator('#mechanics-table tbody tr').count();
        expect(filteredRows).toBeLessThanOrEqual(beforeRows);

        await search.fill('');
        await page.waitForTimeout(1000);
    });

    test('mechanic click opens panel', async ({ page }) => {
        const link = page.locator('#mechanics-table .mechanic-link').first();
        if ((await link.count()) === 0) return;

        await link.click();
        await page.waitForTimeout(1000);
        expect(await panelVisible(page, 'mechanic-panel')).toBe(true);

        await page.evaluate(() => window.closeAllPanels());
        await page.waitForTimeout(300);
    });

    test('sort', async ({ page }) => {
        const header = page.locator('#mechanics-table thead th').nth(1);
        await header.click();
        await page.waitForTimeout(500);
        const rows = await page.locator('#mechanics-table tbody tr').count();
        expect(rows).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════
//  GAMES PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Games Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'games');
        await page.waitForSelector('#games-table', { timeout: 15000 });
    });

    test('page loads', async ({ page }) => {
        const rows = await page.locator('#games-table tbody tr').count();
        expect(rows).toBeGreaterThan(0);
    });

    test('search', async ({ page }) => {
        const search = page.locator('#games-search');
        const beforeRows = await page.locator('#games-table tbody tr').count();

        await search.fill('wolf');
        await page.waitForTimeout(1500);
        const filteredRows = await page.locator('#games-table tbody tr').count();
        expect(filteredRows).toBeLessThan(beforeRows);

        await search.fill('');
        await page.waitForTimeout(1500);
    });

    test('sort by column', async ({ page }) => {
        const firstCellBefore = await page.locator('#games-table tbody tr td').first().textContent();
        const header = page.locator('#games-table thead th').nth(1);
        await header.click();
        await page.waitForTimeout(1000);
        const firstCellAfter = await page.locator('#games-table tbody tr td').first().textContent();
        expect(firstCellAfter).not.toBe(firstCellBefore);
    });

    test('game click opens panel', async ({ page }) => {
        const link = page.locator('[onclick*="showGameDetails"]').first();
        if ((await link.count()) === 0) return;

        await link.click();
        await page.waitForTimeout(1500);
        expect(await panelVisible(page, 'game-panel')).toBe(true);
    });

    test('game panel has content', async ({ page }) => {
        const link = page.locator('[onclick*="showGameDetails"]').first();
        if ((await link.count()) === 0) return;

        await link.click();
        await page.waitForTimeout(1500);
        const perf = await page.locator('#game-performance').innerHTML();
        expect(perf.length).toBeGreaterThan(50);

        await page.evaluate(() => window.closeAllPanels());
        await page.waitForTimeout(300);
    });

    test('filter by provider', async ({ page }) => {
        const provFilter = page.locator('#games-filter-provider');
        if ((await provFilter.count()) === 0) return;

        const options = await provFilter.locator('option').count();
        if (options < 2) return;

        await provFilter.selectOption({ index: 1 });
        await page.waitForTimeout(2000);
        const rows = await page.locator('#games-table tbody tr').count();
        expect(rows).toBeGreaterThan(0);

        await provFilter.selectOption({ index: 0 });
        await page.waitForTimeout(1500);
    });

    test('filter by category', async ({ page }) => {
        const catFilter = page.locator('#games-filter-category');
        if ((await catFilter.count()) === 0) return;

        const options = await catFilter.locator('option').count();
        if (options < 2) return;

        await catFilter.selectOption({ index: 1 });
        await page.waitForTimeout(2000);
        const rows = await page.locator('#games-table tbody tr').count();
        expect(rows).toBeGreaterThan(0);

        await catFilter.selectOption({ index: 0 });
        await page.waitForTimeout(1500);
    });

    test('pagination', async ({ page }) => {
        const nextBtn = page.locator('#games-next-btn');
        if ((await nextBtn.count()) === 0) return;

        const pageBefore = await page.locator('#games-current-page').textContent();
        if (await nextBtn.isDisabled()) return;
        await nextBtn.click();
        await page.waitForTimeout(1000);
        const pageAfter = await page.locator('#games-current-page').textContent();
        expect(pageAfter).not.toBe(pageBefore);
    });
});

// ═══════════════════════════════════════════════════════════════
//  PROVIDERS PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Providers Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'providers');
        await page.waitForSelector('#providers-table', { timeout: 15000 });
    });

    test('page loads', async ({ page }) => {
        const rows = await page.locator('#providers-table tbody tr').count();
        expect(rows).toBeGreaterThan(0);
    });

    test('provider click opens panel', async ({ page }) => {
        const link = page.locator('[onclick*="showProviderDetails"]').first();
        if ((await link.count()) === 0) return;

        await link.click();
        await page.waitForTimeout(1000);
        expect(await panelVisible(page, 'provider-panel')).toBe(true);
    });

    test('provider panel content', async ({ page }) => {
        const link = page.locator('[onclick*="showProviderDetails"]').first();
        if ((await link.count()) === 0) return;

        await link.click();
        await page.waitForTimeout(1000);
        const content = await page.locator('#provider-panel-content').innerHTML();
        expect(content.length).toBeGreaterThan(100);

        await page.evaluate(() => window.closeAllPanels());
        await page.waitForTimeout(300);
    });

    test('sort', async ({ page }) => {
        const header = page.locator('#providers-table thead th').nth(1);
        await header.click();
        await page.waitForTimeout(1000);
        const rows = await page.locator('#providers-table tbody tr').count();
        expect(rows).toBeGreaterThan(0);
    });

    test('search', async ({ page }) => {
        const search = page.locator('#provider-search');
        if ((await search.count()) === 0) return;

        const beforeRows = await page.locator('#providers-table tbody tr').count();
        await search.fill('pragmatic');
        await page.waitForTimeout(1500);
        const afterRows = await page.locator('#providers-table tbody tr').count();
        expect(afterRows).toBeLessThanOrEqual(beforeRows);

        await search.fill('');
        await page.waitForTimeout(1000);
    });
});

// ═══════════════════════════════════════════════════════════════
//  INSIGHTS PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Insights Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'insights');
        await page.waitForTimeout(3000);
    });

    test('page loads with content', async ({ page }) => {
        const text = await page.locator('#page-container').innerText();
        expect(text.length).toBeGreaterThan(100);
    });

    test('build/avoid/watch cards', async ({ page }) => {
        for (const id of ['insight-build-next', 'insight-avoid', 'insight-watch']) {
            const el = page.locator(`#${id}`);
            if ((await el.count()) > 0) {
                const text = await el.innerText();
                expect(text.length, `${id} should have content`).toBeGreaterThan(10);
            }
        }
    });

    test('franchise section', async ({ page }) => {
        const section = page.locator('#brand-intelligence-section');
        if ((await section.count()) > 0) {
            await expect(section).toBeVisible();
        }
    });

    test('provider intelligence', async ({ page }) => {
        const matrix = page.locator('#provider-theme-matrix');
        if ((await matrix.count()) > 0) {
            const text = await matrix.innerText();
            expect(text.length).toBeGreaterThan(10);
        }
    });

    test('theme landscape chart', async ({ page }) => {
        const canvas = page.locator('#chart-market-landscape');
        if ((await canvas.count()) > 0) {
            const width = await canvas.evaluate(el => el.width);
            expect(width).toBeGreaterThan(0);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  TRENDS PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Trends Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'trends');
        await page.waitForTimeout(3000);
    });

    test('page loads with charts', async ({ page }) => {
        const text = await page.locator('#page-container').innerText();
        expect(text.length).toBeGreaterThan(50);
    });

    test('overall trend chart', async ({ page }) => {
        const canvas = page.locator('#overall-trend-chart');
        if ((await canvas.count()) > 0) {
            const width = await canvas.evaluate(el => el.width);
            expect(width).toBeGreaterThan(0);
        }
    });

    test('theme trend chart', async ({ page }) => {
        const canvas = page.locator('#theme-trend-chart');
        if ((await canvas.count()) > 0) {
            const width = await canvas.evaluate(el => el.width);
            expect(width).toBeGreaterThan(0);
        }
    });

    test('year drill-down', async ({ page }) => {
        const zoomBtns = page.locator('#overall-zoom-btns button');
        if ((await zoomBtns.count()) > 0) {
            await zoomBtns.first().click();
            await page.waitForTimeout(1500);
            const card = page.locator('#year-detail-card');
            if ((await card.count()) > 0) {
                const hidden = await card.evaluate(el => el.classList.contains('hidden'));
                if (!hidden) {
                    const text = await card.innerText();
                    expect(text.length).toBeGreaterThan(10);
                }
            }
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  ART INSIGHTS PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Art Insights Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'art');
        await page.waitForTimeout(4000);
    });

    test('page loads', async ({ page }) => {
        const text = await page.locator('#page-container').innerText();
        expect(text.length).toBeGreaterThan(100);
    });

    test('art opportunity chart', async ({ page }) => {
        const canvas = page.locator('#art-opportunity-chart');
        if ((await canvas.count()) > 0) {
            const width = await canvas.evaluate(el => el.width);
            expect(width).toBeGreaterThan(0);
        }
    });

    test('bar charts render', async ({ page }) => {
        for (const id of ['art-themes-chart', 'art-characters-chart', 'art-elements-chart']) {
            const canvas = page.locator(`#${id}`);
            if ((await canvas.count()) > 0) {
                const width = await canvas.evaluate(el => el.width);
                expect(width, `${id} should render`).toBeGreaterThan(0);
            }
        }
    });

    test('combo heatmap', async ({ page }) => {
        const heatmap = page.locator('#art-combo-heatmap');
        if ((await heatmap.count()) > 0) {
            const text = await heatmap.innerText();
            expect(text.length).toBeGreaterThan(20);
        }
    });

    test('combo dimension picker', async ({ page }) => {
        const picker = page.locator('#art-combo-dim-picker');
        if ((await picker.count()) === 0) return;

        const options = await picker.locator('option').count();
        if (options < 2) return;

        const beforeText = await page.locator('#art-combo-heatmap').innerText();
        await picker.selectOption({ index: 1 });
        await page.waitForTimeout(2000);
        const afterText = await page.locator('#art-combo-heatmap').innerText();
        expect(afterText).not.toBe(beforeText);
    });

    test('landscape charts', async ({ page }) => {
        for (const id of ['art-characters-landscape', 'art-elements-landscape', 'art-colors-landscape']) {
            const canvas = page.locator(`#${id}`);
            if ((await canvas.count()) > 0) {
                const width = await canvas.evaluate(el => el.width);
                expect(width, `${id} should render`).toBeGreaterThan(0);
            }
        }
    });

    test('art trend chart', async ({ page }) => {
        const canvas = page.locator('#art-trend-chart');
        if ((await canvas.count()) > 0) {
            const width = await canvas.evaluate(el => el.width);
            expect(width).toBeGreaterThan(0);
        }
    });

    test('art trend dimension picker', async ({ page }) => {
        const picker = page.locator('#art-trend-dimension');
        if ((await picker.count()) === 0) return;

        const options = await picker.locator('option').count();
        if (options < 2) return;

        await picker.selectOption({ index: 1 });
        await page.waitForTimeout(2000);
        const canvas = page.locator('#art-trend-chart');
        if ((await canvas.count()) > 0) {
            const width = await canvas.evaluate(el => el.width);
            expect(width).toBeGreaterThan(0);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  GAME LAB PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Game Lab Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'game-lab');
        await page.waitForTimeout(2000);
    });

    test('page loads', async ({ page }) => {
        const text = await page.locator('#page-container').innerText();
        expect(text.length).toBeGreaterThan(50);
    });

    test('blueprint tool visible', async ({ page }) => {
        const blueprint = page.locator('#lab-section-blueprint');
        if ((await blueprint.count()) > 0) {
            await expect(blueprint).toBeVisible();
        }
    });

    test('concept tool', async ({ page }) => {
        await page.evaluate(() => window.switchLabTool('concept'));
        await page.waitForTimeout(1500);

        const concept = page.locator('#lab-section-concept');
        if ((await concept.count()) > 0) {
            await expect(concept).toBeVisible();
        }
    });

    test('concept theme chips', async ({ page }) => {
        await page.evaluate(() => window.switchLabTool('concept'));
        await page.waitForTimeout(1500);

        const chips = page.locator('#concept-quick-ideas button, [onclick*="setConceptExample"]');
        if ((await chips.count()) > 0) {
            await chips.first().click();
            await page.waitForTimeout(500);
        }
    });

    test('name generator tool', async ({ page }) => {
        await page.evaluate(() => window.switchLabTool('name-gen'));
        await page.waitForTimeout(1500);

        const nameGen = page.locator('#lab-section-name-gen');
        if ((await nameGen.count()) > 0) {
            await expect(nameGen).toBeVisible();
        }
    });

    test('tab switching', async ({ page }) => {
        const tools = ['concept', 'name-gen', 'blueprint'];
        for (const tool of tools) {
            await page.evaluate(t => window.switchLabTool(t), tool);
            await page.waitForTimeout(1000);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  AI ASSISTANT PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('AI Assistant Page', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'ai-assistant');
        await page.waitForTimeout(2000);
    });

    test('page loads', async ({ page }) => {
        const chat = page.locator('#ai-chat');
        await expect(chat).toBeVisible();
    });

    test('input exists', async ({ page }) => {
        await expect(page.locator('#ai-input')).toBeVisible();
    });

    test('quick question buttons', async ({ page }) => {
        const buttons = page.locator('[onclick*="askAI"]');
        expect(await buttons.count()).toBeGreaterThanOrEqual(2);
    });

    test('send message without crash', async ({ page }) => {
        const input = page.locator('#ai-input');
        await input.fill('What are the top themes?');
        await input.press('Enter');
        await page.waitForTimeout(2000);
        expect(pageErrors).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════
//  TICKETS PAGE
// ═══════════════════════════════════════════════════════════════
test.describe('Tickets Page', () => {
    test('page loads without errors', async ({ page, baseURL }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await login(page, baseURL);
        await navigateTo(page, 'tickets');
        await page.waitForTimeout(1000);

        const content = page.locator('#tickets-content');
        if ((await content.count()) > 0) {
            await expect(content).toBeVisible();
        }
        expect(errors).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════
//  CROSS-PAGE DATA AGREEMENT
// ═══════════════════════════════════════════════════════════════
test.describe('Cross-Page Data Agreement', () => {
    test('theme consistency', async ({ page, baseURL }) => {
        await login(page, baseURL);

        await navigateTo(page, 'themes');
        await page.waitForSelector('#themes-table tbody tr', { timeout: 10000 });
        const themeLink = page.locator('#themes-table tbody tr [data-theme]').first();
        if ((await themeLink.count()) === 0) return;
        const topThemeName = await themeLink.getAttribute('data-theme');

        await navigateTo(page, 'overview');
        await page.waitForTimeout(2000);
        const overviewText = await page.locator('#page-container').innerText();
        expect(overviewText).toContain(topThemeName.trim());
    });

    test('provider consistency', async ({ page, baseURL }) => {
        await login(page, baseURL);

        await navigateTo(page, 'overview');
        await page.waitForTimeout(2000);

        const overviewText = await page.locator('#page-container').innerText();
        expect(overviewText).toContain('TOP PROVIDER');
        const providerMatch = overviewText.match(/TOP PROVIDER.*?\n.*?\n(\w[\w\s&]*)/);
        expect(providerMatch, 'Should find a provider name on overview').toBeTruthy();
    });

    test('game count consistency', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'overview');

        const text = await page.locator('#overview-total-games').textContent();
        const count = Number(text.replace(/,/g, ''));
        expect(count).toBeGreaterThan(2000);
    });

    test('theme #1 matches between overview and themes page', async ({ page, baseURL }) => {
        await login(page, baseURL);

        // Get #1 theme from Themes page
        await navigateTo(page, 'themes');
        await page.waitForSelector('#themes-table tbody tr', { timeout: 10000 });
        const themesTopLink = page.locator('#themes-table tbody tr [data-theme]').first();
        if ((await themesTopLink.count()) === 0) return;
        const themesPageFirst = await themesTopLink.getAttribute('data-theme');

        // Get most popular theme from Overview page
        await navigateTo(page, 'overview');
        await page.waitForTimeout(2000);

        let overviewBestTheme = null;
        const bestThemeCard = page
            .locator('div:has(> div:has-text("Most Popular Theme")) > .text-sm.font-bold')
            .first();
        if (await bestThemeCard.count()) {
            overviewBestTheme = (await bestThemeCard.textContent()).trim();
        }

        expect(themesPageFirst).toBeTruthy();
        if (overviewBestTheme) {
            expect(overviewBestTheme.toLowerCase()).toEqual(themesPageFirst.trim().toLowerCase());
        } else {
            const overviewText = await page.locator('#page-container').innerText();
            expect(overviewText.toLowerCase()).toContain(themesPageFirst.trim().toLowerCase());
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  PANEL INTERACTIONS
// ═══════════════════════════════════════════════════════════════
test.describe('Panel Interactions', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        await login(page, baseURL);
    });

    test('game panel → provider link', async ({ page }) => {
        await navigateTo(page, 'games');
        await page.waitForSelector('#games-table', { timeout: 15000 });

        const gameLink = page.locator('[onclick*="showGameDetails"]').first();
        if ((await gameLink.count()) === 0) return;
        await gameLink.click();
        await page.waitForTimeout(1500);

        const provLink = page.locator('#game-panel [onclick*="showProviderDetails"]').first();
        if ((await provLink.count()) === 0) return;
        await provLink.click();
        await page.waitForTimeout(1000);
        expect(await panelVisible(page, 'provider-panel')).toBe(true);

        await page.evaluate(() => window.closeAllPanels());
        await page.waitForTimeout(300);
    });

    test('theme panel → close', async ({ page }) => {
        await navigateTo(page, 'themes');
        await page.waitForSelector('#themes-table tbody tr', { timeout: 10000 });

        const link = page.locator('#themes-table .theme-link').first();
        if ((await link.count()) === 0) return;
        await link.click();
        await page.waitForTimeout(1000);
        expect(await panelVisible(page, 'theme-panel')).toBe(true);

        await page.evaluate(() => window.closeAllPanels());
        await page.waitForTimeout(500);
        const closed = await page.locator('#theme-panel').evaluate(el => el.style.right !== '0px');
        expect(closed).toBe(true);
    });

    test('mechanic panel content', async ({ page }) => {
        await navigateTo(page, 'mechanics');
        await page.waitForSelector('#mechanics-table tbody tr', { timeout: 10000 });

        const link = page.locator('#mechanics-table .mechanic-link').first();
        if ((await link.count()) === 0) return;
        await link.click();
        await page.waitForTimeout(1000);

        const content = await page.locator('#mechanic-panel-content').innerHTML();
        expect(content.length).toBeGreaterThan(50);

        await page.evaluate(() => window.closeAllPanels());
        await page.waitForTimeout(300);
    });

    test('only one panel at a time', async ({ page }) => {
        await navigateTo(page, 'themes');
        await page.waitForSelector('#themes-table tbody tr', { timeout: 10000 });

        const themeLink = page.locator('#themes-table .theme-link').first();
        if ((await themeLink.count()) === 0) return;
        await themeLink.click();
        await page.waitForTimeout(1000);
        expect(await panelVisible(page, 'theme-panel')).toBe(true);

        await navigateTo(page, 'games');
        await page.waitForSelector('#games-table', { timeout: 15000 });

        const gameLink = page.locator('[onclick*="showGameDetails"]').first();
        if ((await gameLink.count()) === 0) return;
        await gameLink.click();
        await page.waitForTimeout(1500);
        expect(await panelVisible(page, 'game-panel')).toBe(true);

        await page.evaluate(() => window.closeAllPanels());
        await page.waitForTimeout(300);
    });
});

// ═══════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════
test.describe('Navigation', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        await login(page, baseURL);
    });

    test('sidebar links', async ({ page }) => {
        const navItems = page.locator('nav [data-page]');
        const count = await navItems.count();
        expect(count).toBeGreaterThanOrEqual(6);
    });

    test('back/forward', async ({ page }) => {
        await navigateTo(page, 'themes');
        await page.waitForSelector('#themes-table', { timeout: 10000 });

        await navigateTo(page, 'games');
        await page.waitForSelector('#games-table', { timeout: 15000 });

        await page.goBack();
        await page.waitForTimeout(2000);

        const themesVisible = await page
            .locator('#themes-table')
            .isVisible()
            .catch(() => false);
        expect(themesVisible).toBe(true);
    });

    test('direct hash', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}/dashboard.html#art`);
        await page.waitForFunction(
            () => {
                const o = document.getElementById('loading-overlay');
                return !o || o.style.opacity === '0' || !o.offsetParent;
            },
            { timeout: 30000 }
        );
        await page.waitForTimeout(3000);
        const text = await page.locator('#page-container').innerText();
        expect(text.length).toBeGreaterThan(50);
    });

    test('invalid hash falls back to overview', async ({ page, baseURL }) => {
        await page.goto(`${baseURL}/dashboard.html#nonexistent`);
        await page.waitForFunction(
            () => {
                const o = document.getElementById('loading-overlay');
                return !o || o.style.opacity === '0' || !o.offsetParent;
            },
            { timeout: 30000 }
        );
        await page.waitForTimeout(3000);

        const overviewGames = page.locator('#overview-total-games');
        if ((await overviewGames.count()) > 0) {
            const text = await overviewGames.textContent();
            expect(Number(text.replace(/,/g, ''))).toBeGreaterThan(0);
        }
    });
});

// ═══════════════════════════════════════════════════════════════
//  GLOBAL FEATURES
// ═══════════════════════════════════════════════════════════════
test.describe('Global Features', () => {
    test('no NaN/undefined in visible text', async ({ page, baseURL }) => {
        await login(page, baseURL);
        const pagesToCheck = ['overview', 'themes', 'providers', 'games', 'insights'];

        for (const p of pagesToCheck) {
            await navigateTo(page, p);
            await page.waitForTimeout(2500);
            const text = await page.evaluate(() => document.body.innerText);
            const nanMatches = text.match(/\bNaN\b/g);
            expect(nanMatches, `NaN found on ${p} page`).toBeNull();

            const undefMatches = text.match(/\bundefined\b/gi);
            const filtered = (undefMatches || []).filter(m => m === 'undefined');
            expect(filtered.length, `"undefined" found on ${p} page`).toBe(0);
        }
    });

    test('no empty chart canvases on overview', async ({ page, baseURL }) => {
        await login(page, baseURL);
        await navigateTo(page, 'overview');
        await page.waitForTimeout(3000);

        const canvases = page.locator('#page-container canvas');
        const count = await canvases.count();
        for (let i = 0; i < count; i++) {
            const dims = await canvases.nth(i).evaluate(el => ({ w: el.width, h: el.height }));
            expect(dims.w, `Canvas ${i} width`).toBeGreaterThan(0);
            expect(dims.h, `Canvas ${i} height`).toBeGreaterThan(0);
        }
    });

    test('console error sweep', async ({ page, baseURL }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await login(page, baseURL);
        const allPages = ['overview', 'themes', 'mechanics', 'games', 'providers', 'insights', 'trends', 'art'];
        for (const p of allPages) {
            await navigateTo(page, p);
            await page.waitForTimeout(2000);
        }

        expect(errors, `Errors across pages: ${errors.join('; ')}`).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════
//  ADDITIONAL UI INTERACTION TESTS (P8-1)
// ═══════════════════════════════════════════════════════════════
test.describe('UI Interaction Tests', () => {
    test.beforeEach(async ({ page, baseURL }) => {
        pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        await login(page, baseURL);
    });

    test('provider filter on Themes page filters results', async ({ page }) => {
        await navigateTo(page, 'themes');
        const provFilter = page.locator('#themes-filter-provider');
        if ((await provFilter.count()) === 0) return;

        const options = await provFilter.locator('option').count();
        if (options < 2) return;

        const beforeCount = await page.locator('#themes-count').textContent();
        await provFilter.selectOption({ index: 1 });
        await page.waitForTimeout(1500);
        const afterCount = await page.locator('#themes-count').textContent();
        expect(parseInt(afterCount)).toBeLessThan(parseInt(beforeCount));

        await provFilter.selectOption({ index: 0 });
        await page.waitForTimeout(1000);
        const resetCount = await page.locator('#themes-count').textContent();
        expect(parseInt(resetCount)).toBeGreaterThanOrEqual(parseInt(afterCount));
    });

    test('name generator produces results', async ({ page }) => {
        await navigateTo(page, 'game-lab');
        await page.evaluate(() => window.switchLabTool('name-gen'));
        await page.waitForTimeout(2000);

        const themeSelect = page.locator('#ng-theme');
        if ((await themeSelect.count()) === 0) return;

        const options = await themeSelect.locator('option').count();
        if (options < 2) return;

        await themeSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);

        const genBtn = page.locator('#ng-generate');
        if ((await genBtn.count()) === 0) return;
        await genBtn.click();
        await page.waitForTimeout(2000);

        const results = page.locator('#ng-results');
        if ((await results.count()) > 0) {
            const text = await results.textContent();
            expect(text.length).toBeGreaterThan(0);
        }
    });

    test('color distribution chart has adequate height', async ({ page }) => {
        await navigateTo(page, 'art');
        await page.waitForTimeout(3000);

        const container = page.locator('#art-color-tone-chart');
        if ((await container.count()) === 0) return;

        const height = await container.evaluate(el => el.offsetHeight);
        expect(height).toBeGreaterThanOrEqual(300);
    });

    test('category dropdown on Themes page filters', async ({ page }) => {
        await navigateTo(page, 'themes');
        const catFilter = page.locator('#themes-category-filter');
        if ((await catFilter.count()) === 0) return;

        const beforeCount = await page.locator('#themes-count').textContent();
        await catFilter.selectOption('Slot');
        await page.waitForTimeout(1500);
        const afterCount = await page.locator('#themes-count').textContent();
        expect(parseInt(afterCount)).toBeLessThanOrEqual(parseInt(beforeCount));
    });

    test('game lab sub-page header updates', async ({ page }) => {
        await navigateTo(page, 'game-lab');
        const label = page.locator('#lab-active-tool');
        if ((await label.count()) === 0) return;

        await page.evaluate(() => window.switchLabTool('name-gen'));
        await page.waitForTimeout(1000);
        const text = await label.textContent();
        expect(text).toContain('Name Generator');
    });

    test('no purple badge visible on Games page when no category', async ({ page }) => {
        await navigateTo(page, 'games');
        const badge = page.locator('#games-category-label');
        if ((await badge.count()) === 0) return;
        await expect(badge).toBeHidden();
    });
});
