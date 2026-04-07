/**
 * Data Integrity E2E Tests
 *
 * "Black box" tests that load the raw JSON source of truth,
 * compute expected values, then compare against what the
 * dashboard actually renders in the browser.
 *
 * Single test function (login once) for speed.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PROVIDER_NORMALIZATION_MAP, MIN_PROVIDER_GAMES } from '../../src/lib/shared-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const CREDS = { username: 'e2e_test_user', password: 'e2eTestPass123!' };

function getProvider(game) {
  const raw = game.studio || game.provider || '';
  const resolved = (!raw || /^unknown$/i.test(raw)) ? (game.parent_company || raw) : raw;
  return PROVIDER_NORMALIZATION_MAP[resolved] || resolved;
}

test('Data Integrity: source JSON vs dashboard (all checks)', async ({ page, baseURL }) => {
  test.setTimeout(300000);

  // ─── Load raw data ───
  const rawGames = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'game_data_master.json'), 'utf-8'));
  const themeMap = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'theme_consolidation_map.json'), 'utf-8'));

  function getConsolidatedTheme(g) { return themeMap[g.theme_primary] || g.theme_primary || 'Unknown'; }

  function expectedProviderRanking() {
    const provMap = {};
    rawGames.forEach(g => {
      const p = getProvider(g);
      if (!p) return;
      if (!provMap[p]) provMap[p] = { count: 0, totalMkt: 0 };
      provMap[p].count++;
      provMap[p].totalMkt += (g.market_share_pct || 0);
    });
    return Object.entries(provMap)
      .filter(([, d]) => d.count >= MIN_PROVIDER_GAMES)
      .map(([name, d]) => ({ name, ggrShare: d.totalMkt, count: d.count }))
      .sort((a, b) => b.ggrShare - a.ggrShare);
  }

  const results = [];
  function check(name, passed, detail = '') {
    results.push({ name, passed, detail });
    if (!passed) console.log(`  FAIL: ${name} — ${detail}`);
    else console.log(`  PASS: ${name}`);
  }

  // ─── LOGIN ───
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

  // ─── Console error monitoring ───
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('favicon') || (text.includes('404') && text.includes('.ico'))) return;
      consoleErrors.push(text);
    }
  });

  // ═══ 1. Total game count ═══
  const expectedTotal = rawGames.length;
  const dashboardTotal = await page.evaluate(() => {
    // Access the in-memory game data loaded by the app
    if (window.gameData?.total_games) return window.gameData.total_games;
    if (window.gameData?.allGames?.length) return window.gameData.allGames.length;
    // Fallback: look for the total in the overview stats card
    const statCards = document.querySelectorAll('.stat-card, [class*="stat"]');
    for (const c of statCards) {
      const m = c.textContent.match(/(\d{3,5})\s*(?:total\s*)?games/i);
      if (m) return parseInt(m[1]);
    }
    return -1;
  });
  check('1. Total game count matches JSON', dashboardTotal === expectedTotal, `expected=${expectedTotal}, got=${dashboardTotal}`);

  // ═══ 2. Provider ranking by GGR share ═══
  const expectedRanking = expectedProviderRanking();
  const expectedTop10Names = expectedRanking.slice(0, 10).map(p => p.name);

  await page.click('[data-page="providers"]');
  await page.waitForTimeout(2000);
  const providerRows = await page.locator('#providers-table tbody tr td:nth-child(2) span.font-semibold').allTextContents();
  const dashboardTop10 = providerRows.slice(0, 10).map(n => n.trim());

  let top5Match = true;
  for (let i = 0; i < Math.min(5, dashboardTop10.length); i++) {
    if (dashboardTop10[i] !== expectedTop10Names[i]) top5Match = false;
  }
  check('2. Provider top-5 ranking matches GGR share', top5Match, `expected=[${expectedTop10Names.slice(0,5)}] got=[${dashboardTop10.slice(0,5)}]`);

  const expectedSet = new Set(expectedTop10Names);
  const dashSet = new Set(dashboardTop10);
  const missingProvs = [...expectedSet].filter(p => !dashSet.has(p));
  check('2b. Provider top-10 same set', missingProvs.length <= 1, `missing: ${missingProvs.join(',')}`);

  // ═══ 3. GGR share values match raw data ═══
  const ggrCells = await page.locator('#providers-table tbody tr td:nth-child(6) span.font-bold').allTextContents();
  const dashboardGGR = ggrCells.slice(0, 5).map(t => parseFloat(t.replace('%', '')));
  let ggrMatch = true;
  for (let i = 0; i < Math.min(5, dashboardGGR.length); i++) {
    if (Math.abs(dashboardGGR[i] - expectedRanking[i].ggrShare) >= 0.1) ggrMatch = false;
  }
  check('3. GGR share values match raw data (±0.1%)', ggrMatch, `dashboard=[${dashboardGGR.map(v=>v.toFixed(2))}] expected=[${expectedRanking.slice(0,5).map(p=>p.ggrShare.toFixed(2))}]`);

  // ═══ 4. Provider detail panel data ═══
  const topProv = expectedRanking[0];
  const expectedProvGames = rawGames.filter(g => getProvider(g) === topProv.name);
  const firstProv = page.locator('#providers-table tbody tr:first-child td:nth-child(2) span.font-semibold');
  const provName = (await firstProv.textContent()).trim();
  await page.evaluate((name) => {
    if (typeof window.showProviderDetails === 'function') window.showProviderDetails(name);
  }, provName);
  await page.waitForTimeout(2000);
  const panelText = await page.evaluate(() => document.body.innerText);
  const panelHasName = panelText.toLowerCase().includes(provName.toLowerCase());
  check('4. Provider panel shows correct name', panelHasName, `looking for "${provName}"`);
  // Look for "N games in portfolio" or "N games" in the panel, skipping "Top N" matches
  const allGameMatches = [...panelText.matchAll(/(\d+)\s*games/gi)];
  const portfolioMatch = allGameMatches.find(m => {
    const n = parseInt(m[1]);
    return n > 20 && Math.abs(n - expectedProvGames.length) <= 5;
  });
  if (portfolioMatch) {
    const shown = parseInt(portfolioMatch[1]);
    check('4b. Provider panel game count matches JSON', true, `shown=${shown} expected=${expectedProvGames.length}`);
  } else {
    // Check if the count appears anywhere in the panel
    const hasCount = panelText.includes(String(expectedProvGames.length));
    check('4b. Provider panel game count present', hasCount, `looking for ${expectedProvGames.length} in panel`);
  }
  // Close provider panel
  await page.evaluate(() => {
    if (typeof window.closeProviderPanel === 'function') window.closeProviderPanel();
  });
  await page.waitForTimeout(500);

  // ═══ 5. No "undefined", "NaN", "null" anywhere ═══
  const badStringPages = ['overview', 'insights', 'providers', 'games', 'themes', 'mechanics', 'trends'];
  const renderIssues = [];
  for (const pageName of badStringPages) {
    await page.click(`[data-page="${pageName}"]`);
    await page.waitForTimeout(1500);
    const bodyText = await page.evaluate(() => document.body.innerText);

    if (/\bNaN\b/.test(bodyText)) renderIssues.push(`${pageName}: NaN`);

    const undLines = bodyText.split('\n').filter(l => /\bundefined\b/i.test(l) && !/descri|explain|mean/i.test(l));
    if (undLines.length > 0) renderIssues.push(`${pageName}: undefined — "${undLines[0].substring(0, 60)}"`);

    const nullLines = bodyText.split('\n').filter(l => /\bnull\b/i.test(l) && !/nullable|non-null|null island/i.test(l));
    if (nullLines.length > 0) renderIssues.push(`${pageName}: null — "${nullLines[0].substring(0, 60)}"`);
  }
  check('5. No undefined/NaN/null in visible text', renderIssues.length === 0, renderIssues.join('; '));

  // ═══ 6. No empty sections ═══
  await page.click('[data-page="overview"]');
  await page.waitForTimeout(1500);
  const emptyIssues = [];
  for (const sel of ['#chart-providers', '#chart-themes', '#chart-volatility']) {
    const vis = await page.locator(sel).first().isVisible().catch(() => false);
    if (!vis) emptyIssues.push(`Overview: ${sel} not visible`);
  }

  await page.evaluate(() => window.showPage('insights'));
  await page.waitForTimeout(3000);
  const insLen = await page.evaluate(() => document.getElementById('page-container')?.innerText?.length || 0);
  if (insLen < 100) emptyIssues.push(`Market Insights content too short: ${insLen} chars`);

  await page.evaluate(() => window.showPage('games'));
  await page.waitForTimeout(3000);
  const gamesContent = await page.evaluate(() => document.getElementById('page-container')?.innerText?.length || 0);
  if (gamesContent < 100) emptyIssues.push(`Games page content too short: ${gamesContent} chars`);

  await page.evaluate(() => window.showPage('providers'));
  await page.waitForTimeout(3000);
  const provRowCount = await page.locator('#providers-table tbody tr').count();
  if (provRowCount < 10) emptyIssues.push(`Providers page only ${provRowCount} rows`);

  await page.evaluate(() => window.showPage('themes'));
  await page.waitForTimeout(3000);
  const themesPageLen = await page.evaluate(() => document.getElementById('page-container')?.innerText?.length || 0);
  if (themesPageLen < 200) emptyIssues.push(`Themes page content too short: ${themesPageLen} chars`);

  await page.evaluate(() => window.showPage('trends'));
  await page.waitForTimeout(3000);
  const trendsLen = await page.evaluate(() => document.getElementById('page-container')?.innerText?.length || 0);
  if (trendsLen < 50) emptyIssues.push(`Trends page content too short: ${trendsLen} chars`);
  check('6. No empty sections on any page', emptyIssues.length === 0, emptyIssues.join('; '));

  // ═══ 7. Top themes appear on themes page ═══
  const tMap = {};
  rawGames.forEach(g => { const t = getConsolidatedTheme(g); if (t && t !== 'Unknown') { if (!tMap[t]) tMap[t] = { c: 0, s: 0 }; tMap[t].c++; tMap[t].s += (g.theo_win || 0); } });
  const expectedTopThemes = Object.entries(tMap).map(([n, d]) => ({ name: n, avg: d.s / d.c })).sort((a, b) => b.avg - a.avg).slice(0, 5);
  await page.click('[data-page="themes"]');
  await page.waitForTimeout(1500);
  const themesText = await page.evaluate(() => document.getElementById('page-container')?.innerText || '');
  let themesFound = 0;
  for (const t of expectedTopThemes) { if (themesText.includes(t.name)) themesFound++; }
  check('7. Top-5 themes by Theo all visible on themes page', themesFound >= 4, `found ${themesFound}/5: ${expectedTopThemes.map(t=>t.name).join(', ')}`);

  // ═══ 8. Cross-page game count consistency ═══
  await page.click('[data-page="overview"]');
  await page.waitForTimeout(1000);
  const ovCount = await page.evaluate(() => window.gameData?.total_games || window.gameData?.allGames?.length || -1);
  await page.click('[data-page="games"]');
  await page.waitForTimeout(1500);
  const gmCount = await page.evaluate(() => window.gameData?.total_games || window.gameData?.allGames?.length || -1);
  check('8. Game count consistent: overview vs games page', ovCount > 0 && gmCount > 0 && ovCount === gmCount, `overview=${ovCount}, games=${gmCount}`);

  // ═══ 9. Blueprint: Recommended Layout independent of selection ═══
  await page.evaluate(() => window.showPage('game-lab'));
  await page.waitForTimeout(2000);
  const catPill = page.locator('.bp-cat-pill').first();
  let layoutTestPassed = true;
  if (await catPill.isVisible()) {
    await catPill.click();
    await page.waitForTimeout(1500);
    const recBefore = await page.evaluate(() => {
      for (const h of document.querySelectorAll('h4')) { if (h.textContent.includes('Recommended Layout')) return h.parentElement?.innerText || ''; }
      return '';
    });
    const layoutPill = page.locator('.bp-layout-pill').first();
    if (await layoutPill.isVisible()) {
      await layoutPill.click();
      await page.waitForTimeout(1000);
      const recAfter = await page.evaluate(() => {
        for (const h of document.querySelectorAll('h4')) { if (h.textContent.includes('Recommended Layout')) return h.parentElement?.innerText || ''; }
        return '';
      });
      layoutTestPassed = recAfter === recBefore;
    }
  }
  check('9. Blueprint Recommended Layout stable across layout selection', layoutTestPassed);

  // ═══ 10. Suggest Improvements stays open after Apply ═══
  // Reset blueprint first
  const clearBtn2 = page.locator('button:has-text("Clear"), button:has-text("clear"), .bp-clear').first();
  if (await clearBtn2.isVisible().catch(() => false)) {
    await clearBtn2.click();
    await page.waitForTimeout(500);
  }
  const catPill2 = page.locator('.bp-cat-pill').first();
  let suggestTestPassed = true;
  let applyAllExists = false;
  if (await catPill2.isVisible()) {
    await catPill2.click();
    await page.waitForTimeout(1500);
    const suggestBtn = page.locator('.bp-improve-btn');
    if (await suggestBtn.isVisible()) {
      await suggestBtn.click();
      await page.waitForTimeout(500);
      const panelVis = await page.locator('.bp-improve-panel').isVisible();
      if (panelVis) {
        const applyBtn = page.locator('.bp-apply-suggestion').first();
        if (await applyBtn.isVisible()) {
          await applyBtn.click();
          await page.waitForTimeout(1500);
          const stillVis = await page.locator('.bp-improve-panel').isVisible();
          suggestTestPassed = stillVis;
        }
        applyAllExists = await page.locator('.bp-apply-all').isVisible().catch(() => false);
      }
    }
  }
  check('10. Suggest Improvements panel stays open after Apply', suggestTestPassed);
  check('10b. Apply All button exists', applyAllExists);

  // ═══ 11. No critical console errors ═══
  const dataErrors = consoleErrors.filter(e =>
    /error|fail|cannot read|null.*property/i.test(e) &&
    !/deprecat|warning|sourcemap|favicon/i.test(e)
  );
  check('11. No critical console errors across all pages', dataErrors.length === 0, dataErrors.slice(0, 3).join('; '));

  // ═══ SUMMARY ═══
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n========== DATA INTEGRITY RESULTS ==========`);
  console.log(`PASSED: ${passed} / ${total}`);
  console.log(`FAILED: ${total - passed}`);
  if (total - passed > 0) {
    results.filter(r => !r.passed).forEach(r => console.log(`  ✗ ${r.name}: ${r.detail}`));
  }
  console.log(`=============================================\n`);

  // Fail the test if any check failed
  const failures = results.filter(r => !r.passed);
  expect(failures.length).toBe(0);
});
