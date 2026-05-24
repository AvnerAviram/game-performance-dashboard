# Pipelines

Data processing scripts organized by domain. Each pipeline follows a consistent structure.

## Standard Folder Structure

Every pipeline folder uses:
```
{pipeline_name}/
├── scripts/       # Executable code (.py, .mjs, .cjs)
├── state/         # Runtime outputs, logs, cached results (gitignored where needed)
├── config.json    # Pipeline-specific configuration (if applicable)
├── ground_truth.json  # Validation reference data (if applicable)
└── _experiments/  # Archived experiments (if applicable)
```

## Pipelines

| Folder              | Purpose                                    | Key Script                                         |
| ------------------- | ------------------------------------------ | -------------------------------------------------- |
| `art_pipeline/`     | Art style classification (Claude Vision)   | `scripts/classify_art.py`                       |
| `feature_pipeline/` | Game feature extraction (Claude text)      | `scripts/extract_game_profile.py`                  |
| `scraping/`         | Screenshot + data scraping                 | `scripts/vso_screenshot_parallel.cjs`              |
| `matching/`         | Game name matching + fuzzy search          | `scripts/smart_match.py`                           |

## Shared Configuration

- `config.py` — Shared Python path resolution (all `.py` scripts import from here)
- `requirements.txt` — Python dependencies for all pipelines
- `.env` — API keys (`ANTHROPIC_API_KEY`, etc.) — NOT committed

## Running

From `game_analytics_export/`:

```bash
# Art classification
python data/pipelines/art_pipeline/scripts/classify_art.py --batch --apply

# Feature extraction
python data/pipelines/feature_pipeline/scripts/extract_game_profile.py --batch --apply

# Screenshot acquisition
node data/pipelines/scraping/scripts/vso_screenshot_parallel.cjs /tmp/vso_batch_all.json

# Game matching
python data/pipelines/matching/scripts/smart_match.py
```
