# Screenshot Pre-Screen Pipeline

Automatically classifies game screenshots as **gameplay** vs **not_gameplay** before they enter the art classification pipeline.

## Pipeline Script
`scripts/prescreen_classifier.py`

## How It Works

### Two-Stage Filter

1. **Size Gate** (free, instant)
   - Images < 60KB → auto-rejected as thumbnails
   - Catches ~50% of non-gameplay images

2. **Claude Vision** (Sonnet, 200×200px JPEG q50)
   - Cost: ~$0.002 per image
   - Accuracy: 95.7% against user-reviewed ground truth
   - Precision: 95.7% | Recall: 100%
   - Biased toward keeping images (false positives > false negatives)

### Prompt Engineering
The classification prompt lives in `prompt.txt` — editable without touching code.
Iterate by: editing prompt → running `--regression` → checking accuracy.

## Usage

```bash
# Run regression test against ground truth
python scripts/prescreen_classifier.py --regression

# Classify new screenshots (with optional limit)
python scripts/prescreen_classifier.py --classify --limit 100

# Show current stats
python scripts/prescreen_classifier.py --stats
```

## Directory Structure

```
prescreen_pipeline/
├── README.md              ← this file
├── prompt.txt             ← editable classification prompt
├── scripts/
│   └── prescreen_classifier.py   ← main pipeline script
├── gt/
│   └── ground_truth.json  ← user-reviewed labels (gameplay/not_gameplay)
└── state/
    ├── prescreen_results.json    ← classification results
    └── regression_log.json       ← history of regression runs
```

## Regression Testing

Every prompt change should be tested:
1. Edit `prompt.txt`
2. Run `python scripts/prescreen_classifier.py --regression`
3. Check accuracy against GT
4. If accuracy drops → revert prompt
5. If accuracy improves → commit and run on new images

## Ground Truth

`gt/ground_truth.json` contains user-reviewed decisions:
- 38 total entries (23 with screenshot files on disk)
- Add more by running spot-checks and updating the file

## Cost Estimate

For 1,000 new screenshots:
- Size gate eliminates ~500 (free)
- Claude classifies ~500 remaining: ~$1.00
- Total: ~$1 per 1,000 images
