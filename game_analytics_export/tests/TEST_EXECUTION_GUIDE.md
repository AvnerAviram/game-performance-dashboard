# Test Execution Guide

## Overview

This guide explains how to run the comprehensive test suite that validates 100% data accuracy across all 10 dashboard pages.

## Test Architecture

The test suite consists of 4 layers of validation:

```
Layer 1: JSON Baseline Tests
    ↓
Layer 2: DuckDB Aggregation Tests
    ↓
Layer 3: UI Rendering Tests (10 pages)
    ↓
Layer 4: E2E Visual Tests
```

## Prerequisites

- Node.js >= 16.0.0
- npm or yarn
- Modern browser (for E2E tests)

## Installation

```bash
cd game_analytics_export
npm install
```

## Test Commands

### Run All Tests

```bash
npm run test:all
```

This runs both Vitest tests (unit + integration) and Playwright E2E tests.

### Run Unit Tests Only

```bash
npm run test:unit
```

Tests formula calculations, utilities, and business logic.

### Run Integration Tests Only

```bash
npm run test:integration
```

Tests UI rendering, filters, and data display.

### Run Data Validation Tests Only

```bash
npm run test:validation
```

Tests JSON baseline and DuckDB aggregations.

### Run E2E Tests Only

```bash
npm run test:e2e
```

Tests complete user flows across all pages.

### Run Tests in Watch Mode

```bash
npm run test:watch
```

Automatically re-runs tests when files change.

### Run Tests with UI

```bash
npm run test:ui
```

Opens Vitest UI for interactive test exploration.

### Run E2E Tests with Visible Browser

```bash
npm run test:e2e:headed
```

Runs E2E tests with browser window visible.

### Generate Coverage Report

```bash
npm run test:coverage
```

Generates detailed coverage report in `coverage/` directory.

## Test Structure

```
tests/
├── utils/                          # Test utilities
│   ├── json-aggregator.js         # Manual aggregation functions
│   ├── html-parser.js             # HTML parsing utilities
│   └── test-data-generator.js     # Mock data generators
│
├── data-validation/               # Layer 1 & 2
│   ├── validate-json-baseline.test.js
│   ├── validate-duckdb-aggregations.test.js
│   ├── validate-games.test.js
│   └── validate-rankings.test.js
│
├── unit/                          # Unit tests
│   ├── formulas.test.js
│   ├── formulas-comprehensive.test.js
│   ├── sorting-validation.test.js
│   └── ui-functions.test.js
│
├── integration/                   # Layer 3 - UI tests
│   ├── validate-overview-page.test.js
│   ├── validate-themes-page.test.js
│   ├── validate-mechanics-page.test.js
│   ├── validate-games-page.test.js
│   ├── validate-providers-page.test.js
│   ├── validate-anomalies-page.test.js
│   ├── validate-insights-page.test.js
│   ├── validate-trends-page.test.js
│   ├── validate-prediction-page.test.js
│   ├── validate-ai-assistant-page.test.js
│   ├── filters.test.js
│   ├── filters-comprehensive.test.js
│   └── csv-export.test.js
│
├── e2e/                           # Layer 4 - E2E tests
│   ├── e2e-all-pages.spec.js
│   ├── e2e-data-consistency.spec.js
│   └── e2e-cross-page.spec.js
│
├── monitoring/                     # Data quality monitoring
│   └── data-quality-monitor.test.js
│
└── setup.js                       # Test setup file
```

## Test Coverage

### Coverage Thresholds

The test suite enforces strict coverage requirements:

- **Lines**: 95%
- **Functions**: 95%
- **Branches**: 90%
- **Statements**: 95%

### Excluded from Coverage

- `node_modules/`
- `tests/` (test files themselves)
- `*.config.js` (configuration files)
- `src/interactions.js` (event handlers tested in E2E)

## What Gets Tested

### Layer 1: JSON Baseline (validate-json-baseline.test.js)

- ✅ Schema validation (all 501 games have required fields)
- ✅ Data type validation (strings, numbers, objects)
- ✅ Value ranges (RTP 0-100, theo_win 0-200, etc.)
- ✅ No duplicates, missing values, or invalid entries
- ✅ Baseline statistics calculation

**Tests**: 20+ tests  
**Purpose**: Establish "source of truth" for all subsequent validation

### Layer 2: DuckDB Aggregations (validate-duckdb-aggregations.test.js)

- ✅ Overview stats (total games, theme count, mechanic count)
- ✅ Theme distribution (game counts, averages, market share)
- ✅ Mechanic distribution
- ✅ Provider distribution
- ✅ Anomalies (high/low performers)
- ✅ Game filtering (by provider, mechanic, theme, search)
- ✅ Smart Index calculation

**Tests**: 50+ tests  
**Purpose**: Verify DuckDB calculations against manual JavaScript aggregations

### Layer 3: UI Rendering (10 page tests)

#### 3A. Overview Page (validate-overview-page.test.js)
- ✅ Quick stats display
- ✅ Top 10 themes table
- ✅ Comparison cards (6 cards)
- ✅ Charts rendering

#### 3B. Themes Page (validate-themes-page.test.js)
- ✅ All themes displayed
- ✅ Sorting by Smart Index
- ✅ Filter tabs (All, Market Leaders, Opportunities, Premium)
- ✅ Search functionality
- ✅ Column sorting

#### 3C. Mechanics Page (validate-mechanics-page.test.js)
- ✅ All mechanics displayed
- ✅ Filter tabs
- ✅ Sorting and search

#### 3D. Games Page (validate-games-page.test.js)
- ✅ All 501 games displayed
- ✅ Pagination (50/100/500 per page)
- ✅ Filters and search

#### 3E. Providers Page (validate-providers-page.test.js)
- ✅ All providers displayed
- ✅ Game counts match DuckDB
- ✅ Provider detail panels

#### 3F. Anomalies Page (validate-anomalies-page.test.js)
- ✅ Top 25 high performers
- ✅ Bottom 30 low performers
- ✅ Card display

#### 3G. Insights Page (validate-insights-page.test.js)
- ✅ Market Leaders
- ✅ Opportunity Finder
- ✅ Calculations use real data

#### 3H. Trends Page (validate-trends-page.test.js)
- ✅ Performance trends 2021-2025
- ✅ Charts rendering

#### 3I. Prediction Page (validate-prediction-page.test.js)
- ✅ Form elements
- ✅ Predictions use real data

#### 3J. AI Assistant Page (validate-ai-assistant-page.test.js)
- ✅ Chat interface
- ✅ Data access

**Tests**: 96+ tests  
**Purpose**: Verify UI displays data correctly from DuckDB

### Layer 4: E2E Visual Tests

#### 4A. All Pages Navigation (e2e-all-pages.spec.js)
- ✅ Navigate through all 10 pages
- ✅ No console errors
- ✅ Data tables populate
- ✅ Screenshots for visual regression

#### 4B. Data Consistency (e2e-data-consistency.spec.js)
- ✅ Detail panels show correct data
- ✅ Filters update counts correctly
- ✅ Sorting maintains data integrity

#### 4C. Cross-Page Validation (e2e-cross-page.spec.js)
- ✅ Total game count consistent (501)
- ✅ Same game has same data everywhere
- ✅ Aggregations match detailed counts

**Tests**: 15+ scenarios  
**Purpose**: Catch visual issues and verify cross-page consistency

### Additional Tests

#### Formula Tests (formulas-comprehensive.test.js)
- ✅ Smart Index formula with edge cases
- ✅ Market share calculations
- ✅ Average calculations
- ✅ Floating point precision

#### Filter Tests (filters-comprehensive.test.js)
- ✅ Provider filters
- ✅ Mechanic filters
- ✅ Theme filters
- ✅ Search (case-insensitive, partial matches)
- ✅ Multiple filter combinations
- ✅ Sorting (all columns)

#### Data Quality Monitor (data-quality-monitor.test.js)
- ✅ No negative values
- ✅ No NaN or Infinity
- ✅ Valid ranges
- ✅ No missing data
- ✅ Data source is DuckDB

**Total Tests**: 200+ tests across all layers

## Interpreting Results

### Success Criteria

✅ **All tests pass** - No failing tests  
✅ **95% coverage** - Meets coverage thresholds  
✅ **Zero discrepancies** - JSON → DuckDB → UI all match  
✅ **No hard-coded values** - All data from games_master.json  
✅ **Cross-page consistency** - Same data everywhere  

### Common Issues

#### 1. DuckDB Initialization Timeout

**Error**: Test timeout waiting for DuckDB  
**Solution**: Increase `testTimeout` in vitest.config.js or ensure DuckDB WASM loads properly

#### 2. Floating Point Precision

**Error**: Expected 12.34, received 12.3399999  
**Solution**: Tests use tolerance (±0.01) for float comparisons

#### 3. Fetch API in Tests

**Error**: fetch is not defined  
**Solution**: Tests mock fetch or use `setup.js` to polyfill

#### 4. DOM Not Available

**Error**: document is not defined  
**Solution**: Ensure vitest.config.js has `environment: 'jsdom'`

## Debugging Failed Tests

### 1. Run Single Test File

```bash
npm test -- tests/data-validation/validate-json-baseline.test.js
```

### 2. Run Single Test

```bash
npm test -- -t "should calculate Smart Index correctly"
```

### 3. Enable Debug Output

```bash
DEBUG=* npm test
```

### 4. Run E2E Tests in Debug Mode

```bash
npm run test:e2e:debug
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:all
      - run: npm run test:coverage
```

## Performance

- **Unit tests**: ~5-10 seconds
- **Integration tests**: ~15-30 seconds
- **E2E tests**: ~1-2 minutes
- **Full suite**: ~2-3 minutes

## Maintenance

### Adding New Tests

1. Create test file in appropriate directory
2. Import utilities from `tests/utils/`
3. Follow existing test patterns
4. Run tests to verify
5. Check coverage impact

### Updating Coverage Thresholds

Edit `vitest.config.js`:

```javascript
thresholds: {
  lines: 95,
  functions: 95,
  branches: 90,
  statements: 95
}
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## Support

For issues or questions:
1. Check test logs for error details
2. Review this guide for common solutions
3. Run tests in debug mode for more info
4. Check coverage report for gaps

---

**Last Updated**: 2026-02-04  
**Test Suite Version**: 1.0.0
