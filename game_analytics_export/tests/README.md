# Test Suite - Game Analytics Dashboard

Comprehensive test suite with unit, integration, data validation, enforcement, and E2E tests.

## Quick Start

```bash
npm install

npm test              # Vitest (unit + integration + validation + enforcement)
npm run test:smoke    # Playwright E2E smoke test (requires server on :3000)
npm run test:all      # Both: Vitest + Playwright smoke
```

## Test Structure

```
tests/
├── unit/                      # 40 test files – formulas, metrics, fields, rendering, coding standards
├── integration/               # 17 test files – page validation, API, filters, CSV export, security
├── data-validation/           # 8 test files  – game data integrity, rankings, schema, duplicates
├── enforcement/               # 3 test files  – no-inline-aggregation, no-inline-field-access, no-raw-provider-access
├── e2e/                       # Playwright E2E
│   ├── smoke-e2e.spec.mjs     # Comprehensive smoke test (12 areas, ~24s)
│   ├── test-production.mjs    # Production readiness checks
│   └── ...                    # Additional spec/config files
├── alignment/                 # Visual alignment tests (header positioning)
├── components/                # Component class enforcement
├── monitoring/                # Data quality monitor
└── duckdb-enforcement.test.js # DuckDB-only aggregation enforcement
```

## Available Commands

### Vitest (unit / integration / validation / enforcement)

```bash
npm test                    # Run all Vitest tests
npm run test:watch          # Run in watch mode
npm run test:coverage       # Run with coverage report
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:validation     # Data validation tests only
```

### Playwright E2E

```bash
npm run test:smoke          # Comprehensive smoke test (all panels, cross-nav, filters)
npm run test:e2e            # Production readiness E2E checks
npm run test:playwright     # Consolidated Playwright suite
npm run test:alignment      # Visual alignment tests
```

### Run Everything

```bash
npm run test:all            # Vitest + Playwright smoke test
```

## Test Categories

### 1. Unit Tests (40 files)

Located in `tests/unit/`. Covers:

- Ranking formula calculations (Total Theo Win, Weighted Theo Win, Market Share)
- Game field accessors and metric computations
- Feature parsing, theme consolidation, name generation
- Coding standards (Prettier formatting enforcement)
- Source-level enforcement (theme clickability, render patterns)

### 2. Integration Tests (17 files)

Located in `tests/integration/`. Covers:

- Page validation (games, providers, themes, mechanics)
- CSV export accuracy and data integrity
- Filter logic and search functionality
- Security and API interaction patterns

### 3. Data Validation Tests (8 files)

Located in `tests/data-validation/`. Validates `games_dashboard.json` (1,539 games):

- All games have required fields
- Numeric values are valid
- No duplicate game names
- Themes, mechanics, and providers are valid
- Rankings and schema integrity
- DuckDB aggregation consistency

### 4. Enforcement Tests (3 files)

Located in `tests/enforcement/`. Grep-based source scanning that prevents:

- Inline aggregation (must use metrics layer)
- Inline field access (must use `F.*` accessors)
- Raw provider access (must use `F.provider()`)

### 5. E2E Smoke Test

Located in `tests/e2e/smoke-e2e.spec.mjs`. A single Playwright test that exercises 12 interactive areas in a real Chromium browser (~24 seconds):

1. All 6 pages load without JS errors
2. Theme panel opens from themes table
3. Mechanic panel opens from mechanics table
4. Provider panel opens from providers page
5. Game panel opens from games page
6. Cross-panel: theme opens via JS call
7. Cross-panel: provider opens from theme panel
8. Scoped theme panel with clickable breadcrumb title
9. Overview theme cards are clickable
10. Insights theme links are clickable
11. Theme view filter switching
12. Table sorting

**Requires:** Server running on port 3000 (`npm start` in a separate terminal).

## Troubleshooting

**Server not running?**
```bash
npm start    # Starts Express server on port 3000
```

**Playwright not installed?**
```bash
npx playwright install
```

**Port 3000 already in use?**
```bash
lsof -ti:3000 | xargs kill -9
npm start
```

## CI/CD Integration

```yaml
- name: Run tests
  run: |
    npm install
    npm run build
    npm start &
    sleep 3
    npm run test:all
```

## Current Stats

- **853 Vitest tests** across 53 test files (~28s)
- **12-area Playwright smoke test** (~24s)
- **Total `test:all` time:** ~55s
