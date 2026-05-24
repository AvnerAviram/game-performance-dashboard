# Feature Extraction Pipeline

> **Script**: [`pipelines/features/extract_game_profile.py`](../../game_analytics_export/pipelines/features/extract_game_profile.py)

## Overview

Extracts **game mechanics/features** from HTML rules pages using Claude's text understanding.  
Each game's rules page is parsed and classified into a canonical 30-feature vocabulary.

---

## How It Works

```
     ┌──────────────────────────────────────────────────────────────┐
     │                     RULES HTML PAGE                          │
     │  (game paytable, feature descriptions, RTP, volatility)     │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                   HTML → Structured Text                     │
     │                                                              │
     │  • Strip navigation, scripts, styles                        │
     │  • Preserve headers as [H1]...[H6] markers                  │
     │  • Keep table structure and lists                            │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │               Claude Sonnet 4 (Text Analysis)                │
     │                                                              │
     │  • Reads cleaned rules text                                 │
     │  • Maps to 30-feature canonical vocabulary                  │
     │  • Extracts theme, volatility, RTP, description             │
     │  • Confidence score per feature (1–5)                       │
     │  • Prompt caching for cost efficiency                       │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                   Vocabulary Normalization                    │
     │                                                              │
     │  • Only canonical features kept (30 allowed)                │
     │  • Deduplication                                            │
     │  • "Multiplier" hidden (too ubiquitous)                     │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                        OUTPUT (per game)                     │
     ├──────────────────────────────────────────────────────────────┤
     │  features:      ["Free Spins", "Hold and Spin", "Megaways"] │
     │  theme_primary: "Egyptian/Pharaoh"                          │
     │  volatility:    "High"                                      │
     │  rtp:           96.5                                        │
     │  description:   "Ancient Egyptian adventure with..."        │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │             HUMAN SPOT-CHECK REVIEW                          │
     │                                                              │
     │  Validate extracted features against actual rules page       │
     │  Mark correct/incorrect features                             │
     │  Corrections → ground truth (228 games)                      │
     │  Error patterns → prompt refinements                         │
     └──────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
     ┌──────────────────────────────────────────────────────────────┐
     │             REGRESSION TEST                                  │
     │                                                              │
     │  Re-run extraction on all 228 GT games                       │
     │  Compute micro F1 score                                      │
     │  Improved? → keep prompt changes                             │
     │  Worse? → revert, try again                                  │
     │  Hard gate: blocks deploy if F1 < 95%                        │
     └──────────────────────────────────────────────────────────────┘
```

---

## Model & Parameters

| Parameter | Value |
|-----------|-------|
| Model | `claude-sonnet-4-20250514` |
| Max Tokens | 4,096 |
| Prompt Caching | Enabled (ephemeral) |
| Input | Cleaned HTML text (~2–8K tokens) |
| Cost per game | ~$0.005–0.01 |
| Batch API | 50% cheaper (async processing) |

---

## Canonical Feature Vocabulary (30 features)

| Feature | Feature | Feature |
|---------|---------|---------|
| 3 Pot | Free Spins | Static Jackpot |
| Buy Bonus | Gamble Feature | Sticky Wilds |
| Cascading Reels | Hold and Spin | Symbol Removal |
| Cash On Reels | Megaways | Symbol Transformation |
| Collect Feature | Multiplier Wild | Symbol Upgrade |
| Colossal Symbols | Mystery Symbols | Trail Bonus |
| Expanding Reels | Nudges | Wheel |
| Expanding Wilds | Persistence | Wild Reels |
| Pick Bonus | Progressive Jackpot | Win Both Ways |
| Respin | Stacked Symbols | Sidebets |

> "Multiplier" is intentionally hidden from the dashboard (too ubiquitous to be meaningful).

---

## Processing Steps

### Step 1: HTML Cleaning
- Parse HTML rules page with BeautifulSoup
- Preserve section headers as `[H1]`...`[H6]` markers
- Strip navigation, scripts, styles
- Keep structured text for Claude to reason about document structure

### Step 2: Claude Classification
- System prompt defines the canonical vocabulary
- User prompt contains the cleaned rules text
- Claude identifies which features are present
- Returns structured JSON with feature names, confidence scores, and descriptions

### Step 3: Vocabulary Normalization
- Map extracted feature names to canonical vocabulary
- Filter out non-canonical features
- Deduplicate entries
- Store rich details in `features_detailed` (name, description, confidence, context)

### Step 4: Application to Master
- Write canonical feature strings to `features[]` in `game_data_master.json`
- Preserve `features_detailed[]` for X-ray panel deep-dive
- Safety guard: won't overwrite if art fields would be lost

---

## Additional Extracted Fields

| Field | Source | Description |
|-------|--------|-------------|
| `theme_primary` | Rules text analysis | Primary visual/gameplay theme |
| `volatility` | Rules page specs | Low / Medium / High / Very High |
| `rtp` | Rules page specs | Return to Player percentage |
| `description` | Claude summarization | 1–2 sentence game description |
| `extraction_date` | Timestamp | When extraction was performed |

---

## Commands

```bash
# Extract single game
python3 extract_game_profile.py --game "Capital Gains"

# Extract and apply to master (sequential)
python3 extract_game_profile.py --run-all --apply --limit 10

# Batch API extraction (cheapest)
python3 extract_game_profile.py --batch --apply

# Test against ground truth
python3 extract_game_profile.py --test-ags

# Art characterization (separate pass)
python3 extract_game_profile.py --extract-art --limit 20
```

---

## File Locations

| File | Purpose |
|------|---------|
| `data/extract_game_profile.py` | Main pipeline script |
| `data/rules_html/` | Source HTML rules pages (~8800 files) |
| `data/rules_game_matches.json` | Game ↔ rules page matching |
| `data/game_data_master.json` | Output target (features written here) |
| `data/extraction_results.jsonl` | Raw extraction log |
| `data/extraction_checkpoint.json` | Resume checkpoint |
| `data/staged_feature_extraction.json` | Staged results pre-apply |
| `data/ground_truth_ags.json` | Ground truth for validation |

---

## Quality Controls

| Control | Description |
|---------|-------------|
| Ground Truth | 228 games (207 with features) in `ground_truth_ags.json` |
| Hard Gate | 95% micro F1 — `sc_extract.py --validate-features` blocks if below |
| Validated Accuracy | **97.0% micro F1** on 30 AGS validation games |
| Canonical Vocabulary | Only 30 allowed features — rejects all others |
| Deduplication | No duplicate features within a game |
| Art Preservation Guard | Refuses to write master if art fields drop >5% |
| Confidence Scores | 1–5 per extracted feature |

---

## Data Flow

```
rules_html/ ──▶ extract_game_profile.py ──▶ staged_feature_extraction.json
                                                        │
                                                        ▼ (--apply)
                                              game_data_master.json
                                                        │
                                                        ▼ (build:data)
                                              games_processed.json + games.parquet
                                                        │
                                                        ▼
                                              Dashboard (DuckDB queries)
```
