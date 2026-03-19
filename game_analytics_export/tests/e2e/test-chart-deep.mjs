import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';

async function main() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

    const errors = [];
    page.on('pageerror', err => errors.push('PAGE_ERR: ' + err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE_ERR: ' + msg.text()); });

    await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('#login-username', 'avner');
    await page.fill('#login-password', 'avner');
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard.html**', { timeout: 15000 });
    await page.waitForSelector('#overview-total-games', { state: 'visible', timeout: 30000 });

    // Navigate to insights
    await page.click('[data-page="insights"]');
    await page.waitForTimeout(6000);

    // Deep chart analysis
    const chartAnalysis = await page.evaluate(() => {
        const canvas = document.getElementById('chart-market-landscape');
        if (!canvas) return { error: 'canvas not found' };
        
        const container = document.getElementById('market-landscape-chart');
        const containerStyle = container ? window.getComputedStyle(container) : null;
        
        let chart;
        try { chart = Chart.getChart(canvas); } catch(e) { return { error: e.message }; }
        if (!chart) return { error: 'no chart instance' };

        const data = chart.data.datasets[0].data;
        const yValues = data.map(d => d.y);
        const xValues = data.map(d => d.x);
        
        return {
            dataPointCount: data.length,
            yMin: Math.min(...yValues),
            yMax: Math.max(...yValues),
            xMin: Math.min(...xValues),
            xMax: Math.max(...xValues),
            yScaleMin: chart.scales.y.min,
            yScaleMax: chart.scales.y.max,
            xScaleType: chart.scales.x.type,
            chartAreaTop: chart.chartArea.top,
            chartAreaBottom: chart.chartArea.bottom,
            chartAreaHeight: chart.chartArea.bottom - chart.chartArea.top,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            canvasDisplayWidth: canvas.offsetWidth,
            canvasDisplayHeight: canvas.offsetHeight,
            containerHeight: container?.offsetHeight,
            containerComputedHeight: containerStyle?.height,
            allPoints: data.map((d, i) => ({ x: d.x, y: d.y.toFixed(2), r: d.r })),
        };
    });

    console.log('=== CHART ANALYSIS ===');
    console.log(`  Points: ${chartAnalysis.dataPointCount}`);
    console.log(`  Y data range: ${chartAnalysis.yMin?.toFixed(2)} - ${chartAnalysis.yMax?.toFixed(2)}`);
    console.log(`  Y scale range: ${chartAnalysis.yScaleMin?.toFixed(2)} - ${chartAnalysis.yScaleMax?.toFixed(2)}`);
    console.log(`  X data range: ${chartAnalysis.xMin} - ${chartAnalysis.xMax}`);
    console.log(`  X scale type: ${chartAnalysis.xScaleType}`);
    console.log(`  Chart area h: ${chartAnalysis.chartAreaHeight}px (top=${chartAnalysis.chartAreaTop}, bottom=${chartAnalysis.chartAreaBottom})`);
    console.log(`  Canvas: ${chartAnalysis.canvasWidth}x${chartAnalysis.canvasHeight} (display: ${chartAnalysis.canvasDisplayWidth}x${chartAnalysis.canvasDisplayHeight})`);
    console.log(`  Container: ${chartAnalysis.containerHeight}px (computed: ${chartAnalysis.containerComputedHeight})`);
    console.log(`  All data points:`);
    if (chartAnalysis.allPoints) {
        chartAnalysis.allPoints.forEach((p, i) => console.log(`    [${i}] x=${p.x}, y=${p.y}, r=${p.r}`));
    }

    // Scroll to chart and take a big screenshot
    await page.evaluate(() => {
        const el = document.getElementById('market-landscape-chart');
        if (el) el.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/e2e/deep-chart-view.png' });

    // Element-level screenshot of the container
    const container = await page.$('#market-landscape-chart');
    if (container) {
        await container.screenshot({ path: 'tests/e2e/deep-chart-container.png' });
        console.log('  Container screenshot saved');
    }

    // Also full-page screenshot at insights level
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Check all sections existence
    const sections = await page.evaluate(() => {
        const ids = ['insight-build-next','insight-avoid','insight-watch','provider-theme-matrix','top-outliers','bottom-outliers'];
        const result = {};
        ids.forEach(id => {
            const el = document.getElementById(id);
            result[id] = el ? { h: el.offsetHeight, children: el.children.length, empty: el.textContent.trim() === '' } : 'NOT FOUND';
        });
        return result;
    });

    console.log('\n=== ALL SECTIONS ===');
    for (const [id, data] of Object.entries(sections)) {
        if (typeof data === 'string') console.log(`  ❌ ${id}: ${data}`);
        else {
            const ok = data.h > 0 && data.children > 0 && !data.empty;
            console.log(`  ${ok ? '✅' : '❌'} ${id}: h=${data.h}, children=${data.children}`);
        }
    }

    console.log('\n=== ERRORS ===');
    if (errors.length) errors.forEach(e => console.log(`  ${e}`));
    else console.log('  None');

    await browser.close();
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
