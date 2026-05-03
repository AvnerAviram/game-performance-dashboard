# QA Task: Theme Taxonomy Consolidation Verification

## Context

A Dev agent just completed a theme taxonomy consolidation. The change normalizes `theme_consolidated` from a mixed ~65+ vocabulary (48 art themes + 40 performance themes) down to a clean ~43 industry-standard taxonomy.

## What Changed

1. **New file**: `data/art_theme_consolidation_map.json` -- 48 art theme -> consolidated mappings
2. **Updated**: `data/theme_consolidation_map.json` -- "7s"->"Classic", "Money"->"Money/Gold", "Gold"->"Money/Gold", added Arctic/Branded/Urban passthroughs
3. **Updated**: `scripts/build-parquet.mjs` -- theme resolution now goes through art map first
4. **Updated**: `src/lib/db/duckdb-client.js` -- same resolution logic for DuckDB INSERT path
5. **Updated**: `package.json` build script -- new JSON added to `cp dist/data/` list
6. **Updated**: `tests/unit/validate-duckdb-field-mapping.test.js` -- simulateInsert now includes art_theme branch
7. **New tests**: art theme map contract test, theme count assertions

## Verification Checklist

### 1. Data Integrity (CRITICAL)

Run these checks and report results:

- [ ] `npm run build:data` succeeds with no errors
- [ ] `games_processed.json` row count matches expected valid game count
- [ ] `art_theme` column in built data is UNCHANGED (compare a sample of games)
- [ ] No game that previously had a valid `theme_consolidated` now has "Unknown"
- [ ] Build-time guard catches any unmapped `art_theme` values (test by temporarily adding a fake art_theme to verify it fails)

### 2. Theme Count Verification

- [ ] Count distinct `theme_consolidated` values in `games_processed.json` -- should be ~43 (not 65+)
- [ ] Count distinct `art_theme` values -- should still be ~48 (unchanged)
- [ ] Verify these specific merges happened:
  - No "Asian Temple/Garden" in `theme_consolidated` (should be "Asian")
  - No "Classic Slots" in `theme_consolidated` (should be "Classic")
  - No "7s" in `theme_consolidated` (should be "Classic")
  - No "Money" standalone in `theme_consolidated` (should be "Money/Gold")
  - No "Gold" standalone in `theme_consolidated` (should be "Money/Gold")
  - "Arctic" exists as a consolidated theme
  - "Urban" exists as a consolidated theme
  - "Branded" exists as a consolidated theme

### 3. Mass Balance Check

For each merged theme, verify game counts are conserved:
- Old "7s" count + old "Classic" count + old "Classic Slots" count = new "Classic" count
- Old "Money" count + old "Gold" count + old "Luxury/VIP" count = new "Money/Gold" count
- Old "Asian" count + old "Asian Temple/Garden" count = new "Asian" count

### 4. Test Suite

- [ ] `npm test` -- all tests pass (expected: 1,614+)
- [ ] `npm run format:check` -- passes
- [ ] New art theme contract test exists and passes
- [ ] `validate-duckdb-field-mapping.test.js` `simulateInsert` now includes `art_theme` branch
- [ ] No test is skipped that was previously passing

### 5. Build & Deploy Readiness

- [ ] `npm run build` succeeds (full production build)
- [ ] `art_theme_consolidation_map.json` exists in `dist/data/`
- [ ] Server starts successfully: `node server/server.cjs`

### 6. Visual Verification (Playwright)

Take screenshots and verify:

- [ ] **Market Insights Theme Landscape**: ~43 clean bubbles (no duplicates like "Asian" + "Asian Temple/Garden")
- [ ] **Market Insights Provider Landscape**: unchanged (no regression)
- [ ] **Art Insights Art Themes Landscape**: still shows granular art names (48 values, unchanged)
- [ ] **Overview page**: theme count stat reflects new ~43 number
- [ ] **Hover/tooltip** on theme bubbles still works correctly
- [ ] **Click/drill-down** on theme bubbles opens correct panel

### 7. Resolver Alignment Check

Verify that all three resolver paths produce identical results:
- `build-parquet.mjs` resolver
- `duckdb-client.js` INSERT resolver
- `validate-duckdb-field-mapping.test.js` `simulateInsert`

Pick 5 games with `art_theme` set and 5 without, trace through each path.

### 8. Regression Spots to Check

- [ ] Theme filter dropdowns (if any) show new consolidated names
- [ ] Coverage pills on charts show correct game counts
- [ ] `dimension-filter.cjs` server-side theme matching still works
- [ ] No console errors on any page

## How to Run Visual Checks

Login: `e2e_test_user` / `e2eTestPass123!`
Server: `http://localhost:3000/`

```bash
# Start server
npm run build && node server/server.cjs &

# Take screenshots with Playwright
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:3000/');
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', 'e2e_test_user');
  await page.fill('#login-password', 'e2eTestPass123!');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard.html**');

  // Market Insights
  await page.goto('http://localhost:3000/dashboard.html#insights');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/qa-market-insights.png', fullPage: true });

  // Art Insights
  await page.goto('http://localhost:3000/dashboard.html#art');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/qa-art-insights.png', fullPage: true });

  // Overview
  await page.goto('http://localhost:3000/dashboard.html#overview');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/qa-overview.png', fullPage: false });

  await browser.close();
})();
"
```

## Report Format

Return a structured report:
```
## QA REPORT: Theme Taxonomy Consolidation

### Overall: PASS / FAIL

### Data Integrity: PASS / FAIL
- Details...

### Theme Counts: PASS / FAIL
- Distinct theme_consolidated: X (expected ~43)
- Distinct art_theme: X (expected ~48)

### Test Suite: PASS / FAIL
- Tests passed: X
- Tests failed: X
- New tests verified: Y/N

### Visual Verification: PASS / FAIL
- Screenshots attached at /tmp/qa-*.png
- Issues found: ...

### Regressions Found: NONE / LIST
```
