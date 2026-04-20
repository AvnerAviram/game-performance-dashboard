#!/usr/bin/env node
/**
 * E2E Sort Consistency Validator
 *
 * Logs into the dashboard, navigates to Overview + detail pages, and
 * verifies the top-ranked items match across pages (Smart Index order).
 * Also checks that data actually renders (no empty tables/charts).
 *
 * Run: node tests/e2e/validate-sort-consistency.mjs
 * Requires: server running on port 3000
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
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
    console.log('\n🔍 E2E Sort Consistency Validator\n');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // LOGIN
    console.log('📋 Logging in...');
    await page.goto(`${BASE}/login.html`);
    await page.fill('#login-username', CREDS.username);
    await page.fill('#login-password', CREDS.password);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 20000 });
    await page.waitForFunction(
        () => {
            const o = document.getElementById('loading-overlay');
            return !o || o.style.opacity === '0' || !o.offsetParent;
        },
        { timeout: 30000 }
    );
    await page.waitForTimeout(3000);
    check('Login successful', true);

    // ─── OVERVIEW: extract top themes and mechanics from charts ───
    console.log('\n📊 Overview page — extracting chart data...');
    await page.evaluate(() => window.showPage('overview'));
    await page.waitForTimeout(2000);

    // Extract themes from gameData (the source used by Overview chart)
    const overviewThemeLabels = await page.evaluate(() => {
        const data = window.gameData;
        if (!data || !data.themes) return [];
        return data.themes.slice(0, 10).map(t => t.Theme || t.theme || '');
    });
    check('gameData.themes has data', overviewThemeLabels.length >= 5, `got ${overviewThemeLabels.length} items`);

    // The mechanics chart labels are only inside the canvas — extract from gameData instead
    const overviewMechanicLabels = await page.evaluate(() => {
        const data = window.gameData;
        if (!data || !data.mechanics) return [];
        return data.mechanics.slice(0, 10).map(m => m.Mechanic || m.mechanic || '');
    });
    check(
        'gameData.mechanics has data',
        overviewMechanicLabels.length >= 5,
        `got ${overviewMechanicLabels.length} items`
    );

    console.log(`   gameData top-5 themes: ${overviewThemeLabels.slice(0, 5).join(', ')}`);
    console.log(`   gameData top-5 mechanics: ${overviewMechanicLabels.slice(0, 5).join(', ')}`);

    // ─── THEMES PAGE: extract table order ───
    console.log('\n📊 Themes page — extracting table data...');
    await page.evaluate(() => window.showPage('themes'));
    await page.waitForSelector('#themes-table tbody tr', { timeout: 10000 });
    await page.waitForTimeout(500);

    const pageThemes = await page.evaluate(() => {
        const rows = document.querySelectorAll('#themes-table tbody tr.theme-row');
        return Array.from(rows)
            .slice(0, 10)
            .map(r => {
                const cells = r.querySelectorAll('td');
                if (cells.length >= 2) {
                    const nameSpan = cells[1].querySelector('span.text-\\[15px\\], span.font-semibold');
                    return nameSpan ? nameSpan.textContent.trim() : cells[1].textContent.trim().split('\n')[0].trim();
                }
                return '';
            })
            .filter(Boolean);
    });
    check('Themes table has data', pageThemes.length >= 5, `got ${pageThemes.length} rows`);
    console.log(`   Themes page top-5: ${pageThemes.slice(0, 5).join(', ')}`);

    // Validate themes sorted by Smart Index (values should decrease)
    const themeSIValues = await page.evaluate(() => {
        const rows = document.querySelectorAll('#themes-table tbody tr');
        return Array.from(rows)
            .slice(0, 10)
            .map(r => {
                const cells = r.querySelectorAll('td');
                for (const cell of cells) {
                    const text = cell.textContent.trim();
                    if (/^\d+\.\d+$/.test(text) && parseFloat(text) > 0) return parseFloat(text);
                }
                return 0;
            });
    });
    const themesSorted = themeSIValues.every((v, i) => i === 0 || v <= themeSIValues[i - 1] + 0.01);
    check(
        'Themes table sorted descending by Smart Index',
        themesSorted,
        `values: ${themeSIValues.map(v => v.toFixed(2)).join(', ')}`
    );

    // ─── MECHANICS PAGE: extract table order ───
    console.log('\n📊 Mechanics page — extracting table data...');
    await page.evaluate(() => window.showPage('mechanics'));
    await page.waitForSelector('#mechanics-table tbody tr', { timeout: 10000 });
    await page.waitForTimeout(500);

    const pageMechanics = await page.evaluate(() => {
        const rows = document.querySelectorAll('#mechanics-table tbody tr');
        return Array.from(rows)
            .slice(0, 10)
            .map(r => {
                const cells = r.querySelectorAll('td');
                if (cells.length >= 2) {
                    const nameSpan = cells[1].querySelector('span');
                    return nameSpan ? nameSpan.textContent.trim() : cells[1].textContent.trim();
                }
                return '';
            })
            .filter(Boolean);
    });
    check('Mechanics table has data', pageMechanics.length >= 5, `got ${pageMechanics.length} rows`);
    console.log(`   Mechanics page top-5: ${pageMechanics.slice(0, 5).join(', ')}`);

    // ─── PROVIDERS PAGE: check table has data ───
    console.log('\n📊 Providers page — verifying data...');
    await page.evaluate(() => window.showPage('providers'));
    await page.waitForTimeout(2000);

    const providerCount = await page.evaluate(() => {
        const rows = document.querySelectorAll('#providers-content table tbody tr, #providers-content .provider-row');
        return rows.length;
    });
    check('Providers page has data', providerCount > 0, `got ${providerCount} providers`);

    // ─── CROSS-PAGE CONSISTENCY: compare Overview vs Page ───
    console.log('\n🔗 Cross-page consistency checks...');

    // gameData is the source of truth for both Overview charts and page tables
    if (overviewThemeLabels.length >= 5 && pageThemes.length >= 5) {
        const top5Match = overviewThemeLabels.slice(0, 5).every((t, i) => t === pageThemes[i]);
        check(
            'gameData themes top-5 matches Themes page table top-5',
            top5Match,
            `gameData: [${overviewThemeLabels.slice(0, 5).join(', ')}] vs Page: [${pageThemes.slice(0, 5).join(', ')}]`
        );
    }

    if (overviewMechanicLabels.length >= 5 && pageMechanics.length >= 5) {
        const top5Match = overviewMechanicLabels.slice(0, 5).every((m, i) => m === pageMechanics[i]);
        check(
            'gameData mechanics top-5 matches Mechanics page table top-5',
            top5Match,
            `gameData: [${overviewMechanicLabels.slice(0, 5).join(', ')}] vs Page: [${pageMechanics.slice(0, 5).join(', ')}]`
        );
    }

    // ─── DATA INTEGRITY: no empty states on any page ───
    console.log('\n📋 Data integrity across pages...');

    const dataPages = ['overview', 'themes', 'mechanics', 'providers', 'games', 'insights'];
    for (const pageName of dataPages) {
        await page.evaluate(n => window.showPage(n), pageName);
        await page.waitForTimeout(1500);

        const hasContent = await page.evaluate(() => {
            const main = document.getElementById('page-container');
            if (!main) return false;
            const text = main.textContent || '';
            return (
                text.length > 200 &&
                !text.includes('Both DuckDB and JSON fallback failed') &&
                !text.includes('No data available')
            );
        });
        check(`${pageName} page has rendered content`, hasContent);
    }

    // ─── FINAL ───
    check('No JS errors during validation', jsErrors.length === 0, jsErrors.join('; '));

    await browser.close();

    console.log('\n' + '═'.repeat(60));
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log('\n❌ Failures:');
        failures.forEach(f => console.log(`   • ${f}`));
    }
    console.log('═'.repeat(60) + '\n');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
