# Handoff Document — Game Performance Dashboard

**Updated**: Apr 8, 2026  
**Purpose**: Single source of truth for all agents. Read this FIRST before doing anything.

---

## AGENT INSTRUCTIONS

You are working on a multi-agent project. Other agents may be active in parallel. Follow these rules strictly:

1. **Read `.cursor/rules/data-schema-contract.mdc`** — the binding schema contract.
2. **DO NOT rename fields** in `game_data_master.json`. Current names are final.
3. **DO NOT rename DuckDB columns** in `duckdb-client.js`. All SQL queries depend on them.
4. **DO NOT rewrite `game-fields.js`** — only ADD new accessors for genuinely new fields.
5. **ALL field access** must use `F.xxx(game)` from `game-fields.js`.
6. **ALL aggregation** must use functions from `metrics.js`.
7. **Run `npm test`** before declaring any change done (1,200+ tests, 83 files, all must pass — NO exclusions).
8. **Run `npm run format`** before declaring done.
9. **Chart.js** is imported via ESM from `src/ui/chart-setup.js` — never add a CDN `<script>` tag.
10. **DuckDB WASM** is self-hosted in `public/duckdb/` — never load from CDN.

---

## PROJECT OVERVIEW

Game analytics dashboard (Vanilla JS + Vite + Tailwind + DuckDB WASM) displaying **4,550 games** with performance metrics, features, themes, symbols, and art characterization.

Data file: `game_analytics_export/data/game_data_master.json`

---

## DATA SCHEMA — THREE LAYERS (MUST STAY IN SYNC)

### Layer 1: JSON Source (`game_data_master.json`)

4,550 games as flat objects. **47 possible fields** (not all present on every game).

**Core fields (every game has these):**

| JSON Field | Type | Description |
|------------|------|-------------|
| `id` | string | `game-NNNN-slug` |
| `name` | string | Display name |
| `provider` | string | Studio name — **NOT** `provider_studio` |
| `game_category` | string | Slot (4,201), Instant Win (107), Table Game (103), Live Casino (55), Video Poker (27), Lottery (27), Bingo/Keno (19), Crash (10), Arcade (1) |
| `theo_win` | number | Theo win index — **NOT** `performance_theo_win` |
| `market_share_pct` | number | **Fractional** (0.021 = 2.1%) — DuckDB multiplies ×100 |
| `release_year` | number | NJ launch year |
| `release_month` | number | NJ launch month |
| `sites` | number | Casino sites carrying the game |
| `avg_bet` | number | Average bet amount |
| `median_bet` | number | |
| `games_played_index` | number | |
| `coin_in_index` | number | |

**Extracted fields (present on ~3,000+ games):**

| JSON Field | Type | Count | Description |
|------------|------|-------|-------------|
| `theme_primary` | string | 3,062 | Consolidated theme |
| `themes_all` | array | varies | All assigned themes |
| `features` | array | 3,046 | Mechanic features list |
| `symbols` | array | 3,579 (78.7%) | `{name, type, description}` objects |
| `description` | string | 2,962 | Game description |
| `rtp` | number | 2,065 | — **NOT** `specs_rtp` |
| `volatility` | string | 289 | — **NOT** `specs_volatility` |
| `reels` | number | varies | — **NOT** `specs_reels` |
| `rows` | number | varies | — **NOT** `specs_rows` |
| `paylines` | varies | varies | |
| `original_release_year` | number | ~4,238 | Global release year (preferred for trends) |
| `original_release_month` | number | varies | |
| `min_bet`, `max_bet`, `max_win` | number | varies | |
| `franchise`, `franchise_type` | string | varies | |

**Metadata fields:**

`data_confidence`, `extraction_date`, `extraction_notes`, `html_rules_available`, `original_release_date_source`, `feature_details`, `grid_config`, `jackpot_structure`, `win_evaluation`, `default_bet`, `last_modified_date`, `game_sub_category`, `data_status`, `gt_applied_date`, `verification_date`, `verification_notes`, `themes`, `themes_raw`, `paylines_count`

### Layer 2: DuckDB Columns (`duckdb-client.js`)

DuckDB uses **legacy prefixed column names**. The INSERT in `duckdb-client.js` maps JSON → DuckDB:

| JSON field | DuckDB column | Transform |
|------------|---------------|-----------|
| `provider` | `provider_studio` | `normalizeProvider()` applied |
| `theo_win` | `performance_theo_win` | direct |
| `market_share_pct` | `performance_market_share_percent` | **×100** (fraction → percent) |
| `rtp` | `specs_rtp` | direct |
| `volatility` | `specs_volatility` | direct |
| `reels` | `specs_reels` | direct |
| `rows` | `specs_rows` | direct |
| `theme_primary` | `theme_primary` | consolidated via theme map |

**DO NOT rename these columns** — every SQL query in the codebase references them.

### Layer 3: Accessors (`game-fields.js`)

All field access MUST use `F.xxx(game)`. These handle both JSON and DuckDB row formats:

```
F.theoWin(g)          → g.performance_theo_win ?? g.theo_win ?? ...
F.provider(g)         → normalizeProvider(g.provider_studio || g.provider)
F.marketShare(g)      → g.performance_market_share_percent ?? g.market_share_pct ?? ...
F.rtp(g)              → parseFloat(g.specs_rtp || g.rtp || 0)
F.volatility(g)       → g.specs_volatility || g.volatility (+ normalization)
F.theme(g)            → g.theme_primary
F.themeConsolidated(g)→ g.theme_consolidated || g.theme_primary
F.features(g)         → g.features || []
F.releaseYear(g)      → g.release_year
F.originalReleaseYear(g) → g.original_release_year || g.release_year
F.gameCategory(g)     → g.game_category || 'Slot'
```

The `FIELD_NAMES` object in `game-fields.js` maps to **DuckDB column names** (used for dynamic SQL sort keys).

---

## ARCHITECTURE

### Data Flow

```
BUILD TIME:
  game_data_master.json + theme_map + franchise + confidence + art
    → scripts/build-parquet.mjs
    → data/games.parquet (977 KB, pre-processed, all transforms baked in)
    → data/games_processed.json (JSON fallback, same data)

RUNTIME (primary — Parquet):
  games.parquet → DuckDB WASM parquet_scan() → data.js → metrics.js → UI

RUNTIME (fallback — JSON, when WASM unavailable):
  games_processed.json → data.js loadViaJSON() → metrics.js → UI
```

### Build Pipeline

| Step | Script | What it does |
|------|--------|--------------|
| `build:css` | Tailwind CLI | Generates `src/output.css` |
| `build:data` | `scripts/build-parquet.mjs` | Pre-processes all data → Parquet + JSON |
| `vite build` | Vite 8 + Rolldown | Bundles JS (manual chunks), copies `public/` → `dist/` |
| Post-build | shell commands | Copies data files, `sw.js`, `health.json` to `dist/` |

**IMPORTANT**: Run `npm run build:data` after ANY change to `game_data_master.json`, `theme_consolidation_map.json`, `franchise_mapping.json`, `confidence_map.json`, or `staged_art_characterization.json`. The Parquet and processed JSON must be regenerated.

### Core Modules

| Module | Purpose | Rules |
|--------|---------|-------|
| `src/lib/game-fields.js` | ~30 field accessors | Only add, never rewrite |
| `src/lib/metrics.js` | All aggregation functions | ALL aggregation must go here |
| `src/lib/shared-config.js` | Provider normalization, volatility ordering, thresholds | Import from here, never copy |
| `src/lib/db/duckdb-client.js` | DuckDB init, Parquet/JSON loading, SQL queries | DO NOT rename columns |
| `src/lib/data.js` | Queries DuckDB (or JSON fallback), populates gameData | |
| `src/ui/chart-setup.js` | Chart.js ESM import + registration | ALL chart files import `Chart` from here |

### Chunk Splitting (Vite manualChunks)

| Chunk | Contents | Loaded |
|-------|----------|--------|
| `main` | App shell, router, UI panels, filters | Eagerly |
| `core` | data.js, metrics.js, game-fields.js, shared-config.js | Eagerly |
| `vendor-chartjs` | Chart.js (tree-shaken — Bar, Bubble, Line only) | Eagerly (via chart-setup) |
| `dashboard-components` | chart-setup.js, chart-utils.js, chart-config.js | Eagerly |
| `duckdb-client` | @duckdb/duckdb-wasm + duckdb-client.js | Lazy (dynamic import in data.js) |
| Per-page chunks | overview, themes, mechanics, etc. (14 pages) | Lazy (dynamic import via router) |

### Self-Hosted Assets (NO CDN dependencies)

| Asset | Location (dev) | Location (prod) |
|-------|---------------|-----------------|
| DuckDB WASM binary | `public/duckdb/duckdb-eh.wasm` | `dist/duckdb/duckdb-eh.wasm` |
| DuckDB worker | `public/duckdb/duckdb-browser-eh.worker.js` | `dist/duckdb/` |
| Chart.js | `node_modules/chart.js` (bundled by Vite) | `dist/assets/vendor-chartjs-*.js` |
| Game data | `data/games.parquet` | `dist/data/games.parquet` |

**CSP note**: DuckDB WASM auto-loads its `parquet` extension from `extensions.duckdb.org` at runtime. The `vercel.json` CSP must include `https://extensions.duckdb.org` in `connect-src`. The `deployment-readiness.test.js` enforcement test validates this.

### Service Worker (`sw.js`)

- **Hashed assets + DuckDB WASM** (`/assets/*`, `/duckdb/*`): cache-first (immutable)
- **Game data** (`games.parquet`, `games_processed.json`): stale-while-revalidate
- **Everything else** (API, HTML): network passthrough
- Bump `CACHE_NAME` in `sw.js` when changing caching behavior

### Enforcement Tests (auto-fail on violation)

| Test | Enforces |
|------|----------|
| `no-inline-aggregation.test.js` | No aggregation loops outside `metrics.js` |
| `no-inline-field-access.test.js` | No fallback chains outside `game-fields.js` |
| `no-raw-provider-access.test.js` | No `.provider_studio` / `game.provider` outside allowed files |
| `no-raw-gamedata-in-charts.test.js` | No raw `gameData` access in chart files |
| `label-consistency.test.js` | No banned UI labels (Smart Index, Feature Analysis, etc.) |
| `page-loading-safety.test.js` | Router uses `?raw` imports, all pages have HTML files |
| `deployment-readiness.test.js` | CSP allows DuckDB extensions, no stale CDN refs, build pipeline valid |
| `no-cdn-chartjs.test.js` | Chart.js imported via `chart-setup.js`, no CDN script tags |

---

## KEY FILES (DO NOT DELETE OR WIPE)

| File | Purpose |
|------|---------|
| `data/game_data_master.json` | Main data (4,550 games) — authoring truth |
| `data/games.parquet` | Pre-processed Parquet (build artifact from `build:data`) |
| `data/games_processed.json` | Pre-processed JSON fallback (build artifact from `build:data`) |
| `data/ground_truth_ags.json` | 87-entry AGS ground truth for F1 benchmarking |
| `data/rules_game_matches.json` | Game → rules page match (3,541 matches) |
| `data/rules_html/` | Raw HTML rules archive (8,716 files, gitignored) |
| `data/rules_text/` | Clean article text (8,704 files, gitignored) |
| `data/theme_consolidation_map.json` | Theme grouping map |
| `data/franchise_mapping.json` | Franchise grouping |
| `data/confidence_map.json` | Spec confidence levels per game |
| `data/staged_art_characterization.json` | Art characterization data |
| `data/extract_game_profile.py` | Combined extraction script (has safe-write guard) |
| `data/smart_match.py` | Strict game-to-rules matching |
| `data/download_all_rules.py` | Downloads help pages |
| `scripts/build-parquet.mjs` | Build-time data processor (JSON → Parquet) |
| `src/ui/chart-setup.js` | Chart.js ESM registration (ALL chart imports go through here) |
| `public/duckdb/` | Self-hosted DuckDB WASM binaries (copied from node_modules) |
| `server/users.json` | **Auth users (bcrypt hashed) — DO NOT wipe or remove entries** |

---

## EXTRACTION COVERAGE (Practical Ceilings)

| Data | Coverage | Ceiling reason |
|------|----------|----------------|
| Symbols | 3,579 / 4,550 (78.7%) | 544 slots have no rules page; 85 have rules without symbol data; 340 non-slots don't have slot symbols |
| Features | 3,046 / 4,550 (66.9%) | Same rules-page limitations |
| Themes | 3,062 / 4,550 (67.3%) | Same |
| RTP | 2,065 / 4,550 (45.4%) | Many rules pages don't list RTP |
| Volatility | 289 / 4,550 (6.4%) | Rarely disclosed in rules pages |

---

## ENVIRONMENT

- **Node v20** (`fnm use 20`)
- **Working dir**: `game_analytics_export/`
- **Dev server**: `npx vite` (serves from root + `public/`)
- **Build**: `npm run build` (CSS + Parquet + Vite + post-copy)
- **Tests**: `npx vitest run` → 1,146+ tests, 79 files
- **Format**: `npm run format` (Prettier, 4-space indent, single quotes, semicolons)
- **Python 3.10+** with `anthropic requests beautifulsoup4 lxml openpyxl`
- **API key**: `data/.env` as `ANTHROPIC_API_KEY=sk-ant-...`
- **DuckDB WASM** v1.28.0 (self-hosted in `public/duckdb/`, NOT CDN)
- **Chart.js** v4.4.1 (ESM import via `chart-setup.js`, NOT CDN `<script>`)

---

## HTML SECURITY

All dynamic content must use:
- `escapeHtml(value)` for text content
- `escapeAttr(value)` for HTML attributes
- `safeOnclick('fn', value)` for onclick handlers

## UI PATTERNS

- Scroll within `page-container`, never `window.scrollTo`
- Tooltips use `absolute` positioning (not `fixed`)
- Panel opening: call `window.closeAllPanels('panel-id')` first

---

## CHART VISUALIZATION RULES (MUST READ BEFORE TOUCHING CHART FILES)

### Protected chart files — coordinate with the chart owner before modifying:

| File | Charts | Notes |
|------|--------|-------|
| `src/ui/chart-themes.js` | Theme bar chart, Mechanics bar chart, Top Games bar chart, Scatter chart, **Theme Landscape** | Theme Landscape has custom inline SA label solver, hover/click handling, and axis warping |
| `src/ui/chart-utils.js` | Shared utilities: `createSABubbleLabelPlugin`, `createSAHoverHandler`, `createSAClickHandler`, `createQuadrantPlugin`, `bubbleScaleOptionsWarped`, `createXWarp`, `createYWarp`, `needsLeaderLine`, `snapLabelToBubble` | ALL other landscape charts depend on these |
| `src/ui/chart-volatility.js` | Volatility overview + landscape | Uses SA plugin with volatility meter icons |
| `src/ui/chart-rtp.js` | RTP overview + landscape | |
| `src/ui/chart-providers.js` | Provider overview + landscape | |
| `src/ui/chart-brands.js` | Brand overview + landscape | Uses Y-warp via `createYWarp` |
| `src/lib/sa-label-solver.js` | Simulated Annealing label placement algorithm | Shared by all landscape charts |

### Insights page chart order (in `src/pages/insights.html`):

Theme Landscape → Provider Landscape → Volatility Landscape → RTP Landscape → Brand Landscape

### Quality Gates

| Gate | What it does | When it runs |
|------|-------------|--------------|
| Pre-commit hook | `format:check` + `npm test` (1200+ tests) | Every `git commit` |
| GitHub Actions CI | format + lint + typecheck + test + build + dist verify | Every push/PR to main |
| `npm run test:gate` | Same as CI, locally | Run manually before deploy |

**Vercel deployment protection** (one-time setup in Vercel dashboard):
1. Go to Project Settings > Git > Deployment Protection
2. Enable "Only deploy when all checks pass"
3. This blocks deploy if the CI `gate` job fails

### Critical rules:

1. **ALL axis warp parameters MUST be data-driven** (computed from percentiles), never hardcoded constants. Data values change when extraction pipelines run — hardcoded warp breaks the chart layout.
2. **After ANY build** (`npm run build`), `sw.js` is auto-copied to `dist/`. Bump `CACHE_NAME` in `sw.js` if caching behavior changes.
3. **Hover/click on landscape charts** uses Chart.js `onHover`/`onClick` callbacks (NOT raw `addEventListener`). Use `createSAHoverHandler()` and `createSAClickHandler(fn)` for charts with the SA label plugin. Theme Landscape has its own inline hover handler (same pattern, just not shared).
4. **Test visually** after chart changes — run `npm run build`, restart server, hard-refresh browser (Cmd+Shift+R). Clear service worker if cached assets persist.
5. **Bubble sizing** must use `sqrt` scaling proportional to game/title count: `rMin + Math.sqrt(count / maxCount) * (rMax - rMin)`. This ensures visual area is proportional to count (human perception scales with area, not radius).
6. **Label placement** uses Simulated Annealing (`sa-label-solver.js`). Labels that are isolated (no nearby bubbles) skip leader lines (`needsLeaderLine`). Non-leader labels snap to the nearest cardinal position around their bubble (`snapLabelToBubble`).
7. **Quadrant legend** (Opportunity / Leaders / Niche / Saturated) appears below Theme, Provider, and Brand landscapes only — NOT on Volatility or RTP because those use their own color schemes (volatility-level colors and RTP-band colors).
8. **Volatility landscape** has per-bubble meter icons (ascending bars like slot game volatility selectors) and per-label colors from `VOL_COLORS`. These are passed via `opts.drawIcon` and `opts.labelColors` to `createSABubbleLabelPlugin`.
9. **RTP band labels** use format `94%-95%` (percent sign on BOTH numbers). Defined in `RTP_BANDS` in `metrics.js`.
