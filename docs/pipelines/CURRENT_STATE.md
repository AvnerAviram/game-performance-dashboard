# Pipeline State — May 14, 2026

## Where We Left Off

Color threshold calibration complete (25%, 3 rounds). Rollout A (203 games color update) and Rollout D (142 games full reclass) done. Screenshot acquisition Phase 1 complete (673 new gameplay screenshots). Batch E art classification (672 games) done, spot-checked (85% accuracy, 3 fixes applied), and promoted to master. All tests pass (1689).

---

## Numbers

| Metric | Value |
|--------|-------|
| Games in master | 5,124 |
| Screenshots on disk | 4,059 |
| Prescreen classified | 4,057 (3,665 gameplay / 165 promo / 75 splash / 152 rules) |
| Art results total (pipeline) | 998 games (with latest prompt + 25% threshold) |
| Art data in master JSON | 3,693 with theme, 994 with art_color_tone_pct |
| Color threshold | **25%** (calibrated R1→R3, Top-1=88%) |

---

## Action Scorecard

| Action | Count | Status | Notes |
|--------|-------|--------|-------|
| **A. Color calibration** | 40 games | ✅ DONE | 3 rounds, 82.5% at 25% threshold |
| **B. Rollout A (color update)** | 203/324 games | ✅ DONE | 121 skipped (non-gameplay SC) |
| **C. Rollout D (full reclass)** | 142 games | ✅ DONE | Upgraded screenshots, 85% spot-check |
| **D. Promote to master** | 325 games | ✅ DONE | build:data + tests pass |
| **E. Screenshot acquisition P1** | 673 new gameplay | ✅ DONE | SC smart retry, 97.5% success, $5.35 |
| **E2. Art classify new screenshots** | 672 games | ✅ DONE | Batch API $3.70 + $0.31 retry, promoted to master |
| **E3. Need more screenshots** | ~1,065 games | NEXT | Untried SC + BWB fallback |
| **F. Remaining old art games** | ~2,697 games | Pending | In master with old prompt, no pct data yet |

---

## What's Done

1. **Batch 24 art classification** — 79 games classified, spot-checked, 10 corrections applied. Results in `state/results.json`, NOT yet in master.

2. **Theme taxonomy cleanup** — 7 new consolidated buckets added:
   - Candy (59), Nature/Forest (59), Farm (59), Atlantis (15), Carnival (24), Steampunk (18), Prehistoric (18)
   - Maps updated, tests pass, `build:data` successful.

3. **Smart SC retry** — 76 new gameplay screenshots acquired via iterative download+classify loop. 86.4% success rate.

4. **Screenshot classification V6** — 297 ground truth images, 97.4% accuracy.

5. **Screenshot Acquisition Phase 1** (May 14):
   - Retried 690 "size-rejected" SC games via `sc_smart_retry.mjs`
   - 673 new gameplay screenshots acquired (97.5% hit rate)
   - All confirmed via prescreen classifier (672 gameplay, 1 rules_page)
   - Cost: $5.35 total ($3.33 download classify + $2.02 prescreen)
   - Total screenshots: 3,384 → 4,059; gameplay: 2,993 → 3,665

6. **Color threshold — Calibration COMPLETE** (May 13):
   - Prompt rewritten: shade-aware + dark-bg bias fix + anti-overestimation rules
   - Threshold: **25%** (calibrated from 20% across 3 rounds of user review)
   - Calibration: R1=77%, R2=75%, R3@25%=82.5% — Top-1 regression=88%
   - Output: `art_color_tone_raw` (all colors with pct) → `art_color_tone` (≥25%) + `art_color_tone_pct` (with %)
   - Post-processing: 25% hard threshold, always-keep-top-1 fallback, cap at 3
   - Shade aggregation in dashboard: Dark Blue/Light Blue → Blue bubble (details on hover)
   - 27 Python unit tests pass, 1689 JS tests pass
   - Regression: theme 94%, color Top-1 88%, characters 94%

---

## Active Workstreams (parallel)

### A-D. Color + Reclassification + Promote — ALL DONE

| Phase | Result |
|-------|--------|
| Color calibration (3 rounds) | 82.5% at 25% threshold, Top-1=88% on GT |
| Rollout A (color update) | 203 games reclassified, 0 validation issues |
| Rollout D (full reclass) | 142 games, 85% spot-check, 3 corrections applied |
| Promote to master | 325 + 671 games merged, build:data + 1689 tests pass |

### E. Screenshot Acquisition — Phase 1 DONE, Phase 2 NEXT

**Phase 1 (May 14) — COMPLETE:**
- Source: 690 SC "size-rejected" games → retried with `sc_smart_retry.mjs` (up to 6 images/page)
- Result: **673 new gameplay screenshots** (97.5% success rate)
- Cost: $3.33 (download classify) + $2.02 (prescreen) = **$5.35 total**
- All 673 confirmed gameplay by prescreen (1 edge case: Luck-Of-The-Dead → rules_page)
- State: `scraping/state/sc_retry_log.json` updated, `prescreen_results.json` updated

**Phase 2 (~1,065 remaining):**
- ~57 untried games in `sc_ready_to_try.json` (never attempted via Playwright)
- ~1,000+ games with no SC match — need BWB fallback or manual curation
- VSO fallback ready but not run at scale
- Bing is dead (bot detection)
- Every new gameplay screenshot → full art classification (new prompt with 25% threshold)

### F. Remaining Old Art Games (~2,697 in master, old prompt)

- These games have art_theme/art_color_tone from older prompt versions
- No art_color_tone_pct data yet (new field)
- To update: re-run with current prompt in batches, ~$30 via Batch API for all
- Lower priority — existing data is usable, just missing pct field

### G. New Screenshots → Full Art (grows with E)

- As E acquires new screenshots:
  1. Screenshot classification (V6, $0.003/image)
  2. Full art classification with 25% threshold prompt (~$0.011/game)
  3. Spot-check 20, apply corrections
  4. Promote to master with approval

### Summary: What needs reclassifying

| Type | Count | When |
|------|-------|------|
| Full reclassify (upgraded screenshots) | 121 | After approval |
| Color-only reclassify (existing games, new threshold) | 2,874 | After color calibration approved |
| Full classify (new screenshots from acquisition) | **672 DONE** (promoted to master) | ✅ Complete |
| Screenshots needed first | ~1,065 | SC untried + BWB fallback |

---

## Key Files

| File | Purpose |
|------|---------|
| `data/master/game_data_master.json` | Source of truth — DO NOT edit without approval |
| `data/pipelines/art_pipeline/state/results.json` | Art classification results (2,997 games) |
| `data/pipelines/art_pipeline/scripts/classify_art.py` | Art classifier (color threshold v2) |
| `data/pipelines/art_pipeline/scripts/test_color_threshold.py` | Python unit tests for color threshold |
| `data/pipelines/prescreen_pipeline/state/prescreen_results.json` | Screenshot classifications (3,384) |
| `data/pipelines/scraping/state/sc_ready_to_try.json` | 954 untried SC matches |
| `data/pipelines/art_pipeline/batch_gate.json` | Must be open for batches >10 |
| `data/pipelines/art_pipeline/corrections.json` | Human correction overrides |
| `data/pipelines/art_pipeline/ground_truth.json` | 20 GT games for regression |
| `data/mappings/art_theme_consolidation_map.json` | Art theme → consolidated bucket |
| `data/mappings/theme_consolidation_map.json` | Feature theme → consolidated bucket |
| `.cursor/plans/color_threshold_classification_388d092a.plan.md` | Full color threshold plan |

---

## Pipeline Order (always follow)

```
1. Download screenshot (SC primary, VSO fallback)
2. Screenshot classification (V6, 1568px) → gameplay / promotional / splash / rules
3. Art classification (only gameplay) → theme, colors, chars, elements
   - Colors: 20% area threshold, 1-3 per game
4. Spot-check review (20 sample, interactive HTML)
5. Apply corrections to state/results.json
6. Promote to master (WITH APPROVAL ONLY)
7. npm run build:data → regenerate parquet + processed JSON
```

---

## Approvals Required

- Never start classification batches without approval
- Never edit `game_data_master.json` without approval
- Always spot-check before promoting to master
- Color threshold rollout: user must approve calibration results first
