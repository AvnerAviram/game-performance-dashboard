# games_master Validation Suite

Phased validation of `games_master.json` (~515 games) against the CSV baseline.

## Quick Start

```bash
# Run full validation suite (Phases 0-5)
./run_validation_suite.sh

# With backup before run
./run_validation_suite.sh --backup
```

## Scripts

| Script | Purpose |
|--------|---------|
| `validate_phase0_csv_baseline.py` | CSV reconciliation - match db to CSV, find mismatches, holes |
| `validate_phase1_provider.py` | Provider verification - prioritized list, apply corrections |
| `validate_phase2_names_performance.py` | Game names & theo_win/market_share vs CSV |
| `validate_phase3_specs.py` | RTP, reels, rows - missing or out of range |
| `validate_phase4_themes.py` | Themes & mechanics - generic placeholders |
| `validate_phase5_flagged.py` | FLAGGED, invalid, duplicate, manual review |
| `validate_1_csv_reconciliation.py` | Legacy CSV compare (position-based) |
| `validate_2_feature_names.py` | Feature-as-game-name detection, mechanic.features |
| `validate_3_web_sources.py` | Source quality check |
| `validate_4_data_completeness.py` | Field completeness |

## Phase 1 Provider Verification

```bash
# List games to verify (priority order)
python3 validate_phase1_provider.py --list

# Generate report with batches
python3 validate_phase1_provider.py --report

# Apply corrections from JSON file
python3 validate_phase1_provider.py --apply corrections.json
python3 validate_phase1_provider.py --apply corrections.json --dry-run
```

## Output Reports

All reports in `game_analytics_export/data/`:

- `VALIDATION_PHASE0_REPORT.json` - CSV baseline reconciliation
- `VALIDATION_PHASE1_REPORT.json` - Provider verification batches
- `VALIDATION_PHASE2_REPORT.json` - Names & performance issues
- `VALIDATION_PHASE3_REPORT.json` - Specs issues
- `VALIDATION_PHASE4_REPORT.json` - Theme/mechanic issues
- `VALIDATION_PHASE5_REPORT.json` - FLAGGED, invalid, duplicate

## Logging & Corrections

- **Provider corrections**: `CSV_CORRECTIONS_LOG.json` (`provider_corrections`)
- **Other corrections**: `CSV_CORRECTIONS_LOG.json` (`name_corrections`, `performance_corrections`, `theme_corrections`, `specs_corrections`)
- **Cache**: `validation_cache.json` - verified results, checkpoint for resume

## CSV Baseline

Path: `/Users/avner/Downloads/Data Download Theme (4).csv`

Columns: Game Name, Parent Supplier, Game Category, Month/Year of OGPD Release Date, Theo Win Index, % of Total GGR
