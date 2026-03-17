# Testing Guide

## Quick Start

### Run Alignment Tests

```bash
cd game_analytics_export
node tests/alignment/test-alignment-suite.cjs
```

**Expected output:**
```
✅ Passed: 10/10
🎉 SUCCESS: All pages have perfect alignment at X=272px!
```

### View Results

- **Screenshots:** `game_analytics_export/test-results/*.png`
- **JSON Results:** `game_analytics_export/test-results/alignment-test-results.json`

## What the Tests Verify

### Horizontal Alignment
- All 10 page headers align at X=272px (±1px tolerance)
- Consistent left spacing from sidebar edge

### Pages Tested
1. Overview
2. Themes
3. Mechanics
4. Games
5. Providers
6. Anomalies
7. Insights
8. Trends
9. Prediction
10. AI Assistant

## When to Run Tests

✅ **Run tests BEFORE committing if you changed:**
- Page padding/margins
- Header structures
- Component classes (in index.html `<script>` section)
- layout-fixes.css

❌ **Don't need to run tests for:**
- Content changes (text, data)
- Colors (unless changing padding)
- JavaScript logic
- Chart updates

## Test Details

### Technology
- **Playwright**: Browser automation for E2E testing
- **Node.js 20+**: Required for Playwright
- **Headless Chrome**: Fast, automated screenshot capture

### Test Process
1. Clear browser cache (cookies + hard reload)
2. Load dashboard with cache-busting timestamp
3. For each page:
   - Navigate to page
   - Wait 500ms for render
   - Take screenshot
   - Measure H2 X-position
   - Compare to expected (272px)
4. Report results + save screenshots

### Test Duration
- ~11-12 seconds for all 10 pages
- ~1 second per page (including screenshot)

## Troubleshooting

### Tests fail with "net::ERR_CONNECTION_REFUSED"

**Solution:** Start local server first:
```bash
cd /Users/avner/Projects/game-performace-dashboard
python3 -m http.server 8000
```

### Tests show misalignment but browser looks correct

**Solution:** Hard refresh browser (`Cmd + Shift + R`). Browser cache might be showing old version.

### Need to update screenshots

Screenshots are automatically regenerated on each test run with timestamps. Check `test-results/` for latest.

## Adding New Tests

Create new test files in `tests/alignment/`:

```javascript
const { chromium } = require('playwright');

async function myNewTest() {
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext()).newPage();
    
    await page.goto('http://localhost:8000/game_analytics_export/');
    
    // Your test logic here
    
    await browser.close();
}

myNewTest().catch(console.error);
```

## CI/CD Integration

Add to GitHub Actions, Jenkins, etc.:

```yaml
- name: Run Alignment Tests
  run: |
    cd game_analytics_export
    python3 -m http.server 8000 &
    sleep 2
    node tests/alignment/test-alignment-suite.cjs
```

Exit code 0 = pass, 1 = fail.
