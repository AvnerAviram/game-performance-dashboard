# Screenshot Acquisition & Classification Pipeline

## Overview

Acquires gameplay screenshots for slot games and classifies them into four categories before art classification.

---

## How It Works

```
     ┌──────────────────────────────────────────────────────────────┐
     │                    STEP 1: MATCH GAME                        │
     │                                                              │
     │  Match game name to SlotCatalog URL                          │
     │  Smart fuzzy name matching                                   │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                    STEP 2: DOWNLOAD                          │
     │                                                              │
     │  Playwright browser automation                               │
     │  Gets highest-resolution image from game page                │
     │  Saves to data/screenshots/                                  │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │               STEP 3: SCREENSHOT CLASSIFICATION              │
     │                                                              │
     │  Resize to max 1568px long edge, JPEG quality 85             │
     │  Claude Sonnet Vision classifies into 4 categories:          │
     │                                                              │
     │    gameplay      → actual game session, reel grid visible    │
     │    promotional   → marketing poster/banner, no game UI       │
     │    splash_screen → loading screen, "TOUCH TO CONTINUE"       │
     │    rules_page    → paytable, help text, payout info          │
     │                                                              │
     │  Decision: when uncertain → classify as gameplay             │
     │  Cost: ~$0.003 per image (Sonnet Vision @ 1568px)            │
     └────────────────┬─────────────────────────┬───────────────────┘
                      │                         │
                      ▼                         ▼
     ┌────────────────────────────┐  ┌──────────────────────────────┐
     │   GAMEPLAY                 │  │   NOT GAMEPLAY               │
     │   → Art Classification     │  │   promotional / splash /     │
     │                            │  │   rules_page                 │
     └────────────────────────────┘  │   → flagged for new          │
                                     │     screenshot acquisition   │
                                     └──────────────────────────────┘
```

> **Design principle**: Recall > Precision. Never reject actual gameplay. False positives are acceptable — they get caught later in art classification's `screenshot_quality` check.

---

## Acquisition Sources

| Source | Method | Status |
|--------|--------|--------|
| **SlotCatalog** | Playwright scraping (highest-res image from game page) | Primary — 57 untried matches remaining |
| **VSO** | Demo iframe screenshot capture | Fallback — scripts ready, not yet run at scale |
| **Bing Image Search** | Playwright + Bing Images | Dead — 0 results, blocked by bot detection |

---

## Cost Summary

| Step | Cost | Notes |
|------|------|-------|
| Download | Free | Playwright scraping |
| Claude Classification | $0.003/image | Sonnet Vision @ 1568px, full-res |
| **Total for 1,000 images** | **~$3.00** | |

---

## Accuracy

| Metric | Value |
|--------|-------|
| Overall Accuracy | 97.4% |
| Ground Truth | 290 user-reviewed images |
| Categories | gameplay / promotional / splash_screen / rules_page |
| Prompt version | V5 (4-category classifier) |

---

## Training Loop

```
  Edit prompt.txt → Run --regression → Check accuracy against GT → Improved? Keep / Revert
       ▲                                                                         │
       └───────────────── human spot-check corrections ◄─────────────────────────┘
```

| Training Detail | Value |
|-----------------|-------|
| Prompt file | `prompt.txt` (editable without touching code) |
| GT size | 290 labeled images |
| Iterations | 5 prompt refinement cycles |
| Target | 100% recall (never reject real gameplay) |

---

## Commands

```bash
# Run regression test against ground truth
python3 scripts/prescreen_classifier.py --regression

# Classify new screenshots
python3 scripts/prescreen_classifier.py --classify --limit 100

# Re-classify all screenshots (ignore existing results)
python3 scripts/prescreen_classifier.py --classify --full

# Show stats
python3 scripts/prescreen_classifier.py --stats
```

---

## Coverage Status

| Category | Count |
|----------|-------|
| Screenshots on disk | 4,059 |
| Classified as gameplay | 3,665 |
| Classified as promotional | 165 |
| Classified as splash_screen | 75 |
| Classified as rules_page | 152 |
| Games still missing screenshots | ~1,065 |

### Acquisition History

| Date | Method | Games Tried | Success | Cost |
|------|--------|-------------|---------|------|
| May 14, 2026 | SC smart retry (690 size-rejected) | 690 | 673 (97.5%) | $5.35 |
| Earlier | SC smart download (1,021 matched) | 1,021 | 324 (31.7%) | ~$3 |
| Earlier | SC smart retry (92 curated) | 92 | 80 (87%) | ~$0.50 |

---

## File Locations

| File | Purpose |
|------|---------|
| `prescreen_pipeline/scripts/prescreen_classifier.py` | Classification script |
| `prescreen_pipeline/prompt.txt` | Editable prompt (V5) |
| `prescreen_pipeline/gt/ground_truth.json` | Ground truth (290 entries) |
| `prescreen_pipeline/state/prescreen_results.json` | Classification results (3,382 images) |
| `scraping/scripts/download_sc_screenshots_playwright.mjs` | SC download script |
| `scraping/scripts/vso_screenshot_parallel.cjs` | VSO screenshot capture |
| `scraping/state/sc_ready_to_try.json` | 954 untried SC matches |
| `scraping/state/acquisition_plan.json` | Full acquisition plan (455 games) |
