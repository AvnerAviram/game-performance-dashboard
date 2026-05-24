# Pipelines

Data processing pipelines that build the game analytics dashboard.

## Overview

```
  game_data_master.json (5,124 games)
       ▲           ▲
       │           │
  Art Pipeline    Feature Pipeline
       ▲           ▲
       │           │
  Screenshots    Rules HTML pages
       ▲           ▲
       │           │
  SlotCatalog    Provider websites
```

---

## Pipelines

| Pipeline | What it does | Key Script |
|----------|-------------|------------|
| **Matching** | Connects game names to rules pages | `matching/scripts/smart_match.py` |
| **Scraping** | Downloads screenshots from SlotCatalog | `scraping/scripts/download_sc_screenshots_playwright.mjs` |
| **Screenshot Classification** | Classifies screenshots (gameplay / promotional / splash / rules) | `prescreen_pipeline/scripts/prescreen_classifier.py` |
| **Art Classification** | Classifies visual style (theme, colors, chars, elements) | `art_pipeline/scripts/classify_art.py` |
| **Feature Extraction** | Extracts mechanics from rules pages | `feature_pipeline/scripts/extract_game_profile.py` |

---

## Docs

- [Art Classification](./ART_CLASSIFICATION.md)
- [Screenshot Acquisition & Classification](./SCREENSHOT_ACQUISITION.md)
- [Feature Extraction](./FEATURE_EXTRACTION.md)
- [Pipeline Overview (visual)](./pipeline-overview.html) — open in browser

---

## Running

From `game_analytics_export/`:

```bash
# Game matching
python data/pipelines/matching/scripts/smart_match.py

# Screenshot acquisition
node data/pipelines/scraping/scripts/vso_screenshot_parallel.cjs /tmp/vso_batch_all.json

# Art classification
python data/pipelines/art_pipeline/scripts/classify_art.py --batch --apply

# Feature extraction
python data/pipelines/feature_pipeline/scripts/extract_game_profile.py --batch --apply
```
