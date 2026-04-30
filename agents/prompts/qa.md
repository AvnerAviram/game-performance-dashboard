# QA Agent — Phase 1 Validation: Data Types + UNNEST Gate

## Context

Dev agent completed Phase 1 of the SQL-First Architecture Migration — the GATE phase. Array fields (`features`, `art_characters`, `art_elements`, `art_color_tone`, `themes_all`, etc.) should now be stored as native `VARCHAR[]` in DuckDB instead of JSON strings.

**This is a HARD GATE.** If native arrays + UNNEST don't work, the entire SQL migration stops.

Full plan: `/Users/avner/.cursor/plans/sql-first_migration_(validated)_88725c2a.plan.md`

Use `fnm use 20` before any npm commands.

---

## Pre-Checks

```bash
fnm use 20
npm run format:check
npm test
npm run build
```

All must pass. Report exact test count.

---

## Section 1: Build Pipeline Changes

### 1a. build-parquet.mjs — arrays NOT stringified

Read `scripts/build-parquet.mjs` and verify:

1. `features` field: must NOT use `JSON.stringify`. Should pass native array (with HIDDEN_FEATURES filtered). Verify `HIDDEN_FEATURES` is imported from `shared-config.js`.
2. `art_characters`, `art_elements`, `art_color_tone`: must NOT use `JSON.stringify`. Should pass native arrays.
3. `themes_all`, `themes_raw`, `symbols`: same — no `JSON.stringify`.
4. `art_theme_secondary` column exists in the row object.

Run `npm run build:data` and verify:
```bash
npm run build:data
```
Must succeed.

### 1b. games_processed.json — arrays are native JSON arrays

Check the output file:
```bash
node -e "const d=require('./data/games_processed.json'); const g=d.find(x=>x.features&&x.features.length>0); console.log('Type:', typeof g.features, 'IsArray:', Array.isArray(g.features), 'Sample:', g.features.slice(0,3))"
```

Expected: `Type: object IsArray: true Sample: ['Free Spins', 'Wild', ...]` — NOT a string.

Do the same for art_characters:
```bash
node -e "const d=require('./data/games_processed.json'); const g=d.find(x=>x.art_characters&&x.art_characters.length>0); console.log('Type:', typeof g.art_characters, 'IsArray:', Array.isArray(g.art_characters), 'Sample:', g.art_characters.slice(0,3))"
```

### 1c. HIDDEN_FEATURES filtered at build time

Verify that `Multiplier` and `Multipliers` do NOT appear in any features array in games_processed.json:
```bash
node -e "const d=require('./data/games_processed.json'); const has=d.some(g=>Array.isArray(g.features)&&(g.features.includes('Multiplier')||g.features.includes('Multipliers'))); console.log('Has hidden features:', has)"
```

Expected: `Has hidden features: false`

---

## Section 2: DuckDB Client Changes

### 2a. CREATE TABLE column types

In `src/lib/db/duckdb-client.js`, verify the CREATE TABLE statement uses:
- `features VARCHAR[]` (not `features VARCHAR`)
- `art_characters VARCHAR[]`
- `art_elements VARCHAR[]`
- `art_color_tone VARCHAR[]`
- `themes_all VARCHAR[]`
- `themes_raw VARCHAR[]`
- `symbols VARCHAR[]`
- `art_theme_secondary VARCHAR` (new column)

### 2b. RELIABLE_GAME constant

Verify it uses `len(features) > 0` instead of `features != '[]'`.

### 2c. LIKE patterns replaced

Search for any remaining `LIKE '%"` patterns related to features:
```bash
rg "features LIKE" src/lib/db/duckdb-client.js
```
Expected: **zero results**

Verify `list_contains` is used instead:
```bash
rg "list_contains" src/lib/db/duckdb-client.js
```
Expected: at least 2-3 results (mechanic filter, feature filter, getGamesByMechanic)

### 2d. features != '[]' eliminated

```bash
rg "features != '\[\]'" src/lib/db/duckdb-client.js
```
Expected: **zero results**

### 2e. getOverviewStats uses UNNEST

Read the `getOverviewStats` function and verify it uses `UNNEST(features)` instead of JS parseFeatures loop for counting unique mechanics.

### 2f. getUniqueMechanics/getUniqueFeatures use UNNEST

Read both functions and verify they use `UNNEST(features)` + `DISTINCT` in SQL instead of JS Set/loops.

---

## Section 3: data.js Fallback Fix

In `src/lib/data.js`, verify the `hasFeatures` check handles both arrays and strings:
```bash
rg "hasFeatures" src/lib/data.js
```

Must NOT use `g.features !== '[]'` as the only check. Should handle `Array.isArray(g.features)`.

---

## Section 4: GATE VERIFICATION (most critical section)

Start the server:
```bash
npm start &
```

Wait for it to be ready, then run these verification queries. You can either:
- Use the browser console after logging in, OR
- Write a small Node script that imports duckdb-client and runs queries

### Gate Check 1: Column type
```sql
SELECT typeof(features) AS t FROM games LIMIT 1
```
**MUST return `VARCHAR[]`** (not `VARCHAR`)

### Gate Check 2: UNNEST works
```sql
SELECT UNNEST(features) AS f FROM games WHERE features IS NOT NULL LIMIT 10
```
**MUST return individual feature strings** (e.g., `{f: 'Free Spins'}`, `{f: 'Wild'}`)

### Gate Check 3: list_contains works
```sql
SELECT COUNT(*) AS n FROM games WHERE list_contains(features, 'Free Spins')
```
**MUST return a number > 0**

### Gate Check 4: Array return
When querying a game with features, the JS result must have features as a native JS array:
```sql
SELECT features FROM games WHERE features IS NOT NULL LIMIT 1
```
Check: `Array.isArray(result[0].features)` **MUST be `true`**

### Gate Check 5: Art arrays too
```sql
SELECT typeof(art_characters) AS t FROM games WHERE art_characters IS NOT NULL LIMIT 1
```
**MUST return `VARCHAR[]`**

```sql
SELECT UNNEST(art_characters) AS c FROM games WHERE art_characters IS NOT NULL LIMIT 5
```
**MUST return individual character strings**

### Gate Check 6: Game counts preserved
```sql
SELECT COUNT(*) FROM games
```
Must match `game_data_master.json` length (expect ~4550)

```sql
SELECT COUNT(*) FROM games WHERE features IS NOT NULL AND len(features) > 0
```
Must be > 0 (expect ~2000+)

---

## Section 5: Data Consistency

### 5a. Cross-check with golden baseline

Run the data validation tests:
```bash
npx vitest run tests/data-validation/validate-data-pipeline.test.js
npx vitest run tests/data-validation/validate-parquet-pipeline.test.js
npx vitest run tests/data-validation/validate-reliable-filter-alignment.test.js
```

All must pass.

### 5b. Enforcement tests
```bash
npx vitest run tests/enforcement/
```
All must pass.

### 5c. Full test suite
```bash
npm test
```
Report count. Must be >= 1609.

### 5d. Post-build smoke
```bash
npm run test:gate
```
Must pass.

---

## Section 6: Playwright

```bash
npx playwright test tests/e2e/debug-expand.spec.mjs --project chromium --reporter=line --timeout 60000
```
Must pass.

---

## GATE DECISION

Based on Sections 1-6:

- **ALL gate checks pass** (Section 4) → **GATE OPEN — proceed to Phase 2**
- **ANY gate check fails** → **GATE CLOSED — document failure, report to Atlas, STOP**

---

## Report

Update `/Users/avner/Projects/game-performace-dashboard/agents/prompts/atlas.md` with:

### QA Agent Report — Phase 1 Gate Validation

| Section | Status | Detail |
|---------|--------|--------|
| Pre-checks | | format, test count, build |
| 1a: build-parquet arrays | | No JSON.stringify confirmed |
| 1b: games_processed.json | | IsArray=true for features + art |
| 1c: HIDDEN_FEATURES | | Multiplier/Multipliers absent |
| 2a: CREATE TABLE types | | VARCHAR[] columns listed |
| 2b: RELIABLE_GAME | | len(features) > 0 |
| 2c: LIKE patterns | | Zero LIKE results |
| 2d: features != '[]' | | Zero results |
| 2e-f: UNNEST functions | | Functions confirmed |
| 3: data.js fallback | | Array.isArray check |
| **GATE 1: typeof** | | VARCHAR[] or VARCHAR? |
| **GATE 2: UNNEST** | | Individual strings? |
| **GATE 3: list_contains** | | Count > 0? |
| **GATE 4: Array.isArray** | | true or false? |
| **GATE 5: Art arrays** | | VARCHAR[] + UNNEST? |
| **GATE 6: Game counts** | | Total + featured count |
| 5a: Data validation tests | | pass/fail |
| 5b: Enforcement tests | | count + pass/fail |
| 5c: Full test suite | | count + pass/fail |
| 5d: test:gate | | pass/fail |
| 6: Playwright | | pass/fail |

**GATE DECISION: OPEN or CLOSED**

If CLOSED, describe exactly which gate check failed and what the error message was.
