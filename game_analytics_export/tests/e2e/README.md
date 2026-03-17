# Automated UI Testing

## Overview

This test suite programmatically interacts with your dashboard to check for visual bugs, duplicate content, and data accuracy issues.

## What It Tests

### 🔍 Visual Bug Detection
1. **Duplicate Content Detection**: Checks for repeated text in panels (like the bug you found)
2. **Duplicate List Items**: Ensures no games/themes/mechanics appear twice
3. **Section Duplication**: Verifies headers like "Performance" only appear once

### 📊 Data Accuracy
4. **Top Game Verification**: Confirms top performer displays correctly
5. **Total Count**: Verifies game counts match master JSON
6. **Multiple Panel Opens**: Tests opening panels in sequence for state issues

### ⚙️ Functional Testing
7. **All Pages Load**: Tests navigation to all 10 pages
8. **Panel Interactions**: Opens/closes game and provider panels
9. **Console Errors**: Monitors for JavaScript errors

## Quick Start

```bash
# Option 1: Use the test runner (handles server startup)
./tests/e2e/run-ui-tests.sh

# Option 2: Run manually (make sure server is running first)
python3 -m http.server 8000  # In one terminal
npx playwright test tests/e2e/automated-ui-check.spec.js  # In another
```

## Test Details

### Test 1: Overview Page
- Checks KPI/metric cards for duplicates
- Verifies total game count

### Test 2: Games Side Panel ⚠️ CRITICAL
This is where you found the last duplicate bug.
- Opens game detail panel
- Scans for duplicate consecutive lines
- Verifies each section header appears exactly once
- Tests: Performance, Specs, Theme, Provider, Similar Games

### Test 3: Games List
- Extracts all game names from the list
- Checks for duplicate entries

### Test 4: Provider Panel
- Opens provider detail panel
- Checks for duplicate content

### Test 5: Themes Page
- Verifies no duplicate theme cards

### Test 6: Mechanics Page
- Verifies no duplicate mechanic cards

### Test 7: Data Accuracy - Top Game
- Reads master JSON to find top performer
- Verifies it displays correctly on Games page
- Expected: **Cash Eruption ($43.47M)**

### Test 8: Data Accuracy - Total Count
- Verifies total game count on Overview
- Expected: **486 valid games**

### Test 9: Console Errors
- Monitors browser console for errors
- Tests all 10 pages

### Test 10: Multiple Panel Opens
- Opens 3 different game panels in sequence
- Verifies each has unique content
- Checks for state/caching issues

## Helper Functions

The test suite includes reusable helpers:

```javascript
// Navigate to any page
await navigateToPage(page, 'games');

// Open panels
await openGamePanel(page, 0);  // Open first game
await openProviderPanel(page, 0);  // Open first provider

// Close any panel
await closePanel(page);

// Check for duplicates in text
const duplicates = findDuplicateLines(text);

// Extract clean game names
const name = extractGameName(rawText);
```

## Expected Results

✅ **All 10 tests should pass**, meaning:
- No duplicate content in any panels
- No duplicate items in any lists
- Correct top game displayed (Cash Eruption)
- Correct total count (486 games)
- No console errors
- All pages load successfully

## If Tests Fail

1. **Check the output** - it will show exactly which line was duplicated
2. **Test exit code** - Non-zero means failures
3. **Screenshots** - Playwright can capture screenshots on failure
4. **Manual verification** - If a test fails, manually check that page

## Configuration

Tests run in:
- **Headed mode** by default (you'll see the browser)
- **Chromium** browser
- **3 second wait** for DuckDB to load data
- **1 second waits** between page navigations

## Troubleshooting

**Server not starting?**
```bash
# Check if port 8000 is in use
lsof -ti:8000
# Kill any process using it
kill $(lsof -ti:8000)
```

**Playwright not installed?**
```bash
npm install --save-dev @playwright/test
npx playwright install
```

**Tests timing out?**
- Increase `waitForTimeout` values in the test file
- Check if DuckDB is loading slowly (large dataset)

**False positives?**
- The duplicate detection looks for consecutive identical lines
- Adjust the `findDuplicateLines` function if needed

## Adding New Tests

```javascript
test('Your test name', async ({ page }) => {
  await navigateToPage(page, 'your-page');
  
  // Your test logic here
  const element = await page.locator('.your-selector');
  expect(element).toBeVisible();
  
  console.log('✅ Your test passed');
});
```

## Performance

Tests typically complete in **30-60 seconds** depending on your machine.

## CI/CD Integration

You can integrate this into CI/CD:

```yaml
# Example GitHub Actions
- name: Run UI Tests
  run: |
    python3 -m http.server 8000 &
    npx playwright test tests/e2e/automated-ui-check.spec.js
```

---

**This automated suite replaces manual testing and will catch visual bugs like the duplicate content issue you found previously.**
