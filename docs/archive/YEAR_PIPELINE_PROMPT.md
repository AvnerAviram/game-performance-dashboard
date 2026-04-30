# Year Extraction Pipeline — Agent Prompt

> Copy everything below this line as the prompt for a new agent.

---

## Your Task

You are continuing work on a **Global Online Release Year extraction pipeline** for a slot game analytics dashboard. The goal is to get the correct **global online release year** for all 4,550 games in the master dataset.

**Read `game_analytics_export/data/YEAR_PIPELINE.md` first** — it is the single source of truth for this pipeline. Everything you need is there: goal definition, current state, data sources, pitfalls, file map, pending tasks, and non-negotiable rules.

Below is a summary to orient you quickly, but YEAR_PIPELINE.md has the full details.

---

## Orchestration — Keep YEAR_PIPELINE.md Current

This pipeline is coordinated by an orchestrator chat. **After every significant action** (new calibration run, staged results updated, source validated, task completed, decision made, or user approval received), update `game_analytics_export/data/YEAR_PIPELINE.md` so the orchestrator can track progress across chats.

Each update must include:
- **Date** of the update
- **What changed** (new numbers, sources added, tasks completed)
- **Current state snapshot** — coverage %, GT accuracy, staged count, validated count
- **Open blockers or decisions** waiting on user

Maintain a dated changelog section at the top of YEAR_PIPELINE.md (newest first) so history is preserved.

The orchestrator will NOT read your chat history — all status must live in YEAR_PIPELINE.md.

---

## What "Global Online Release Year" Means

The year a game **first became available for real-money play on any regulated online casino platform worldwide** (any jurisdiction — UK, Malta, NJ, etc.).

**It is NOT:**
- Land-based casino cabinet release date (physical slot machines)
- NJ-specific launch date (unless the game is online-first)
- Announcement, certification, or social casino date
- Game variant re-release date

---

## Current State (verified numbers)

| Metric | Value |
|--------|-------|
| Total games in master | 4,550 |
| Have global year (`original_release_year`) | 2,474 (54.4%) |
| **Actually validated against ground truth** | **41 (1.7%)** |
| Stripped (unreliable years removed) | 1,766 |
| Invalid (global year > NJ year) | 37 |

**Bottom line: 98.3% of existing years have never been validated. We don't know if they're correct.**

---

## Ground Truth

We have **32 AGS games** with provider-verified global online release dates (day-level precision) from an AGS provider Excel spreadsheet. These are in `year_pipeline/ground_truth.json`.

**Every new data source MUST be calibrated against these 32 AGS GT games before being trusted.** This is how the feature/art classification pipelines work in this project — calibrate first, trust later.

---

## Source Calibration Results (what we know)

| Source | Calibrated? | AGS GT Accuracy | Notes |
|--------|------------|-----------------|-------|
| SlotsLaunch (scrape) | YES | **97%** (28/29) | Best source. 1 miss: Red Silk (28-day boundary). API not yet tried. |
| SlotCatalog | YES | **70%** (14/20) | Often gives land-based cabinet dates, not online. |
| slot.report | PARTIAL | **Can't test** (0 AGS games) | 5,592 games, only online-first EU providers. Already downloaded as `_slot_report_data.json`. |
| SlotReport (existing master source) | NO | **Can't test** (0 AGS overlap) | 958 games in master from this source, never validated. |
| Claude API lookup | FAILED | ~40-50% | All 1,778 Claude years were stripped. Do not retry. |
| Eilers CSV | N/A | 100% for NJ | NJ dates only, not global. Already in master as `release_year`. |

Full details in `year_pipeline/source_calibration.json`.

---

## Critical Pitfalls (read before touching data)

1. **Land-based cabinet dates** — SlotCatalog often returns cabinet release (years before online). Affects Ainsworth, Konami, Aristocrat, IGT, L&W, Aruze, AGS.
2. **Epoch dates** — January 1, 1970 in SlotsLaunch for Wazdan/Gaming Realms. Always garbage.
3. **NJ year != Global year** — NJ launch is 1-3 years after global for EU providers.
4. **NJ year = Global year** — For online-first providers (Wazdan, Gaming Realms, Spinberry, etc.), NJ IS the global year.
5. **Year-boundary edge cases** — Red Silk: released Dec 17 2020, SlotsLaunch says Jan 14 2021.
6. **Slug mismatches** — URL-based SlotsLaunch scraping fails ~60%. API would fix this.
7. **Global year > NJ year is invalid** — 37 games in master have this. They're wrong.

Full list with severity/examples in `year_pipeline/pitfalls.json`.

---

## Key Files

```
game_analytics_export/data/
├── YEAR_PIPELINE.md                    ← MASTER PLAN — read this first
├── extract_release_year.mjs            ← Pipeline script (extract/review/apply)
│
├── year_pipeline/                      ← KNOWLEDGE FILES
│   ├── ground_truth.json               ← 32 AGS games with verified dates
│   ├── source_calibration.json         ← Accuracy per source vs AGS GT
│   ├── pitfalls.json                   ← 9 documented traps
│   ├── provider_classification.json    ← Provider tiers (online-first/land-based/etc.)
│   └── config.json                     ← Thresholds + master field documentation
│
├── _slotslaunch_scrape.json            ← 658 SL dates (URL scraping, 37% hit rate)
├── _slotslaunch_calibration.json       ← SL vs AGS GT calibration (29 games)
├── _sc_release_dates.json              ← 1,718 SlotCatalog cached dates
├── _sc_recovery.json                   ← 269 SC matches (THIS is what pipeline reads)
├── _slot_report_data.json              ← slot.report API data (5,592 games, 58 providers)
├── _staged_year_results.json           ← Pipeline output (1,012 at conf>=3, NOT applied)
├── eilers_source.csv                   ← 4,551 NJ platform dates
└── game_data_master.json               ← Master data (DO NOT WRITE without user permission)
```

---

## Pipeline Commands

```bash
cd game_analytics_export/data
fnm use 20  # Node v20 required

node extract_release_year.mjs --stats        # Show current year coverage
node extract_release_year.mjs --gt-test      # Extract all stripped + calibrate vs AGS GT
node extract_release_year.mjs --extract      # Extract years, write staged results
node extract_release_year.mjs --review       # Generate YEAR_REVIEW_V2.html for user review
node extract_release_year.mjs --apply        # Apply staged results to master (GT-gated at 95%)
```

---

## Pending Tasks (Priority Order)

### 1. Try the SlotsLaunch API (highest impact)

Our URL-based scraping only matched 37% of games. The SlotsLaunch API (`GET /api/games`) provides structured data with a `release` field and a `land_based` boolean flag. It requires an API token (check `.env` or register at slotslaunch.com). API docs: https://docs.slotslaunch.com/article/12-api-endpoints

**Steps:**
1. Check if we have an API token (`.env` currently only has `ANTHROPIC_API_KEY`)
2. Register at slotslaunch.com if needed
3. Fetch all games via API, paginating with `per_page=150`
4. Match against our 4,550 master games by name
5. Calibrate against the 32 AGS GT games
6. Compare coverage improvement vs URL scraping

### 2. Cross-validate with slot.report data

`_slot_report_data.json` has 5,592 games with dates but 0 AGS games. Useful for validating online-first providers.

**Steps:**
1. Match slot.report games against master by name + provider
2. For games with both slot.report and existing SC/SR dates, check if they agree
3. For online-first stripped games, use slot.report as a second source for consensus
4. Record findings in `year_pipeline/source_calibration.json`

### 3. Validate existing years in master

2,285 games have years from slotcatalog (1,327) and slotreport (958) — never validated.

**Steps:**
1. Cross-reference against SlotsLaunch/slot.report data
2. Flag disagreements
3. The 37 games with `original_release_year > release_year` are definitely wrong — fix or remove
4. Generate a review HTML for user to verify suspicious ones

### 4. Apply pipeline results (needs user approval)

1,012 years at confidence >= 3 are staged in `_staged_year_results.json`. The GT gate passed at 96%.

**Steps:**
1. Ask user for approval
2. Run `node extract_release_year.mjs --apply`
3. Verify coverage improvement

### 5. Close the remaining ~450 no-source gap

These are mostly land-based US providers (Aristocrat 96, L&W 80, IGT 54, Everi 44, Aruze 41) where all sources fail. The SlotsLaunch API (Task 1) is the best hope.

---

## How This Project Does Things (Methodology)

This project uses a rigorous pipeline methodology modeled on `extract_game_profile.py` (feature/art classification). The key principles:

1. **IS/NOT definition cards** — Clear rules for what counts and what doesn't
2. **Ground truth calibration** — Test every source against known-correct data (AGS GT) before trusting it
3. **Confidence scoring** — Every result gets a 1-5 confidence score; only conf >= 3 gets applied
4. **Deterministic post-processing** — Rule-based fixes applied after extraction (epoch filter, plausibility checks, provider-aware rules)
5. **GT gate** — Pipeline must pass >= 95% accuracy on AGS GT before any data is written to master
6. **Staged output** — Results go to a staging file, then review HTML, then apply (never direct to master)
7. **Scale slowly** — Calibrate → 5 games → verify → 20 → verify → all
8. **Document everything** — Update `YEAR_PIPELINE.md` and knowledge files as you go

---

## Non-Negotiable Rules

1. **NEVER write to `game_data_master.json` without explicit user permission**
2. **NEVER trust a source that hasn't been calibrated against AGS GT**
3. **Always run GT calibration after any pipeline change** — must pass >= 95%
4. **Backup master before any write**
5. **Use real data, never guess or estimate accuracy** — run the numbers
6. **Document everything in YEAR_PIPELINE.md and knowledge files**
7. **Land-based dates are NOT online dates** — always check provider type
8. **Prefer API over scraping** — structured data beats URL construction

---

## Environment

- **Node v20** required (`fnm use 20`)
- **Working directory**: `game_analytics_export/data`
- **API key**: `ANTHROPIC_API_KEY` in `game_analytics_export/data/.env` (for Claude calls if needed)
- **All year scripts are `.mjs`** (ES modules)
- **Run `npm test` from `game_analytics_export/`** before declaring work done
- **Run `npm run format`** before declaring work done
