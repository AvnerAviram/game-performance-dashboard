# Game Data Pipeline — Single Source of Truth

**If you are a new AI agent: start here.** This is the only file you need to understand the data pipeline.

**Updated**: Apr 6, 2026

---

## Current State

4,550 games in master. NJ release year 100% coverage (all games). 887 with global release dates (19.5% — AGS: 36, slot.report: 851). 3,453 with symbols (1,368 full paytable from legacy merge). 1,731 franchise-mapped. AGS ground truth fully backfilled. Features use HIDDEN_FEATURES blocklist (Multiplier removed). Server gzip compression enabled (13.2→1.0 MB). Trend legend hover highlighting. Brand sorting. Bubble chart click-to-panel. **Art characterization pipeline built** — taxonomy validated against industry standards, 27-game GT, few-shot examples, F1 eval loop (`--test-art`), 83.8% aggregate accuracy on held-out set. **Year pipeline complete** — NJ year is primary everywhere, global year is bonus field in game detail panel only.

### Trusted Data Sources

| Source | File | What it provides | Count |
|--------|------|------------------|-------|
| **Eilers CSV** | `data/eilers_source.csv` | Performance metrics, provider, game category, NJ release date, sites | 4,600 rows |
| **HTML Rules** | `data/rules_text/*.txt` + `data/rules_html/*.html` | Official game rules — features, symbols, RTP, volatility, reels, rows, paylines | 3,409 matched games |
| **AGS Ground Truth** | `data/ground_truth_ags.json` | Verified features/themes for F1 benchmarking (87 entries, 100% backfilled) | 87 games |
| **SlotReport** | `data/_slot_report_data.json` | Global release dates, RTP, volatility, features | 5,592 entries (4,703 with dates) |
| **SlotCatalog Cache** | `data/_legacy/sc_cache/*.html` | Cached game pages with release dates, specs | 2,760 pages |
| **Staged External** | `data/staged_best_of_sources.json` | Best-of-sources specs from Evolution scrapes | 802 games |
| **Legacy Symbols** | `data/_legacy/games_dashboard_backup_pre95.json` | Full paytable symbols (themed + card + functional) | 1,425 games (1,386 merged) |
| **Art Ground Truth** | `data/ground_truth_art.json` | Verified art characterization for F1 benchmarking | 27 games |

---

## Prerequisites

```bash
# Python 3.10+
pip install anthropic requests beautifulsoup4 lxml openpyxl

# API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > game_analytics_export/data/.env

# Node v20
fnm use 20

# Tests (1095 JS + 53 Python — all must pass)
cd game_analytics_export && npx vitest run
cd game_analytics_export && python3 -m pytest data/test_extract_game_profile.py -q
```

---

## Key Files

### Production Data (DO NOT DELETE)

| File | Purpose |
|------|---------|
| `data/game_data_master.json` | Main data file (4,551 games). DuckDB loads this directly. |
| `data/ground_truth_ags.json` | 87-entry ground truth. Irreplaceable. |
| `data/theme_consolidation_map.json` | Theme grouping map (7s, Mythology→Mythical, etc). |
| `data/franchise_mapping.json` | Franchise grouping (1,731 games, 520 franchises). |
| `data/confidence_map.json` | Per-game per-field confidence levels. |
| `data/_release_date_matches.json` | Release date matches (2,327 entries from SR + SC + staged). |
| `data/ground_truth_art.json` | 27-entry art characterization GT. Manually verified. |

### Pipeline Scripts

| File | Purpose |
|------|---------|
| `data/extract_game_profile.py` | Main extraction — Claude API, post-processing. |
| `data/match_release_dates.py` | Match SlotReport dates to master games. |
| `data/extract_sc_release_dates.py` | Extract dates from cached SlotCatalog HTML. |
| `data/smart_match.py` | Strict title-based matching with verification gate. |

---

## game_data_master.json Schema

### CSV fields (XLSX protected — extraction NEVER overwrites)

| Field | Type |
|-------|------|
| `id` | string |
| `name` | string |
| `provider` | string |
| `game_category` | string |
| `release_year` | number (NJ launch date) |
| `release_month` | number (NJ launch date) |
| `sites` | number |
| `avg_bet` | number |
| `median_bet` | number |
| `games_played_index` | number |
| `coin_in_index` | number |
| `theo_win` | number |
| `market_share_pct` | number |

### Global Release Date fields (informational — NOT used for dashboard analysis)

**Note:** NJ year (`release_year`) is the primary year for all dashboard analysis. Global year is a supplementary field shown in game detail panels only.

| Field | Coverage | Source |
|-------|----------|-------|
| `original_release_date` | 887/4,550 (19.5%) | `ags_provider_data` (36), `slotreport` (851) |
| `original_release_year` | 887/4,550 (19.5%) | Derived from date |
| `original_release_month` | 887/4,550 (19.5%) | Derived from date |
| `original_release_date_source` | 887/4,550 (19.5%) | `"ags_provider_data"` or `"slotreport"` |

### Extracted fields (from Claude API + HTML rules)

| Field | Coverage | Notes |
|-------|----------|-------|
| `features` | 99% | Array of strings. "Multiplier" filtered by HIDDEN_FEATURES. |
| `theme_primary` | 100% | Consolidated via theme_consolidation_map. |
| `themes_all` | 100% | Array of all theme tags. |
| `symbols` | 68% (3,112/4,551) | String or object arrays. 1,439 still missing. |
| `reels` | 89% | |
| `rows` | 57% | |
| `rtp` | 69% | |
| `volatility` | 7% | Rarely in HTML rules |
| `max_win` | 23% | |

### Art characterization fields (from Claude API + post-processing rules)

| Field | Coverage | Notes |
|-------|----------|-------|
| `art_theme` | 0% (pipeline ready) | Single value from 33-item taxonomy. Norse/Viking, Irish/Celtic, Festive, etc. |
| `art_characters` | 0% (pipeline ready) | Array. 29-item taxonomy. Pharaoh, Viking, Leprechaun, Dinosaur, etc. |
| `art_elements` | 0% (pipeline ready) | Array. 25-item taxonomy. Gems, Gold, Fruits, Fishing, etc. |
| `art_mood` | 0% (pipeline ready) | Single value from 13-item taxonomy. Dark, Bright, Epic, Festive, etc. |
| `art_narrative` | 0% (pipeline ready) | Single value from 19-item taxonomy. Treasure Hunt, Fishing, Music, etc. |
| `art_style` | 0% (pipeline ready) | Single value. Low reliability from text inference. |
| `art_color_tone` | 0% (pipeline ready) | Single value. Low reliability from text inference. |
| `art_confidence` | 0% (pipeline ready) | Always `text_inferred` (no visual analysis). |

**Art taxonomy validated against**: SlotCatalog, KeyToCasino, slot.report industry databases.
**Art GT eval**: 83.8% aggregate on 18 held-out games (Setting 100%, Mood 94%, Characters 86%, Narrative 72%, Elements 66%).
**Few-shot**: 8 training examples in prompt. Deterministic post-processing rules for name/HTML-based overrides.

---

## DuckDB Integration

The dashboard loads `game_data_master.json` into an in-browser DuckDB instance.

Key schema additions (beyond CSV fields):
- `original_release_year INTEGER` / `original_release_month INTEGER` — global release dates
- `theme_consolidated VARCHAR` — consolidated theme from map
- `franchise VARCHAR` / `franchise_type VARCHAR` — from `franchise_mapping.json`
- `*_confidence VARCHAR` — per-field confidence from `confidence_map.json`

The Trends page uses `release_year` (NJ launch year) as the primary date for all analysis. Global year is informational only.

### Centralized Data Access

- **`getActiveGames()`** / **`getActiveThemes()`** / **`getActiveMechanics()`** — filtered data getters in `data.js`
- **`F.releaseYear(g)`** — NJ launch year, PRIMARY year for all dashboard analysis
- **`F.originalReleaseYear(g)`** — global release year only (returns 0 when absent, no NJ fallback)
- **`F.themesAll(g)`** — auto-parses JSON strings from DuckDB
- **`parseFeatures(val)`** — auto-filters `HIDDEN_FEATURES` (e.g., Multiplier)
- Category filter: `applyCategory()` in `chart-config.js` recomputes all view data

### Charts & Panels

- All brand/franchise charts show ALL brands (no caps)
- RTP/Volatility bubble clicks open detail panels
- Market leader filter uses `MARKET_LEADER_THRESHOLD` constant (0.005 = 0.5%)
- N/A-heavy side panel sections auto-collapse with chevron toggle

---

## Living Plan

### Remaining Work

1. **Symbol gaps** — 1,439 games without symbols (needs Claude API, cost approval required)
2. **Release date gaps** — 2,224 games without global dates (mostly NJ-only titles)
3. **Spec enrichment** — RTP, volatility from external sources
4. **Art characterization extraction** — pipeline ready, phased rollout:
   - Phase A: **Small batch** (50 games) → manual review → fix any issues ← **CURRENT**
   - Phase B: Medium batch (200 games) → spot-check → refine post-processing
   - Phase C: Full extraction (~4,000 slots) → apply to master
   - Phase D: DuckDB schema + `game-fields.js` + `metrics.js` + dashboard UI
5. **Mobile UX** — responsive improvements

### Art Characterization Pipeline (full plan: `data/ART_CHARACTERIZATION_PLAN.md`)

```bash
# Test against GT (held-out games, F1 scoring)
python3 data/extract_game_profile.py --test-art

# Test specific games
python3 data/extract_game_profile.py --test-art-games "Game1,Game2"

# Extract art (stages to staged_art_characterization.json)
python3 data/extract_game_profile.py --extract-art --limit 50

# Apply staged art to master (after manual review)
python3 data/extract_game_profile.py --extract-art --apply-art
```

**Key files**:
- `data/ground_truth_art.json` — 27-game GT (8 training + 19 test)
- `data/staged_art_characterization.json` — staging area (review before applying)
- `data/art_test_results.jsonl` — eval run results cache

**Taxonomy** (7 dimensions, industry-validated):
- Settings (33), Characters (29), Elements (25), Moods (13), Narratives (19), Styles (8), Color Tones (7)
- Post-processing: 60+ name-based rules, 20+ HTML-based rules
- Few-shot: 8 training examples in prompt

---

## DO NOT Rules

1. **DO NOT use files from `data/_legacy/`** for new work. They are reference only.
2. **DO NOT add classification data without validating against GT.** Always measure F1.
3. **DO NOT overwrite `ground_truth_ags.json` or `ground_truth_art.json`** without explicit user approval.
4. **DO NOT skip tests.** All 1095 JS + 53 Python tests must pass after any change.
5. **DO NOT overwrite XLSX fields** (runtime gate + test enforce this).
6. **Use `F.releaseYear(g)` for all trends/analysis** (NJ year). Use `F.originalReleaseYear(g)` only for the global year bonus field in game detail panels.
7. **DO NOT hardcode threshold values** — use constants from `shared-config.js`.

---

## Environment

- Node v20 (`fnm use 20`)
- Dev server: `cd game_analytics_export && npx vite`
- Tests: `cd game_analytics_export && npx vitest run` (1095 tests)
- Python tests: `python3 -m pytest data/test_extract_game_profile.py -q`
- Format: `npm run format` (Prettier, 4-space indent, single quotes)
- Python 3.10+ with `anthropic requests beautifulsoup4 lxml openpyxl`
- API key in `data/.env` as `ANTHROPIC_API_KEY=sk-ant-...`
