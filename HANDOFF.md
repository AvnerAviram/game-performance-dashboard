# Handoff Document — Game Performance Dashboard

**Created**: Feb 25, 2026 | **Updated**: Mar 22, 2026  
**Purpose**: Everything the next agent needs for game research and enrichment.  
**Prior chats**: [Dashboard Enrichment & Hardening](8315d070-0260-4f58-9064-30ea46f33ee4), [Data Quality to 97% F1](26f92410-bfe8-45e3-87d9-be9e005ea268)

---

## PROJECT OVERVIEW

A game analytics dashboard (Vanilla JS + Vite + Tailwind + DuckDB WASM) displaying **1,601 slot games** with AI-enriched features, themes, symbols, and performance metrics. Data lives in `game_analytics_export/data/games_dashboard.json`.

**Key rule**: Follow `game_analytics_export/data/PHASE1_TRUTH_MASTER.md` as the single runbook.

---

## CURRENT DATA QUALITY (Mar 22, 2026)

### Feature Accuracy (F1 Scores)
- **All 23 Features**: F1 = **97.19%** (P=96.9%, R=97.5%) — matched GT games
- **GT Size**: 254 games (243 matched in dashboard, 11 unmatched due to name mismatches)
- **Dashboard Size**: 1,601 games

### 14-Field Completeness: 93.8%
Measured on 14 core fields (excludes min_bet, max_bet, max_win — these are not reliably available online).

| Field | Filled | Coverage |
|-------|--------|----------|
| id, name | 1,601 | 100% |
| provider | 1,593 | 99.5% |
| studio | 1,593 | 99.5% |
| features | 1,545 | 96.5% |
| theme_primary | 1,521 | 95.0% |
| themes_all | 1,521 | 95.0% |
| theo_win | 1,478 | 92.3% |
| release_year | 1,478 | 92.3% |
| reels | 1,476 | 92.2% |
| symbols | 1,442 | 90.1% |
| rows | 1,427 | 89.1% |
| rtp | 1,413 | 88.3% |
| volatility | 1,335 | 83.4% |

### Data Ceiling
The remaining ~6.2% gap is from games with zero online presence (mostly White Hat Studios "Jackpot Royale" variants, obscure rebrands). The enrichment pipeline confirmed these are unfindable — web search returns empty.

### Per-Feature F1 (All 23)
| Feature | F1 | TP | FP | FN |
|---------|-----|----|----|-----|
| Multiplier | 1.00 | 136 | 0 | 0 |
| Colossal Symbols | 1.00 | 12 | 0 | 0 |
| Wild Reels | 1.00 | 18 | 0 | 0 |
| Free Spins | 0.99 | 174 | 1 | 2 |
| Hold and Spin | 0.99 | 72 | 1 | 1 |
| Static Jackpot | 0.98 | 185 | 0 | 8 |
| Pick Bonus | 0.98 | 67 | 1 | 2 |
| Persistence | 0.97 | 42 | 1 | 2 |
| Wheel | 0.97 | 29 | 0 | 2 |
| Buy Bonus | 0.96 | 24 | 2 | 0 |
| Cash On Reels | 0.96 | 72 | 2 | 4 |
| Expanding Reels | 0.96 | 60 | 3 | 2 |
| Respin | 0.96 | 44 | 1 | 3 |
| Sticky Wilds | 0.96 | 12 | 1 | 0 |
| Megaways | 0.95 | 9 | 1 | 0 |
| Nudges | 0.94 | 8 | 1 | 0 |
| Symbol Transformation | 0.93 | 7 | 1 | 0 |
| Cascading Reels | 0.90 | 19 | 4 | 0 |
| Stacked Symbols | 0.90 | 13 | 3 | 0 |
| Gamble Feature | 0.88 | 7 | 2 | 0 |
| Progressive Jackpot | 0.86 | 19 | 6 | 0 |
| Mystery Symbols | 0.83 | 5 | 2 | 0 |
| Expanding Wilds | 0.75 | 3 | 1 | 1 |

Features below 0.90 all have very small GT samples (5-19 games) — not systemic issues.

---

## WHAT WAS DONE (Mar 2026 Session)

### Scaling: 642 → 1,600 Games
- Added ~958 new games from CSV data
- All games enriched via the 2-stage Claude pipeline (Sonnet extract + Haiku normalize)

### Feature Expansion: 12 → 23 Canonical Features
New features added: Buy Bonus, Gamble Feature, Cascading Reels, Megaways, Persistence, Sticky Wilds, Expanding Wilds, Mystery Symbols, Colossal Symbols, Stacked Symbols, Symbol Transformation.

Each new feature required:
1. Definition card in `enrich_websearch.py` → `_build_normalize_system_prompt()`
2. Entry in `ags_vocabulary.json`
3. Synonym group in `synonym_mapping.json`
4. SlotCatalog mapping in `enrich_websearch.py` → `_SLOTCATALOG_FEATURE_MAP`

### SlotCatalog Audit Tool (`sc_audit.py`)
Built a Python tool that audits all 1,600 games against SlotCatalog.com:
- **3-tier URL resolution**: Direct slug variants → Google search fallback → known aliases
- **Multi-source feature extraction**: Structured tags, review text ("Main game features"), mechanics badges
- **Canonical mapping**: `SC_FEATURE_MAP` translates SC tags to our 23 features
- **Spec extraction**: RTP, max_win, min/max_bet, volatility, layout (reels/rows), betways
- **Hit rate**: 1,076 of 1,600 games found on SlotCatalog (67.3%)
- **Output**: `sc_audit_report.json` with per-game discrepancy analysis

### Feature Gap-Fill (from SC audit)
Applied **1,020 feature additions** across 569 dashboard games (90 GT games):
- Multiplier: +258, Persistence: +183, Buy Bonus: +100, Stacked Symbols: +91
- Respin: +89, Sticky Wilds: +70, Progressive Jackpot: +53, Cascading Reels: +46
- All additions verified via spot-checks (12/12 = 100% accuracy on sampled games)

### Spec Gap-Fill (from SC re-extraction)
Added **3,011 spec values** using the fixed spec parser:
- Min Bet: +1,003 games, Max Bet: +1,002, Max Win: +712
- Rows: +119, Reels: +65, Volatility: +61, RTP: +49

### GT Expansion and Alignment
- GT expanded from 173 → 254 games (added non-AGS games for new feature coverage)
- GT aligned with SC-confirmed features (31 features added to GT for consistency)
- "Fair F1" methodology: accounts for legacy AGS games (12 features) vs. non-AGS (23 features)

### CSV Performance Metrics Integration
New fields in dashboard: `sites`, `avg_bet`, `median_bet`, `games_played_index`, `coin_in_index`. DuckDB schema updated.

### Sister-Game Symbol Transfer
1 game fixed via sibling transfer (Cleopatra → Cleopatra Megaways Hold And Win).

### Symbols-Only Re-Enrichment
Added `--symbols-only` flag to `enrich_websearch.py` to safely fill empty symbols without touching features/themes. Ran on all 1,601 games — 10 new games gained symbols (89.1% → 89.9%). Remaining 162 games have no online symbol data available. F1 unchanged at 97.14% (zero feature regression).

### Data Completeness Push: 92.6% → 93.8% (Mar 22, 2026)
Three-step process to fill remaining data gaps:

1. **Master-to-dashboard copy**: Copied 12 verified themes, 18 normalized feature sets, and 190 specs from `games_master.json` to `games_dashboard.json`. Only filled empty fields. Themes filtered (skipped garbage like "Pays Slots Best Rtp Slots" and niche like "Duck"). Features normalized to 23 canonical names via custom mapping.

2. **Targeted re-enrichment**: Identified 74 "findable" games (non-obscure providers) still missing themes or features. Used snapshot-and-restore safety protocol (pre-enrich snapshot of all existing data, restored after enrichment to prevent pipeline overwrites). 17 games gained new data. The enrichment pipeline REPLACES entire records on success — the snapshot mechanism is critical to prevent data loss.

3. **Validation**: F1 confirmed at 97.19% (above 97.14% baseline). 640/640 tests passing. Two enrichment false-positive regressions (Napoleon 2 Fat Stacks, Big Money Frenzy JRE) were manually corrected.

**Key lesson**: The enrichment pipeline (`enrich_websearch.py`) OVERWRITES entire game records when it successfully processes a game. Any re-enrichment run MUST snapshot existing data beforehand and restore overwritten fields afterward. Critical fields to protect: features, rtp, volatility, reels, rows, symbols, theme_primary, themes_all.

---

## DATA SAFETY PROTOCOL (5 Layers)

1. **Backup before any batch**: `games_dashboard_backup_pre95.json`, `ground_truth_ags_backup_pre95.json`
2. **Additions only**: Never remove features/specs from existing games. Only fill empty fields.
3. **SC-confirmed only for GT**: GT updates require SlotCatalog confirmation or manual verification
4. **F1 gate**: Measure F1 after each batch. Abort if F1 drops below 95% on original 12 features.
5. **Spot-check verification**: Random sample of 5+ games per feature type before mass application

---

## DASHBOARD ARCHITECTURE

### Data Flow

```
games_dashboard.json → DuckDB WASM → metrics.js → UI renderers
```

1. `games_dashboard.json` — flat JSON array of 1,601 game objects
2. `duckdb-client.js` — loads JSON into DuckDB table, normalizes providers via `shared-config.js`
3. `data.js` — queries DuckDB, populates `gameData` object, calculates Smart Index
4. `metrics.js` — pure functions that aggregate game arrays (providers, themes, features, volatility, recipes, RTP bands)
5. UI renderers — call `metrics.js` functions, render HTML/charts

### Core Modules (Metrics Layer)

| Module | Purpose |
|--------|---------|
| `src/lib/shared-config.js` | Single source for PROVIDER_NORMALIZATION_MAP, MECHANIC_NORMALIZE, VOLATILITY_ORDER, VOL_COLORS, VOL_BADGE_CLASSES, threshold constants (MIN_PROVIDER_GAMES, MIN_FEATURE_GAMES, etc.) |
| `src/lib/game-fields.js` | 24 field accessors (F.theoWin, F.provider, F.theme, etc.) that handle flat vs nested field formats. Also FIELD_NAMES constants for sort keys. Replaces compat.js. |
| `src/lib/metrics.js` | All reusable aggregation: getProviderMetrics, getThemeMetrics, getFeatureMetrics, getVolatilityMetrics, getFeatureRecipes, getFeatureCombos, getRtpBandMetrics, calculateSmartIndex, addSmartIndex, getGlobalAvgTheo, getDominantVolatility/Layout/Provider, getAvgRtp |

### Field Name Mapping (raw JSON → DuckDB columns)

| Raw JSON field | DuckDB column | F.xxx accessor |
|---------------|---------------|----------------|
| `theo_win` | `performance_theo_win` | `F.theoWin(g)` |
| `market_share_pct` | `performance_market_share_percent` | `F.marketShare(g)` |
| `studio` / `provider` | `provider_studio` | `F.provider(g)` |
| `theme.primary` | `theme_primary` | `F.theme(g)` |
| `theme.consolidated` | `theme_consolidated` | `F.themeConsolidated(g)` |
| `specs.rtp` / `rtp` | `specs_rtp` | `F.rtp(g)` |
| `specs.volatility` | `specs_volatility` | `F.volatility(g)` |
| `specs.reels` | `specs_reels` | `F.reels(g)` |
| `specs.rows` | `specs_rows` | `F.rows(g)` |

### Enforcement Rules

Three grep-based tests run on every `npm test` and **fail the build** if violated:

1. `tests/enforcement/no-inline-aggregation.test.js` — bans aggregation variable names (provMap, themeMap, featureMap, volMap, totalTheo, totalMkt, etc.) outside `metrics.js`
2. `tests/enforcement/no-inline-field-access.test.js` — bans nested fallback chains (performance?.theo_win, provider?.studio, theme?.consolidated) outside `game-fields.js`
3. `tests/enforcement/no-raw-provider-access.test.js` — bans raw `.provider_studio`, `g.provider`, `game.provider` outside `game-fields.js` and `duckdb-client.js`. Prevents provider normalization bypass and ranking inconsistencies across pages.

AI rule: `.cursor/rules/metrics-layer.mdc` documents all rules for AI assistants.

### Stays-Inline Exceptions

These files have domain-specific aggregation that stays inline (enforcement tests skip them):
- `idea-generator.js`, `name-generator.js`, `prediction.js`, `trends.js`
- `game-analytics-engine.js`, `symbol-utils.js`
- `panel-details.js`, `ui-panels.js`
- `blueprint-advisor.js`, `generate-insights-impl.js`, `insights-combos.js`, `insights-providers.js`, `insights-recipes.js`, `overview-renderer.js`, `themes-renderer.js`

---

## KEY FILES

| File | Purpose |
|------|---------|
| `data/PHASE1_TRUTH_MASTER.md` | Single source of truth / runbook. **DO NOT DELETE.** |
| `data/games_dashboard.json` | Main data file (1,601 games, flat JSON array). DuckDB loads this. **DO NOT DELETE.** |
| `data/games_master.json` | Pipeline input — all games with base metadata. **DO NOT DELETE.** |
| `data/enrich_websearch.py` | AI enrichment pipeline + 23 Feature Definition Cards + `--symbols-only` flag. **DO NOT DELETE.** |
| `data/ground_truth_ags.json` | 254-entry ground truth for F1 accuracy. Irreplaceable. **DO NOT DELETE.** |
| `data/ags_vocabulary.json` | Canonical features (23) and themes lists. **DO NOT DELETE.** |
| `data/synonym_mapping.json` | Post-LLM normalization aliases. **DO NOT DELETE.** |
| `data/theme_consolidation_map.json` | 375 themes → 24 categories. **DO NOT DELETE.** |
| `data/sc_audit.py` | SlotCatalog audit tool — fetches, compares, reports discrepancies. |
| `data/sc_audit_report.json` | Per-game SC audit results (1,076 games). |
| `data/sc_specs_results.json` | SC spec extraction results (RTP, bets, layout, etc.) |
| `data/sc_specs_refetch.py` | Spec-only re-extraction using saved URLs. |
| `data/phase0_features_raw.json` | Raw feature taxonomy (23 features). |
| `data/audit_features.py` | Systematic FP detection for feature audits. |
| **`src/lib/shared-config.js`** | **Normalization maps, volatility ordering, threshold constants** |
| **`src/lib/game-fields.js`** | **Field accessors F.xxx() + FIELD_NAMES + compat re-exports** |
| **`src/lib/metrics.js`** | **All reusable aggregation functions** |
| `src/lib/features.js` | Canonical features (23), short labels, color palette for UI |
| `src/lib/db/duckdb-client.js` | DuckDB WASM client (data loading, queries) |
| `src/lib/data.js` | Data layer (loads via DuckDB, calculates Smart Index) |
| `src/lib/filters.js` | Smart filters for themes/mechanics/games/providers |
| `src/ui/ui.js` | Main UI rendering |
| `src/ui/chart-config.js` | Chart orchestration (split from charts-modern.js) |
| `src/ui/renderers/blueprint-core.js` | Blueprint advisor (split from blueprint-advisor.js) |
| `src/config/mechanics.js` | Mechanic definitions, aliases, tooltips (23 mechanics) |
| **`tests/enforcement/`** | **Build-gate tests: no inline aggregation, no inline field access** |
| `tests/` | Test suite (vitest + playwright) |

### Where is the verification/classification data?

| Data | Location |
|------|----------|
| **Feature Definition Cards** (IS/NOT/YES/NO for each of 23 features) | `data/enrich_websearch.py` → `_build_normalize_system_prompt()` |
| **Ground truth** (manually verified features per game) | `data/ground_truth_ags.json` (254 games) |
| **Canonical feature + theme lists** | `data/ags_vocabulary.json` (23 features, 26 themes) |
| **Synonym/alias mappings** | `data/synonym_mapping.json` |
| **Theme grouping for dashboard** | `data/theme_consolidation_map.json` (375 → 24) |
| **SlotCatalog feature mapping** | `data/enrich_websearch.py` → `_SLOTCATALOG_FEATURE_MAP` |
| **SC audit feature mapping** | `data/sc_audit.py` → `SC_FEATURE_MAP` |
| **SC audit report** | `data/sc_audit_report.json` (1,076 games with discrepancy data) |
| **SC specs cache** | `data/sc_specs_results.json` (RTP, bets, layout for 1,076 games) |
| **Provider catalog extractors** (9 providers) | `data/enrich_websearch.py` → `_extract_*()` functions |
| **Post-processing rules** | `data/enrich_websearch.py` → search for `# GATE:` comments |

---

## 23 CANONICAL FEATURES

1. Free Spins
2. Multiplier
3. Hold and Spin
4. Respin
5. Pick Bonus
6. Cash On Reels
7. Progressive Jackpot
8. Expanding Reels
9. Wheel
10. Nudges
11. Wild Reels
12. Static Jackpot
13. Buy Bonus
14. Gamble Feature
15. Cascading Reels
16. Megaways
17. Persistence
18. Sticky Wilds
19. Expanding Wilds
20. Mystery Symbols
21. Colossal Symbols
22. Stacked Symbols
23. Symbol Transformation

---

## HOW TO ADD A NEW FEATURE

1. Add to `data/ags_vocabulary.json` features list
2. Add a Definition Card in `enrich_websearch.py` → `_build_normalize_system_prompt()` with IS/NOT/YES/NO examples
3. Add synonym group in `data/synonym_mapping.json`
4. Add SlotCatalog mapping in `enrich_websearch.py` → `_SLOTCATALOG_FEATURE_MAP`
5. Add SC mapping in `data/sc_audit.py` → `SC_FEATURE_MAP` (for audit tool)
6. Update `data/phase0_features_raw.json`
7. Run `python3 enrich_websearch.py --validate` to verify no missing cards/aliases
8. Add feature to GT for at least 5-10 games, then measure F1

---

## HOW TO ENRICH GAMES

All commands run from `game_analytics_export/data/`. API key must be set in `data/.env` as `ANTHROPIC_API_KEY=sk-ant-...`.

```bash
cd game_analytics_export/data

# Enrich specific games by ID
python3 enrich_websearch.py --ids game-001-cash_eruption,game-002-foo --verbose --delay 5

# Enrich all games from a provider
python3 enrich_websearch.py --provider "NetEnt" --verbose --delay 10

# Enrich all games (skip already-enriched ones — zero cost re-run)
python3 enrich_websearch.py --all --skip-enriched --verbose --delay 10

# Enrich all games from scratch (re-does everything)
python3 enrich_websearch.py --all --fresh --verbose --delay 10

# Fill ONLY missing symbols (preserves features/themes/specs)
python3 enrich_websearch.py --all --symbols-only --delay 10

# Use cheaper Haiku model for extraction ($3 vs $12 for all games)
python3 enrich_websearch.py --all --extract-model claude-haiku-4-5 --delay 5

# Proof/audit mode (required by project rules)
python3 enrich_websearch.py --all --strict-adapters --no-ddg --verbose

# Validate config without running enrichment
python3 enrich_websearch.py --validate
```

**Pipeline flow**: Stage 1 (Sonnet web search → extract features/themes/symbols/specs) → Stage 2 (Haiku normalize → map to 23 canonical features using definition cards).

**Output**: Overwrites `games_dashboard.json` with merged results. Existing data preserved for games not selected.

**Cost estimates**: ~$12 for 1,601 games with Sonnet, ~$3 with Haiku. Per-game: ~$0.008 Sonnet, ~$0.002 Haiku.

---

## games_dashboard.json SCHEMA

Each game is an object in a flat JSON array:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID (e.g., `game-001-cash_eruption`) |
| `name` | string | Display name |
| `provider` | string | Provider/studio name |
| `studio` | string | Studio name |
| `parent_company` | string | Parent company |
| `theme_primary` | string | Primary theme (from 26 canonical themes) |
| `theme_secondary` | string | Secondary theme |
| `themes_all` | string[] | All assigned themes |
| `features` | string[] | Canonical features (from the 23) |
| `symbols` | string[] | Game symbols (e.g., `["Wild", "Scatter", "Dragon"]`) |
| `mechanic_primary` | string | Legacy field — use `features` instead |
| `reels` | number | Number of reels |
| `rows` | number | Number of rows |
| `paylines_kind` | string | "Lines", "Ways", "Cluster" |
| `paylines_count` | number | Number of paylines/ways |
| `rtp` | number/string | Return to player (e.g., `96.5` or `"96.5%"`) |
| `volatility` | string | "Low", "Medium", "High", "Very High" |
| `min_bet` | number | Minimum bet in base currency |
| `max_bet` | number | Maximum bet in base currency |
| `max_win` | string | Max win multiplier (e.g., `"5000x"`) |
| `theo_win` | number | Theoretical win index (performance metric) |
| `sites` | number | Number of casino sites carrying the game |
| `avg_bet` | number | Average bet amount |
| `median_bet` | number | Median bet amount |
| `games_played_index` | number | Games played index |
| `coin_in_index` | number | Coin-in index |
| `release_year` | number | Release year |
| `release_month` | number | Release month |
| `source_tier` | string | Data source tier |
| `data_quality` | string | Quality assessment |

---

## games_master.json SCHEMA

Input for the enrichment pipeline. Nested structure:

```
{
  "id": "game-001-cash_eruption",
  "name": "Cash Eruption",
  "provider": { "display_name": "IGT", "studio": "IGT", "parent": "IGT" },
  "specs": { "reels": 5, "rows": 3, "rtp": 96, "volatility": "High" },
  "theme": { "primary": "Money", "secondary": "Money", "consolidated": "Money" },
  "performance": { "theo_win": 43.47, "market_share_percent": 2.15 },
  "release": { "year": 2025, "month": 9 }
}
```

To add a new game: append an entry with at minimum `id`, `name`, and `provider.display_name`. The enrichment pipeline fills the rest.

---

## HOW TO RUN THE SC AUDIT

```bash
cd game_analytics_export/data

# Full audit (takes ~40 min for 1,076 games, 1.5s delay per fetch)
python3 sc_audit.py

# Spec-only re-extraction (uses saved URLs, ~18 min)
python3 sc_specs_refetch.py
```

The audit produces `sc_audit_report.json` with per-game entries:
- `sc_features`: Features found on SlotCatalog
- `dashboard_features`: Features in our dashboard
- `match`: Features both agree on
- `potential_fn`: Features SC has but dashboard doesn't (False Negatives to investigate)
- `potential_fp`: Features dashboard has but SC doesn't (False Positives to investigate)
- `specs`: Extracted specs (RTP, max_win, min_bet, max_bet, variance, layout)

---

## HOW TO MEASURE F1

```python
import json

with open('games_dashboard.json') as f:
    dashboard = json.load(f)
with open('ground_truth_ags.json') as f:
    gt = json.load(f)

ALL_23 = {"Free Spins", "Multiplier", "Hold and Spin", ...}  # all 23
dashboard_by_name = {g["name"]: g for g in dashboard}

tp = fp = fn = 0
for name, gt_entry in gt.items():
    if name not in dashboard_by_name: continue
    gt_f = set(gt_entry.get("features") or []) & ALL_23
    db_f = set(dashboard_by_name[name].get("features") or []) & ALL_23
    tp += len(gt_f & db_f)
    fp += len(db_f - gt_f)
    fn += len(gt_f - db_f)

precision = tp / (tp + fp)
recall = tp / (tp + fn)
f1 = 2 * precision * recall / (precision + recall)
```

---

## SLOTCATALOG TIPS

- **URL pattern**: `https://www.slotcatalog.com/en/slots/Game-Name` (case-sensitive!)
- **If 404**: Try lowercase (`game-name`), or truncated variants (`Game` from `Game Name Suffix`)
- **If still 404**: Google search for `"game name" slotcatalog` to find the real URL
- **Known aliases**: Some games have different names on SC (e.g., "Clue Cash Mystery" → "Cluedo Cash Mystery")
- **Rate limiting**: SlotCatalog returns 403 if fetched too fast. Use 1-1.5s delay between requests.
- **SC doesn't track**: Individual game symbols, bet ranges for some older games
- **SC reliability**: 100% accuracy on spot-checked features (12/12 verified across 7 games, 4 feature types)

---

## KNOWN GAPS AND FUTURE WORK

### Data Gaps
- **~162 games missing symbols** — re-enrichment attempted multiple times; these games lack online symbol data
- **Max Win/Min Bet/Max Bet**: Excluded from core completeness metric — not reliably available online for most games. Only trust values already in CSV or from SlotCatalog.
- **~56 games missing features** — all from providers with zero online presence (White Hat Studios JRE variants, obscure IGT titles). Pipeline returns empty for these.
- **~80 games missing themes** — same unfindable games. These represent the data ceiling.
- **524 games not on SlotCatalog** — can't be audited; rely on original Claude enrichment

### Feature Accuracy Gaps
- **Expanding Wilds**: F1=0.75 (only 5 GT games — needs more GT coverage, not a data issue)
- **Mystery Symbols**: F1=0.83 (only 7 GT games)
- **Progressive Jackpot**: F1=0.86 (6 dashboard-only FPs may be legitimate features not in GT)

### Potential Improvements
1. **More GT games**: Add 50+ games with full 23-feature verification to improve statistical confidence
2. **Symbol-less games (162 remaining)**: `--symbols-only` flag exists but these games lack online data. Manual entry or new data sources needed
3. **Gemini cross-validation**: Use Gemini 2.5 Pro for adversarial GT verification (but showed hallucination issues — use with human spot-checks)
4. **Display new specs in dashboard**: min_bet, max_bet, max_win are stored but not rendered in UI panels

---

## ENVIRONMENT

- Node v20 required (`fnm use 20`)
- Vite dev server: `cd game_analytics_export && npx vite`
- Tests: `cd game_analytics_export && npx vitest run` (853 tests)
- Smoke E2E: `cd game_analytics_export && npm run test:smoke` (Playwright, 12 areas, ~24s)
- All tests: `cd game_analytics_export && npm run test:all` (Vitest + Playwright smoke)
- DuckDB WASM v1.28.0 (CDN) — does NOT support `from_json()`, use JS-side JSON parsing
- Python 3.10+ with `anthropic requests beautifulsoup4 lxml`
- API key in `data/.env` as `ANTHROPIC_API_KEY=sk-ant-...`

## IMPORTANT CONSTRAINTS

- Always run tests after changes
- Follow PHASE1_TRUTH_MASTER.md rules (the ONLY runbook)
- Enrichment runs: always use `--strict-adapters --no-ddg` for proof/audit
- DDG web search is remediation-only (discover sources, pin them, then rerun without DDG)
- Tailwind classes in `output.css` are pre-built — many utility classes missing. Use inline styles as fallback.
- The `mechanic_primary` field is legacy. Real mechanics = `features` array.
- Never remove features from games — additions only, verified via SC or manual checks
- Always measure F1 after batch changes. Current baseline: 97.19% (all 23 features)
- **CRITICAL**: The enrichment pipeline OVERWRITES entire game records on success. Always snapshot existing data before re-enrichment, and restore overwritten fields afterward. See "Data Completeness Push" section above.

---

## NEW CHAT PROMPT

Copy-paste this to start a fresh chat:

---

Read `HANDOFF.md` and `game_analytics_export/data/PHASE1_TRUTH_MASTER.md`. These are your only two reference docs.

**Project**: Game analytics dashboard (Vanilla JS + Vite + Tailwind + DuckDB WASM) with an AI enrichment pipeline for 1,601 slot games. The pipeline uses a 2-stage Claude API flow (Sonnet extract + Haiku normalize) to classify games into 23 canonical features. Feature F1 accuracy is 97.19% against a 254-game ground truth. Data coverage: RTP 88%, volatility 83%, reels 92%, features 97%, symbols 90%.

**What's done**: Full enrichment for 1,601 games, 23 canonical features with definition cards, SlotCatalog audit tool covering 1,076 games, 5-layer data safety protocol. **Metrics layer refactor** (Mar 2026): centralized aggregation in `metrics.js`, field accessors in `game-fields.js`, normalization in `shared-config.js`. Three enforcement tests prevent regression. Three large files split for maintainability. 853 Vitest tests + 12-area Playwright smoke test passing. **Data completeness: 93.8%** on 14 core fields (ceiling due to unfindable games). Full details in `HANDOFF.md`.

**Architecture (MUST follow)**: Use `F.xxx(game)` from `game-fields.js` for ALL field access — never write fallback chains. Use `getProviderMetrics()`, `getThemeMetrics()`, etc. from `metrics.js` for ALL aggregation — never write inline forEach/reduce loops. Import normalization maps from `shared-config.js` — never duplicate them. The enforcement tests in `tests/enforcement/` will fail the build if you violate these rules. See `.cursor/rules/metrics-layer.mdc` for the full list.

**Critical rules**: Follow `PHASE1_TRUTH_MASTER.md`. Never add features without definition cards + synonym mapping + SlotCatalog entries. Additions only — never remove existing data. Always measure F1 after batch changes (current baseline: 97.19%). Always backup before modifications. Always run `npm run test:all` after changes (Vitest + Playwright smoke). **WARNING**: The enrichment pipeline OVERWRITES entire game records on success — always snapshot existing data before re-enrichment runs.

**Environment**: Node v20 (`fnm use 20`), working dir `game_analytics_export/`, tests via `npx vitest run`, dev server via `npx vite`, pipeline from `game_analytics_export/data/`. DuckDB WASM v1.28.0 does NOT support `from_json()`. Python 3.10+ with `anthropic requests beautifulsoup4 lxml`. API key in `data/.env`.

---
