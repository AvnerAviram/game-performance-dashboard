# Art Agent — Batch 4-7 Sprint: Classify Remaining 1,778 Games

**From**: Atlas (orchestrator)
**Mission**: Fix the `.jpeg` extension bug, classify all remaining selectable games, re-classify old batches with improved prompt, resolve outstanding issues, and produce a final accuracy report.
**Estimated cost**: ~$21
**Estimated API time**: ~7-8 hours total (spread across batches)

---

## Current State (verified by Atlas)

- **2,645 / 4,201 slots have results** (63%), but only 981 are v2 (current pipeline)
- **~1,778 games truly selectable** (have screenshot + SC review + not yet v2 classified)
  - 1,660 found by `--select-batch` (only checks `.jpg/.png/.webp`)
  - **118 hidden by `.jpeg` extension bug** (fix in Phase 0 before ANY classification)
- **~1,442 slots cannot be classified** (no screenshot or no SC review — out of scope for this sprint)
- **Accuracy (232-game expanded regression)**:
  - Theme: 97.0% adjusted — PASSES gate
  - Characters: 90.9% adj
  - Elements: 74.1% adj (weakest, but improved steadily through vocab work)
  - Colors: 91.8% adj
- **296 games in user_reviews.json** (232 human, 64 auto)
- **52 corrections in corrections.json**
- **2,760 screenshots on disk** (re-downloaded with image #2 = gameplay; dir also has 9 non-image files)

### Optimal Config (validated by cost experiment)

Use **T3** for ALL classification in this sprint:
- Prompt caching ENABLED (`cache_control: {"type": "ephemeral"}`)
- No masked screenshot (`--no-masked`)
- Sync API (NOT batch API — batch API is unreliable for >100 vision requests)
- Cost: **$0.010/game**
- Speed: ~5 games/min

---

## Sprint Plan — 7 Phases (Phase 0 is a bug fix, no API cost)

### Phase 0: Fix `.jpeg` Extension Bug (MANDATORY — no API cost)

**Problem**: `load_screenshot()`, `create_masked_screenshot()`, `select_new_batch()`, and `repair_screenshots()` listing only check `.jpg/.png/.webp` — NOT `.jpeg`. **118 unclassified games** with `.jpeg` screenshots are invisible to batch selection and classification.

**Fix**: In `classify_art.py`, add `.jpeg` to the extension list in these 4 locations:

1. **`load_screenshot()`** (line ~671): Change `for ext in ['.jpg', '.png', '.webp']:` → `for ext in ['.jpg', '.jpeg', '.png', '.webp']:`
2. **`create_masked_screenshot()`** (line ~687): Same change
3. **`select_new_batch()`** (line ~1873): Change `for ext in ['*.jpg', '*.png', '*.webp']:` → `for ext in ['*.jpg', '*.jpeg', '*.png', '*.webp']:`
4. **`repair_screenshots()` listing** (lines ~2230-2236): Add an `or os.path.exists(os.path.join(SCREENSHOT_DIR, fname.replace('.html', '') + '.jpeg'))` clause to the existing `.jpg`/`.png`/`.webp` chain

Also fix 2 stale comments:
- Line ~1996: docstring says "192" → change to "232"
- Line ~2508: argparse help says "192" → change to "232"

**Verify after fix**:
```bash
python3 -c "
from classify_art import select_new_batch
games = select_new_batch(9999)
print(f'{len(games)} selectable games')
# Should be ~1,778, NOT ~1,660
"
```

### Phase 1: Batch 4 (~420 games, ~$4.20) + Spot-Check

```bash
cd game_analytics_export/data

# Select 450 unclassified games (includes .jpeg games after Phase 0 fix)
python3 classify_art.py --select-batch 450

# Classify them (T3 config: cached, no masked)
python3 classify_art.py [FILES...] --no-masked

# Run expanded regression (offline, no API calls)
python3 classify_art.py --regression-full
```

**After batch 4:**
- Verify theme stays ≥97% adjusted. If it drops, STOP and investigate.
- Verify some `.jpeg` games were included in this batch (proves Phase 0 fix worked).
- **Spot-check 10 random games** → `BATCH4_SPOT_CHECK.html`
- Present to user for review. If issues found, fix before continuing.
- Save user verdicts to `user_reviews.json`.
- Report: games classified, success/fail count, regression scores.

### Phase 2: Batch 5 (~450 games, ~$4.50) + Spot-Check

```bash
python3 classify_art.py --select-batch 450
python3 classify_art.py [FILES...] --no-masked
python3 classify_art.py --regression-full
```

**After batch 5:**
- **Spot-check 10 random games** → `BATCH5_SPOT_CHECK.html`
- Present to user for review.
- If spot-check reveals new vocab issues or systematic errors, fix them before continuing.
- Save user verdicts to `user_reviews.json`.

### Phase 3: Batch 6 (~450 games, ~$4.50) + Spot-Check

```bash
python3 classify_art.py --select-batch 450
python3 classify_art.py [FILES...] --no-masked
python3 classify_art.py --regression-full
```

**After batch 6:**
- **Spot-check 10 random games** → `BATCH6_SPOT_CHECK.html`
- Present to user for review.
- Fix any issues before continuing.
- Save user verdicts to `user_reviews.json`.

### Phase 4: Batch 7 (remaining games) + Final Spot-Check

```bash
# Select ALL remaining unclassified
python3 classify_art.py --select-batch 9999
python3 classify_art.py [FILES...] --no-masked
python3 classify_art.py --regression-full
```

**After batch 7:**
- **Spot-check 10 random games** → `BATCH7_SPOT_CHECK.html`
- Present to user.
- At this point, ALL selectable games should be classified. Verify with `--stats`.

### Phase 5: Re-classify Batches 1-2 with Current Prompt (~349 games, ~$3.49)

Batches 1 and 2 were classified with older prompts — before:
- Character specificity improvements
- Vocab splits (Trees/Forest, Castle/Fortress/Tower, Bamboo/Tropical Plants)
- New vocab (Candy, Gold Coins, Caution Tape, Inferno/Fire theme, Fire Station theme)
- Rope Frame false-positive fix
- Gold Coins un-filtered from noise
- Common misses checklist

These ~349 games should be re-classified with the current prompt to ensure consistent quality.

**How to identify batch 1-2 games:**
- They're already in results.json with `_classified_at` timestamps on **2026-04-19** (~349 games)
- There is NO `_batch_id` field — use the `_classified_at` date to filter
- Some legacy v1 entries have no `_classified_at` at all (they have `_source` instead) — leave those for now
- Re-classify by passing their filenames to the pipeline with `--no-masked`
- The pipeline will overwrite their entries in results.json with improved classifications

```bash
# Extract batch 1-2 filenames (classified on 2026-04-19)
python3 -c "
import json
r = json.load(open('art_pipeline/results.json'))
files = [k for k,v in r['games'].items()
         if v.get('_classified_at','').startswith('2026-04-19')]
print(f'{len(files)} batch 1-2 games found')
for f in files: print(f)
" > /tmp/batch12_files.txt

# Then re-classify with current prompt
python3 classify_art.py [FILES_FROM_LIST...] --no-masked
python3 classify_art.py --regression-full
```

**After phase 5:**
- Run expanded regression. Compare scores to pre-reclassification baseline.
- Report: how many games changed, which dimensions improved.

### Phase 6: Final Cleanup & Report

1. **Resolve the 7 unresolved theme issues** — add corrections to `corrections.json` for the clear cases:
   - 10x-cash: Add correction for "Money/Gold/Casino" theme (if user confirmed this)
   - 9-Coins: Add correction for "Classic/Fire"
   - Basketball-Star-On-Fire: Add correction for basketball secondary
   - Lucky-Golden-Toad & Lucky-Tree: Mark as "bad screenshot, no fix available" in corrections notes
   - Renegades: Add correction for user's preferred theme if clear
   - circuit-shock: Leave as-is (user was unsure)

2. **Resolve 3 remaining fix games**: Big-Foot, Djinn-Of-Storms, circuit-shock — add corrections if clear answers exist.

3. **Run final expanded regression** and generate a comprehensive report:
   - Total coverage: X / 4,201 slots
   - Accuracy across all dimensions
   - Breakdown by batch
   - Known gaps (unclassifiable games)
   - Cost summary for entire sprint

4. **Update `ART_PIPELINE_HANDOFF.md`** with final state.

5. **Update Atlas working memory** (`.cursor/rules/atlas-working-memory.mdc`) with final numbers.

---

## Reporting Protocol

After EACH batch, report to the user:

```
BATCH N COMPLETE
- Games classified: X (Y succeeded, Z failed)
- Total coverage: X / 4,201 (XX.X%)
- Cost: ~$X.XX
- Regression: Theme XX.X% | Chars XX.X% | Elements XX.X% | Colors XX.X%
- [Spot-check: if applicable]
```

---

## Non-Negotiable Rules

1. **NEVER call external APIs without user approval** — state count + cost estimate, wait for "yes"
2. **Use T3 config ONLY** — `--no-masked` flag, sync API (not batch API)
3. **Theme must stay ≥97% adjusted** on `--regression-full` after EVERY batch. If it drops, STOP.
4. **Run `--regression-full` after every batch** — this is the primary quality gate (232 human-reviewed games, offline, no API cost)
5. **Save all user verdicts immediately** to `user_reviews.json`
6. **DO NOT write to `game_data_master.json`**
7. **Update working memory** (`.cursor/rules/atlas-working-memory.mdc`) after each phase with accurate numbers
8. **Spot-check format**: Generate HTML review files matching the format of `BATCH3_SPOT_CHECK.html`
9. **Results save ONLY at batch end** — if the process crashes mid-batch, all results are lost. Monitor for errors. If you see repeated failures, stop early and save what you have by splitting into smaller sub-batches.

## Cost Summary

| Phase | Games | Cost | Spot-Check |
|-------|-------|------|------------|
| Phase 0 (.jpeg fix) | 0 | $0.00 | N/A (code fix only) |
| Batch 4 | ~450 | $4.50 | Yes (10 games) |
| Batch 5 | ~450 | $4.50 | Yes (10 games) |
| Batch 6 | ~450 | $4.50 | Yes (10 games) |
| Batch 7 | remaining (~428) | $4.28 | Yes (10 games) |
| Re-classify 1-2 | ~349 | $3.49 | No (regression only) |
| **Total** | **~2,127** | **~$21.27** | **4 spot-checks** |

---

## Key Files

```
game_analytics_export/data/
├── classify_art.py              ← Main pipeline
├── art_pipeline/
│   ├── results.json                ← Classification results (currently 2,645 games)
│   ├── user_reviews.json           ← 296 entries (232 human, 64 auto)
│   ├── corrections.json            ← 52 game-specific overrides
│   └── run_log.json                ← Audit trail
├── screenshots/                    ← 2,760 gameplay screenshots (134 are .jpeg)
├── _legacy/sc_cache/               ← SC review HTML files
├── game_data_master.json           ← Master data (READ ONLY)
└── .env                            ← ANTHROPIC_API_KEY

.cursor/rules/
├── atlas-working-memory.mdc        ← Update after each phase
└── atlas-orchestration.mdc         ← Orchestration rules (reference)
```

## CLI Quick Reference

```bash
python3 classify_art.py --select-batch N       # Select N unclassified games
python3 classify_art.py FILE... --no-masked     # Classify (T3 config)
python3 classify_art.py --regression-full       # 232-game expanded regression (offline)
python3 classify_art.py --stats                 # Pipeline stats
python3 classify_art.py --repair-screenshots    # Find + fix bad screenshots
```
