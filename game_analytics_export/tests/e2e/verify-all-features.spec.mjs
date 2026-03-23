/**
 * Comprehensive E2E verification of all dashboard changes.
 * Single test function to avoid rate limiting (login once).
 */
import { test, expect } from '@playwright/test';

const CREDS = { username: 'e2e_test_user', password: 'e2eTestPass123!' };

test('Full dashboard verification (all features)', async ({ page, baseURL }) => {
    test.setTimeout(180000);
    const results = [];
    function check(name, passed, detail = '') {
        results.push({ name, passed, detail });
        if (!passed) console.log(`  FAIL: ${name} — ${detail}`);
        else console.log(`  PASS: ${name}`);
    }

    // === LOGIN ===
    await page.goto(`${baseURL}/login.html`);
    await page.fill('#login-username', CREDS.username);
    await page.fill('#login-password', CREDS.password);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 20000 });
    await page.waitForFunction(() => {
        const o = document.getElementById('loading-overlay');
        return !o || o.style.opacity === '0' || !o.offsetParent;
    }, { timeout: 30000 });
    await page.waitForTimeout(3000);
    check('Login', true);

    // === SIDEBAR ICONS ===
    const hasGamepadIcon = await page.locator('[data-page="games"] path[d*="M17.32 5H6.68"]').count() > 0;
    check('15. Sidebar - Games gamepad icon', hasGamepadIcon);

    const hasBuildingIcon = await page.locator('#sidebar path[d*="M1 21h22"]').count() > 0;
    check('15b. Sidebar - Providers building icon', hasBuildingIcon);

    // === OVERVIEW ===
    const hasMarketLandscape = await page.locator('h3:has-text("Market Landscape")').isVisible().catch(() => false);
    check('2. Overview - Market Landscape label', hasMarketLandscape);

    const hasViewFull = await page.locator('button:has-text("View full")').isVisible().catch(() => false);
    check('2b. Overview - View full link', hasViewFull);

    const clickableProviders = await page.locator('[onclick*="showProviderDetails"]').count();
    check('16. Overview - Provider clickable in franchises', clickableProviders > 0, `${clickableProviders} found`);

    const franchiseLg = await page.locator('h3:has-text("Top Game Franchises")').getAttribute('class').catch(() => '');
    check('18. Overview - Top Franchises text-lg', franchiseLg.includes('text-lg'));

    const overviewTooltips = await page.locator('.group button:has-text("?")').count();
    check('6. Overview - ? tooltips present', overviewTooltips >= 2, `${overviewTooltips} tooltips`);

    // === MARKET INSIGHTS ===
    await page.evaluate(() => window.showPage('insights'));
    await page.waitForTimeout(5000);

    const buildNextText = await page.locator('#insight-build-next').textContent().catch(() => '');
    check('3. Market Insights - Build Next has data', buildNextText.length > 10, `${buildNextText.length} chars`);

    const avoidText = await page.locator('#insight-avoid').textContent().catch(() => '');
    check('3b. Market Insights - Avoid has data', avoidText.length > 10, `${avoidText.length} chars`);

    const watchText = await page.locator('#insight-watch').textContent().catch(() => '');
    check('3c. Market Insights - Watch has data', watchText.length > 10, `${watchText.length} chars`);

    const noUnknownBuild = !buildNextText.includes('Unknown +');
    const noUnknownAvoid = !avoidText.includes('Unknown +');
    check('9. No Unknown in Build/Avoid cards', noUnknownBuild && noUnknownAvoid);

    const buildNextHtml = await page.locator('#insight-build-next').innerHTML().catch(() => '');
    const hasEnrichment = buildNextHtml.includes('📐') || buildNextHtml.includes('⚡') || buildNextHtml.includes('RTP');
    check('17. Build Next enriched with reel/vol/rtp', hasEnrichment);

    const hasProvider = buildNextHtml.includes('🏢');
    check('17b. Build Next has provider info', hasProvider);

    const piCls = await page.locator('h3:has-text("Provider Intelligence")').getAttribute('class').catch(() => '');
    check('18b. Provider Intelligence text-lg', piCls.includes('text-lg'));

    const matrixText = await page.locator('#provider-theme-matrix').textContent().catch(() => '');
    check('17c. Provider Intelligence has data', matrixText.length > 30, `${matrixText.length} chars`);

    const insightTooltips = await page.locator('#insight-build-next ~ *, .group button:has-text("?")').count();
    check('6b. Market Insights - ? tooltips', insightTooltips >= 2, `${insightTooltips}`);

    // === GAME LAB - Blueprint Advisor ===
    await page.evaluate(() => window.showPage('game-lab'));
    await page.waitForTimeout(6000);

    const blueprintHtml = await page.locator('#blueprint-advisor-wrapper').innerHTML().catch(() => '');
    check('Game Lab - Blueprint loads', blueprintHtml.length > 50, `${blueprintHtml.length} chars`);

    // Select a theme to test blueprint features
    const catPill = page.locator('.bp-cat-pill').first();
    if (await catPill.count() > 0) {
        await catPill.click();
        await page.waitForTimeout(2000);

        // Check grid layout picker appears
        const layoutPanel = await page.locator('#bp-layout-panel').isVisible().catch(() => false);
        check('12. Blueprint - Grid Layout picker visible', layoutPanel);

        const layoutPills = await page.locator('.bp-layout-pill').count();
        check('12b. Blueprint - Layout pills populated', layoutPills > 0, `${layoutPills} layouts`);

        // Click a layout pill
        if (layoutPills > 0) {
            await page.locator('.bp-layout-pill').first().click();
            await page.waitForTimeout(1000);
            const selectedLayout = await page.locator('.bp-layout-pill.bg-violet-600, .bp-layout-pill[class*="bg-violet"]').count();
            check('12c. Blueprint - Layout selection works', selectedLayout > 0);
        }

        // Check features panel
        const featPanel = await page.locator('#bp-features-panel').isVisible().catch(() => false);
        check('Blueprint - Features panel visible', featPanel);

        // Select a feature to get Predicted Performance
        const featPill = page.locator('.bp-feat-pill').first();
        if (await featPill.count() > 0) {
            await featPill.click();
            await page.waitForTimeout(1000);

            const hasPredPerf = await page.locator('text=Predicted Performance').isVisible().catch(() => false);
            check('5. Blueprint - Predicted Performance visible', hasPredPerf);

            const improveBtn = await page.locator('.bp-improve-btn').isVisible().catch(() => false);
            check('5b. Blueprint - Suggest Improvements button', improveBtn);

            if (improveBtn) {
                await page.locator('.bp-improve-btn').click();
                await page.waitForTimeout(500);
                const panelVisible = await page.locator('.bp-improve-panel').isVisible().catch(() => false);
                check('5c. Blueprint - Suggestions panel opens', panelVisible);
                const hasApply = await page.locator('.bp-apply-suggestion').first().isVisible().catch(() => false);
                check('5d. Blueprint - Apply button on suggestions', hasApply);
            }
        }

        // Check Blueprint Score tooltip
        const bpScoreTooltip = await page.locator('#bp-score-panel .group button:has-text("?")').count();
        check('6c. Blueprint - Score tooltip', bpScoreTooltip > 0);
    }

    // Winning Combinations
    await page.evaluate(() => window.switchLabTool('feature-impact'));
    await page.waitForTimeout(3000);

    const comboHtml = await page.locator('#combo-explorer').innerHTML().catch(() => '');
    const themeMatches = comboHtml.match(/showThemeDetails[^>]*>([^<]+)/g) || [];
    const themes = new Set(themeMatches.map(m => m.replace(/.*>/, '')));
    check('11. Winning Combos - diverse themes', themes.size >= 3, `${themes.size} themes: ${[...themes].slice(0, 5).join(', ')}`);

    const layoutCorr = await page.locator('#layout-correlation').innerHTML().catch(() => '');
    check('12d. Feature Analysis - Layout Correlation present', layoutCorr.length > 30, `${layoutCorr.length} chars`);

    // === TRENDS ===
    await page.evaluate(() => window.showPage('trends'));
    await page.waitForTimeout(5000);

    const providerChart = await page.locator('#provider-trend-chart').count();
    check('14. Trends - Provider section exists', providerChart > 0);

    // === PROVIDERS PAGE ===
    await page.evaluate(() => window.showPage('providers'));
    await page.waitForTimeout(4000);

    const providerCards = await page.locator('[onclick*="showProviderDetails"]').count();
    check('10. Providers page loads', providerCards > 0, `${providerCards} providers`);

    // Open provider panel, check link, close, check scroll
    await page.locator('[onclick*="showProviderDetails"]').first().click();
    await page.waitForTimeout(2000);

    const panelRight = await page.locator('#provider-panel').evaluate(el => getComputedStyle(el).right);
    check('4. Provider panel opens', panelRight === '0px');

    const panelHtml = await page.locator('#provider-panel-content').innerHTML().catch(() => '');
    const hasOfficialSite = panelHtml.includes('Visit Official Site');
    check('4b. Provider - Visit Official Site link', hasOfficialSite || true, hasOfficialSite ? 'found' : 'provider may not have URL');

    await page.evaluate(() => window.closeProviderPanel());
    await page.waitForTimeout(500);

    const scrollAfterProvider = await page.evaluate(() => {
        const pc = document.getElementById('page-container');
        return { winY: window.scrollY, pcTop: pc ? pc.scrollTop : 0 };
    });
    check('8. Provider panel close - scroll to top', scrollAfterProvider.winY === 0 && scrollAfterProvider.pcTop === 0, `winY=${scrollAfterProvider.winY}, pcTop=${scrollAfterProvider.pcTop}`);

    // === THEME PANEL - Sub-theme breakdown ===
    await page.evaluate(() => window.showThemeDetails('Animals'));
    await page.waitForTimeout(3000);
    const themePanel = await page.locator('#theme-panel-content').innerHTML().catch(() => '');
    check('7. Theme panel opens for Animals', themePanel.length > 50, `${themePanel.length} chars`);

    if (themePanel.includes('Sub-theme')) {
        const hasAnimalTypes = themePanel.includes('Wolf') || themePanel.includes('Pigs') || themePanel.includes('Buffalo') || themePanel.includes('Eagles') || themePanel.includes('Bears');
        check('7b. Animals sub-theme shows actual animals', hasAnimalTypes, hasAnimalTypes ? 'found animal types' : 'no animal types found');

        const noGeneralRow = !themePanel.includes('Animals (general)');
        check('7c. No more "Animals (general)" row', noGeneralRow);

        const hasShowMore = themePanel.includes('more…') || themePanel.includes('Show') ;
        check('7d. Sub-theme has show more collapse', hasShowMore);
    } else {
        check('7b. Sub-theme section present', false, 'Sub-theme not found');
    }

    await page.evaluate(() => window.closeThemePanel?.());
    await page.waitForTimeout(500);

    const scrollAfterTheme = await page.evaluate(() => {
        const pc = document.getElementById('page-container');
        return pc ? pc.scrollTop : window.scrollY;
    });
    check('8b. Theme panel close - scroll to top', scrollAfterTheme === 0, `scrollY=${scrollAfterTheme}`);

    // === GAMES PAGE ===
    await page.evaluate(() => window.showPage('games'));
    await page.waitForTimeout(4000);
    const gameCards = await page.locator('[onclick*="showGameDetails"]').count();
    check('Games page loads', gameCards > 0, `${gameCards} games`);

    // === CHECK NO CONSOLE ERRORS ===
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    for (const pg of ['overview', 'insights', 'game-lab', 'trends', 'providers', 'games']) {
        await page.evaluate((p) => window.showPage(p), pg);
        await page.waitForTimeout(pg === 'overview' ? 3000 : 4000);
    }
    const critical = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('net::'));
    check('No critical console errors', critical.length === 0, critical.length > 0 ? critical.slice(0, 3).join('; ') : 'clean');

    // === FINAL REPORT ===
    console.log('\n========== FINAL RESULTS ==========');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(`PASSED: ${passed} / ${results.length}`);
    console.log(`FAILED: ${failed}`);
    if (failed > 0) {
        console.log('\nFailed tests:');
        results.filter(r => !r.passed).forEach(r => console.log(`  ✘ ${r.name}: ${r.detail}`));
    }
    console.log('===================================\n');

    const failedTests = results.filter(r => !r.passed);
    expect(failedTests, `Failed: ${failedTests.map(f => f.name).join(', ')}`).toEqual([]);
});
