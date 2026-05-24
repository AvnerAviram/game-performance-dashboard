---
name: Project Restructure
overview: Full restructure of game_analytics_export for human + AI clarity. Path centralization, logical data grouping, pipeline organization, with tests at every step.
todos:
  - id: research-done
    content: Research best practices + audit dependencies + dev/QA review (DONE)
    status: completed
  - id: phase-1-path-helper
    content: "PHASE 1: Create shared path helper (tests/helpers/paths.js + server + build scripts)"
    status: pending
  - id: phase-1-tests
    content: "PHASE 1 GATE: npm test passes with path helper, no file moves yet"
    status: pending
  - id: phase-2-data-subfolders
    content: "PHASE 2: Move JSONs into data/{master,mappings,matching,staging,validation}/"
    status: pending
  - id: phase-2-tests
    content: "PHASE 2 GATE: npm test + npm run build + server starts correctly"
    status: pending
  - id: phase-3-pipelines
    content: "PHASE 3: Create pipelines/ dir, move Python/Node scripts from data/scripts/"
    status: completed
  - id: phase-3-tests
    content: "PHASE 3 GATE: npm test + smoke-run art classification on 1 game"
    status: pending
  - id: phase-4-docs-cleanup
    content: "PHASE 4: Pipeline doc links, data/README.md, cursor rules, rename ui-screenshots"
    status: pending
  - id: phase-4-tests
    content: "PHASE 4 GATE: npm test + npm run build + full visual check"
    status: pending
  - id: dev-review-final
    content: Dev agent reviews complete restructure
    status: pending
  - id: qa-final
    content: QA agent runs full test suite + build + serve validation
    status: pending
isProject: false
---

# Project Restructure for Human + AI Clarity (v2 — Post Dev/QA Review)

## Critical Safety Notes

- **Screenshot batch is running in background** — DO NOT touch `data/screenshots/` during migration
- **Test after EVERY phase** — never move to next phase without green tests
- **Plans live in `docs/plans/` only** (not .cursor/plans/)

---

## Current Problems

1. **16 loose JSON files in `data/`** — no logical grouping
2. **Pipeline docs don't link to scripts** — can't find `classify_art.py` from the docs
3. **`art_pipeline/` exists but no `feature_pipeline/`** — inconsistent naming
4. **Two "scripts" folders** — `scripts/` (npm build) vs `data/scripts/` (Python pipelines)
5. **No central path config** — 30+ files hardcode relative paths
6. **`game_analytics_export/ui-screenshots/`** (UI; renamed from `screenshots/` in Phase 4) vs `data/screenshots/` (game) — clearer separation
7. **`.cursor/rules/` has stale paths**

---

## Target Structure

```
game_analytics_export/
├── data/
│   ├── README.md                    # Explains layout, what's committed, sizes
│   ├── master/
│   │   └── game_data_master.json
│   ├── mappings/
│   │   ├── confidence_map.json
│   │   ├── theme_consolidation_map.json
│   │   ├── art_theme_consolidation_map.json
│   │   └── franchise_mapping.json
│   ├── matching/
│   │   ├── rules_game_matches.json
│   │   ├── rules_index.json
│   │   ├── rules_match_rejections.json
│   │   ├── rules_fuzzy_candidates.json
│   │   └── rules_text/
│   ├── staging/
│   │   ├── staged_art_characterization.json
│   │   ├── staged_best_of_sources.json
│   │   └── staged_feature_extraction.json
│   ├── validation/
│   │   ├── ground_truth_ags.json
│   │   ├── ground_truth_themes.json
│   │   └── _release_date_matches.json
│   ├── screenshots/               # Game screenshots (800MB, UNTOUCHED)
│   ├── sources/                   # Raw inputs (eilers_source.csv, etc.)
│   ├── _archive/                  # Old compressed data
│   ├── games.parquet              # Build output
│   └── games_processed.json       # Build output
│
├── pipelines/                     # ALL data processing code
│   ├── README.md                  # Index: script | inputs | outputs | cost
│   ├── config.py                  # Shared Python path resolution
│   ├── art/
│   │   ├── classify_art.py
│   │   └── config.json            # (from data/art_pipeline/)
│   ├── features/
│   │   └── extract_game_profile.py
│   ├── scraping/
│   │   ├── download_sc_screenshots.mjs
│   │   ├── download_sc_screenshots_playwright.mjs
│   │   ├── vso_screenshot_batch.cjs
│   │   ├── scrape_game_descriptions.py
│   │   └── scrape_provider_descriptions.py
│   └── matching/
│       ├── smart_match.py
│       └── spot_check.py
│
├── scripts/                       # npm build/release tools (UNCHANGED)
├── ui-screenshots/                # Dashboard UI test screenshots (renamed)
├── tests/
│   ├── helpers/
│   │   └── paths.js               # Centralized path constants
│   ├── unit/
│   ├── integration/
│   ├── data-validation/
│   ├── enforcement/
│   ├── e2e/
│   └── ...
├── src/                           # Frontend (unchanged)
├── server/                        # API server (unchanged)
└── ...configs...
```

---

## Phase 1: Path Centralization (NO file moves)

### 1a. Create `tests/helpers/paths.js`

```javascript
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ROOT = game_analytics_export/
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

export const DATA_DIR = resolve(ROOT, 'data');
export const MASTER_JSON = resolve(DATA_DIR, 'game_data_master.json');
export const SCREENSHOTS_DIR = resolve(DATA_DIR, 'screenshots');

// After Phase 2, these will point to subfolders:
export const MAPPINGS_DIR = DATA_DIR;      // → data/mappings/ later
export const MATCHING_DIR = DATA_DIR;      // → data/matching/ later
export const STAGING_DIR = DATA_DIR;       // → data/staging/ later
export const VALIDATION_DIR = DATA_DIR;    // → data/validation/ later
```

**Key insight**: Start with paths pointing to current flat locations. Then Phase 2 just changes the constants — not every consumer.

### 1b. Update ALL consumers (full list from dev/QA audit)

**Tests (24+ files):**
- `tests/setup.js`
- `tests/utils/load-test-data.js`
- `tests/utils/json-aggregator.js`
- `tests/unit/xray-data-integrity.test.js`
- `tests/unit/provenance-api-coverage.test.js`
- `tests/unit/production-readiness.test.js`
- `tests/unit/art-theme-consolidation.test.js`
- `tests/unit/providers-games.test.js`
- `tests/enforcement/deployment-readiness.test.js`
- `tests/enforcement/build-pipeline.test.js`
- `tests/data-validation/validate-matching.test.js`
- `tests/data-validation/validate-data-pipeline.test.js`
- `tests/data-validation/validate-insights-qa.test.js`
- `tests/data-validation/validate-release-date-matching.test.js`
- `tests/data-validation/validate-art-data.test.js`
- `tests/data-validation/validate-duckdb-field-mapping.test.js`
- `tests/data-validation/validate-specs-backfill.test.js`
- `tests/data-validation/validate-parquet-pipeline.test.js`
- All other `tests/data-validation/validate-*.test.js`
- `tests/e2e/data-integrity.spec.mjs`
- `tests/e2e/xray-data-driven.spec.mjs`

**Server:**
- `server/routes/data.cjs` — uses `path.join(DATA_DIR, 'filename.json')` for: `game_data_master.json`, `franchise_mapping.json`, `theme_consolidation_map.json`, `confidence_map.json`, `staged_art_characterization.json`, `ground_truth_ags.json`, `thin_gt_extractions.json`, `staged_best_of_sources.json`, `rules_game_matches.json`, `rules_text/`

**Build scripts:**
- `scripts/build-parquet.mjs` — reads `game_data_master.json`, `theme_consolidation_map.json`, `art_theme_consolidation_map.json`, `franchise_mapping.json`, `confidence_map.json`, `staged_art_characterization.json`
- `scripts/build.mjs` — copies list of data files to `public/data/`
- `scripts/apply-corrections.cjs`
- `scripts/merge-art-data.cjs`
- `scripts/validate-franchises.mjs`
- `scripts/data/verify-and-correct-games.mjs`

### 1c. Create `lib/data-paths.cjs` for server/build (CJS compatible)

```javascript
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

module.exports = {
  DATA_DIR,
  MASTER_JSON: path.join(DATA_DIR, 'game_data_master.json'),
  // ... all file paths
};
```

### PHASE 1 GATE: `npm test` + `npm run build` + server starts

---

## Phase 2: Move JSON Files Into Subfolders

Once paths.js is the single source of truth, update ONLY the constants:

```javascript
// paths.js changes:
export const MASTER_JSON = resolve(DATA_DIR, 'master', 'game_data_master.json');
export const MAPPINGS_DIR = resolve(DATA_DIR, 'mappings');
// etc.
```

Then physically move files:

```bash
mkdir -p data/{master,mappings,matching,staging,validation}
mv data/game_data_master.json data/master/
mv data/{confidence_map,theme_consolidation_map,art_theme_consolidation_map,franchise_mapping}.json data/mappings/
mv data/{rules_game_matches,rules_index,rules_match_rejections,rules_fuzzy_candidates}.json data/matching/
mv data/rules_text data/matching/
mv data/{staged_art_characterization,staged_best_of_sources,staged_feature_extraction}.json data/staging/
mv data/{ground_truth_ags,ground_truth_themes,_release_date_matches}.json data/validation/
```

**Build contract preserved**: `scripts/build.mjs` copies to `public/data/` with SAME flat filenames — frontend URLs unchanged.

### PHASE 2 GATE: `npm test` + `npm run build` + `npm start` serves correctly

---

## Phase 3: Pipeline Scripts Migration

### 3a. Create `pipelines/` structure

Move `data/scripts/` → `pipelines/` with domain subfolders.

### 3b. Create `pipelines/config.py`

```python
from pathlib import Path
import os

PIPELINE_ROOT = Path(__file__).parent
APP_ROOT = PIPELINE_ROOT.parent        # game_analytics_export/
DATA_DIR = APP_ROOT / 'data'
MASTER_JSON = DATA_DIR / 'master' / 'game_data_master.json'
SCREENSHOTS_DIR = DATA_DIR / 'screenshots'
ART_PIPELINE_DIR = DATA_DIR / 'art_pipeline'  # results, config, gate
STAGING_DIR = DATA_DIR / 'staging'
ENV_FILE = PIPELINE_ROOT / '.env'      # API keys stay with pipelines
```

### 3c. Rewrite Python script path resolution

Every Python script changes from:
```python
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MASTER_PATH = os.path.join(SCRIPT_DIR, 'game_data_master.json')
```
to:
```python
import sys; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATA_DIR, MASTER_JSON, SCREENSHOTS_DIR, ART_PIPELINE_DIR
```

### 3d. Move `data/art_pipeline/` config/results to live alongside art script

Keep `data/art_pipeline/results.json` (output) in data, but move `config.json`, `ground_truth.json` to `pipelines/art/`.

### PHASE 3 GATE: `npm test` + smoke-run `python pipelines/art/classify_art.py --dry-run` on 1 game

---

## Phase 4: Documentation + Cleanup

### 4a. Add script path to pipeline docs

Each `docs/pipelines/*.md` gets:
```markdown
> **Script**: `game_analytics_export/pipelines/art/classify_art.py`
> **Config**: `game_analytics_export/pipelines/art/config.json`
```

### 4b. Create `data/README.md`

### 4c. Rename `screenshots/` → `ui-screenshots/`
- Update any Playwright snapshot paths referencing it

### 4d. Update `.cursor/rules/` stale paths

### 4e. Consolidate plans to `docs/plans/` only

### PHASE 4 GATE: `npm test` + full visual check + docs accurate

---

## Execution Strategy

- **Dev agent** executes each phase
- **After each phase gate**: QA agent runs full `npm test` + `npm run build` + spot checks
- **Never proceed** to next phase without green gate
- **Screenshot batch in background**: `data/screenshots/` is NEVER touched during any phase
