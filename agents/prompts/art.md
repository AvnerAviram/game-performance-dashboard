# Art Agent — Current Task

> **Updated by Atlas**: 2026-04-29
> **Status**: READY — classify first half remainder (games 301-1160, A→Z)
> **Read first**: `AGENTS.md`, then `agents/art.md`

## Context

You already classified games 1-400 (saved via checkpoint). Another agent is running in parallel, classifying games 1161-2320 (Z→A) into a separate output file. Your job is the middle chunk: games 401-1160.

## Task: Classify games 401-1160

### Run this command from `game_analytics_export/data/`:

```bash
cat _first_half_games.txt | xargs python3 classify_art_v2.py --no-masked 2>&1
```

This processes 760 games (Dancing-Drums-Explosion through Queen-Of-Ice) using the existing pipeline with all corrections applied. Checkpoints save to `results.json` every 100 games automatically.

Expected runtime: ~1.6 hours at ~7.7 games/minute.

### When Done

Report:
1. Total games classified
2. Any failures (with game names)
3. Total game count in `results.json`

### Rules

- Use the EXISTING code, corrections, and prompt — no changes
- Do NOT modify `classify_art_v2.py`, `corrections.json`, or `_parallel_games.txt`
- The script checkpoints every 100 games automatically
- If the script errors on a game, it logs the error and continues

### DO NOT TOUCH

- `results_parallel.json` — the other agent is writing to this
- `_parallel_games.txt` — the other agent's game list
- `classify_art_v2.py` — no code changes
- `corrections.json`, `user_reviews.json`, `game_data_master.json`
- `src/`, `server/`
