# Art Agent — Cost Optimization Experiment

**From**: Atlas (orchestrator)
**Priority**: HIGH — do this BEFORE Batch 3
**Estimated cost**: ~$1.25 total (4 tests × 20 games)
**Estimated time**: ~15 minutes

## Context

The Batch API got stuck on the 287-game run. Atlas investigated and found:
1. **Not payload size** (60MB is fine, limit is 256MB)
2. The real issues: no prompt caching (1.58M wasted tokens), demand throttling on 287 vision requests
3. The pipeline discards all token usage data — we're flying blind on costs

This experiment will give us hard data to pick the optimal config for Batch 3 (122 games) and any future reclassification.

## What to Build

### Step 1: Add token usage tracking to `classify_game()`

In `classify_art.py`, the `classify_game()` function (line ~1477) calls `client.messages.create()` but only uses `resp.content[0].text` and throws away `resp.usage`. Fix this:

```python
# After resp = client.messages.create(...) around line 1477-1482
# Capture usage data from the response
usage_data = {
    'input_tokens': resp.usage.input_tokens,
    'output_tokens': resp.usage.output_tokens,
    'cache_creation_input_tokens': getattr(resp.usage, 'cache_creation_input_tokens', 0),
    'cache_read_input_tokens': getattr(resp.usage, 'cache_read_input_tokens', 0),
}
```

Make `classify_game()` return `result, name, fixes, usage_data` (4 values instead of 3). Update all callers.

### Step 2: Add `--no-masked` CLI flag

Add a `--no-masked` argument that skips calling `create_masked_screenshot()`. When set, `masked_b64` stays `None` and only the original screenshot is sent. This affects both `classify_game()` and `run_batch()` — pass a `use_masked=True` parameter.

### Step 3: Add prompt caching support

**For sync API** (`classify_game()`, line ~1477):
```python
resp = client.messages.create(
    model=MODEL,
    max_tokens=1000,
    cache_control={"type": "ephemeral"},  # <-- ADD THIS
    system=system_prompt,
    messages=[{"role": "user", "content": user_content}],
)
```

**For batch API** (`run_batch_api()`, line ~1668-1675):
```python
requests.append({
    "custom_id": custom_id,
    "params": {
        "model": MODEL,
        "max_tokens": 1000,
        "system": [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral", "ttl": "1h"}}],  # <-- cache with 1-hour TTL for batch
        "messages": [{"role": "user", "content": user_content}],
    }
})
```

Add a `--no-cache` flag so we can disable caching for the baseline test.

### Step 4: Build the `--cost-experiment` mode

Add a `--cost-experiment` CLI flag. When set, it:

1. Selects 20 games from the expanded regression set (games that are both in `user_reviews.json` AND in `results.json`, so we can compare accuracy). Pick the first 20 alphabetically from human-reviewed rounds (exclude `auto_*` rounds).

2. Runs 4 test configurations sequentially on the SAME 20 games:

| Test | Cache | Masked | API | Implementation |
|------|-------|--------|-----|----------------|
| T1 | OFF (`--no-cache`) | YES (2 images) | Sync | Baseline, current behavior |
| T2 | ON (5-min ephemeral) | YES (2 images) | Sync | Just caching added |
| T3 | ON (5-min ephemeral) | NO (1 image, `--no-masked`) | Sync | Caching + drop masked |
| T4 | ON (1h ephemeral) | YES (2 images) | Batch API | Caching in batch mode |

3. For each test, captures per-game:
   - `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
   - Wall clock time (seconds)
   - Classification result (theme, characters, elements, colors)

4. After all 4 tests complete, compares each game's results against `user_reviews.json` verdicts to score accuracy per config.

5. Saves everything to `art_pipeline/cost_experiment_results.json`:
```json
{
  "timestamp": "2026-04-19T...",
  "games_tested": 20,
  "tests": {
    "T1_baseline": {
      "config": {"cache": false, "masked": true, "api": "sync"},
      "total_input_tokens": 12345,
      "total_output_tokens": 678,
      "total_cache_creation_tokens": 0,
      "total_cache_read_tokens": 0,
      "wall_clock_seconds": 120.5,
      "estimated_cost_usd": 0.57,
      "accuracy": {"theme": 95.0, "characters": 90.0, "elements": 70.0, "colors": 85.0},
      "per_game": [ ... ]
    },
    "T2_cached": { ... },
    "T3_no_masked": { ... },
    "T4_batch_cached": { ... }
  },
  "comparison": {
    "caching_savings_pct": 51.2,
    "masked_accuracy_delta": {"theme": 0.0, "characters": -5.0, "elements": +5.0, "colors": 0.0},
    "batch_reliable": true
  }
}
```

6. Prints a summary table to stdout:
```
=== COST EXPERIMENT RESULTS ===
Test       | Input Tok | Cache Read | Cost     | Time   | Theme | Chars | Elem  | Colors
T1 base    | 171,000   | 0          | $0.57    | 120s   | 95.0% | 90.0% | 70.0% | 85.0%
T2 cached  | 65,000    | 104,500    | $0.29    | 118s   | 95.0% | 90.0% | 70.0% | 85.0%
T3 no-mask | 45,000    | 104,500    | $0.24    | 95s    | 95.0% | 85.0% | 65.0% | 85.0%
T4 batch   | 65,000    | 104,500    | $0.15    | 45s    | 95.0% | 90.0% | 70.0% | 85.0%
```

### Cost calculation formula

Use Sonnet 4 pricing:
- Sync: input $3/MTok, output $15/MTok
- Batch: input $1.50/MTok, output $7.50/MTok
- Cache write (5-min): 1.25× base input rate
- Cache write (1-hour): 2× base input rate
- Cache read: 0.1× base input rate

```python
def calculate_cost(usage, is_batch=False, cache_ttl='5m'):
    input_rate = 1.5 if is_batch else 3.0  # $/MTok
    output_rate = 7.5 if is_batch else 15.0
    write_mult = 2.0 if cache_ttl == '1h' else 1.25
    
    uncached = usage['input_tokens'] / 1e6 * input_rate
    cache_write = usage['cache_creation_input_tokens'] / 1e6 * input_rate * write_mult
    cache_read = usage['cache_read_input_tokens'] / 1e6 * input_rate * 0.1
    output = usage['output_tokens'] / 1e6 * output_rate
    return uncached + cache_write + cache_read + output
```

## Important Rules

1. **DO NOT modify results.json** — the experiment results go to `cost_experiment_results.json` only
2. **DO NOT re-classify games permanently** — this is a read-only experiment for cost data
3. **The caching and token tracking changes SHOULD persist** in the codebase after the experiment — they're permanent improvements
4. **The `--no-masked` and `--no-cache` flags SHOULD persist** — useful for future testing
5. **Run `--regression-full` after all code changes** to verify you haven't broken anything (no API calls, offline only)
6. **API calls**: 4 tests × 20 games = 80 sync calls + 1 batch of 20. Estimated total cost: ~$1.25

## Accuracy Comparison Method

For each of the 20 test games, compare the classification result against the user review verdicts in `user_reviews.json`:
- Theme: exact match or secondary theme match (use existing `_theme_matches()` logic)
- Characters: check if the reviewed characters are present
- Elements: check if reviewed elements are present  
- Colors: check if reviewed colors match

Report as percentage correct per dimension per test config.

## Deliverables

1. Code changes in `classify_art.py` (caching, token tracking, --no-masked, --no-cache, --cost-experiment)
2. `art_pipeline/cost_experiment_results.json` with all raw data
3. Summary table printed to stdout
4. `--regression-full` output confirming no regressions
5. Update `ART_PIPELINE_HANDOFF.md` with the new flags and experiment results

## After This Experiment

Atlas will analyze the results and decide the optimal configuration for Batch 3 (122 remaining games). Do NOT start Batch 3 until Atlas reviews the experiment data.
