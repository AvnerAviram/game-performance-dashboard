---
name: CSV Data Update Plan
overview: "Plan for safely importing a new Eilers CSV (5K+ games) into the dashboard: update existing game metrics, add new games, and run them through the feature and art classification pipelines -- with safeguards at every step."
todos:
  - id: merge-to-main
    content: Commit current work, merge to main branch, tag pre-csv-migration, create feat branch
    status: completed
  - id: archive-sources
    content: Copy both CSVs to data/sources/, update .gitignore, write source validation tests
    status: completed
  - id: build-infrastructure
    content: Add Ags→AGS to provider map, install csv-parse, build migration tests + rollback script
    status: completed
  - id: build-update-script
    content: Create update-from-csv.mjs with UTF-16/TAB parsing, matching, dry-run, field conversion
    status: completed
  - id: phase1-update-existing
    content: Run dry-run, review reports, then --apply to update 4,404 existing games' metrics
    status: completed
  - id: phase2-add-new
    content: Add ~629 new games with XLSX fields only (features/art = null), rebaseline tests
    status: completed
  - id: phase3-features
    content: "Feature extraction for 343 games (batch API, staged output) — see screenshot_acquisition plan"
    status: pending
  - id: phase4a-screenshots
    content: "Multi-source screenshot waterfall (SC → BWB → Provider) — see multi-source plan"
    status: in_progress
  - id: phase4b-art-classify
    content: "Art classification incrementally (5→10→50→100) with user review gates"
    status: pending
  - id: phase4c-merge
    content: "Single atomic merge: staged features + art → master, validate, build:data"
    status: pending
  - id: cleanup-plans
    content: "Organize plans folder: move old plans to archive, keep only active 3"
    status: pending
isProject: false
---

# CSV Data Update Plan (v4 — validated against actual CSV)

## Plan Hierarchy (active plans)

```
CSV Data Update Plan (THIS FILE) — master orchestration
├── Phase 1-2: DONE (4,377 updated + 574 new = 5,124 games in master)
├── Phase 3: Feature Extraction + Art Classification
│   └── screenshot_acquisition_for_art_5c6f45aa.plan.md
│       ├── Phase 0b: Feature extraction (343 games, batch API, staged)
│       ├── Phase 1: Multi-source screenshots
│       │   └── multi-source_screenshot_acquisition_822b9ddd.plan.md
│       │       ├── Source 1: SlotCatalog (existing)
│       │       ├── Source 2: BigWinBoard (NEW)
│       │       └── Source 3: Provider sites (NEW)
│       ├── Phase 1b: Quality filter calibration (with user)
│       ├── Phase 2: Art classification (incremental batches)
│       └── Phase 3: Single atomic merge (features + art → master)
└── Final: build:data, full test suite, deploy
```

**Current status**: Phase 1-2 COMPLETE (CSV numbers only). Phase 3-4 JUST STARTING — only pilot done (10 games each). Full execution pending.

**Game groups** (who gets what):
- Group A: 343 games — have HTML rules, get FEATURES (batch API) + ART (screenshot + classify)
- Group B: ~1,805 games — no rules, get ART ONLY (screenshot + classify, features = N/A)
- Group C: ~250 games — non-slots, skip both (table games)
- Already done: 2,726 have art + features from prior work

## Context

- Current master: [game_data_master.json](game_analytics_export/data/game_data_master.json) (**5,124 games** — after Phase 1-2)
- Current coverage: 2,726 with art, ~3,398 with features (3,046 original + 352 extracted), ~5,000 with theo_win
- **Source CSVs** (both archived in `data/sources/`, tracked in git):
  - `eilers_nov25.csv` — OLD baseline: UTF-8, comma-delimited, CRLF, ~4,600 rows, Nov 2025, built current 4,550-game master
  - `eilers_mar26.tsv` — NEW update: **UTF-16 LE** (with BOM), **TAB-delimited**, 5,084 rows + Grand Total footer, **March 2026**, 4,661 slots, 64 providers, 4,505 slots with theo > 0
- **Overlap analysis**: 4,404 games match by normalized name; **629 new games** only in CSV; 142 games only in master (no longer tracked by Eilers)
- Protected "XLSX fields" from CSV: `name`, `provider`, `game_category`, `release_year`, `release_month`, `sites`, `avg_bet`, `median_bet`, `games_played_index`, `coin_in_index`, `theo_win`, `market_share_pct`
- **HARD RULE**: `id` is NEVER updated for existing games. `name`/`provider` changes are flagged for manual review only.

### CSV Column Mapping

| CSV Column (exact header) | CSV Format | Master Field | Conversion |
|---------------------------|-----------|--------------|------------|
| `Game Name` | string | `name` | trim |
| `Parent Supplier` | string (e.g. "Igt") | `provider` | normalize via PROVIDER_NORMALIZATION_MAP |
| `Game Category` | string | `game_category` | direct (validate against known set) |
| `Month, Year of OGPD Release Date` | "August, 2021" | `release_year` + `release_month` | parse month name → number; extract year |
| `Casinos (Sites)` | integer | `sites` | parseInt |
| `Avg. Average Bet` | "$1.90" | `avg_bet` | strip `$` and `,`, parseFloat |
| `Median Avg Bet` | "$1.92" | `median_bet` | strip `$` and `,`, parseFloat |
| `Avg. Games Played Index` | "58.44" | `games_played_index` | parseFloat |
| `Avg. Coin In Index` | "40.2" | `coin_in_index` | parseFloat |
| `Theo Win Index` | "44.50" | `theo_win` | parseFloat (strip commas if >999) |
| `% of Total GGR` | "1.86%" | `market_share_pct` | strip `%`, parseFloat, **divide by 100** |

### Known Provider Mismatches (CSV → Master)

- `Igt` → `IGT` (already in PROVIDER_NORMALIZATION_MAP)
- `Play N Go` → `Play'n GO` (already in map)
- `Ags` → `AGS` (**MISSING from map — must add before running**)
- `Digital Gaming Corporation`, `Eyecon`, `Fingenuity`, `Ricochet` → new providers (not in master)
- `Playson` → in master but NOT in CSV (142 master-only games include Playson titles)

---

## Pre-requisites (before anything else)

### Step 0: Git Branching

1. **Commit current work** to current branch (71 files changed, 2553 insertions)
2. **Merge to main** — ensure main has all current coverage/UI fixes
3. **Tag main**: `git tag pre-csv-migration` (one-command restore point)
4. **Create new branch**: `git checkout -b feat/csv-data-update-may26`
5. All CSV migration work happens on this branch. **Do NOT merge feat branch back to main until ALL phases are complete and validated.** Main stays clean as rollback target throughout the entire process.

### Step 1: Archive Source CSVs

5. **Create `data/sources/` directory** (tracked in git, NOT served to client/browser)
6. **Copy both CSVs into the project**:
   - `data/sources/eilers_nov25.csv` — the old CSV (Nov '25, 4,600 rows, UTF-8, comma-delimited, built current master)
   - `data/sources/eilers_mar26.tsv` — the new CSV (Mar '26, 5,084 rows, UTF-16 LE, tab-delimited)
   - Use `.tsv` extension for the new file to signal tab-delimited format
7. **Update `.gitignore`**: change `*.csv` rule to exclude `data/sources/` (so these are tracked)
8. **Add `data/sources/README.md`** documenting: file origins, dates, encoding, delimiter, row counts, which master version each produced

### Step 2: Source Validation Tests

9. **Write `tests/data-validation/validate-source-csv.test.js`** — validates source CSVs are intact:
   - Old CSV: row count = 4,600 (expected), has expected columns, first game = "First Person Blackjack"
   - New CSV: row count = 5,085 (including header + Grand Total), encoding = UTF-16 LE, first data game = "Cash Eruption"
   - Both CSVs: every Slot row has non-empty `Game Name`, numeric `Theo Win Index` parseable
   - Cross-check: old CSV game count aligns with current master count (± tolerance for table game filtering)
   - **Data loss check**: after parsing new CSV, assert total parsed rows = 5,084, assert parsed slots with theo > 0 = 4,505

### Step 3: Infrastructure

10. **Run full test suite** to confirm baseline: `cd game_analytics_export && npx vitest run`
11. **Add `Ags: 'AGS'` to `PROVIDER_NORMALIZATION_MAP`** in [shared-config.js](game_analytics_export/src/lib/shared-config.js)
12. **Install `csv-parse`**: `npm install csv-parse` (add to package.json)
13. **Backup master**: `cp data/game_data_master.json data/game_data_master_backup_pre_phase1.json`
14. **Build the migration test suite** (new file: `tests/data-validation/validate-migration.test.js`) — see Testing section below. Must pass before any data changes.
15. **Build the surgical rollback script** (`scripts/data/rollback-fields.mjs`) — two modes: restore fields and remove IDs. Tested before Phase 1.
16. **Commit infrastructure** (source CSVs + validation tests + rollback script + provider map fix + csv-parse dep)

---

## Phase 1: Update Existing Games (numeric metrics only)

**Goal**: For games already in master, update their performance/numeric fields from the new CSV. NEVER touch `id`, `name`, `provider`, or any extracted field.

**Script**: Create `game_analytics_export/scripts/data/update-from-csv.mjs`

### Technical Requirements

- **File reading pipeline** (auto-detect format — old CSV is UTF-8/comma, new is UTF-16/TAB):
  1. Read file as binary Buffer: `fs.readFileSync(csvPath)`
  2. **Auto-detect encoding**: check first 2 bytes for UTF-16 LE BOM (`FF FE`). If present → `buffer.toString('utf16le')` + strip BOM char. Otherwise → `buffer.toString('utf8')` + strip UTF-8 BOM if present.
  3. **Auto-detect delimiter**: if first header line contains `\t` → TAB delimiter; otherwise → comma delimiter.
  4. Parse with **`csv-parse/sync`** (synchronous API): `import { parse } from 'csv-parse/sync'` then `parse(string, { delimiter: detected, columns: true, skip_empty_lines: true, relax_column_count: true, trim: true })`
  5. **Validate parse result**: assert column count = 15, assert first column key includes "Month" or "Data Date", assert row count within expected range (log actual count)
- **Row filtering**: Skip rows where `Game Name` is empty, equals "Total", or equals "Grand Total". Skip rows where `Parent Supplier` is empty or `"` (garbage data).
- **Field parsing** (apply BEFORE any comparison or write):
  - `Avg. Average Bet` / `Median Avg Bet`: strip `$` and `,`, parseFloat
  - `Theo Win Index`: strip commas, parseFloat
  - `% of Total GGR`: strip `%`, parseFloat, **DIVIDE BY 100** (CSV "1.86%" → master 0.0186)
  - `Casinos (Sites)`: parseInt (strip commas)
  - `Index`: strip commas (used only for logging, not stored)
  - `Month, Year of OGPD Release Date`: parse "August, 2021" → `{ release_year: 2021, release_month: 8 }`
- **Provider normalization**: Apply `PROVIDER_NORMALIZATION_MAP` to `Parent Supplier` value. Normalize both CSV and master sides identically before matching.
- **Atomic writes**: Write to `game_data_master.tmp.json`, then `fs.renameSync()` to final path. Never truncate the real file mid-write.
- **`--apply` fails when `csv_manual_review.json` is non-empty** -- operator must resolve or pass `--reviewed` flag to acknowledge.
- **Category validation**: Known categories = `Slot`, `Table Game`, `Instant Win`, `Live Casino`, `Lottery`, `Video Poker`, `Bingo/Keno`, `Crash`, `Arcade`. Any other value (e.g. "High 5 Games" — a known data error in this CSV) → quarantine to manual review.

### Matching Algorithm (3-tier, strict-to-loose)

1. **Exact match**: normalized name + normalized provider (both sides use `PROVIDER_NORMALIZATION_MAP` from [shared-config.js](game_analytics_export/src/lib/shared-config.js))
2. **Relaxed match**: normalized name only, BUT only if there's a **single** CSV candidate for that name
3. **Fuzzy match** (score >= 0.95 token-set similarity): only if single candidate AND `theo_win` proximity within 20% -- routed to **manual review queue**, NEVER auto-applied

Unmatched master games and unmatched CSV rows are reported separately.

### Update Rules

- Update ONLY numeric XLSX fields: `theo_win`, `market_share_pct`, `sites`, `avg_bet`, `median_bet`, `games_played_index`, `coin_in_index`, `release_year`, `release_month`, `game_category`
- **NEVER update**: `id`, `name`, `provider` (identity fields are frozen for existing games)
- **Reject rule**: if existing `theo_win > 5` and new value is `0` or `null` -- flag for review, do not auto-apply
- **Delta guard**: if `market_share_pct` changes by more than 10x in either direction (AFTER conversion to decimal fraction) -- flag for review. When old or new is 0/null, skip ratio check and flag if the other is > 0.01.
- **Category guard**: if new `game_category` is not in the known set (`Slot`, `Table Game`, `Instant Win`, `Live Casino`, `Lottery`, `Video Poker`, `Bingo/Keno`, `Crash`, `Arcade`) -- flag for review (known issue: 1 row has "High 5 Games" as category — a data error)

### Outputs

- `data/csv_update_report.json` -- per-game diff (old vs new values, match tier, confidence score)
- `data/csv_manual_review.json` -- games that need human sign-off (fuzzy matches, rejected updates, large deltas)
- `data/csv_unmatched_master.json` -- master games not found in CSV (142 games; these are KEPT in master unchanged — Eilers coverage is not guaranteed to track all titles forever)
- `data/csv_unmatched_csv.json` -- CSV rows not matched to master (629 rows; candidates for Phase 2). This file is generated by BOTH `--dry-run` and `--apply` runs. Keep a dated copy before Phase 2. If Phase 2 needs to be re-run, regenerate by running Phase 1 again.

### Modes

- `--dry-run` (default): produces reports only, no writes
- `--apply`: writes master after all validations pass (aborts if manual review non-empty)
- `--apply --reviewed`: writes master, acknowledging manual review was done externally

### Pre-write Validation (built into script)

- **Extracted-field fingerprint**: For each game, compute SHA256 of a canonical JSON blob containing ONLY string/array-of-string fields: `{art_characters, art_color_tone, art_elements, art_narrative, art_theme, art_theme_secondary, background_description, description, features, symbols, theme_primary, themes_all}`. Rules: keys sorted alphabetically; string arrays `.slice().sort()` before stringify; null fields included as `null`; missing keys treated as `null`. This produces deterministic hashes for before/after comparison. Assert **zero** hash changes for any existing game.
- Assert no `id` changed
- Assert no `name` changed
- Assert game count unchanged (Phase 1 only updates, never adds/removes)

### Testing (Phase 1)

- **BEFORE**: Run `npx vitest run tests/data-validation/` -- must pass
- **DURING** (built into script): fingerprint validation, count assertion
- **AFTER**: Run `npx vitest run tests/data-validation/` -- must pass; run `npm run build:data`

---

## Phase 2: Add New Games

**Goal**: Games in CSV but NOT in master get added as new entries with XLSX fields only.

**Script**: Extend `update-from-csv.mjs` with `--add-new` flag

### Rules

- Source: `data/csv_unmatched_csv.json` from Phase 1 (629 rows that don't match any master game)
- Filter: only `Slot` category, `theo_win > 0`, not table games (same `TABLE_KEYWORDS` filter as existing scripts), valid `game_category` (skip "High 5 Games" row), non-empty provider (skip garbage `"` row)
- **ID generation**: increment from current max ID number (currently 4550) -> `game-4551-slug`, `game-4552-slug`, etc. Zero-padded 4 digits. Slug = lowercase name, non-alphanumeric -> underscore, truncated to 40 chars. If slug collision, append `-2`, `-3`.
- **Name uniqueness**: assert no duplicate `name` values in final master. If CSV has same title from two providers, disambiguate as `"Title (Provider)"` and flag for review. Note: only 1 slot has cross-provider collision ("Break The Piggy Bank" — Octoplay + Spinomenal). Also handle **same-provider duplicate rows** in CSV (12 cases, mostly non-slot table games like "Blackjack", "Roulette" from Evolution) — for slots, take the row with highest `theo_win`; for non-slots, dedupe by keeping first occurrence.
- **New-game template** — every new game must include ALL 23 universal keys (present on all 4,550 existing games) plus standard art/extraction fields. Full template:

```javascript
{
  // XLSX fields (from CSV):
  id: "game-NNNN-slug",
  name: "...",
  provider: "...",   // normalized
  game_category: "Slot",
  release_year: N,
  release_month: N,
  sites: N,
  avg_bet: N,
  median_bet: N,
  games_played_index: N,
  coin_in_index: N,
  theo_win: N,
  market_share_pct: N,
  // Universal keys (set to canonical empty):
  description: null,
  theme_primary: null,
  themes_all: [],
  features: [],
  symbols: [],
  html_rules_available: false,
  game_sub_category: null,
  jackpot_structure: null,
  last_modified_date: null,
  win_evaluation: null,
  // Art/extraction fields (sparse — include for consistency):
  extraction_date: null,  // CRITICAL: null ensures --run-all targets these
  art_theme: null,
  art_theme_secondary: null,
  art_characters: null,
  art_elements: null,
  art_narrative: null,
  art_color_tone: null,
  art_confidence: null,
  art_character_categories: null,
  background_description: null,
  is_branded: false,
  screenshot_quality: null,
}
```

  Note: Sparse keys (`reels`, `rows`, `rtp`, `volatility`, `max_win`, `min_bet`, `max_bet`, `default_bet`, `grid_config`, `paylines`, `data_confidence`, `feature_details`, etc.) are NOT present on all existing games, so omitting them from new games is acceptable and consistent with schema.
- Atomic write (temp + rename)

### Outputs

- `data/csv_new_games_report.json` -- list of added games with IDs and performance numbers
- Updated `game_data_master.json` (after `--apply`)

### Testing (Phase 2)

- **BEFORE**: Run `npx vitest run tests/data-validation/validate-migration.test.js` (snapshot existing state)
- **DURING** (built into script): unique IDs, unique names, no existing-game mutations
- **AFTER**: Rebaseline affected tests (see Test Rebaselining below), then full suite must pass

### Test Rebaselining (after Phase 2)

Update these test files with new values calculated from the actual new master:

- [validate-csv-integrity.test.js](game_analytics_export/tests/data-validation/validate-csv-integrity.test.js): `master.length`, `theo_win` sum bounds, slot count bounds, provider count bounds, `market_share_pct` sum band
- [validate-art-data.test.js](game_analytics_export/tests/data-validation/validate-art-data.test.js): BOTH `art_theme >= 55%` AND `art_characters >= 75%` will fail (diluted by new no-art games) -- **temporarily adjust both to absolute counts** (`art_theme >= 2726`, `art_characters >= 2726`) rather than percentages, until Phase 4 restores the ratios
- [validate-data-pipeline.test.js](game_analytics_export/tests/data-validation/validate-data-pipeline.test.js): `extracted.length >= 2900` (keep as-is; existing games unchanged)
- [validate-symbols-backfill.test.js](game_analytics_export/tests/data-validation/validate-symbols-backfill.test.js): `>= 3200` (keep as-is; existing games unchanged)

---

## Phase 3: Feature Classification (new games only)

**Goal**: Run new games through `extract_game_profile.py` to get features, themes, symbols.

### Prerequisites (before extraction)

1. **Match HTML rules to new games**: Run `python3 data/smart_match.py` -- reads `game_data_master.json` + `rules_index.json`, outputs updated `rules_game_matches.json`
2. **Coverage report**: Of the ~500 new games, how many appear in `rules_game_matches.json` AND have `.html` files in `data/rules_html/`? Only those are extractable. Report before proceeding.
3. **Backfill `extraction_date` on existing games** (CRITICAL): Any existing game that already has features/themes but lacks `extraction_date` could get re-extracted. Before running `--run-all`, write a one-time script to set `extraction_date: "legacy"` on all games that have non-empty `features` but no `extraction_date`. This prevents re-extraction drift.
4. Games without HTML rules will remain feature-less until rules are acquired (out of scope).

### Extraction

- **Correct CLI**: `python3 data/extract_game_profile.py --run-all --apply --limit 50`
- **How targeting works**: `--run-all` skips games that have `extraction_date` set. Since new games have `extraction_date: null` and existing games will have it backfilled (step 3 above), only new games with matched HTML rules are processed.
- Run in batches of 50 with checkpoints
- `safe_write_master()` guard active (aborts if art count drops >5%)

### Testing (Phase 3)

- **BEFORE each batch**: Snapshot extracted-field fingerprints for all existing games
- **AFTER each batch**: Verify existing game fingerprints unchanged; run `npx vitest run tests/data-validation/validate-data-pipeline.test.js`
- **AFTER all batches**: Full test suite; `npm run build:data`; F1 validation: `python3 data/extract_game_profile.py --validate-features`

---

## Phase 4: Screenshot + SC HTML Acquisition + Art Classification

**Goal**: Acquire screenshots and SC review HTML for games lacking art, then run them through `classify_art.py` (vision pipeline) — same full pipeline as the original 2,726 classified games.

**Detailed sub-plan**: See [screenshot_acquisition_for_art_5c6f45aa.plan.md](screenshot_acquisition_for_art_5c6f45aa.plan.md) for the full breakdown.

### Current Gap (post-Phase 3)

- 2,148 slots have no art classification and no screenshots
- 1,332 of those already show in the app (have features) but lack art data
- 0 of them have SC cache HTML or screenshots — they need both acquired

### Phase 4a: Screenshot + SC HTML Acquisition

**Script**: `data/download_sc_screenshots_playwright.mjs` (enhanced to also save HTML)

1. **Enhancement**: Save page HTML to `data/_legacy/sc_cache/{slug}.html` during download (3-line change — the script already fetches `page.content()` but discards it)
2. **Dry-run**: `--stats` to confirm ~2,148 candidates
3. **Pilot batch**: `--download --limit 20` — validate hit rate (expect ~60-70%) + check screenshot quality + verify saved HTML contains game description/specs
4. **Full download**: batches of 200 (`--download --limit 200 --start-from N`), 4s delay between pages, ~3-4 hours total
5. **Expected yield**: ~1,200-1,500 games with both screenshot + SC HTML

### Phase 4a.5: Screenshot Quality Prescreen

**Script**: `data/classify_art.py --prescreen`
- Classifies each new screenshot as gameplay/promotional/rules_page/loading_screen
- Cost: ~$0.0002/image (trivial)
- Only "gameplay" screenshots proceed to art classification
- Filters out posters, marketing banners, rules pages, loading screens
- Expected: ~85-90% pass rate (based on original 840: 88% gameplay)

### Phase 4b: Art Classification (incremental — user reviews every batch)

**Script**: `data/classify_art.py`
- Uses screenshots (vision) + SC HTML (text cross-reference) — identical pipeline to original 2,726
- **MUST use `--batch-api`** (50% cost savings)
- **Requires user cost approval before running**

**Incremental execution — measure 5 times, cut once:**

1. **Batch 0 (5 games)**: Classify 5 games → generate review HTML → user spot-checks all 5 → verify accuracy matches expectations (>97% theme)
2. **Batch 1 (20 games)**: If batch 0 is good → classify 20 more → user spot-reviews → verify no drift
3. **Batch 2 (50 games)**: If still good → classify 50 → user reviews sample of 10-15 → merge to master → run tests + build:data
4. **Batch 3+ (100 games)**: Scale up only after consistent quality confirmed → user reviews sample of 10-15 per batch
5. **Repeat** until all downloaded games are classified

**At each batch gate (before proceeding to next):**
- User reviews the art assignments (theme, characters, elements)
- Verify no existing game art was modified (fingerprint check)
- Check for unmapped themes (would break `build:data`)
- Confirm accuracy before scaling up

**CLI for each batch:**

```bash
# Step 0: ALWAYS backup before merge (merge-art-data.cjs write is NOT atomic)
cp data/game_data_master.json data/game_data_master_backup_pre_art_merge.json

# Step 1: Classify a batch (pass specific SC cache filenames)
python3 data/classify_art.py --batch-api game1.html game2.html ...
# Results written to art_pipeline/results.json

# Step 2: Generate review HTML for user to inspect
# (review HTML shows theme, characters, elements, screenshot side-by-side)

# Step 3: USER REVIEWS — wait for approval before merge

# Step 4: Merge into master (only after user approves)
node scripts/merge-art-data.cjs --dry-run  # preview first
node scripts/merge-art-data.cjs            # writes master (non-atomic!)
```

**NOT** `extract_game_profile.py --extract-art` (that's a different, text-based pipeline).

**Pre-flight gate**: `classify_art.py` blocks batches where <80% of games have screenshots. Only classify games where BOTH screenshot download AND SC HTML save succeeded.

### Phase 4c: Quick Wins (34 games)

Before the big Playwright download: classify the **34 SC cache games** that already have screenshots but no art results yet (immediate coverage gain, no downloads needed).

### Post-classification

- **Update `art_theme_consolidation_map.json`** if any new `art_theme` values were produced that aren't in the map (otherwise `npm run build:data` will hard-fail with `process.exit(1)`)
- Spot-check 10-20 art assignments manually
- Compare against art ground truth if any overlap

### Testing (Phase 4)

- **BEFORE**: Snapshot existing art field fingerprints
- **AFTER merge**: Verify existing game art unchanged; `npm run build:data` succeeds; art count increased
- **AFTER all batches**: Restore percentage thresholds in `validate-art-data.test.js` once coverage is adequate

---

## Comprehensive Testing Strategy

### New Test File: `tests/data-validation/validate-migration.test.js`

This file is written BEFORE any data changes and validates migration integrity at every phase.

**Tests to include:**

1. **Fingerprint stability** -- for a given backup file and current master, verify that all extracted fields for pre-existing game IDs are byte-identical
2. **No duplicate IDs** -- assert all `id` values are unique
3. **No duplicate names** -- assert all `name` values are unique
4. **ID format valid** -- all IDs match `/^game-\d{4,}-[a-z0-9_]+$/`
5. **New games have empty extracted fields** -- all games added after the backup have `features: []`, `art_theme: null`, etc.
6. **XLSX fields non-null for all games** -- every game has `theo_win`, `name`, `provider`, `id` as non-null
7. **Game count monotonically increases** -- current count >= backup count (we never delete games)
8. **Extracted-field count never decreases** -- count of games with `features.length > 0` >= count in backup; same for `art_theme`
9. **Provider values are in known set** -- all providers appear in `PROVIDER_NORMALIZATION_MAP` or are flagged
10. **`game_category` values are in known set** -- no novel categories without explicit addition
11. **No suspicious `theo_win` drops** -- no pre-existing game with `theo_win > 5` in backup has `theo_win <= 0` in current master
12. **`market_share_pct` sum in band** -- total sum of `market_share_pct` across all games is within expected range (recalculated from CSV)
13. **Sequential IDs** -- new game IDs are sequential from max(backup IDs) + 1, no gaps

### Existing Tests That Must Pass (35 files in `tests/data-validation/`)

Key files with hardcoded values that may need rebaselining:

- `validate-csv-integrity.test.js` -- game count, theo sum, slot count, provider count, market share sum
- `validate-art-data.test.js` -- art coverage percentages (55%, 75%)
- `validate-data-pipeline.test.js` -- extracted count >= 2900, quality ratios
- `validate-symbols-backfill.test.js` -- >= 3200 games with symbols
- `validate-duplicates.test.js` -- no duplicate names or IDs (must always pass)

### Test Execution Schedule

| Phase | BEFORE | DURING (in-script) | AFTER |
|-------|--------|---------------------|-------|
| Phase 1 | Full suite green | Fingerprint check, count stable, no ID/name change | Full suite green + `build:data` |
| Phase 2 | `validate-migration` snapshot | Unique IDs, unique names, no existing mutations | Rebaseline counts, then full suite green + `build:data` |
| Phase 3 | Fingerprint snapshot of existing games | Per-batch: existing fingerprints unchanged | Full suite + `build:data` + F1 validation |
| Phase 4 | Art fingerprint snapshot | Existing art unchanged after merge | Full suite + `build:data` + rebaseline art % thresholds |

### Rollback Test

The `rollback-fields.mjs` script also gets a test: given a backup and a list of IDs + fields, verify it correctly restores only those fields without touching anything else.

---

## Safety Rails

- **Git checkpoint before each phase** (separate commits with descriptive messages)
- **Intermediate backups**: backup before Phase 1 (`_backup_pre_phase1`), and again after Phase 1 before Phase 2 (`_backup_post_phase1`). This allows rolling back Phase 2 without losing Phase 1 metric updates.
- **Dry-run default** on all update scripts -- `--apply` required to write
- **`--apply` blocks on non-empty manual review** -- must pass `--reviewed` to acknowledge
- **Atomic writes** (temp file + `fs.renameSync`) -- crash-safe, no partial corruption
- **Diff reports** generated before any writes, reviewed before proceeding
- **Per-ID extracted-field fingerprinting** -- SHA256 of canonical JSON blob (string/array-of-string fields only, sorted keys, sorted arrays), compared before/after every phase
- **`safe_write_master()`** prevents catastrophic art count loss (>5% drop aborts)
- **Manual review queue** for fuzzy matches, large deltas, edge cases -- never auto-applied
- **Full test suite** runs between phases
- **`npm run build:data`** runs after every master write (catches unmapped values, schema issues, parquet generation)
- **Surgical rollback script**: `rollback-fields.mjs` -- two modes:
  - `--restore-fields` -- restores specified fields for a list of game IDs from a backup file
  - `--remove-ids` -- removes games by ID list from master (for undoing Phase 2 additions using `csv_new_games_report.json`)
  - Built and tested BEFORE Phase 1.
- **`extraction_date` backfill** on existing games before Phase 3 -- prevents re-extraction

---

## Delegation Strategy

**Orchestrator (me)**: Git operations, decision-making, reviewing outputs, running phases, presenting results for your review.

**Parallel subagents** (launched simultaneously where possible):

| Task | Agent Type | When |
|------|-----------|------|
| Write `update-from-csv.mjs` (parsing + matching + all modes) | generalPurpose | After branch created |
| Write `validate-migration.test.js` + `validate-source-csv.test.js` | generalPurpose | After branch created |
| Write `rollback-fields.mjs` | generalPurpose | After branch created |
| Verify after each phase (run tests, check fingerprints) | verifier | After each --apply |

This means steps 3-5 below happen in parallel (~3 min total vs ~10 min sequential).

---

## Execution Order (incremental, human-reviewed at every step)

1. **Commit + merge + branch** (`feat/csv-data-update-may26`)
2. **Archive CSVs + fix provider map + install csv-parse**
3. **Build tools** (3 agents in PARALLEL: update script, tests, rollback)
4. **Verify infrastructure** (all tests green)

### Phase 1 — Incremental (you review each step)

5. **1 game test**: Update ONLY "Cash Eruption" from new CSV → show you the before/after diff → you verify in the data
6. **5 game test**: Update 5 more games → show diffs → you verify
7. **Full Phase 1**: dry-run on all 4,404 → you review the report → then --apply

### Phase 2 — Incremental (you review each step)

8. **1 new game test**: Add 1 new game (e.g. "Huff N Puff Money Mansion") → show the full record → you verify against our pipeline (build:data, UI loads)
9. **5 new games test**: Add 5 more → verify
10. **Full Phase 2**: add all ~629 → rebaseline tests → you review

### Phase 3+4 — Batched with human gates (measure 5 times, cut once)

11. **Phase 3**: feature extraction (343 games, batch API, staged to `staged_feature_extraction.json`)
12. **Phase 4a**: Multi-source screenshot waterfall (SC → BWB → Provider, pilot each source with user review)
13. **Phase 4b**: Art classification — **incrementally**: 5 → 10 → 50 → 100 per batch, user spot-reviews EVERY batch
14. **Phase 4c**: Single atomic merge (features + art → master, validate, build:data)
15. **Merge feat → main** (only after all phases validated by you)

---

## Next Actions (immediate — what we do NOW)

1. **Organize plans folder** — move 70+ old plans to `archive/`, keep only 3 active
2. **Feature extraction (343 games)** — submit batch API, wait for results, stage output
3. **SC pilot (50 games)** — validate hit rate by year, user reviews screenshot grid
4. **BWB pilot (20 games)** — implement `tryBigWinBoard()`, user reviews quality
5. **Quality filter calibration** — iterative loop with user until <2% false negative
6. **Full waterfall** — only after pilots pass, batches of 200
7. **Art classification** — incremental (5→10→50→100), user reviews each batch
8. **Single atomic merge** — features + art → master
9. **Build + deploy** — build:data, full test suite, verify UI

Steps 2-3 can run in PARALLEL (two agents). Steps 4+ are sequential and depend on pilot results.

---

## Plan Organization

**Active plans** (`.cursor/plans/`):
- `csv_data_update_plan_0c60955c.plan.md` — THIS: master orchestration
- `screenshot_acquisition_for_art_5c6f45aa.plan.md` — Phase 3+4 detail (features + screenshots + art + merge)
- `multi-source_screenshot_acquisition_822b9ddd.plan.md` — Screenshot sources sub-plan (SC → BWB → Provider)

**TODO**: Move all other 70+ plans to `.cursor/plans/archive/` (they are from completed older work). Only keep these 3 active plans visible.
