# Testing Assessment – Game Analytics Dashboard

**Date:** Feb 5, 2025  
**Status:** Tests are broken; infrastructure needs repair before adding more tests.

---

## Executive Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| **npm test** | ❌ Broken | Runs Playwright only; loads Vitest files → fails |
| **Vitest** | ❌ Not installed | Unit/integration tests require it |
| **Unit tests** | ⚠️ Would work | Pure math; no DuckDB/browser |
| **Integration tests** | ❌ Would fail | Depend on `loadGameData()` / DuckDB (browser-only) |
| **Data validation** | ❌ Would fail | Wrong file names (`games_complete`), DuckDB in Node |
| **E2E (Playwright)** | ❌ Broken | Config picks up all files; many specs are one-offs |
| **CI** | ❌ Fails | `npm test` fails |

---

## 1. What’s Broken

### 1.1 Test Runner Mismatch

- **`npm test`** runs `playwright test` (Playwright is the default).
- Unit/integration/data-validation tests use **Vitest** (`*.test.js`).
- **Vitest is not in `package.json`** → `Cannot find module 'vitest'`.
- Playwright loads the whole `tests/` tree, including `*.test.js` → Vitest tests fail under Playwright.

### 1.2 Playwright Picking Up Wrong Files

- `playwright.config.js`: `testDir: './tests'` → all subdirs.
- Playwright runs both `*.spec.js` (E2E) and `*.test.js` (Vitest).
- Vitest tests fail; Playwright also reports `test.describe() not expected here` (likely duplicate Playwright versions).

### 1.3 Outdated / Wrong Data References

| Test | Issue |
|------|--------|
| `validate-games.test.js` | Imports `games_complete.json` – **file does not exist** (project uses `games_master.json`). |
| `validate-duckdb-aggregations.test.js` | Hardcodes `total_games === 501`; actual count is ~1000. |
| `validate-duckdb-aggregations.test.js` | Imports `duckdb-client.js` – uses Worker, Blob, `window` → **does not run in Node**. |

### 1.4 Browser-Only Code in Node Tests

- `loadGameData()` and `data.js` use DuckDB WASM (browser).
- `duckdb-client.js` uses `Worker`, `Blob`, `URL.createObjectURL`, `window` → Node cannot run it.
- Integration tests (`csv-export.test.js`, `validate-rankings.test.js`) call `loadGameData()` → they **cannot run in Node as-is**.

### 1.5 E2E Test Proliferation

- **~80+ Playwright specs** in `tests/e2e/`, many one-off diagnostics:
  - `v149-data-check.spec.js`, `v151-final-visual.spec.js`, `v154-final-test.spec.js`, …
  - `FINAL-PROOF-TEST.spec.js`, `SHOW-ME-THE-REAL-VERSION.spec.js`, …
  - `analyze-broken-pages.spec.js`, `diagnose-*.spec.js`, …
- Hardcoded URLs: `http://localhost:8000/game_analytics_export/` vs `baseURL: http://localhost:8000` (depends on serve root).
- Canonical E2E suite: `dashboard-navigation.spec.js` (13 tests).

### 1.6 Root-Level Test Scripts

- Many ad-hoc scripts in `tests/`: `CHECK-*.js`, `REPRO-*.js`, `DEBUG-*.js`, `TEST-*.js`, etc.
- Not wired into any test runner; mix of manual and legacy scripts.

---

## 2. What Actually Works (Conceptually)

| Test Type | File(s) | Would work if… |
|-----------|---------|-----------------|
| **Unit: formulas** | `unit/formulas.test.js`, `unit/formulas-comprehensive.test.js` | Vitest installed; no external deps. |
| **Unit: sorting** | `unit/sorting-validation.test.js` | Vitest installed; may need data file path fixes. |
| **Unit: ui-functions** | `unit/ui-functions.test.js` | Vitest installed; needs review for DOM/browser deps. |
| **E2E: dashboard** | `e2e/dashboard-navigation.spec.js` | Playwright config scoped to real E2E specs only. |

---

## 3. Data File Reality

- **Only** `data/games_master.json` exists.
- No `games_complete.json`.
- Tests that reference `games_complete` will fail until updated.

---

## 4. Recommendations

### Phase 1: Make Tests Run (Infrastructure)

1. **Install Vitest**
   ```bash
   npm i -D vitest jsdom
   ```

2. **Split test commands**
   - Vitest: `test:unit`, `test:integration`, `test:validation`, `test:vitest` (all Vitest).
   - Playwright: `test:e2e` (only E2E).

3. **Update Playwright config**
   - `testMatch: ['**/*.spec.js']` so Playwright ignores `*.test.js`.
   - Or `testDir: './tests/e2e'` and move canonical specs there.

4. **Standardize `npm test`**
   - `npm test` → run Vitest first, then Playwright (or vice versa).
   - Or `npm test` → Vitest only; `npm run test:all` → Vitest + E2E.

### Phase 2: Fix or Remove Broken Tests

5. **validate-games.test.js**
   - Switch to `games_master.json` (or a test fixture).
   - Adjust schema expectations to match `games_master` structure.

6. **validate-duckdb-aggregations.test.js**
   - **Option A:** Skip in Node (DuckDB is browser-only).
   - **Option B:** Use `@duckdb/duckdb-wasm` Node build if available.
   - **Option C:** Remove and rely on E2E/visual checks of DuckDB behavior.

7. **Integration tests (csv-export, validate-rankings)**
   - Add a **test-only data loader** that loads `games_master.json` directly (no DuckDB).
   - Or mock `data.js` / `loadGameData()` to return precomputed structures.
   - Avoid calling DuckDB in Node.

8. **Remove hardcoded counts**
   - Replace `expect(total_games).toBe(501)` with `expect(total_games).toBeGreaterThan(0)` or derive expected from fixtures.

### Phase 3: Clean Up E2E

9. **Single canonical E2E suite**
   - Keep `dashboard-navigation.spec.js` as the main suite.
   - Archive or delete one-off specs (e.g. move to `tests/archive/e2e-one-offs/`).

10. **Fix URLs**
    - Use `page.goto('/')` + `baseURL: 'http://localhost:8000'`.
    - Run server from `game_analytics_export/` so `/` serves the app.

### Phase 4: What to Add (Later)

11. **Coverage**
    - Run `npm run test:coverage` with Vitest.
    - Relax thresholds initially (e.g. 50% lines) until tests are stable.

12. **Critical-path E2E**
    - Data loads and displays.
    - Navigation (Overview, Themes, Mechanics).
    - Filters work.
    - CSV export works (if UI exposes it).

13. **Data integrity**
    - Schema validation for `games_master.json`.
    - Smoke tests for ranking formulas against known inputs.

14. **CI**
    - Run Vitest + Playwright in CI.
    - Use `npx playwright install --with-deps` (already in workflow).
    - Ensure server root and ports match local setup.

---

## 5. Quick Wins (Next Steps)

1. Add Vitest and `test:vitest` script.
2. Configure Playwright to run only `*.spec.js`.
3. Run `unit/formulas.test.js` with Vitest → confirm it passes.
4. Update `validate-games.test.js` to use `games_master.json`.
5. Add a minimal JSON loader for tests that need game data (no DuckDB).
6. Prune E2E to a small set of core specs.
7. Update CI to run both Vitest and Playwright.

---

## 6. Test Count Summary (Current)

| Category | Files | Est. tests | Runnable now? |
|----------|-------|------------|----------------|
| Unit | 4 | ~60 | Yes (with Vitest) |
| Integration | 15 | ~50+ | No (DuckDB/data deps) |
| Data validation | 5 | ~40 | No (wrong files, DuckDB) |
| E2E | 80+ | 100+ | Partially (config/runners broken) |
| **Total** | 100+ | 250+ | **Mostly broken** |

---

## 7. Conclusion

The current test setup is not reliable: wrong runners, wrong data files, and browser-only code run in Node. Prioritize fixing the infrastructure (Vitest + Playwright separation, data paths, mocks) and then stabilize a small set of unit and E2E tests before expanding coverage.
