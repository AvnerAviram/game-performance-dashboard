# Data Directory

Organized data for the Game Performance Dashboard.

## Structure

| Folder | Contents |
|--------|----------|
| `master/` | `game_data_master.json` — the single source of truth for all game metadata |
| `mappings/` | Lookup tables (themes, confidence, franchises, art themes) |
| `matching/` | Rules-based game matching data (indices, matches, rejections, fuzzy candidates) |
| `staging/` | Pipeline outputs awaiting approval/merge (art, features, best-of) |
| `validation/` | Ground truth files for pipeline accuracy validation |
| `screenshots/` | Game screenshots (acquired from various sources) |
| `art_pipeline/` | Art classification pipeline state (results, config, ground truth) |

## Key Files

- **`master/game_data_master.json`** — 3000+ games with metadata, features, art classification
- **`mappings/theme_consolidation_map.json`** — Maps raw themes to canonical theme names
- **`mappings/confidence_map.json`** — Provider confidence scores for data quality
- **`staging/staged_art_characterization.json`** — Latest art classification batch results (pending merge)

## Notes

- Files in `staging/` are NOT yet merged into master — they need user approval first
- `screenshots/` is populated by scraping pipelines (do not delete during acquisition)
- Build scripts copy flat-named files to `public/data/` for the frontend (the subfolder structure is internal only)
