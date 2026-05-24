# Art Classification Pipeline

> **Script**: `game_analytics_export/data/pipelines/art_pipeline/scripts/classify_art.py`

## Overview

Classifies the **visual art style** of slot games using Claude Vision + text reviews.  
Each game gets a multi-dimensional art profile: theme, colors, characters, elements, and narrative.

---

## How It Works

```
     ┌──────────────────────────────────────────────────────────────┐
     │                          INPUTS                              │
     │  • Screenshot (from download pipeline)                       │
     │  • Review text (SC cache / game description)                 │
     │  • Symbol names (from Feature Extraction via master.json)    │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                   STEP 1: PREPROCESS                         │
     │                                                              │
     │  • If image > 1568px long edge → downscale (no upscale)     │
     │  • Convert to JPEG quality 85                                │
     │  • Create MASKED copy: black out reel grid (18–82%)          │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                STEP 2: CLAUDE VISION (Sonnet 4)              │
     │                                                              │
     │  Single API call with 2 images:                              │
     │    Image 1 (full) → theme, colors, characters                │
     │    Image 2 (masked) → elements                               │
     │                                                              │
     │  Also outputs: screenshot_quality (gameplay/promotional)     │
     │  System prompt CACHED (90% savings after 1st call)           │
     │  Constrained vocabulary, IS/IS NOT classification cards      │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                   STEP 3: POST-PROCESS                       │
     │                                                              │
     │  • If screenshot_quality ≠ gameplay → strip art, mark as     │
     │    "needs_gameplay_screenshot" (no art data saved)            │
     │  • Normalize via alias map                                   │
     │  • Remove characters that are reel symbols                   │
     │  • Cap elements at 5                                         │
     │  • Apply human corrections (corrections.json)                │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                        OUTPUT (per game)                     │
     ├──────────────────────────────────────────────────────────────┤
     │  art_theme:         primary + optional secondary             │
     │  art_color_tone:    2–4 dominant colors                      │
     │  art_characters:    characters outside reel grid             │
     │  art_elements:      up to 5 background objects               │
     │  art_narrative:     narrative style                           │
     │  screenshot_quality: gameplay / promotional / no_screenshot  │
     │  confidence:        1–5 per dimension                        │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │             STEP 4: HUMAN SPOT-CHECK REVIEW                  │
     │                                                              │
     │  Sample batch → interactive HTML (OK/Fix per dimension)      │
     │  Reviewer marks errors, adds correction notes                │
     │  Fixes → corrections.json (applied in post-process)          │
     │  Fixes → ground_truth.json (used in regression testing)      │
     │  Error patterns → prompt refinements                         │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │             STEP 5: REGRESSION TEST                          │
     │                                                              │
     │  Re-run on 20 GT games with updated prompt                   │
     │  Accuracy improved? → keep changes                           │
     │  Accuracy worse? → revert prompt, try again                  │
     │  Repeat until target met (8+ iterations so far)              │
     └──────────────────────────────────────────────────────────────┘
```

---

## Why Two Images?

```
  ┌─────────────────────────────┐     ┌─────────────────────────────┐
  │   IMAGE 1: Full Screenshot  │     │  IMAGE 2: Masked Screenshot │
  │                             │     │                             │
  │  Everything visible:        │     │  Reel grid blacked out:     │
  │  reels, frame, background   │     │  only background + frame    │
  │                             │     │                             │
  │  Used for:                  │     │  Used for:                  │
  │  Theme, Colors, Characters  │     │  Elements (background only) │
  └─────────────────────────────┘     └─────────────────────────────┘
```

The mask prevents Claude from confusing **reel symbols** (items spinning on the reels) with **background elements** (objects in the environment). This was the #1 source of element classification errors.

---

## Where Do Inputs Come From?

| Input | Source | Used For |
|-------|--------|----------|
| Screenshot | SlotCatalog download pipeline | Visual analysis (theme, colors, chars, elements) |
| Masked screenshot | Generated from screenshot (reel area blacked out) | Element detection without reel symbol confusion |
| Symbol names | **Feature Extraction pipeline** → `game_data_master.json` `symbols` field | Distinguishing reel symbols from background elements/characters |
| Review text | SC cache HTML or game description from master | Text-based classification when screenshot is ambiguous |

---

## Model & Cost

| Parameter | Value |
|-----------|-------|
| Model | `claude-sonnet-4-20250514` |
| Max Tokens | 1,000 |
| Prompt Caching | **Enabled** — system prompt cached, 90% savings after 1st call |
| Images per call | 2 (full + masked) |
| Cost per game | ~$0.008 (with caching) |
| Processing speed | ~8 games/minute |
| Parallel batches | Split games across processes for 2× throughput |

---

## Classification Dimensions

### 1. Theme (primary + optional secondary)
- 69 allowed themes (e.g., "Egyptian/Pharaoh", "Jungle/Rainforest", "Norse/Viking Realm")
- Guided by IS/IS NOT classification cards with examples
- Secondary theme only when game genuinely blends two distinct visual worlds

### 2. Colors (2–4 dominant colors)
- 29-color vocabulary (e.g., "Gold", "Teal", "Deep Blue")
- Scanned from: background, side panels, frame, reel area

### 3. Characters
- Only characters appearing as **large artwork OUTSIDE the reel grid**
- Reel-only symbols explicitly excluded (cross-referenced with symbol names)
- Character categories assigned (e.g., "Egyptian Deity", "Warrior/Knight")

### 4. Elements (up to 5)
- Background/frame objects only — uses masked screenshot
- Grounded in `background_description` (Claude describes, then picks from vocab)
- Three vocabularies: Effects (10), Scene (35), Decor (70+)

### 5. Narrative
- Single narrative style (e.g., "Adventure", "Mystery", "Celebration")

### 6. Screenshot Quality
- `gameplay` / `promotional` / `rules_page` / `no_screenshot`

---

## Accuracy

| Dimension | Accuracy | Notes |
|-----------|----------|-------|
| Theme | ~95% | Production-ready |
| Colors | ~80–85% | Production-ready |
| Characters | ~85% | Production-ready |
| Elements | ~50% | Claude vision limitation; useful starting point, refined in reviews |

---

## Training & Quality Assurance

```
  Edit prompt → Run regression (20 GT games) → Accuracy improved? → Keep / Revert
       ▲                                                                    │
       └────────────────── human spot-check corrections ◄───────────────────┘
```

| Mechanism | Description |
|-----------|-------------|
| Batch Gate | `batch_gate.json` — must be open for batches >10 |
| Spot Check | Interactive HTML reviews (OK/Fix per dimension + notes) |
| GT Regression | 20 hard-GT games for quick accuracy check |
| Corrections DB | Manual overrides in `corrections.json` |
| Training iterations | 8+ prompt refinement cycles |

---

## Commands

```bash
# Classify specific games
python3 classify_art.py Game-Name.html Another-Game.html

# Parallel batch (separate output files, merge after)
ART_RESULTS_PATH=results_a.json python3 classify_art.py $(cat batch_a.txt) &
ART_RESULTS_PATH=results_b.json python3 classify_art.py $(cat batch_b.txt) &

# Quick regression (20 GT games)
python3 classify_art.py --regression

# Pipeline stats
python3 classify_art.py --stats
```

---

## File Locations

| File | Purpose |
|------|---------|
| `data/pipelines/art_pipeline/scripts/classify_art.py` | Main script |
| `data/screenshots/` | Game screenshots |
| `data/_legacy/sc_cache/` | SlotCatalog review HTMLs |
| `data/pipelines/art_pipeline/state/results.json` | Classification results |
| `data/pipelines/art_pipeline/batch_gate.json` | Batch gate control |
| `data/pipelines/art_pipeline/corrections.json` | Human overrides |
