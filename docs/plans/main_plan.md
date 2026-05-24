# Main Plan

## Current Status (May 6, 2026)

| Milestone | Status | Games |
|-----------|--------|-------|
| CSV data import (existing + new games) | DONE | 5,124 |
| Feature extraction | DONE | 3,674 have features |
| Screenshot acquisition | IN PROGRESS | ~2,900 have screenshots |
| Art classification | IN PROGRESS | 2,922 classified |
| Final build + deploy | PENDING | — |

---

## What's Done

- CSV Phase 1: Updated 4,377 existing games with new Eilers numbers
- CSV Phase 2: Added 574 new games (total: 5,124)
- Feature extraction: Applied to master, normalized to 30-feature canonical vocabulary
- SlotCatalog screenshots: 2,760 (exhausted)
- Provider screenshots: Play'n GO (106), Light & Wonder (14), Hacksaw Gaming (28)
- Art classification: 2,922 games classified (latest batch: 196 new screenshot games)
- All 1,698 tests pass

## What's Active

1. **Screenshot acquisition** — ~2,000 games still need screenshots
   - Plan: [screenshot-acquisition.md](screenshot-acquisition.md)
   - Need more provider sources (Evolution, IGT, Pragmatic, etc.)
   - Trial and error per provider

2. **Art classification** — Classify as screenshots come in
   - Plan: [art-classification-and-features.md](art-classification-and-features.md)
   - Spot review every 200 games
   - Current accuracy: 84.8% base / 97.3% adjusted (spot-check ~85-90%)

## What's Left

1. **Get more screenshots** — Creative sourcing from remaining providers
2. **Classify remaining** — As screenshots arrive, batch classify
3. **Final merge + build** — Rebuild parquet, test, verify UI
4. **Deploy** — Ship updated dashboard

---

## Completed Plans

| Plan | What It Did |
|------|-------------|
| [csv-data-update.md](completed/csv-data-update.md) | Full CSV import: matching, updating, new games, validation |

## Active Plans

| Plan | What It Covers |
|------|----------------|
| [screenshot-acquisition.md](screenshot-acquisition.md) | Multi-source screenshots: providers, quality filters, review grids |
| [art-classification-and-features.md](art-classification-and-features.md) | Feature extraction + art classification pipeline orchestration |
