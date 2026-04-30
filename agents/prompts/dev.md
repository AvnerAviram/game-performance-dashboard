# Dev Agent — Phase 1: Fix Data Types at Build Time (GATE PHASE)

## Context

This is Phase 1 of the SQL-First Architecture Migration. This phase fixes the ROOT CAUSE of all recurring data bugs: array fields stored as JSON strings instead of native arrays.

**THIS IS A GATE.** After this phase, we verify that DuckDB can UNNEST native array columns. If it can't, the entire SQL migration stops.

Full plan: `/Users/avner/.cursor/plans/sql-first_migration_(validated)_88725c2a.plan.md`

Use `fnm use 20` before any npm commands.

---

## Task 1: Stop Stringifying Arrays in build-parquet.mjs

File: `scripts/build-parquet.mjs`

### 1a. Features, themes_all, themes_raw, symbols (lines 69-76)

**Current code:**
```js
const featuresJson =
    Array.isArray(game.features) && game.features.length > 0 ? JSON.stringify(game.features) : null;
const themesAllJson =
    Array.isArray(game.themes_all) && game.themes_all.length > 0 ? JSON.stringify(game.themes_all) : null;
const themesRawJson =
    Array.isArray(game.themes_raw) && game.themes_raw.length > 0 ? JSON.stringify(game.themes_raw) : null;
const symbolsJson =
    Array.isArray(game.symbols) && game.symbols.length > 0 ? JSON.stringify(game.symbols) : null;
```

**Change to (remove JSON.stringify — keep native arrays):**
```js
const featuresArr =
    Array.isArray(game.features) && game.features.length > 0 ? game.features.filter(f => !HIDDEN_FEATURES.has(f)) : null;
const themesAllArr =
    Array.isArray(game.themes_all) && game.themes_all.length > 0 ? game.themes_all : null;
const themesRawArr =
    Array.isArray(game.themes_raw) && game.themes_raw.length > 0 ? game.themes_raw : null;
const symbolsArr =
    Array.isArray(game.symbols) && game.symbols.length > 0 ? game.symbols : null;
```

**Note:** Features are filtered with `HIDDEN_FEATURES` at build time. Import `HIDDEN_FEATURES` from `src/lib/shared-config.js` at the top of the file:
```js
import { HIDDEN_FEATURES } from '../src/lib/shared-config.js';
```

Check that `shared-config.js` uses a compatible export (it's ESM, build-parquet is `.mjs` — should be fine).

### 1b. Art array fields (lines 138-141)

**Current code:**
```js
art_characters: art.art_characters ? JSON.stringify(art.art_characters) : null,
art_elements: art.art_elements ? JSON.stringify(art.art_elements) : null,
art_color_tone: art.art_color_tone ? JSON.stringify(art.art_color_tone) : null,
```

**Change to:**
```js
art_characters: Array.isArray(art.art_characters) && art.art_characters.length > 0 ? art.art_characters : null,
art_elements: Array.isArray(art.art_elements) && art.art_elements.length > 0 ? art.art_elements : null,
art_color_tone: Array.isArray(art.art_color_tone) && art.art_color_tone.length > 0 ? art.art_color_tone : null,
```

### 1c. Update row property names (lines 111-114)

Update the row object to use the new variable names:
```js
features: featuresArr,
themes_all: themesAllArr,
themes_raw: themesRawArr,
symbols: symbolsArr,
```

### 1d. Add missing column — art_theme_secondary

In the row object (around line 137), add:
```js
art_theme_secondary: art.art_theme_secondary || null,
```

---

## Task 2: Update duckdb-client.js Column Types + SQL Patterns

File: `src/lib/db/duckdb-client.js`

### 2a. Change column types in CREATE TABLE (line ~226)

**Current:**
```sql
features VARCHAR, themes_all VARCHAR, themes_raw VARCHAR,
symbols VARCHAR, description VARCHAR, demo_url VARCHAR,
...
art_theme VARCHAR, art_characters VARCHAR, art_elements VARCHAR,
art_narrative VARCHAR,
art_color_tone VARCHAR, art_confidence VARCHAR
```

**Change to:**
```sql
features VARCHAR[], themes_all VARCHAR[], themes_raw VARCHAR[],
symbols VARCHAR[], description VARCHAR, demo_url VARCHAR,
...
art_theme VARCHAR, art_theme_secondary VARCHAR, art_characters VARCHAR[], art_elements VARCHAR[],
art_narrative VARCHAR,
art_color_tone VARCHAR[], art_confidence VARCHAR
```

Note: Also add `art_theme_secondary VARCHAR` column.

### 2b. Rewrite RELIABLE_GAME constant (line ~33-34)

**Current:**
```js
(features IS NOT NULL AND features != '[]')
```

**Change to:**
```js
(features IS NOT NULL AND len(features) > 0)
```

### 2c. Rewrite feature LIKE filters in getAllGames (lines ~545, 553)

**Current:**
```js
if (filters.mechanic) {
    sql += ` AND features LIKE '%"${filters.mechanic.replace(/'/g, "''")}"%'`;
}
...
if (filters.feature) {
    sql += ` AND features LIKE '%"${filters.feature.replace(/'/g, "''")}"%'`;
}
```

**Change to:**
```js
if (filters.mechanic) {
    sql += ` AND list_contains(features, '${filters.mechanic.replace(/'/g, "''")}')`;
}
...
if (filters.feature) {
    sql += ` AND list_contains(features, '${filters.feature.replace(/'/g, "''")}')`;
}
```

### 2d. Rewrite getGamesByMechanic (line ~576)

**Current:**
```js
WHERE features IS NOT NULL AND features LIKE '%"${safe}"%'
```

**Change to:**
```js
WHERE features IS NOT NULL AND list_contains(features, '${safe}')
```

### 2e. Rewrite getOverviewStats features handling (lines ~399-406)

**Current:**
```js
const featureRows = await query(
    `SELECT DISTINCT features FROM games WHERE features IS NOT NULL AND features != '[]' AND ${RELIABLE_GAME}`
);
const featureSet = new Set();
for (const r of featureRows) {
    parseFeatures(r.features).forEach(f => featureSet.add(f));
}
basic.mechanic_count = featureSet.size;
```

**Change to (use UNNEST on native array):**
```js
const featureRows = await query(
    `SELECT DISTINCT f FROM (SELECT UNNEST(features) AS f FROM games WHERE features IS NOT NULL AND len(features) > 0 AND ${RELIABLE_GAME})`
);
basic.mechanic_count = featureRows.length;
```

### 2f. Rewrite getMechanicDistribution (lines ~439-446)

**Current:** Fetches all rows with features, then iterates in JS with `parseFeatures`.

This is a Phase 2 concern (metrics.js SQL migration). For now, just fix the SQL predicate:

**Change `features != '[]'` to `len(features) > 0`** in the WHERE clause. Keep the JS aggregation loop for now — it will still work because `parseFeatures` handles both arrays and strings.

### 2g. Rewrite getUniqueMechanics (line ~684)

**Current:**
```js
const rows = await query(`SELECT DISTINCT features FROM games WHERE features IS NOT NULL AND features != '[]'`);
```

**Change to (use UNNEST):**
```js
const rows = await query(`SELECT DISTINCT f AS mechanic FROM (SELECT UNNEST(features) AS f FROM games WHERE features IS NOT NULL AND len(features) > 0)`);
return rows.sort((a, b) => a.mechanic.localeCompare(b.mechanic));
```

Remove the JS Set/loop since UNNEST + DISTINCT does it in SQL. But keep the same return shape `[{ mechanic: '...' }]`.

### 2h. Rewrite getUniqueFeatures (lines ~713-724)

**Current:** Same JS Set/loop pattern.

**Change to (use UNNEST):**
```js
export async function getUniqueFeatures() {
    const rows = await query(`
        SELECT DISTINCT f AS feature FROM (SELECT UNNEST(features) AS f FROM games WHERE features IS NOT NULL AND len(features) > 0)
        ORDER BY f
    `);
    return rows;
}
```

### 2i. Rewrite getFeatureDistribution (lines ~729-740)

For now, just fix the SQL predicate. Replace any `features != '[]'` checks with `len(features) > 0`. Keep the JS aggregation loop — it will be replaced in Phase 2.

**Important:** `parseFeatures` already handles JS arrays (line 10-11 of parse-features.js: `if (Array.isArray(val)) { arr = val; }`), so the JS aggregation loops will still work with native arrays coming from DuckDB.

### 2j. Update INSERT logic for JSON fallback

The JSON fallback path (loadFromJSON) uses INSERT statements. When features is a native JS array in games_processed.json, the INSERT needs to handle it:

**Option A (recommended for simplicity):** When inserting, convert arrays to DuckDB array literals:
```js
const featVal = Array.isArray(game.features) 
    ? `ARRAY[${game.features.map(f => `'${f.replace(/'/g, "''")}'`).join(',')}]`
    : 'NULL';
```

**Option B (simpler, documented degradation):** Keep features as VARCHAR in the JSON INSERT fallback path. This means the JSON fallback won't have native arrays, but the Parquet path (primary) will. Document this as a known limitation.

Choose whichever is cleaner. The JSON fallback is rarely used.

---

## Task 3: Fix data.js Fallback Check

File: `src/lib/data.js` line ~224

**Current:**
```js
const hasFeatures = g.features && g.features !== '[]';
```

**Change to:**
```js
const hasFeatures = Array.isArray(g.features) ? g.features.length > 0 : (g.features && g.features !== '[]');
```

This handles both native arrays (from Parquet/new JSON) and legacy strings.

---

## Verification (CRITICAL — This is the GATE)

### Step 1: Rebuild data
```bash
fnm use 20
npm run build:data
```
Must succeed with no errors.

### Step 2: Run tests
```bash
npm test
```
All tests must pass. Some test fixtures may need updating if they use `features: '["Free Spins"]'` (string) — change to `features: ["Free Spins"]` (array).

### Step 3: Build
```bash
npm run build
```
Must exit 0.

### Step 4: Format
```bash
npm run format
npm run format:check
```

### Step 5: Verify native types (GATE CHECK)

Start the dev server and open browser console:
```bash
npm start
```

Then in the browser console (after login + data load), test these queries. Report the results in your atlas.md report:

1. **Type check:**
```js
// In browser console:
const result = await window._duckdb_query("SELECT typeof(features) AS t FROM games LIMIT 1");
console.log(result[0].t);
// Expected: VARCHAR[] (not VARCHAR)
```

If `window._duckdb_query` doesn't exist, add a temporary global in duckdb-client.js:
```js
window._duckdb_query = query;
```

2. **UNNEST check:**
```js
const feats = await window._duckdb_query("SELECT UNNEST(features) AS f FROM games WHERE features IS NOT NULL LIMIT 10");
console.log(feats);
// Expected: Array of objects like [{f: 'Free Spins'}, {f: 'Wild'}, ...]
```

3. **list_contains check:**
```js
const count = await window._duckdb_query("SELECT COUNT(*) AS n FROM games WHERE list_contains(features, 'Free Spins')");
console.log(count[0].n);
// Expected: a number > 0
```

4. **Array return check:**
```js
const game = await window._duckdb_query("SELECT features FROM games WHERE features IS NOT NULL LIMIT 1");
console.log(Array.isArray(game[0].features));
// Expected: true
```

---

## Constraints

- Do NOT change metrics.js function signatures (Phase 2 work)
- Do NOT change chart/renderer files (Phase 3 work)
- Do NOT change server files (Phase 4 work)
- Focus ONLY on: build-parquet.mjs, duckdb-client.js, data.js, and any test fixtures that break

## Report

Update `/Users/avner/Projects/game-performace-dashboard/agents/prompts/atlas.md` with:

| Task | Status | Details |
|------|--------|---------|
| T1: build-parquet arrays | | Fields changed, HIDDEN_FEATURES applied |
| T2a: CREATE TABLE types | | VARCHAR[] columns listed |
| T2b: RELIABLE_GAME | | New predicate |
| T2c-d: LIKE → list_contains | | How many patterns changed |
| T2e: getOverviewStats | | UNNEST version |
| T2g-h: getUniqueMechanics/Features | | UNNEST version |
| T2j: JSON INSERT fallback | | Which option chosen |
| T3: data.js hasFeatures | | Fix applied |
| npm run build:data | | exit code |
| npm test | | count + pass/fail |
| npm run build | | exit code |
| format:check | | pass/fail |
| GATE: typeof(features) | | VARCHAR[] or VARCHAR? |
| GATE: UNNEST works | | Shows individual strings? |
| GATE: list_contains | | Returns count > 0? |
| GATE: Array.isArray | | true or false? |
