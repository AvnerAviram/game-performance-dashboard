const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * Comprehensive Alignment Test Suite
 * Tests all 10 pages for consistent header alignment
 * Run: node test-alignment-suite.cjs
 */

async function runAlignmentTests() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    
    // Aggressive cache bypass
    await context.clearCookies();
    await page.goto('http://localhost:8000/game_analytics_export/?nocache=' + Date.now(), {
        waitUntil: 'networkidle'
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    
    console.log('\n' + '='.repeat(70));
    console.log('🧪 COMPREHENSIVE ALIGNMENT TEST SUITE');
    console.log('='.repeat(70) + '\n');
    
    const allPages = [
        { id: 'overview', name: 'Overview' },
        { id: 'themes', name: 'Themes' },
        { id: 'mechanics', name: 'Mechanics' },
        { id: 'games', name: 'Games' },
        { id: 'providers', name: 'Providers' },
        { id: 'anomalies', name: 'Anomalies' },
        { id: 'insights', name: 'Insights' },
        { id: 'trends', name: 'Trends' },
        { id: 'prediction', name: 'Prediction' },
        { id: 'ai-assistant', name: 'AI Assistant' }
    ];
    
    const results = {
        passed: [],
        failed: [],
        measurements: [],
        timestamp: new Date().toISOString()
    };
    
    const EXPECTED_X = 272;
    const TOLERANCE = 1;
    
    for (const pageInfo of allPages) {
        await page.evaluate((id) => window.showPage(id), pageInfo.id);
        await page.waitForTimeout(500);
        
        // Take screenshot
        const screenshotPath = path.join(__dirname, 'test-results', `${pageInfo.id}-header.png`);
        await page.screenshot({ 
            path: screenshotPath,
            clip: { x: 0, y: 0, width: 1200, height: 250 }
        });
        
        // Measure
        const measure = await page.evaluate((id) => {
            const pageDiv = document.getElementById(id);
            const h2 = pageDiv?.querySelector('h2');
            const h2Rect = h2?.getBoundingClientRect();
            const pageStyles = window.getComputedStyle(pageDiv);
            
            return {
                h2Left: h2Rect?.left || 0,
                h2Top: h2Rect?.top || 0,
                paddingLeft: pageStyles.paddingLeft,
                marginLeft: pageStyles.marginLeft
            };
        }, pageInfo.id);
        
        const diff = Math.abs(measure.h2Left - EXPECTED_X);
        const passed = diff <= TOLERANCE;
        
        const result = {
            id: pageInfo.id,
            name: pageInfo.name,
            h2Left: measure.h2Left,
            h2Top: measure.h2Top,
            paddingLeft: measure.paddingLeft,
            marginLeft: measure.marginLeft,
            diff,
            passed
        };
        
        results.measurements.push(result);
        
        if (passed) {
            results.passed.push(pageInfo.name);
            console.log(`✅ ${pageInfo.name.padEnd(15)} → ${measure.h2Left}px ✓`);
        } else {
            results.failed.push(pageInfo.name);
            console.log(`❌ ${pageInfo.name.padEnd(15)} → ${measure.h2Left}px (expected ${EXPECTED_X}px, diff: ${diff}px)`);
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`✅ Passed: ${results.passed.length}/10`);
    console.log(`❌ Failed: ${results.failed.length}/10`);
    
    if (results.failed.length === 0) {
        console.log('\n🎉 SUCCESS: All pages have perfect alignment at X=272px!');
    } else {
        console.log('\n⚠️  FAILURES:');
        results.failed.forEach(name => console.log(`   - ${name}`));
    }
    
    console.log('\n📸 Screenshots saved to: test-results/');
    console.log('='.repeat(70) + '\n');
    
    // Save results
    fs.writeFileSync(
        path.join(__dirname, 'test-results', 'alignment-test-results.json'),
        JSON.stringify(results, null, 2)
    );
    
    await browser.close();
    return results.failed.length === 0;
}

// Create test-results directory if it doesn't exist
const testResultsDir = path.join(__dirname, 'test-results');
if (!fs.existsSync(testResultsDir)) {
    fs.mkdirSync(testResultsDir, { recursive: true });
}

// Run tests
runAlignmentTests()
    .then(passed => {
        process.exit(passed ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
