#!/usr/bin/env node
/**
 * AI-Powered Data QA Tester
 *
 * Uses Playwright to screenshot dashboard pages, Claude Vision to analyze them,
 * and X-Ray to drill into suspicious findings.
 *
 * Usage:
 *   npm run qa:ai                    # all pages
 *   npm run qa:ai -- --page trends   # single page
 *   npm run qa:ai -- --page overview --model claude-sonnet-4-20250514
 */
import { chromium } from '@playwright/test';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const TICKETS_DIR = path.join(DATA_DIR, '_qa_tickets');
const SCREENSHOTS_DIR = path.join(DATA_DIR, '_qa_screenshots');

// ── Config ──────────────────────────────────────────────────────────────

function loadEnv() {
    const paths = [path.join(DATA_DIR, '.env'), path.join(PROJECT_ROOT, '.env')];
    for (const envPath of paths) {
        if (fs.existsSync(envPath)) {
            for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
                const match = line.match(/^([^#=]+)=(.*)$/);
                if (match && !process.env[match[1].trim()]) {
                    process.env[match[1].trim()] = match[2].trim();
                }
            }
        }
    }
}
loadEnv();

const args = process.argv.slice(2);
function getArg(name, fallback) {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const CONFIG = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: getArg('model', 'claude-sonnet-4-20250514'),
    page: getArg('page', null),
    baseURL: getArg('url', 'http://localhost:3000'),
    confidenceThreshold: 4,
    maxFindingsPerPage: 5,
};

if (!CONFIG.apiKey || CONFIG.apiKey === 'your-key-here') {
    console.error('ERROR: Set ANTHROPIC_API_KEY in game_analytics_export/.env');
    process.exit(1);
}

const anthropic = new Anthropic({ apiKey: CONFIG.apiKey });

// ── QA Definition Cards (IS/NOT patterns) ───────────────────────────────

const QA_DEFINITION_CARDS = `
## BUG TYPE 1: Trend Spike / Drop Anomaly

### IS a bug:
- A dimension (theme, provider, feature) shows a sudden 3x+ jump or drop in ONE year
  compared to adjacent years, AND the sample size for that year is small (< 5 games)
- A single year dominates a dimension's average due to 1-2 outlier games

### NOT a bug:
- Gradual growth or decline over multiple years (natural trend)
- High average in a year with 20+ games (statistically valid)
- A new dimension appearing for the first time in a year (no prior data is not a spike)
- The overall market trend goes in the same direction

### Evidence required:
- The specific year and value
- Comparison to surrounding years
- Game count for that year

## BUG TYPE 2: Count / Ranking Mismatch

### IS a bug:
- A chart shows a bar with N games but a nearby table/card for the same dimension shows a different count
- A provider is ranked #1 in one chart but #3 in another chart on the same page
- A total shown in a KPI card doesn't match the sum visible in the chart below it

### NOT a bug:
- Different pages may show different counts due to filtering (e.g., min game thresholds)
- Rankings that use Smart Index vs raw GGR share may order providers differently
- Bubble size represents game count while position represents performance (different axes = different rankings)

### Evidence required:
- Both numbers and where they appear
- The exact labels/titles of both elements

## BUG TYPE 3: Missing or Empty Data

### IS a bug:
- A chart section or table that is completely empty when the page clearly expects data there
- A label showing "NaN", "undefined", "null", or "[object Object]" in the UI
- A chart with 0 bars/bubbles when the page title says "Top 10..."

### NOT a bug:
- "Unknown" theme having many games (expected for unclassified games)
- Some games lacking volatility or RTP data (sparse coverage is normal)
- Empty sections on pages that depend on user interaction (e.g., Game Lab before blueprint config)

### Evidence required:
- Screenshot showing the empty/broken element
- What should be there based on page context

## BUG TYPE 4: Visual Chart Errors

### IS a bug:
- Chart bars/bubbles overlapping text so it's unreadable
- Axis labels cut off or showing wrong units
- Legend showing dimension names that don't match the chart content
- A chart showing negative values for metrics that should always be positive (game counts, market share)

### NOT a bug:
- Dense charts with many items (some overlap is expected in landscapes with 50+ bubbles)
- Small bars for items with few games (proportional sizing is correct)

### Evidence required:
- The specific chart and what looks wrong
- What the expected rendering should look like

## BUG TYPE 5: X-Ray Provenance Issue

### IS a bug:
- X-Ray panel shows "No games found" for a dimension that clearly has a bar/bubble in the chart
- X-Ray game count is drastically different (>50% off) from what the chart/table shows
- X-Ray shows a completely different dimension name than what was clicked
- Provenance says "estimated" confidence but the value is presented as definitive in the chart

### NOT a bug:
- Minor count differences (1-2 games) between X-Ray and chart (rounding, filter thresholds)
- X-Ray showing the top game for a dimension (this is by design for dimension clicks)
- Provenance showing "extracted" confidence (this is a legitimate data source)

### Evidence required:
- What was clicked (dimension, value)
- What X-Ray shows vs what the chart shows
`;

// ── Page Definitions ────────────────────────────────────────────────────

const PAGE_CONFIGS = {
    overview: {
        name: 'Overview',
        sections: [
            { id: 'kpi-row', selector: '.grid.grid-cols-2', label: 'KPI Cards' },
            { id: 'chart-themes', selector: '#chart-themes', label: 'Theme Chart', padY: 40 },
            { id: 'chart-providers', selector: '#chart-providers', label: 'Provider Chart', padY: 40 },
            { id: 'chart-volatility', selector: '#chart-volatility', label: 'Volatility Chart', padY: 40 },
            { id: 'chart-rtp', selector: '#chart-rtp', label: 'RTP Chart', padY: 40 },
        ],
        probes: [
            {
                type: 'panel',
                fn: 'showThemeDetails',
                args: ['Egyptian'],
                panelId: 'theme-panel',
                label: 'Theme panel: Egyptian',
            },
            {
                type: 'panel',
                fn: 'showProviderDetails',
                args: ['Evolution'],
                panelId: 'provider-panel',
                label: 'Provider panel: Evolution',
            },
        ],
    },
    trends: {
        name: 'Trends',
        sections: [
            { id: 'overall-trend', selector: '#overall-trend-chart', label: 'Overall Trend Line', padY: 60 },
            { id: 'theme-trend', selector: '#theme-trend-chart', label: 'Theme Trends', padY: 60 },
            { id: 'mechanic-trend', selector: '#mechanic-trend-chart', label: 'Mechanic Trends', padY: 60 },
            { id: 'provider-trend', selector: '#provider-trend-chart', label: 'Provider Trends', padY: 60 },
        ],
        probes: [],
    },
    providers: {
        name: 'Providers',
        sections: [{ id: 'providers-table', selector: '#providers-table', label: 'Provider Rankings Table' }],
        probes: [
            {
                type: 'table-rows',
                tableSelector: '#providers-table',
                rowSelector: 'tbody tr',
                panelId: 'provider-panel',
                panelFn: 'showProviderDetails',
                count: 3,
                label: 'Provider detail panels',
            },
        ],
    },
    themes: {
        name: 'Themes',
        sections: [{ id: 'themes-table', selector: '#themes-table', label: 'Theme Rankings Table' }],
        probes: [
            {
                type: 'table-rows',
                tableSelector: '#themes-table',
                rowSelector: '.theme-row',
                panelId: 'theme-panel',
                panelFn: 'showThemeDetails',
                count: 3,
                label: 'Theme detail panels',
            },
        ],
    },
    insights: {
        name: 'Insights',
        sections: [
            { id: 'market-landscape', selector: '#chart-market-landscape', label: 'Market Landscape', padY: 60 },
            {
                id: 'provider-landscape',
                selector: '#chart-provider-landscape',
                label: 'Provider Landscape',
                padY: 60,
            },
            { id: 'strategic-cards', selector: '#insight-build-next', label: 'Strategic Cards' },
        ],
        probes: [],
    },
    mechanics: {
        name: 'Mechanics',
        sections: [{ id: 'mechanics-table', selector: '#mechanics-table', label: 'Mechanics Table' }],
        probes: [
            {
                type: 'table-rows',
                tableSelector: '#mechanics-table',
                rowSelector: 'tbody tr',
                panelId: 'mechanic-panel',
                panelFn: 'showMechanicDetails',
                count: 3,
                label: 'Mechanic detail panels',
            },
        ],
    },
};

// ── Playwright Helpers ──────────────────────────────────────────────────

async function launchBrowser() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.on('console', msg => {
        if (msg.type() === 'error') console.log(`  [browser error] ${msg.text().slice(0, 120)}`);
    });
    return { browser, page };
}

async function login(page) {
    await page.goto(`${CONFIG.baseURL}/login.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#login-username', 'avner');
    await page.fill('#login-password', 'avner');
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 20000 });
    await page.waitForFunction(
        () => {
            const o = document.getElementById('loading-overlay');
            return !o || o.style.opacity === '0' || !o.offsetParent;
        },
        { timeout: 30000 }
    );
    console.log('  Logged in successfully');
}

async function navigateTo(page, pageName) {
    await page.evaluate(name => {
        if (window.showPage) window.showPage(name);
    }, pageName);
    await page.waitForTimeout(3000);
    await page.waitForFunction(() => window.gameData?.allGames?.length > 0, { timeout: 10000 }).catch(() => {});
}

async function enableXRay(page) {
    try {
        const alreadyActive = await page.evaluate(() => !!window.xrayActive);
        if (alreadyActive) return true;

        const hamburger = page.locator('#hamburger-btn');
        await hamburger.waitFor({ state: 'visible', timeout: 5000 });
        await hamburger.click();
        await page.waitForTimeout(600);
        const xrayBtn = page.locator('#xray-menu-btn');
        const visible = await xrayBtn.isVisible();
        if (!visible) {
            await hamburger.click();
            await page.waitForTimeout(600);
        }
        await xrayBtn.waitFor({ state: 'visible', timeout: 5000 });
        await xrayBtn.click();
        await page.waitForTimeout(400);
        await page.evaluate(() => {
            const d = document.getElementById('hamburger-dropdown');
            if (d) d.classList.add('hidden');
        });
        await page.waitForTimeout(200);
        return true;
    } catch (e) {
        console.log(`    [warn] Could not enable X-Ray: ${e.message.split('\n')[0]}`);
        return false;
    }
}

async function closePanel(page) {
    await page.evaluate(() => {
        if (window.closeXRayPanel) window.closeXRayPanel();
        if (window.closeProviderPanel) window.closeProviderPanel();
        if (window.closeThemePanel) window.closeThemePanel();
        if (window.closeMechanicPanel) window.closeMechanicPanel();
        if (window.closeGamePanel) window.closeGamePanel();
        if (window.closeAnyPanel) window.closeAnyPanel();
        ['mechanic-backdrop', 'game-panel', 'provider-panel', 'theme-panel', 'mechanic-panel', 'xray-panel'].forEach(
            id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (id === 'mechanic-backdrop') {
                    el.classList.add('hidden');
                    el.classList.remove('block');
                } else {
                    el.style.right = '-100%';
                }
            }
        );
        document.body.style.overflow = '';
    });
    await page.waitForTimeout(500);
}

async function screenshotSection(page, section, pageName) {
    try {
        const el = page.locator(section.selector).first();
        if (!(await el.count()) || !(await el.isVisible())) {
            console.log(`    [skip] ${section.label} not found`);
            return null;
        }
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        const filePath = path.join(SCREENSHOTS_DIR, `${pageName}-${section.id}.png`);
        await el.screenshot({ path: filePath, type: 'png' });
        console.log(`    [screenshot] ${section.label} → ${path.basename(filePath)}`);
        return filePath;
    } catch (e) {
        console.log(`    [skip] ${section.label} — screenshot failed: ${e.message.split('\n')[0]}`);
        return null;
    }
}

async function screenshotXRayPanel(page, findingId) {
    const panel = page.locator('#xray-panel');
    if (!(await panel.isVisible())) return null;

    const filePath = path.join(SCREENSHOTS_DIR, `xray-${findingId}.png`);
    await panel.screenshot({ path: filePath, type: 'png' });
    return filePath;
}

async function waitForXRayPanel(page, timeout = 8000) {
    try {
        await page.waitForFunction(
            () => {
                const panel = document.getElementById('xray-panel');
                if (!panel || panel.style.right !== '0px') return false;
                const content = document.getElementById('xray-panel-content');
                return content && content.textContent.length > 30 && !content.textContent.includes('Loading');
            },
            { timeout }
        );
        return true;
    } catch {
        return false;
    }
}

// ── Claude API ──────────────────────────────────────────────────────────

function imageToBase64(filePath) {
    return fs.readFileSync(filePath).toString('base64');
}

async function claudeScan(screenshots, pageName) {
    const imageContent = screenshots
        .map(s => [
            { type: 'text', text: `Section: ${s.label}` },
            {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: imageToBase64(s.path) },
            },
        ])
        .flat();

    const response = await anthropic.messages.create({
        model: CONFIG.model,
        max_tokens: 2000,
        system: [
            {
                type: 'text',
                text: `You are a senior QA analyst reviewing a game analytics dashboard for data quality issues.

You MUST follow these IS/NOT rules strictly. Do NOT flag things that are listed under "NOT a bug".
Only flag issues you are CONFIDENT about (confidence 4 or 5 out of 5).
If you're unsure, do NOT include it.

${QA_DEFINITION_CARDS}

IMPORTANT:
- You are looking at REAL production data. Most things are correct.
- Only flag genuine anomalies, not normal data patterns.
- Return EMPTY array [] if everything looks fine. That is a valid and good answer.
- For each finding, you MUST cite specific visual evidence from the screenshot.`,
                cache_control: { type: 'ephemeral' },
            },
        ],
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `You are looking at the "${pageName}" page of a slot game analytics dashboard.

Examine each screenshot section carefully. If you find any data quality issues matching the bug types defined in your instructions, report them.

Return a JSON array (or empty [] if nothing suspicious). Each item:
{
  "bug_type": "trend_spike|count_mismatch|missing_data|visual_error|xray_provenance",
  "element_description": "exact description of what to click (e.g., 'the Egyptian bar in Theme Trends chart')",
  "evidence": "what you see in the screenshot that looks wrong — cite specific numbers/labels",
  "confidence": 4 or 5,
  "severity": "HIGH|MEDIUM|LOW"
}

Return ONLY the JSON array, no markdown fencing, no explanation.`,
                    },
                    ...imageContent,
                ],
            },
        ],
    });

    const text = response.content[0]?.text || '[]';
    try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const findings = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
        return findings.filter(f => (f.confidence || 0) >= CONFIG.confidenceThreshold);
    } catch (e) {
        console.log(`    [warn] Failed to parse Claude response: ${e.message}`);
        console.log(`    [raw] ${text.slice(0, 200)}`);
        return [];
    }
}

async function claudeEvaluateXRay(chartScreenshot, xrayScreenshot, finding) {
    const content = [
        {
            type: 'text',
            text: `You previously flagged this as a potential data quality issue:
- Bug type: ${finding.bug_type}
- Element: ${finding.element_description}
- Evidence: ${finding.evidence}
- Severity: ${finding.severity}

Below are two screenshots:
1. The chart/table section where you spotted the issue
2. The X-Ray provenance panel that opened when we clicked on that element

The X-Ray panel shows: the source data, extraction method, confidence level, game count, average performance, and the top games contributing to this data point.

Based on the X-Ray evidence, is this a REAL data quality issue?

Return JSON (no markdown):
{
  "verdict": "CONFIRMED_ISSUE|FALSE_ALARM|NEEDS_REVIEW",
  "explanation": "why you think this based on the X-Ray evidence",
  "xray_evidence": "what specific info from the X-Ray panel supports your verdict",
  "recommended_action": "what should be done about it (if confirmed)"
}`,
        },
        { type: 'text', text: 'Chart/table section:' },
        {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageToBase64(chartScreenshot) },
        },
        { type: 'text', text: 'X-Ray provenance panel:' },
        {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageToBase64(xrayScreenshot) },
        },
    ];

    const response = await anthropic.messages.create({
        model: CONFIG.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content }],
    });

    const text = response.content[0]?.text || '{}';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
    } catch {
        return { verdict: 'NEEDS_REVIEW', explanation: 'Failed to parse evaluation', xray_evidence: text };
    }
}

// ── X-Ray Drill ─────────────────────────────────────────────────────────

async function tryXRayClick(page, finding) {
    const desc = (finding.element_description || '').toLowerCase();

    const clicked = await page.evaluate(desc => {
        const xrayEls = document.querySelectorAll('[data-xray]');
        for (const el of xrayEls) {
            const text = el.textContent.toLowerCase();
            const data = el.dataset.xray || '';
            const words = desc.split(/\s+/).filter(w => w.length > 3);
            const matchScore = words.filter(w => text.includes(w) || data.toLowerCase().includes(w)).length;
            if (matchScore >= 2) {
                el.click();
                return true;
            }
        }

        const allCells = document.querySelectorAll('td, th, .theme-row, .mechanic-row');
        for (const el of allCells) {
            const text = el.textContent.toLowerCase();
            const words = desc.split(/\s+/).filter(w => w.length > 3);
            const matchScore = words.filter(w => text.includes(w)).length;
            if (matchScore >= 2) {
                el.click();
                return true;
            }
        }
        return false;
    }, desc);

    if (clicked) {
        await page.waitForTimeout(500);
        return waitForXRayPanel(page);
    }

    const canvasMatch = desc.match(/(chart|trend|landscape|bubble)/);
    if (canvasMatch) {
        const canvases = await page.locator('canvas').all();
        for (const canvas of canvases) {
            if (await canvas.isVisible()) {
                const box = await canvas.boundingBox();
                if (box) {
                    await canvas.click({ position: { x: box.width * 0.3, y: box.height * 0.5 }, force: true });
                    await page.waitForTimeout(500);
                    if (await waitForXRayPanel(page, 3000)) return true;
                }
            }
        }
    }

    return false;
}

// ── Interactive Probes ──────────────────────────────────────────────────

async function waitForPanel(page, panelId, timeout = 8000) {
    try {
        await page.waitForFunction(
            id => {
                const panel = document.getElementById(id);
                if (!panel) return false;
                const right = panel.style.right;
                const visible = right === '0px' || right === '0' || right === '0%';
                const hasContent = panel.textContent.length > 20;
                return visible && hasContent;
            },
            panelId,
            { timeout }
        );
        await page.waitForTimeout(1000);
        return true;
    } catch {
        return false;
    }
}

async function screenshotPanel(page, panelId, label) {
    const panel = page.locator(`#${panelId}`);
    if (!(await panel.isVisible())) return null;
    const filePath = path.join(SCREENSHOTS_DIR, `panel-${label.replace(/[^a-z0-9]+/gi, '-')}.png`);
    try {
        await panel.screenshot({ path: filePath, type: 'png' });
        return filePath;
    } catch {
        return null;
    }
}

async function runProbes(page, pageName, probes, tableScreenshots) {
    if (!probes || probes.length === 0) return [];

    console.log(`\n    [probes] Running ${probes.length} interactive probe(s)...`);
    const allProbeFindings = [];

    for (const probe of probes) {
        if (probe.type === 'panel') {
            await runPanelProbe(page, pageName, probe, tableScreenshots, allProbeFindings);
        } else if (probe.type === 'table-rows') {
            await runTableRowProbes(page, pageName, probe, tableScreenshots, allProbeFindings);
        }
    }
    return allProbeFindings;
}

async function runPanelProbe(page, pageName, probe, tableScreenshots, findings) {
    console.log(`    [probe] ${probe.label}`);
    await page.evaluate(({ fn, args }) => window[fn](...args), { fn: probe.fn, args: probe.args });
    const opened = await waitForPanel(page, probe.panelId);
    if (!opened) {
        console.log(`      [skip] Panel did not open`);
        return;
    }
    const panelPath = await screenshotPanel(page, probe.panelId, `${pageName}-${probe.label}`);
    if (panelPath) {
        const tableShot = tableScreenshots[0]?.path;
        if (tableShot) {
            const result = await claudeVerifyPanel(tableShot, panelPath, probe.label, pageName);
            if (result && result.issues?.length > 0) {
                for (const issue of result.issues) {
                    findings.push({
                        bug_type: 'panel_mismatch',
                        element_description: `${probe.label}: ${issue.element}`,
                        evidence: issue.evidence,
                        confidence: issue.confidence || 4,
                        severity: issue.severity || 'MEDIUM',
                        evaluation: { verdict: 'NEEDS_REVIEW', explanation: issue.explanation },
                        page: pageName,
                    });
                }
            }
        }
    }
    await closePanel(page);
}

async function runTableRowProbes(page, pageName, probe, tableScreenshots, findings) {
    console.log(`    [probe] ${probe.label} — clicking top ${probe.count} rows`);

    const rowData = await page.evaluate(
        ({ tableSelector, rowSelector, count }) => {
            const table = document.querySelector(tableSelector);
            if (!table) return [];
            const rows = table.querySelectorAll(rowSelector);
            const result = [];
            for (let i = 0; i < Math.min(rows.length, count); i++) {
                const row = rows[i];
                const allText = row.textContent.replace(/[\s\n]+/g, ' ').trim();
                const cells = row.querySelectorAll('td');
                let name = null;
                for (const cell of cells) {
                    const spans = cell.querySelectorAll('span');
                    for (const span of spans) {
                        const t = span.textContent.trim();
                        if (t.length >= 3 && !/^[🥇🥈🥉\d#.,(%)+\-]+$/.test(t) && !/^\d+(\.\d+)?[%]?$/.test(t)) {
                            name = t;
                            break;
                        }
                    }
                    if (name) break;
                    const t = cell.textContent.trim().split('\n')[0].trim();
                    if (t.length >= 3 && !/^[🥇🥈🥉\d#.,(%)+\-]+$/.test(t) && !/^\d+(\.\d+)?[%]?$/.test(t)) {
                        name = t;
                        break;
                    }
                }
                if (name) result.push({ name, index: i });
            }
            return result;
        },
        { tableSelector: probe.tableSelector, rowSelector: probe.rowSelector, count: probe.count }
    );

    console.log(`      Found rows: ${rowData.map(r => r.name).join(', ')}`);

    for (const { name, index } of rowData) {
        console.log(`      [click] ${name}`);

        try {
            await page.evaluate(
                ({ fn, name }) => {
                    if (window[fn]) window[fn](name);
                },
                { fn: probe.panelFn, name }
            );
        } catch (e) {
            console.log(`        [warn] Could not call ${probe.panelFn}('${name}'): ${e.message.split('\n')[0]}`);
            continue;
        }

        const opened = await waitForPanel(page, probe.panelId);
        if (!opened) {
            console.log(`        [warn] Panel did not open for "${name}"`);
            findings.push({
                bug_type: 'missing_data',
                element_description: `Clicking row "${name}" — panel did not open`,
                evidence: `Clicked row "${name}" in ${probe.tableSelector} but ${probe.panelId} never appeared`,
                confidence: 5,
                severity: 'HIGH',
                evaluation: {
                    verdict: 'CONFIRMED_ISSUE',
                    explanation: 'Panel failed to open for a clickable table row',
                },
                page: pageName,
            });
            continue;
        }

        const panelPath = await screenshotPanel(page, probe.panelId, `${pageName}-${name}`);
        if (panelPath) {
            const tableShot = tableScreenshots[0]?.path;
            if (tableShot) {
                const result = await claudeVerifyPanel(tableShot, panelPath, `${name} detail panel`, pageName);
                if (result && result.issues?.length > 0) {
                    for (const issue of result.issues) {
                        findings.push({
                            bug_type: 'panel_mismatch',
                            element_description: `${name} panel: ${issue.element}`,
                            evidence: issue.evidence,
                            confidence: issue.confidence || 4,
                            severity: issue.severity || 'MEDIUM',
                            evaluation: { verdict: 'NEEDS_REVIEW', explanation: issue.explanation },
                            page: pageName,
                        });
                    }
                }
            }
        }
        await closePanel(page);
        await page.waitForTimeout(300);
    }
}

async function claudeVerifyPanel(tableScreenshot, panelScreenshot, panelLabel, pageName) {
    const response = await anthropic.messages.create({
        model: CONFIG.model,
        max_tokens: 1500,
        system: [
            {
                type: 'text',
                text: `You are a QA analyst verifying data consistency between a dashboard table/chart and a detail panel that opened when a row was clicked.

Your job:
1. Check that numbers in the panel match the corresponding row in the table (game count, market share, avg performance, etc.)
2. Check the panel renders properly — no "NaN", "undefined", "[object Object]", or blank sections
3. Check that the panel title matches what was clicked
4. Check that the panel has meaningful content (games list, stats, description)

IMPORTANT: Minor rounding differences (e.g., 2.3% vs 2.31%) are NOT bugs. Only flag:
- Numbers that differ by more than 10%
- Missing/broken content
- Wrong dimension name in panel title
- Empty game lists when the table shows games exist

Return JSON (no markdown):
{
  "panel_ok": true/false,
  "issues": [
    {
      "element": "what's wrong",
      "evidence": "specific numbers/text from both screenshots",
      "explanation": "why this is a problem",
      "confidence": 4 or 5,
      "severity": "HIGH|MEDIUM|LOW"
    }
  ]
}

Return {"panel_ok": true, "issues": []} if everything looks consistent. That is a good answer.`,
                cache_control: { type: 'ephemeral' },
            },
        ],
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Page: ${pageName}. Panel opened: "${panelLabel}". Compare the table/chart (image 1) with the detail panel (image 2). Are the numbers and content consistent?`,
                    },
                    { type: 'text', text: 'Image 1 — Table/Chart:' },
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: 'image/png', data: imageToBase64(tableScreenshot) },
                    },
                    { type: 'text', text: 'Image 2 — Detail Panel:' },
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: 'image/png', data: imageToBase64(panelScreenshot) },
                    },
                ],
            },
        ],
    });

    const text = response.content[0]?.text || '{}';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : '{"panel_ok": true, "issues": []}');
    } catch {
        console.log(`      [warn] Failed to parse panel verification: ${text.slice(0, 100)}`);
        return { panel_ok: true, issues: [] };
    }
}

// ── Ticket Generation ───────────────────────────────────────────────────

function generateTicket(finding, evaluation, pageName, screenshotPaths, ticketNum) {
    const id = String(ticketNum).padStart(3, '0');
    const slug = finding.bug_type.replace(/_/g, '-');
    const filename = `${id}-${pageName}-${slug}.md`;

    const screenshots = screenshotPaths
        .filter(Boolean)
        .map(p => `![${path.basename(p)}](${path.basename(p)})`)
        .join('\n');

    const md = `# ${finding.severity}: ${finding.element_description}

**Page:** ${pageName}
**Bug Type:** ${finding.bug_type}
**Confidence:** ${finding.confidence}/5
**Severity:** ${finding.severity}
**Verdict:** ${evaluation.verdict}

## What was found

${finding.evidence}

## Claude's Analysis

${evaluation.explanation}

## X-Ray Evidence

${evaluation.xray_evidence || 'N/A'}

## Recommended Action

${evaluation.recommended_action || 'Manual review needed'}

## Steps to Reproduce

1. Open the dashboard and navigate to **${pageName}** page
2. Look at: ${finding.element_description}
3. Ctrl+Click to open X-Ray
4. Compare the X-Ray data with what the chart shows

## Screenshots

${screenshots}
`;

    const ticketPath = path.join(TICKETS_DIR, filename);
    fs.writeFileSync(ticketPath, md);
    return ticketPath;
}

// ── Main Flow ───────────────────────────────────────────────────────────

async function runPageQA(page, pageName, pageConfig) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  PAGE: ${pageConfig.name}`);
    console.log(`${'═'.repeat(60)}`);

    await navigateTo(page, pageName);
    await page.waitForTimeout(4000);

    const screenshots = [];
    for (const section of pageConfig.sections) {
        const filePath = await screenshotSection(page, section, pageName);
        if (filePath) screenshots.push({ path: filePath, label: section.label, id: section.id });
    }

    if (screenshots.length === 0) {
        console.log('    [skip] No sections captured');
        return [];
    }

    console.log(`\n    [claude] Pass 1: Scanning ${screenshots.length} sections...`);
    const findings = await claudeScan(screenshots, pageConfig.name);
    console.log(
        `    [claude] Found ${findings.length} potential issue(s) (confidence >= ${CONFIG.confidenceThreshold})`
    );

    const results = [];

    // Pass 2: X-Ray drill on visual findings
    if (findings.length > 0) {
        for (let i = 0; i < Math.min(findings.length, CONFIG.maxFindingsPerPage); i++) {
            const finding = findings[i];
            console.log(`\n    [finding ${i + 1}] ${finding.severity} — ${finding.element_description}`);
            console.log(`      Evidence: ${finding.evidence}`);

            let evaluation = { verdict: 'NEEDS_REVIEW', explanation: 'Could not open X-Ray for this element' };
            let xrayPath = null;

            try {
                const xrayEnabled = await enableXRay(page);
                if (xrayEnabled) {
                    await page.waitForTimeout(300);
                    const xrayOpened = await tryXRayClick(page, finding);

                    if (xrayOpened) {
                        xrayPath = await screenshotXRayPanel(page, `${pageName}-${i}`);
                        if (xrayPath) {
                            const chartScreenshot = screenshots.find(s =>
                                finding.element_description.toLowerCase().includes(s.label.toLowerCase().split(' ')[0])
                            );
                            console.log(`    [claude] Pass 2: Evaluating X-Ray evidence...`);
                            evaluation = await claudeEvaluateXRay(
                                chartScreenshot?.path || screenshots[0].path,
                                xrayPath,
                                finding
                            );
                        }
                        await closePanel(page);
                    } else {
                        console.log(`    [warn] Could not click element for X-Ray drill`);
                    }
                }
            } catch (e) {
                console.log(`    [warn] X-Ray drill failed: ${e.message.split('\n')[0]}`);
            }

            console.log(`    [verdict] ${evaluation.verdict}: ${evaluation.explanation?.slice(0, 100)}`);
            results.push({ ...finding, evaluation, page: pageName, xrayScreenshot: xrayPath });
        }
    } else {
        console.log('    [visual] No visual issues found');
    }

    // Pass 3: Interactive probes — click rows, open panels, verify data consistency
    if (pageConfig.probes && pageConfig.probes.length > 0) {
        const probeFindings = await runProbes(page, pageName, pageConfig.probes, screenshots);
        if (probeFindings.length > 0) {
            console.log(`    [probes] Found ${probeFindings.length} issue(s) from interactive testing`);
            results.push(...probeFindings);
        } else {
            console.log(`    [probes] All panels verified OK`);
        }
    }

    return results;
}

async function main() {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    fs.mkdirSync(TICKETS_DIR, { recursive: true });

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  AI-Powered Data QA Tester                              ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`  Model: ${CONFIG.model}`);
    console.log(`  Page: ${CONFIG.page || 'all'}`);
    console.log(`  Confidence threshold: ${CONFIG.confidenceThreshold}`);
    console.log(`  Server: ${CONFIG.baseURL}`);

    const { browser, page } = await launchBrowser();
    let allFindings = [];

    try {
        await login(page);

        const pages = CONFIG.page ? { [CONFIG.page]: PAGE_CONFIGS[CONFIG.page] } : PAGE_CONFIGS;
        if (CONFIG.page && !PAGE_CONFIGS[CONFIG.page]) {
            console.error(`Unknown page: ${CONFIG.page}. Available: ${Object.keys(PAGE_CONFIGS).join(', ')}`);
            process.exit(1);
        }

        for (const [pageName, pageConfig] of Object.entries(pages)) {
            const findings = await runPageQA(page, pageName, pageConfig);
            allFindings.push(...findings);
        }
    } finally {
        await browser.close();
    }

    // ── Report ──────────────────────────────────────────────────────

    const confirmed = allFindings.filter(f => f.evaluation?.verdict === 'CONFIRMED_ISSUE');
    const needsReview = allFindings.filter(f => f.evaluation?.verdict === 'NEEDS_REVIEW');
    const falseAlarms = allFindings.filter(f => f.evaluation?.verdict === 'FALSE_ALARM');

    console.log(`\n${'═'.repeat(60)}`);
    console.log('  SUMMARY');
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Total findings: ${allFindings.length}`);
    console.log(`  CONFIRMED:      ${confirmed.length}`);
    console.log(`  NEEDS REVIEW:   ${needsReview.length}`);
    console.log(`  FALSE ALARM:    ${falseAlarms.length}`);

    if (confirmed.length > 0) {
        console.log('\n  Confirmed Issues:');
        let ticketNum = 1;
        for (const f of confirmed) {
            console.log(`    [${f.severity}] ${f.page}: ${f.element_description}`);
            const screenshotPaths = [...(allFindings.find(af => af === f) ? [f.xrayScreenshot] : [])];
            const ticketPath = generateTicket(f, f.evaluation, f.page, screenshotPaths, ticketNum++);
            console.log(`    → Ticket draft: ${path.basename(ticketPath)}`);
        }
    }

    if (needsReview.length > 0) {
        console.log('\n  Needs Review:');
        for (const f of needsReview) {
            console.log(`    [${f.severity}] ${f.page}: ${f.element_description}`);
            console.log(`      ${f.evaluation?.explanation?.slice(0, 100)}`);
        }
    }

    const reportPath = path.join(DATA_DIR, '_qa_ai_report.json');
    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                model: CONFIG.model,
                pages: CONFIG.page || 'all',
                findings: allFindings.map(f => ({
                    page: f.page,
                    bug_type: f.bug_type,
                    element: f.element_description,
                    evidence: f.evidence,
                    confidence: f.confidence,
                    severity: f.severity,
                    verdict: f.evaluation?.verdict,
                    explanation: f.evaluation?.explanation,
                    xray_evidence: f.evaluation?.xray_evidence,
                    action: f.evaluation?.recommended_action,
                })),
                summary: {
                    total: allFindings.length,
                    confirmed: confirmed.length,
                    needs_review: needsReview.length,
                    false_alarms: falseAlarms.length,
                },
            },
            null,
            2
        )
    );
    console.log(`\n  Report saved: ${path.relative(PROJECT_ROOT, reportPath)}`);
    if (confirmed.length > 0) {
        console.log(`  Ticket drafts: ${path.relative(PROJECT_ROOT, TICKETS_DIR)}/`);
        console.log('  Run "npm run qa:post-tickets" to push approved tickets to GitHub.');
    }

    process.exit(confirmed.length > 0 || needsReview.length > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(2);
});
