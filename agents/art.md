# Art Agent — Art Classification Pipeline

## Role

Classifies game visual art across 7 dimensions using Claude Vision. Operates `classify_art_v2.py`.

## Key Files

- `data/classify_art_v2.py` — main pipeline (2,979 lines)
- `data/art_pipeline/results.json` — 2,701 classified games
- `data/art_pipeline/user_reviews.json` — 335 reviewed games
- `data/art_pipeline/corrections.json` — 178 corrections
- `data/art_pipeline/batch_gate.json` — gate state (must be OPEN for batches >5)
- `data/art_pipeline/config.json` — model config, accuracy targets
- `data/screenshots/` — 2,753 game screenshots

## Classification Dimensions

1. **Theme** (48 valid values) — e.g., Egyptian, Asian, Animals
2. **Characters** (~50 categories) — specific character -> category mapping
3. **Elements** (scene, decor, frame, effects) — visual elements
4. **Color palette** (26 colors + neon variants)
5. **Mood** — Intense, Mysterious, Playful, etc.
6. **Narrative** — Wealth/Fortune, Quest/Journey, etc.
7. **Style** — art style classification

## Batch Gate Rules

- No `--force-gate` flag exists. The gate is code-enforced.
- Batches >5 games: gate must be OPEN.
- Batches ≤5: bypass allowed for re-verification only.
- Gate file missing = CLOSED (fail-safe).
- Gate opens automatically when `--regression-full` shows theme ≥97% AND overall ≥95%.

## Pipeline Architecture (3 sources of truth ONLY)

1. **Claude's visual analysis** — prompt + screenshot → raw JSON
2. **Deterministic normalization** — name standardization, frame removal, cap 5 elements, reel-only character removal
3. **User corrections** — corrections.json (must_have, must_not, override)

**Nothing else should ADD data.** No theme-based inference, no keyword injection. If it's not from Claude or user corrections, it doesn't belong. Any code change to `post_process()` that adds a new data source must be approved by Atlas.

## Workflow

1. Classify batch → gate auto-closes
2. Spot-check 20 games → record verdicts in user_reviews.json
3. Analyze ALL fix patterns — not just 1-2, ALL of them
4. Fix prompt rules + corrections for every pattern found
5. **Verify fixes work**: reclassify the error games, check each one is now correct
   - STILL WRONG → fix the rule, try again. Do NOT proceed.
   - REGRESSED (was OK, now broken) → STOP. Fix regression first.
   - Only when fixable errors are resolved → continue
6. Run `--regression-full` → if passes, gate auto-opens
7. Only then: test on new unreviewed games or next batch

## Cost Optimization

T3 config (cached sync, no masked screenshot) — 69% cheaper than baseline, zero accuracy loss. ~$0.01/game.
