---
name: Screenshot Acquisition for Art
overview: Extract features for 457 slots with rules, acquire screenshots for 2,148 slots, calibrate quality filter, classify art incrementally — all with staged outputs, parallel agents, and user review gates.
todos:
  - id: docs-hub
    content: "Create docs/pipelines/ folder with consolidated pipeline docs + update cursor startup rule"
    status: pending
  - id: show-art-games
    content: "Extend RELIABLE_GAME filter to include games with art_theme (show in app with N/A features) + fix DuckDB art source"
    status: pending
  - id: feature-extract
    content: "Extract features for 457 slots (batch API, no --apply, staged JSONL) — Agent 1"
    status: pending
  - id: feature-validate
    content: "Validate extraction results (avg features, zero count, quality) then write staged_feature_extraction.json"
    status: pending
  - id: screenshot-stats
    content: Run Playwright script in --stats mode to confirm candidate count
    status: pending
  - id: pilot-sc
    content: "Pilot A: SC download 50 games (25 older + 25 newer), measure hit rate, user reviews grid"
    status: pending
  - id: pilot-bwb
    content: "Pilot B: BWB download 20 games that SC failed on, user reviews for slug collision"
    status: pending
  - id: pilot-review-screenshots
    content: "User review: screenshot quality grids from all pilots before scaling"
    status: pending
  - id: screenshot-full
    content: "Run full waterfall in batches of 200, track per-source success rate"
    status: pending
  - id: prescreen-calibrate
    content: "Calibrate screenshot quality filter with user (iterative: run → review HTML → tune → repeat)"
    status: pending
  - id: review-screenshots
    content: "User review 1: Screenshot quality check (are these really in-game screenshots?)"
    status: pending
  - id: classify-31-sc
    content: Classify the ~31 SC cache games that already have screenshots but no art
    status: pending
  - id: classify-new-batch
    content: "Art classification incrementally (5→10→50→100) with user review at each gate"
    status: pending
  - id: review-art
    content: "User review 2: Art classification spot-check (is theme/characters/elements correct?)"
    status: pending
  - id: merge-all
    content: "Single atomic merge: apply features + art from staged files to master, validate, build:data"
    status: pending
  - id: verify-tests
    content: Run full test suite, verify Art Insights charts updated
    status: pending
isProject: false
---

# Screenshot Acquisition and Art Classification Plan

## Situation

**Parent plan**: This is Phase 4 of the [CSV Data Update Plan](csv_data_update_plan_0c60955c.plan.md) (Phase 4a/4b/4c).

**All 5,124 games in master.** Current status:
- 2,726 have art (done)
- 2,398 need art (2,148 slots + 250 non-slots)
- 3,398 have features
- 1,726 need features (457 slots have rules but were never extracted)

**Targets for this plan:**
- Feature extraction: **343 slots** (of 457 with rules — 114 are truly sparse after cleaning). Pilot validated 10/10 success at 1000-char threshold.
- Art classification: 2,148 slots (expect **~1,600-1,900 screenshots** via multi-source waterfall at 75-85% hit rate)
- Non-slots (250): Skip for both features and art
- Review text fallback: 1,323 of 2,148 games have descriptions usable as review substitute (pilot validated 8/10 success)

**Execution model: 2 parallel Cursor agents → single merge**
- Agent 1: Feature extraction → writes to `staged_feature_extraction.json`
- Agent 2: Screenshot download + quality filter + art classification → writes to `art_pipeline/results.json`
- **NEITHER agent touches `game_data_master.json`** until both are validated
- Final step: single merge script combines both staged outputs into master (one atomic write)

## Parallel Execution Strategy

```
Agent 1: FEATURES                          Agent 2: ART
─────────────────────                      ─────────────────────
Submit 457 slots (batch API)               Modify Playwright script (3 lines)
  ↓ results → extraction_results.jsonl     Run --stats to confirm count
  ↓ poll until done (~30-60 min)           Download 20 (pilot) → validate
  ↓ quality check                          Download all (batches of 200)
  ↓ write staged_feature_extraction.json   Calibrate quality filter (with user)
DONE (does NOT touch master)               USER REVIEW 1: screenshots
                                           Classify in batches (→ results.json)
                                           USER REVIEW 2: art spot-check
                                           DONE (does NOT touch master)
                        ↓
              SINGLE MERGE (after both validated)
              ────────────────────────────────────
              1. Backup master
              2. Apply features from staged JSON
              3. Apply art from results.json (merge-art-data.cjs)
              4. Validate merged master (JSON.parse, field counts)
              5. Atomic write (temp → rename)
              6. npm run build:data
```

**Why this is better than sequential master writes:**
- Zero race conditions — no concurrent writers to master
- Each output independently reviewable before merge
- If either fails, master remains untouched
- Single rollback point (restore backup)
- Simpler coordination between agents

**Safety**: Before agents start, save `sha256(game_data_master.json)` → `data/.master_baseline_hash`. Merge script checks this hash matches current master. If someone edited master between start and merge, script aborts.

**Trade-off**: 99 games won't have fresh symbols when art classifier runs (features not yet merged). Impact is minimal — 356 games were previously classified without symbols at >97% accuracy. SC HTML text provides sufficient context.

## Phase 0b: Feature Extraction (Agent 1 — parallel with screenshot download)

**Script**: `data/extract_game_profile.py --batch`
**Games**: 457 slots with valid HTML rules files (>2KB), never extracted
- 206 have no art (will also get art later)
- 251 already have art (enriches their data with features)

**All rules files validated**: 457/457 exist in `data/rules_html/` with >2KB raw content.

**PILOT FINDING**: After `clean_html_for_claude()`, only 343/457 have >= 1000 chars of clean text. The remaining 114 have <1000 chars (truly sparse — too little for meaningful extraction). Threshold lowered from 2000 to 1000 chars based on pilot success (10/10 games extracted at avg 2.8 features/game with content in 1400-2000 char range).

**Pipeline uses (all learned from previous runs):**
- 22 classification rules in system prompt (H&S boundaries, inner feature rule, wild types, evidence requirement)
- 10 provider-specific hints (Ruby Play, Bragg, Ainsworth, Wazdan, Play'n GO, Spinberry, Inspired, Spearhead, High 5, Light & Wonder)
- 29 few-shot training examples (20 AGS + 8 cross-provider + 1 critical)
- Post-processing: canonical name normalization (30 features), Slingo rules, confidence filtering
- Provider field passed to prompt automatically → hints applied per-game

**Execution (FULLY STAGED — no master writes):**
1. **Pre-flight validation**: One-command check that all 457 rules files exist and >2KB (abort before API spend if not)
2. Run: `python3 data/extract_game_profile.py --batch` (WITHOUT `--apply`)
3. Results go to `data/extraction_results.jsonl` (appended per game = crash-safe)
4. Anthropic processes batch (~30-60 min). **Save batch_id** for re-fetch if needed.
5. After completion: **quality validation**:
   - Avg features per game (expect >3.0, stop if <1.5)
   - Zero-extraction count (expect <10%, stop if >15%)
   - Spot-check 10 random results manually
6. **Deduplicate JSONL** (key by game name — handles re-poll edge case)
7. **Write staged output**: `data/staged_feature_extraction.json` (map of name → extraction result)
   - This is NOT master — just a staging file for later merge
8. **Do NOT run `--apply` or touch master** — merge happens in final step

**Apply-from-JSONL script** (NEW — needed because `--batch --apply` would resubmit to API):
```javascript
// scripts/apply-features-from-jsonl.mjs
// Reads extraction_results.jsonl → deduplicates by name → writes staged_feature_extraction.json
// Does NOT touch master. Merge happens separately.
```

**Crash recovery**: JSONL appends per-game during retrieval. If crash mid-retrieval, re-run with same batch_id (results retained 29 days). Deduplicate before staging.

**Checkpoints (robustness against IDE crashes)**:
- JSONL file auto-checkpoints (each line = one game, flush immediately)
- Every 50 games: log progress to stdout ("Checkpoint: 50/457 games retrieved")
- `staged_feature_extraction.json` is written ONCE after full retrieval (not incrementally) — but JSONL is the recovery source if interrupted

**Cost**: 457 games x batch API (50% off) + prompt caching = ~$8-11

**Providers in this batch** (top 5): Greentube (60), Evolution (58), High 5 Games (54), Aristocrat (41), Light & Wonder (35). Most have generic rules that work well; High 5 and Light & Wonder have specific hints.

---

## Phase 1: Screenshot + SC HTML Acquisition (Multi-Source Waterfall)

**Sub-plan**: See [Multi-Source Screenshot Acquisition](multi-source_screenshot_acquisition_822b9ddd.plan.md) for full details on the waterfall architecture.

**Script**: `data/download_sc_screenshots_playwright.mjs`
- Already built for this purpose, handles Cloudflare, rate limiting (4s delay), retry logic
- Builds slug from game name: `buildSlug(name)` -> `Name-With-Dashes`
- Saves screenshots to `data/screenshots/` with download log at `screenshots/playwright_download_log.json`

**Multi-source waterfall** (implemented in same script):
1. **SlotCatalog** (existing) — best for 2021-2024 games, provides review text + screenshot
2. **BigWinBoard** (NEW) — gameplay screenshots for popular games across all years
3. **Provider sites** (NEW, optional) — Evolution, Play'n GO for their specific catalogs

Each source tried in order. First success wins. All screenshots go to same destination. Source tracked in log.

**SC HTML save** (DONE in pilot): after `const html = await page.content()`:
```javascript
const scCacheDest = path.join(SC_CACHE_DIR, slug + '.html');
if (!fs.existsSync(scCacheDest) || fs.statSync(scCacheDest).size < 5000) {
    fs.writeFileSync(scCacheDest, html);
}
```

**Review text fallback** (DONE in pilot): When SC review is empty, art classifier uses game description from master as review context. 1,323 of 2,148 games have descriptions >= 50 chars.

**Execution approach:**
1. Pilot each source separately (20 games each) — measure hit rate and quality
2. Run full waterfall in batches of 200: SC first, BWB for 404s, provider for remaining
3. Review log after each batch — track success rate by source
4. All screenshots go through quality prescreen before classification

**Expected outcome (revised from pilot findings):**
- SlotCatalog: ~1,065 screenshots (50% overall, better for 2021-2024)
- BigWinBoard: +400-600 additional (pending pilot validation)
- Provider sites: +200-300 additional
- **Total estimate: ~1,600-1,900 screenshots** (75-85% coverage)
- Remaining ~250-500: too obscure, stay without art (acceptable)

**Quality gate:** Per `ART_PIPELINE_HANDOFF.md` rule 10 — screenshots must be actual in-game screenshots, not posters/logos. `pickBestImage()` prefers gallery images. Universal quality prescreen catches bad images regardless of source.

## Phase 1b: Screenshot Quality Filter (iterative calibration with user)

**Goal**: Build a reliable automated filter that catches non-gameplay screenshots BEFORE art classification. We calibrate it iteratively with user feedback until accuracy is high enough to trust.

**Why this matters**: In the last run, 409/2,726 (15%) were non-gameplay but STILL got classified with high confidence (279 had confidence >= 4). The classifier is overconfident on bad inputs. We need to catch these BEFORE wasting API cost and polluting results.

**Known hard cases the filter must catch:**
- Bonus/pick screens (look like gameplay but different art)
- Feature/wheel screens (have reels UI but wrong context)
- Big-win celebrations (overlay animations over game)
- App store marketing screenshots (stylized, not actual game)
- Posters/logos (easy — already caught well)
- Rules/paytable pages (easy — already caught well)

**Calibration loop:**

1. **Run 1**: Run existing `--pre-screen` on first download batch (~50-100 images)
2. **Generate review HTML**: Grid of ALL screenshots split into two sections:
   - "FLAGGED as non-gameplay" (with filter's classification)
   - "PASSED as gameplay" (so user can catch false negatives)
3. **User reviews**: Quickly scrolls both sections, reports:
   - False negatives (missed non-gameplay in the "passed" section)
   - False positives (wrongly flagged real gameplay)
4. **Tune**: Adjust prompt wording, add example descriptions of hard cases, potentially add image-based heuristics (e.g., "no visible reel grid = not gameplay")
5. **Re-run** on same set → regenerate HTML → user checks again
6. **Repeat** until user is satisfied with accuracy (targeting <2% false negative rate)

**Once calibrated**: The filter becomes an automated hard gate — non-gameplay screenshots are excluded from classification input list. No manual review needed for future batches (except spot-checks).

**Implementation**: 
- Prescreen results: `art_pipeline/screenshot_quality_prescreen.json`
- Review HTML: `art_pipeline/prescreen_review.html` (auto-generated grid with thumbnails)
- Filter exclusion list: games flagged as non-gameplay are skipped when building the classifier input file list
- Cost: ~$0.0002/image per iteration (trivial — can re-run multiple times)

**Current baseline** (from 840 previously screened):
- 741 gameplay (88.2%), 49 promotional, 30 bonus_screen, 8 rules_page, 5 loading_screen, 7 other
- Known issue: 6 cases where prescreen said "gameplay" but user disagreed (bonus/feature screens that look like gameplay)
- Agreement with full classifier: 88.6% (prescreen is slightly more lenient)

**Expect ~10-15% of new downloads to be non-gameplay** — calibrated filter should catch >98% of these before classification.

---

## Phase 2: Art Classification (incremental — user reviews every batch)

**Script**: `data/classify_art.py`
- Uses screenshots + SC HTML (text cross-reference) — same workflow as the original 2,726 classifications
- Now that we save SC HTML during download, these new games get the **same full pipeline** as existing ones (vision + text + description + symbol exclusion)
- **Prefer `--batch-api`** for cost savings (50% cheaper), but have **fallback to sequential** if batch API is unreliable for vision at volume (known risk from prior experience)
- Cost estimate: ~$0.015/game with vision = ~$18-22 for ~1,200 games
- **Requires explicit user cost approval** before EVERY batch (per `api-cost-control.mdc`)

**Execution approach — measure 5 times, cut once:**

1. **Quick win**: classify the ~31 SC cache games that already have screenshots + SC HTML but no art. **MUST split into 3 sub-batches of ~10** (gate logic: batches ≤10 bypass, >10 requires open gate). User reviews all 31 across the 3 sub-batches.
2. **Batch 0 (5 games)**: classify 5 newly-downloaded games → generate review HTML → user reviews ALL 5 → **bypasses gate** (≤10)
3. **Batch 1 (10 games)**: if batch 0 approved → classify 10 → user spot-reviews → **bypasses gate** (≤10)
4. **Gate opening** (REQUIRED before batches >10): Save user review verdicts → apply any corrections → set `fixes_applied: true` in gate metadata → THEN run `--regression-full`. Gate opens ONLY if all dimension thresholds pass AND `fixes_applied` is true. If gate stays closed, fix issues and retry.
5. **Batch 2 (50 games)**: ONLY if gate open → classify 50 → user reviews sample of 10-15 → results added to `results.json` (NOT master)
6. **Batch 3+ (100 games)**: scale up gradually → user reviews sample per batch → results accumulate in `results.json`
7. **Never proceed to next batch without user approval of current batch**

**Batch API validation**: Run batch 0 (5 games) with `--batch-api`. If it succeeds cleanly, continue with batch-api for all subsequent. If it fails/hangs/returns malformed results, switch to sequential mode for the rest.

**Checkpoints (every ~50 games)**:
- `art_pipeline/results.json` is updated after each sub-batch (existing behavior of classify_art.py)
- Git commit `art_pipeline/results.json` after every successful batch review (recover from IDE crash = just re-read committed results)
- Log file: `art_pipeline/run_log.json` tracks which games have been classified per session

At each gate: verify no drift in existing art, check for unmapped themes, confirm accuracy.

**Pre-flight gate**: `classify_art.py` blocks batches where <80% of games have screenshots. For new games, we only classify ones where: (a) screenshot exists, (b) text context is available (SC cache HTML OR synthetic HTML from BWB OR master description >= 50 chars), AND (c) prescreen passed as "gameplay" (once hard gate is wired).

## Phase 3: Single Atomic Merge (AFTER both agents complete + both reviews pass)

**Pre-conditions** (ALL must be true before merge):
- Agent 1: `staged_feature_extraction.json` exists and validated
- Agent 2: `art_pipeline/results.json` updated with new classifications
- User Review 1 (screenshots): passed
- User Review 2 (art spot-check): passed
- `art_theme_consolidation_map.json`: all new themes mapped (no missing entries)

**Merge script** (NEW: `scripts/merge-all-staged.mjs`):
1. **Stale baseline check**: Hash the master file, compare to a saved hash from when agents started. If master was modified externally since agents began, ABORT (prevents merging against a different version).
2. **Backup**: `cp game_data_master.json game_data_master.backup-TIMESTAMP.json`
3. **Load master into memory** (single read — all mutations happen in-memory)
4. **Apply features**: Read `staged_feature_extraction.json`, match games by `name` field, apply features/symbols/themes/specs per game
5. **Apply art** (INLINED logic from `merge-art-data.cjs` — do NOT shell out to it, since it does its own disk write). Use `masterByNorm` Map (with collision assertion), apply art fields from `results.json` entries to matching master games
6. **Validate merged in-memory object** (BEFORE any disk write):
   - `JSON.stringify()` + `JSON.parse()` roundtrip succeeds
   - Game count unchanged (5,124)
   - Art count increased (2,726 + new)
   - Feature count increased (3,398 + new)
   - No duplicate IDs or names
   - No `null` where there was previously a value (regression check)
7. **Single atomic write**: Write to `.tmp` file → `JSON.parse(fs.readFileSync('.tmp'))` verifies → `fs.renameSync()` to master path
8. **Build**: `npm run build:data` (generates processed JSON + parquet)
9. **Tests**: Full test suite

**Key design**: ONE `fs.renameSync()` call = ONE disk mutation for master. All logic happens in-memory. If anything fails before step 7, master file is never touched.

**`--dry-run` mode**: Runs steps 1-6 without disk write. Reports: games matched (features), games matched (art), collision check, validation results. Use for pre-merge confidence.

**Rollback**: If validation fails (step 6), master is untouched. If post-build tests fail (step 9), restore from backup.

## Complete Data Source Checklist (per game)

The art classifier uses ALL of these. Status shows what new games already have vs what needs acquiring:

| # | Data Source | File Location | Status for New Games | How Acquired |
|---|-------------|---------------|---------------------|--------------|
| 1 | **Screenshot** | `screenshots/{slug}.ext` | MISSING | Playwright download (Phase 1) |
| 2 | **SC cache HTML** | `_legacy/sc_cache/{slug}.html` | MISSING | Playwright saves page HTML (Phase 1) |
| 3 | **Quality prescreen** | `art_pipeline/screenshot_quality_prescreen.json` | MISSING | `classify_art.py --pre-screen` (Phase 1b) |
| 4 | **Symbols** | `game_data_master.json` → `symbols` field | POPULATED (for 1,332 with features) | Feature extraction (Phase 3, already done) |
| 5 | **Description** | `game_data_master.json` → `description` field | POPULATED (1,323 of 2,148) | Feature extraction (Phase 3, already done) |
| 6 | **Corrections** | `art_pipeline/corrections.json` | N/A | Added during review if needed |
| 7 | **Pipeline config** | `art_pipeline/config.json` | EXISTS (v11.5) | No action needed |
| 8 | **Ground truth** | `art_pipeline/ground_truth.json` | EXISTS (20 games) | Used for regression only |

All inputs feed into the `build_user_message()` call in `classify_art.py`:
1. Screenshot + masked screenshot (reel area blacked out) → Claude Vision (image inputs)
2. SC HTML review text → parsed via `extract_review()` which extracts `<h2>Review</h2>` section
3. Symbols → exclusion hints ("GAME REEL SYMBOLS: ... THESE ARE NOT CHARACTERS")
4. Description → text cross-reference ("GAME DESCRIPTION: ...")
5. Corrections → known facts injected into prompt ("KNOWN FACTS: ...")
6. Quality prescreen → gate (non-gameplay images skipped before classification)

## Complete Data Flow (7 steps)

```
Step 1: ACQUIRE (Playwright)
  game name → slotcatalog.com/en/slots/{slug}
  Output: screenshots/{slug}.ext + _legacy/sc_cache/{slug}.html

Step 2: QUALITY PRESCREEN (classify_art.py --pre-screen)
  screenshots/{slug}.ext → Claude minimal call ($0.0002/image)
  Output: art_pipeline/screenshot_quality_prescreen.json
  Gate: only "gameplay" quality proceed (expect ~88% pass rate)

Step 3: CLASSIFY (classify_art.py --batch-api)
  Inputs: screenshot + SC HTML + symbols + description + corrections + config
  Output: art_pipeline/results.json

Step 4: REVIEW (user spot-checks every batch)
  Input: results.json → review HTML
  Output: user_reviews.json, corrections.json (if fixes needed)
  Gate: batch_gate.json (≤10 games bypass, >10 requires open gate)

Step 5: SINGLE MERGE (node scripts/merge-all-staged.mjs)
  staged_feature_extraction.json + art_pipeline/results.json → game_data_master.json
  Feature matching: by game name (exact)
  Art matching: SC slug → game name via hyphen-to-space + normalize (masterByNorm)
  Art fields: art_theme, art_theme_secondary, art_color_tone,
              art_characters, art_character_categories, art_elements,
              art_narrative, background_description, is_branded,
              screenshot_quality, art_confidence
  Feature fields: features, symbols, themes, specs (rtp, volatility, etc.)

Step 6: CONSOLIDATION MAP CHECK
  Any new art_theme value MUST exist in art_theme_consolidation_map.json
  If missing → build:data CRASHES with process.exit(1)
  KNOWN ISSUE: 2 themes in results.json not yet mapped:
    - "Magic/Illusion"
    - "European/Italian City"
  → Must add mappings BEFORE any game with these themes enters master

Step 7: BUILD (npm run build:data)
  Reads: master + theme_consolidation_map + art_theme_consolidation_map
         + franchise_mapping + confidence_map + staged_art_characterization
  Output: dist/data/games_processed.json + games.parquet
```

## Known Issues / Blockers to Address Before Running

1. **`art_theme_consolidation_map.json` missing 2 themes**: "Magic/Illusion" and "European/Italian City" exist in `art_pipeline/results.json` but have no mapping. Must add entries before merge touches games with these themes. (Currently 0 games in master have them — safe for now, but new classifications could produce them.)

2. **`batch_gate.json` is CLOSED**: Gate was closed after batch 99 (1,963 games). Per `art-pipeline-gates.mdc`: batches ≤10 bypass the gate. Our incremental plan (5→20→50→100) means first 2 batches bypass automatically. For batch 3 (50 games), we need to either:
   - Run `--regression-full` to auto-open if thresholds pass, OR
   - Open manually after user approves spot-check results

3. **`staged_art_characterization.json`** (4,201 entries): Legacy text-only art data still read by `build-parquet.mjs` as secondary source. New classifications go through `art_pipeline/results.json` → `merge-art-data.cjs` → master. No conflict, but be aware both paths feed into the build.

4. **Playwright slug format**: `buildSlug(name)` produces Title-Case-With-Hyphens (e.g., "Huff-N-Puff-Money-Mansion"). Existing SC cache uses same format (72% are Title-Case). `classify_art.py` finds files by exact filename — works on macOS (case-insensitive FS). Special char games (5 total, e.g., "Break The Piggy Bank (Octoplay)") need verification that SlotCatalog handles parentheses in URLs.

5. **PIL/Pillow dependency**: `create_masked_screenshot()` requires Pillow (`from PIL import Image`). Ensure it's installed in the Python env (`pip install Pillow`). **VERIFIED**: Pillow is installed.

6. **`masterByNorm` collision in merge-art-data.cjs**: If two master games normalize to the same key, last one wins in the Map. **Pre-merge validation step**: run `merge-all-staged.mjs --dry-run` which asserts unique normalized names. If collisions found, resolve manually before real merge.

7. **`staged_art_characterization.json` ↔ master parity**: `build-parquet.mjs` reads art from staged file (`artMap[game.name]`). Fix (Change 5 above): code change makes master take precedence. After merge, also update `staged_art_characterization.json` to include new games (keeps the file as a secondary backup). Run `build:data` and compare counts.

8. **Batch API reliability for vision**: Prior experience suggests large vision batches may throttle/fail. Plan uses batch-api by default but has explicit fallback to sequential mode if batch 0 shows issues.

9. **Legal/ToS**: SlotCatalog scraping with 4s delays and ~2K pages. No explicit robots.txt check in plan. Risk is procedural — existing 2,760 pages were previously scraped from same source without issue.

---

## Pilot Batch Verification Checklist (first 20 downloads)

Before scaling up, verify ALL of the following on the first 20 games:

1. Saved HTML has `<h1>` with correct game name
2. Saved HTML has `<h2>Review</h2>` section with meaningful review text (not empty)
3. Saved HTML has image gallery URLs (parseable by `extractImageUrls()`)
4. HTML file size is reasonable (>5,000 chars = has content; existing SC cache avg ~148KB)
5. `extract_review()` successfully parses the saved HTML (returns non-empty review text)
6. Screenshot is actual gameplay (not poster/promo) — `pickBestImage()` should select gallery images
7. `load_screenshot()` can find and load the downloaded image by slug
8. File naming matches: SC slug used for both HTML and screenshot is consistent
9. On macOS: verify case handling works (slug = Title-Case-With-Hyphens)

If any of these fail, STOP and fix before proceeding to full download.

---

## Considerations

- **Games without features + with art**: These 663 games are currently hidden from the app. No change proposed for now — they're mostly table games (Casino Floor theme). Can revisit the filter later if desired.
- **Non-slot games** (250 without art): Skip for now — Live Casino, Table Games, Video Poker don't benefit much from visual art classification.
- **Failed downloads**: Games we can't find on SlotCatalog will remain without art. This is acceptable — the app handles null `art_theme` gracefully.
- **Rate limiting**: SlotCatalog has Cloudflare protection. The 4s delay in the Playwright script handles this. If we get blocked, increase delay to 8s or use `--start-from` to resume.
- **SlotCatalog page format risk**: Live pages must have same structure as cached (h1 + h2 Review section). Verified in pilot batch.
- **357 classification failures in last batch**: Caused by missing screenshots/SC cache. Our approach (only classify games with BOTH) avoids this.
- **Spot-check review HTML**: Generated by a separate script/agent during previous reviews (e.g., `BATCH1_SPOT_CHECK.html`). We'll generate similar review HTML for each batch so you can visually inspect results alongside screenshots.

## Dependencies Verified

- Python: Pillow (PIL) installed, BeautifulSoup4 installed, anthropic SDK installed
- Node: Playwright 1.58.0 installed (with Chrome channel)
- API key: `data/.env` exists with `ANTHROPIC_API_KEY`
- Pipeline version: v11.5 (accuracy validated at >97% theme, 100% characters, 98% elements)
- Model: `claude-sonnet-4-20250514` (set in `art_pipeline/config.json`)

## Files That Will Be Modified/Created

| File | Action | Notes |
|------|--------|-------|
| `data/download_sc_screenshots_playwright.mjs` | MODIFIED | Add SC HTML save (3 lines) |
| `data/_legacy/sc_cache/*.html` | CREATED | New SC pages for ~1,200 games |
| `data/screenshots/*.ext` | CREATED | New screenshots for ~1,200 games |
| `data/extraction_results.jsonl` | CREATED | Agent 1: raw batch API results |
| `data/staged_feature_extraction.json` | CREATED | Agent 1: validated features output |
| `scripts/apply-features-from-jsonl.mjs` | CREATED | Reads JSONL → writes staged JSON |
| `scripts/merge-all-staged.mjs` | CREATED | Final merge: staged features + art → master |
| `data/art_pipeline/screenshot_quality_prescreen.json` | UPDATED | New entries for prescreened games |
| `data/art_pipeline/results.json` | UPDATED | Agent 2: new classification results |
| `data/art_pipeline/run_log.json` | UPDATED | Audit trail entries |
| `data/art_pipeline/batch_gate.json` | UPDATED | Gate cycle per batch |
| `data/art_theme_consolidation_map.json` | POTENTIALLY UPDATED | If new themes appear |
| `data/game_data_master.json` | UPDATED | **ONLY during final merge step** (single atomic write) |
| `dist/data/games_processed.json` | REGENERATED | After build:data |

## Phase 3b: Show Art-Only Games in App

**Goal**: Games with `art_theme` but no features should appear in the dashboard (currently hidden by `RELIABLE_GAME` filter).

**Unified rule**: `hasArt = art_theme IS NOT NULL AND TRIM(art_theme) != ''` — must be identical in ALL 4 locations:

**Change 1**: `src/lib/db/duckdb-client.js` — extend `RELIABLE_GAME` SQL clause (line 27):
```sql
OR (art_theme IS NOT NULL AND TRIM(art_theme) != '')
```

**Change 2**: `src/lib/data.js` — extend JSON fallback filter (lines 182-195):
```javascript
const hasArt = g.art_theme && g.art_theme.trim() !== '';
return specReliable || hasFeatures || hasArt;
```

**Change 3**: `src/lib/db/duckdb-client.js` — extend `isReliable` function (lines 270-277):
```javascript
const hasArt = game.art_theme && game.art_theme.trim() !== '';
return specReliable || hasFeatures || hasArt;
```

**Change 4**: `scripts/build-parquet.mjs` — extend `isReliable` function (lines 47-54):
```javascript
const hasArt = game.art_theme && game.art_theme.trim() !== '';
return specReliable || hasFeatures || hasArt;
```

**CRITICAL: DuckDB art_theme column source mismatch (RESOLVED)**:

The DuckDB INSERT (line 351 of `duckdb-client.js`) and `build-parquet.mjs` (line 88/146) both read `art_theme` from `staged_art_characterization.json` (`artMap[game.name]`), NOT from `game.art_theme` (master). This creates a dangerous mismatch:

- `staged_art_characterization.json` has 4,201 entries (old text-only pipeline, unverified)
- `game_data_master.json` has 2,726 with art_theme (vision-verified, >97% accuracy)
- Where both exist: 100% agreement (0 disagreements)
- 1,573 staged-only games have TEXT-INFERRED art (lower quality, never vision-verified)
- 98 master-only games have art NOT in staged (from art_pipeline/results.json merge)

**FIX (Change 5)**: In `src/lib/db/duckdb-client.js` line 351, change the art_theme INSERT to prefer master over staged:
```javascript
// Before: ${safeStr(artMap[game.name]?.art_theme)}
// After:
${safeStr(game.art_theme || artMap[game.name]?.art_theme)}
```

Apply same pattern to ALL art fields in the INSERT (lines 351-357). Use **all-or-nothing per game** — if master has `art_theme`, use ALL master art fields; otherwise fall back to ALL staged fields. This prevents partial-source mixing:
```javascript
const artSource = game.art_theme ? game : (artMap[game.name] || {});
${safeStr(artSource.art_theme)}
${safeStr(artSource.art_theme_secondary)}
${toArrayLiteral(artSource.art_characters)}
${toArrayLiteral(artSource.art_elements)}
${safeStr(artSource.art_narrative)}
${toArrayLiteral(artSource.art_color_tone)}
${safeStr(artSource.art_confidence)}
```

And same in `build-parquet.mjs` line 88 + art field lines 146-152 (all-or-nothing per game):
```javascript
// If master has art_theme, use ALL art fields from master; else fall back to ALL staged fields
const artSource = game.art_theme ? game : (artMap[game.name] || {});
art_theme: artSource.art_theme || null,
art_theme_secondary: artSource.art_theme_secondary || null,
// ... etc for all art fields
```

**Effect**: RELIABLE_GAME's `art_theme IS NOT NULL` now checks vision-verified art (2,726 games), NOT unverified text-only art (4,201). Only high-quality art qualifies a game as "reliable." The 1,573 text-only staged games remain as-is (shown if they also have features/specs) but DON'T newly appear purely via art criterion.

**Tests to update** (ALL must be in the SAME COMMIT as the filter change — otherwise CI breaks):
- `tests/data-validation/validate-reliable-filter-alignment.test.js` — add `hasArt` to both `jsIsReliable` and `sqlIsReliable`
- `tests/data-validation/validate-filter-invariants.test.js` — add `hasArt` to `isReliable` helper
- `tests/data-validation/validate-rank-integrity.test.js` — update `isReliable` + art-only games DO get ranks (they have theo_win/market_share)
- Add new fixture test: game with `art_theme` but no features/confidence → appears in `getAllGames`
- **All 4 filter changes + all test updates = single atomic commit**

**UX behavior for games with art but no features:**
- Game panel "Mechanics" section: shows "No features detected" (already handled by `parseFeatures`)
- Mechanic charts: NOT polluted (they independently filter `features IS NOT NULL AND len(features) > 0`)
- Performance charts: work normally (games have `theo_win`, `market_share_pct`)
- Art Insights charts: contribute normally
- Overview stats (total_games, avg_theo_win, etc.): WILL SHIFT — expected, document before/after
- "Classified %" stat: stays lower for these (requires theme + features) — accurate representation
- `performance_rank`: computed for art-only games too (Change 4 ensures this)

**Risk**: Low. No crashes. `parseFeatures` normalizes null/empty to `[]`. Main risk is **aggregate metric drift** (expected — more games in denominator shifts averages slightly). Snapshot key metrics before/after the change.

---

## Phase 0 (Prerequisite): Documentation Hub

**Goal**: Create a single reference folder with all pipeline documentation, linked from a cursor startup rule so it's always available.

**New folder**: `game_analytics_export/docs/pipelines/`

**Files to create/consolidate:**
- `game_analytics_export/docs/pipelines/ART_CLASSIFICATION_PIPELINE.md` — consolidated from `ART_PIPELINE_HANDOFF.md` + this plan's data flow
- `game_analytics_export/docs/pipelines/FEATURE_EXTRACTION_PIPELINE.md` — extract from `PHASE1_TRUTH_MASTER.md`
- `game_analytics_export/docs/pipelines/DATA_UPDATE_PIPELINE.md` — CSV update process from the CSV plan
- `game_analytics_export/docs/pipelines/BUILD_PIPELINE.md` — what `npm run build:data` does, its inputs/outputs, failure modes

**Cursor rule update**: Add to `.cursor/rules/pipeline-preflight.mdc` (already `alwaysApply: true`):
```
5. `game_analytics_export/docs/pipelines/` — consolidated pipeline documentation (art, features, data update, build)
```

**Maintenance rule**: Any time a pipeline changes, update the corresponding doc in `docs/pipelines/`. Add a note at the top of each doc: "Last updated: [date]. If this is stale, update it."

---

## Two Separate User Reviews (MANDATORY)

**Review 1: Screenshot Quality** (after download, before classification)
- Generated HTML grid of ALL downloaded screenshots
- User scrolls through quickly to flag non-gameplay images
- Iterative: flag → tune filter → re-run → flag again until clean
- Goal: <2% false negatives before proceeding to classification
- Separate from art accuracy — this is ONLY about "is this an actual in-game screenshot?"

**Review 2: Art Classification Spot-Check** (after each batch)
- Generated HTML with screenshot + classified theme/characters/elements side by side
- User reviews sample (all for small batches, 10-15 for large batches)
- Reports misclassifications → corrections.json → re-run if needed
- This is about art ACCURACY — "did Claude get the theme/characters right?"

These are **two different HTML review pages** generated at different stages.

---

## Cost and Time Estimate

| Task | Games | Cost (batch API + cache) | Time |
|------|-------|--------------------------|------|
| Feature extraction | 457 | ~$8-11 | ~30-60 min (API) |
| Screenshot download | 2,148 | free | ~3-4 hours |
| Quality prescreen | ~1,400 | ~$0.30 | ~5 min |
| Art classification | ~1,300 | ~$12-15 | ~30-60 min (API) |
| **TOTAL** | | **~$21-27** | ~5-6 hours wall-clock |

Note: Features and screenshots run in parallel, so total wall-clock is ~4-5 hours (not additive).
Human review time: ~30 min total across both review stages.
