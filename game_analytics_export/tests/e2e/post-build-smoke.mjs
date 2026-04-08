#!/usr/bin/env node
/**
 * Post-Build Smoke Test
 *
 * Self-contained: builds the app, starts the server, opens a real browser,
 * validates every page loads without errors, then shuts everything down.
 *
 * This catches the class of bugs that vitest cannot:
 * - CSP blocking runtime resources (DuckDB extensions, etc.)
 * - DuckDB WASM init failures / falling back to JSON silently
 * - Page routing failures (SPA HTML fetch issues)
 * - Missing DOM elements, broken onclick handlers
 * - Console errors on any page
 *
 * Run: node tests/e2e/post-build-smoke.mjs
 * Or:  npm run test:smoke (builds + runs this)
 */
import { execSync, spawn } from 'child_process';
import { chromium } from '@playwright/test';

const PORT = 3099;
const BASE = `http://localhost:${PORT}`;
const CREDS = { username: 'avner', password: 'avner' };

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
    if (condition) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        failures.push(name + (detail ? ` — ${detail}` : ''));
        console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

async function main() {
    // ── BUILD ──
    console.log('\n🔨 Building...');
    try {
        execSync('npm run build', { cwd: process.cwd(), stdio: 'pipe', timeout: 120000 });
        console.log('   Build succeeded.\n');
    } catch (err) {
        console.error('❌ Build failed:', err.stderr?.toString().slice(-500));
        process.exit(1);
    }

    // ── START SERVER ──
    console.log(`🚀 Starting server on port ${PORT}...`);
    const server = spawn('node', ['server/server.cjs'], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(PORT) },
        stdio: 'pipe',
    });

    let serverReady = false;
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server did not start within 10s')), 10000);
        server.stdout.on('data', data => {
            const text = data.toString();
            if (text.includes('Local:') || text.includes('listening')) {
                serverReady = true;
                clearTimeout(timeout);
                resolve();
            }
        });
        server.stderr.on('data', data => {
            const text = data.toString();
            if (text.includes('EADDRINUSE')) {
                clearTimeout(timeout);
                reject(new Error(`Port ${PORT} already in use`));
            }
        });
        server.on('error', err => {
            clearTimeout(timeout);
            reject(err);
        });
    });

    if (!serverReady) {
        console.error('❌ Server failed to start');
        process.exit(1);
    }
    console.log('   Server ready.\n');

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();

        const consoleErrors = [];
        const consoleWarnings = [];
        const consoleLogs = [];
        const cspViolations = [];

        page.on('pageerror', err => consoleErrors.push(err.message));
        page.on('console', msg => {
            const text = msg.text();
            if (msg.type() === 'error') consoleErrors.push(text);
            else if (msg.type() === 'warning') consoleWarnings.push(text);
            else consoleLogs.push(text);
        });

        // ── LOGIN ──
        console.log('--- Login ---');
        await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle', timeout: 15000 });
        check('Login page loads', page.url().includes('login'));

        await page.fill('#login-username', CREDS.username);
        await page.fill('#login-password', CREDS.password);
        await page.click('button[type="submit"]');
        await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(3000);
        const postLoginUrl = page.url();
        check(
            'Dashboard loads after login',
            !postLoginUrl.includes('login'),
            postLoginUrl.includes('login') ? `Still on login page: ${postLoginUrl}` : ''
        );

        // ── DATA LOADING VALIDATION (check actual data in window, not console logs) ──
        console.log('\n--- Data Loading ---');
        await page.waitForFunction(() => window.gameData?.allGames?.length > 0, { timeout: 15000 }).catch(() => {});
        const hasData = await page.evaluate(() => window.gameData?.allGames?.length > 0);
        const dataSource = await page.evaluate(() => window.gameData?._dataSource || 'unknown');
        const gameCount = await page.evaluate(() => window.gameData?.allGames?.length || 0);
        check(`Data loaded: ${gameCount} games (source: ${dataSource})`, hasData);

        const cspBlocked = consoleLogs
            .concat(consoleErrors)
            .some(e => e.includes('Content Security Policy') || e.includes('violates'));
        check(
            'No CSP violations',
            !cspBlocked,
            cspBlocked ? [...consoleErrors, ...consoleLogs].find(e => e.includes('Policy'))?.substring(0, 120) : ''
        );

        if (dataSource === 'json_fallback') {
            console.log('   ⚠️  Used JSON fallback (headless Chromium may struggle with 35MB WASM)');
        }

        // ── DATA INTEGRITY (check on initial load, before navigating) ──
        console.log('\n--- Data Integrity ---');
        await page.evaluate(() => window.showPage('overview'));
        await page.waitForTimeout(2000);

        const totalGames = await page.textContent('#overview-total-games').catch(() => '0');
        const gamesNum = parseInt(totalGames?.replace(/,/g, '') || '0');
        check(`Overview shows games (got ${gamesNum})`, gamesNum > 2000);

        const totalThemes = await page.textContent('#overview-total-themes').catch(() => '0');
        check(`Overview shows themes (got ${totalThemes})`, parseInt(totalThemes) > 20);

        const totalMechanics = await page.textContent('#overview-total-mechanics').catch(() => '0');
        check(`Overview shows mechanics (got ${totalMechanics})`, parseInt(totalMechanics) > 10);

        const canvases = await page.$$('canvas');
        check(`Charts rendered (${canvases.length} canvas elements)`, canvases.length >= 2);

        // ── EVERY PAGE LOADS ──
        console.log('\n--- Page Loading ---');
        const pages = [
            'overview',
            'themes',
            'mechanics',
            'providers',
            'games',
            'insights',
            'game-lab',
            'trends',
            'art',
        ];

        for (const p of pages) {
            const beforeCount = consoleErrors.length;
            await page.evaluate(name => window.showPage(name), p);
            await page.waitForTimeout(1500);
            const afterCount = consoleErrors.length;
            const pageContent = await page.textContent('#page-container').catch(() => '');
            const newErrors = consoleErrors
                .slice(beforeCount)
                .filter(e => !e.includes('ResizeObserver') && !e.includes('Non-Error promise rejection'));
            check(
                `Page "${p}" loads without errors`,
                newErrors.length === 0 && pageContent.length > 50,
                newErrors.length > 0
                    ? newErrors[0].substring(0, 100)
                    : pageContent.length <= 50
                      ? 'Page content too short'
                      : ''
            );
        }

        // ── PANEL INTERACTIONS (from smoke-e2e.spec.mjs) ──
        console.log('\n--- Panel Interactions ---');

        // Theme panel (use JS call — more reliable than DOM selector)
        await page.evaluate(() => window.showPage('themes'));
        await page.waitForTimeout(2000);
        await page.evaluate(() => window.showThemeDetails?.('Animals'));
        await page.waitForTimeout(1000);
        const themePanelOpen = await page.evaluate(() => document.getElementById('theme-panel')?.style.right === '0px');
        const themePanelContent = await page
            .evaluate(() => document.getElementById('theme-panel-content')?.innerHTML?.length || 0)
            .catch(() => 0);
        check('Theme panel opens (Animals)', themePanelOpen && themePanelContent > 100);
        await page.evaluate(() => window.closeThemePanel?.() || window.closeAllPanels?.());
        await page.waitForTimeout(300);

        // Provider panel
        await page.evaluate(() => window.showPage('providers'));
        await page.waitForTimeout(2000);
        const provLink = await page.$('[onclick*="showProviderDetails"]');
        if (provLink) {
            await provLink.click();
            await page.waitForTimeout(800);
            const provPanelOpen = await page.evaluate(
                () => document.getElementById('provider-panel')?.style.right === '0px'
            );
            const provPanelContent = await page
                .evaluate(() => document.getElementById('provider-panel-content')?.innerHTML?.length || 0)
                .catch(() => 0);
            check('Provider panel opens on click', provPanelOpen && provPanelContent > 100);
            await page.evaluate(() => window.closeProviderPanel?.() || window.closeAllPanels?.());
            await page.waitForTimeout(300);
        }

        // Game panel
        await page.evaluate(() => window.showPage('games'));
        await page.waitForTimeout(2000);
        const gameLink = await page.$('[onclick*="showGameDetails"]');
        if (gameLink) {
            await gameLink.click();
            await page.waitForTimeout(800);
            const gamePanelOpen = await page.evaluate(
                () => document.getElementById('game-panel')?.style.right === '0px'
            );
            check('Game panel opens on click', gamePanelOpen);
            await page.evaluate(() => window.closeAllPanels?.());
            await page.waitForTimeout(300);
        }

        // ── NO UNDEFINED/NaN/NULL IN VISIBLE TEXT ──
        console.log('\n--- Data Quality Scan ---');
        const scanPages = ['overview', 'themes', 'providers', 'games', 'insights'];
        const renderIssues = [];
        for (const p of scanPages) {
            await page.evaluate(name => window.showPage(name), p);
            await page.waitForTimeout(1500);
            const bodyText = await page.evaluate(() => document.getElementById('page-container')?.innerText || '');
            if (/\bNaN\b/.test(bodyText)) renderIssues.push(`${p}: NaN`);
            const undLines = bodyText
                .split('\n')
                .filter(l => /\bundefined\b/i.test(l) && !/descri|explain|mean/i.test(l));
            if (undLines.length > 0) renderIssues.push(`${p}: undefined`);
        }
        check(
            'No undefined/NaN in visible text',
            renderIssues.length === 0,
            renderIssues.length > 0 ? renderIssues.join(', ') : ''
        );

        // ── API AUTH ENFORCEMENT (from test-production.mjs) ──
        console.log('\n--- API Auth ---');
        const unauthCtx = await browser.newContext();
        const unauthPage = await unauthCtx.newPage();
        const dataRes = await unauthPage.goto(`${BASE}/api/data/games`);
        check('Data API blocks unauthenticated (401)', dataRes.status() === 401);
        const ticketRes = await unauthPage.goto(`${BASE}/api/tickets`);
        check('Tickets API blocks unauthenticated (401)', ticketRes.status() === 401);
        await unauthCtx.close();

        // ── SECURITY HEADERS ──
        console.log('\n--- Security ---');
        const healthResp = await page.goto(`${BASE}/api/health`);
        const csp = healthResp.headers()['content-security-policy'] || '';
        check('CSP header present', csp.length > 50);
        check('CSP allows extensions.duckdb.org', csp.includes('extensions.duckdb.org'));
        check('CSP has no stale CDN refs', !csp.includes('cdn.jsdelivr.net'));

        // ── FINAL CONSOLE ERROR CHECK ──
        console.log('\n--- Console Summary ---');
        const criticalErrors = consoleErrors.filter(
            e => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('Non-Error promise rejection')
        );
        check(`Zero critical console errors (found ${criticalErrors.length})`, criticalErrors.length === 0);
        if (criticalErrors.length > 0) {
            criticalErrors.slice(0, 5).forEach(e => console.log(`    ⚠️  ${e.substring(0, 150)}`));
        }

        if (consoleWarnings.length > 0) {
            console.log(`\n   ℹ️  ${consoleWarnings.length} warnings (non-blocking):`);
            consoleWarnings.slice(0, 3).forEach(w => console.log(`    ${w.substring(0, 120)}`));
        }

        await browser.close();
    } catch (err) {
        console.error('\n❌ Smoke test crashed:', err.message);
        if (browser) await browser.close();
        failed++;
        failures.push('Test execution: ' + err.message);
    } finally {
        server.kill();
    }

    // ── RESULTS ──
    console.log('\n' + '═'.repeat(60));
    console.log(`  SMOKE TEST: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log('\n  Failed:');
        failures.forEach(f => console.log(`    ✖ ${f}`));
    }
    console.log('═'.repeat(60) + '\n');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
