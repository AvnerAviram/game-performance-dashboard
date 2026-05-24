# Game Analytics Dashboard — Project Map

A data pipeline + dashboard for analyzing slot game performance, features, and art classification.

## Where Is Everything

```
project root/
├── docs/                               ← YOU ARE HERE — all documentation
│   ├── README.md                       ← This file
│   ├── pipelines/
│   │   ├── ART_CLASSIFICATION.md      ← Art pipeline: Claude Vision, params, accuracy
│   │   ├── FEATURE_EXTRACTION.md      ← Feature pipeline: rules → features
│   │   └── README.md                  ← Quick reference for all scripts
│   ├── plans/
│   │   └── MASTER_PLAN.md             ← Active plans + status + what's next
│   ├── reviews/                        ← Spot-check HTML grids (39 files, dated)
│   ├── agents/                         ← AI agent role definitions
│   └── archive/                        ← Old docs, prompts, verification reports
│
├── game_analytics_export/
│   ├── data/
│   │   ├── game_data_master.json       ← THE source of truth (5,124 games)
│   │   ├── classify_art.py          ← Art classification pipeline
│   │   ├── extract_game_profile.py     ← Feature extraction pipeline
│   │   ├── art_pipeline/              ← Art outputs + gate + reviews + run log
│   │   ├── screenshots/               ← Game screenshots (~2,900 images)
│   │   ├── rules_html/                ← HTML rules files (~8,860)
│   │   ├── _legacy/sc_cache/          ← SlotCatalog HTML cache (~2,775)
│   │   └── _archive/                  ← Old backups + intermediate data
│   ├── scripts/                        ← Build, merge, deploy scripts
│   ├── src/                            ← Dashboard frontend code
│   ├── server/                         ← Express server
│   └── tests/                          ← Vitest test suite (114 files, 1698 tests)
│
├── .cursor/rules/                      ← AI guardrails (always-applied)
├── AGENTS.md                           ← AI agent entry point
└── README.md                           ← Repo intro
```

## Quick Links

| Need to... | Go to |
|------------|-------|
| Understand art classification | [pipelines/ART_CLASSIFICATION.md](pipelines/ART_CLASSIFICATION.md) |
| Understand feature extraction | [pipelines/FEATURE_EXTRACTION.md](pipelines/FEATURE_EXTRACTION.md) |
| See all scripts + commands | [pipelines/README.md](pipelines/README.md) |
| Check project status + plans | [plans/MASTER_PLAN.md](plans/MASTER_PLAN.md) |
| Review spot-check grids | [reviews/](reviews/) |

## Current Status

- **5,124 games** in master (CSV update complete)
- **3,674** have features extracted (canonical vocabulary, 30 features)
- **~2,900** have art classification (running 196 new today)
- **~148 new screenshots** acquired (Play'n GO, Light & Wonder, Hacksaw)
- **All 1,698 tests pass** (unit + integration + data validation)

## AI Agent Rules

The AI agent reads `.cursor/rules/atlas-working-memory.mdc` at the start of every session.
It contains a HARD STOP rule: **no writes, no API calls, no file changes without explicit user approval**.
