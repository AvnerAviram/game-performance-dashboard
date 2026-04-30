# Features Agent — Game Features & Themes Extraction

## Role

Extracts game features (mechanics) and themes from HTML rules pages using Claude API. Operates `extract_game_profile.py` and `sc_extract.py`.

## Key Files

- `data/extract_game_profile.py` — main extraction pipeline (4,310 lines)
- `data/sc_extract.py` — SlotCatalog review-based extraction + 95% F1 validation gate
- `data/ground_truth_ags.json` — ground truth: 228 games, 207 with features (validated at 97% F1)
- `data/rules_html/` — 8,860 HTML rules pages (input data)
- `data/game_data_master.json` — extracted features stored here (requires user approval to write)
- `data/_legacy/classification_validation.json` — historical 30-game validation benchmark

## Pipeline Components

| Component | File | Purpose |
|-----------|------|---------|
| Provider hints | `extract_game_profile.py` → `PROVIDER_HINTS` | Per-provider extraction tuning (10 providers) |
| Feature taxonomy | `extract_game_profile.py` → `FEATURE_DEFINITION_CARDS` | Canonical feature definitions for Claude |
| Theme taxonomy | `extract_game_profile.py` → `THEME_TAXONOMY` | Theme classification hierarchy |
| Post-processing | `extract_game_profile.py` → `post_process()` | Slingo filter, theme normalize, confidence gate (≥4) |
| Canonical names | `extract_game_profile.py` → `CANONICAL_FEATURE_NAMES` | Standardizes extracted feature names |
| Training games | `extract_game_profile.py` → `TRAINING_GAMES` + `CRITICAL_EXAMPLES` | Few-shot examples for Claude |
| GT validation | `extract_game_profile.py` → `compare_with_gt()` | Compares extraction vs ground truth |
| F1 hard gate | `sc_extract.py` → `validate_features()` | Blocks if micro F1 < 95% |

## Quality Gate

- **95% micro F1** hard gate in `sc_extract.py --validate-features`
- Compares against `ground_truth_ags.json` features
- Current benchmark: **97.0% micro F1** on 30 AGS validation games
- Gate file missing or features missing from GT = gate fails (fail-safe)

## Workflow

1. Collect HTML rules pages → `data/rules_html/`
2. Run extraction → features + themes written to `game_data_master.json`
3. Validate → `sc_extract.py --validate-features` must pass 95% F1
4. Spot-check new extractions against GT
5. Update GT if new validated games are available

## Critical Knowledge

- Features were restored to `ground_truth_ags.json` on 2026-04-19 (had been accidentally removed in commit `12011183`)
- The validated GT source is `_backup_20260319/ground_truth_ags.json` (matches commit `d4132cd9`)
- `test_extract_game_profile.py` depends on GT for correct validation
