# Agent System — How It Works

> For humans. Complete overview of the project, agent system, and where everything lives.

---

## Agents

| Agent | What it does | Role file |
|-------|-------------|-----------|
| **Atlas** | Orchestrator. Validates work, writes prompts, enforces gates. Never codes. | `agents/atlas.md` |
| **Art** | Art classification via Claude Vision. Classifies game visuals (7 dimensions). | `agents/art.md` |
| **Features** | Feature/theme extraction from HTML rules pages via Claude. | `agents/features.md` |
| **Dev** | Dashboard features, UX fixes, tests. Frontend + server. | `agents/dev.md` |
| **Security** | Security audit, hardening. Auth, CSP, rate limiting, sanitization. | `agents/security.md` |
| **QA** | Data verification, spot-checks, drift detection, claim validation. | `agents/qa.md` |

---

## Complete File Structure

```
.
├── AGENTS.md                              # Agent entry point (pointer map, ~40 lines)
├── MASTER_PLAN.md                         # Living backlog — what to work on next
├── HANDOFF.md                             # Full data schema (3 layers), protected files
├── README.md                              # Project readme
├── .gitignore
│
├── agents/                                # Agent role definitions
│   ├── README.md                          #   This file
│   ├── atlas.md                           #   Orchestrator role + anti-patterns
│   ├── art.md                             #   Art classification pipeline role
│   ├── features.md                        #   Features extraction pipeline role
│   ├── dev.md                             #   Dashboard development role
│   ├── security.md                        #   Security audit & hardening role
│   ├── qa.md                              #   Data QA & verification role
│   └── prompts/                           #   Living task files (Atlas updates, user @-references)
│       ├── art.md                         #     Current art agent task
│       ├── dev.md                         #     Current dev agent task
│       ├── security.md                    #     Current security agent task
│       └── qa.md                          #     Current QA agent task
│
├── scripts/                               # Standalone validation scripts
│   ├── backup_games_master.sh             #   Back up game_data_master.json
│   ├── run_validation_suite.sh            #   Run all validation phases
│   └── validate_*.py                      #   Phase 0–5 validation (CSV, features, web, etc.)
│
├── docs/
│   ├── COMPONENTS.md                      #   UI component reference
│   ├── DESIGN_TOKENS.md                   #   Design system tokens
│   └── archive/                           #   Historical docs (22 files — old prompts, reports)
│
├── .cursor/
│   ├── rules/                             # Always-loaded enforcement rules
│   │   ├── atlas-working-memory.mdc       #   Atlas persistent state (live counts, decisions)
│   │   ├── atlas-orchestration.mdc        #   Orchestration protocols, prompt templates
│   │   ├── coding-standards.mdc           #   Formatting, field access, imports
│   │   ├── data-schema-contract.mdc       #   JSON → DuckDB → F.xxx() contract
│   │   ├── metrics-layer.mdc              #   Aggregation rules
│   │   ├── art-pipeline-gates.mdc         #   Batch gate protocol (no bypass)
│   │   └── api-cost-control.mdc           #   API cost guardrails
│   │
│   ├── agents/                            # Cursor subagent definitions
│   │   └── verifier.md                    #   Auto-verification (readonly, model: fast)
│   ├── hooks.json                         # Hook config
│   └── hooks/                             # Automated guardrails
│       ├── validate-atlas-memory.sh       #   sessionStart — injects live state
│       ├── protect-data-files.sh          #   preToolUse — blocks writes to critical data
│       ├── block-dangerous-commands.sh    #   beforeShellExecution — blocks destructive cmds
│       ├── track-edits.sh                 #   afterFileEdit — categorizes edits
│       └── verify-on-stop.sh             #   stop — forces verification loop
│
└── game_analytics_export/                 # Main application
    │
    ├── index.html                         # App entry point
    ├── sw.js                              # Service worker (cache versioning)
    ├── package.json                       # Dependencies + build/test/format scripts
    ├── vite.config.js                     # Vite bundler config
    ├── vitest.config.js                   # Test runner config
    ├── tailwind.config.js                 # Tailwind CSS config
    ├── postcss.config.js                  # PostCSS config
    ├── .prettierrc                        # Prettier formatting config
    │
    ├── server/
    │   └── server.cjs                     # Express server (static files, auth, API proxy)
    │
    ├── public/
    │   ├── duckdb/                        #   Self-hosted DuckDB WASM (no CDN)
    │   └── robots.txt
    │
    ├── deploy/                            # Production deployment (Windows IIS)
    │   ├── deploy.ps1                     #   PowerShell deploy script
    │   ├── deploy.sh                      #   Bash deploy script
    │   ├── install.ps1                    #   First-time IIS setup
    │   ├── nginx.conf                     #   Nginx config (alternative)
    │   └── DEPLOY_CHECKLIST.md
    │
    ├── src/                               # Frontend source
    │   ├── pages/                         #   HTML pages (14 pages)
    │   │   ├── overview.html              #     Dashboard overview
    │   │   ├── games.html                 #     Game browser
    │   │   ├── providers.html             #     Provider analytics
    │   │   ├── themes.html                #     Theme analytics
    │   │   ├── mechanics.html             #     Mechanics analytics
    │   │   ├── art.html                   #     Art insights
    │   │   ├── trends.html                #     Trend analysis
    │   │   ├── insights.html              #     Market insights
    │   │   ├── game-lab.html              #     Game Lab Blueprint
    │   │   ├── name-generator.html        #     Name generator
    │   │   ├── prediction.html            #     Performance prediction
    │   │   ├── ai-assistant.html          #     AI assistant
    │   │   ├── tickets.html               #     QA tickets
    │   │   └── anomalies.html             #     Anomaly detection
    │   │
    │   ├── lib/                           #   Core libraries
    │   │   ├── game-fields.js             #     F.xxx() field accessors (PROTECTED)
    │   │   ├── metrics.js                 #     Aggregation functions (PROTECTED)
    │   │   ├── features.js                #     Feature definitions + CANONICAL_FEATURES
    │   │   ├── shared-config.js           #     PROVIDER_NORMALIZATION_MAP, HIDDEN_FEATURES
    │   │   ├── data.js                    #     Data loading + DuckDB init
    │   │   ├── db/                        #     DuckDB client (PROTECTED column names)
    │   │   ├── filters.js                 #     Global filter system
    │   │   ├── auth.js                    #     Authentication
    │   │   ├── api-client.js              #     API client
    │   │   ├── sanitize.js                #     HTML sanitization (escapeHtml, escapeAttr)
    │   │   ├── parse-features.js          #     Feature string parsing
    │   │   ├── symbol-utils.js            #     Symbol/element utilities
    │   │   ├── env.js                     #     Environment detection
    │   │   └── debounce.js, sa-label-solver.js, game-analytics-engine.js
    │   │
    │   ├── features/                      #   Feature modules (JS per page)
    │   │   ├── name-generator.js          #     Name generator logic + image upload
    │   │   ├── idea-generator.js          #     Game Lab Blueprint
    │   │   ├── trends.js                  #     Trends page logic
    │   │   ├── overview-insights.js       #     Overview page insights
    │   │   ├── data-xray.js               #     X-ray mode
    │   │   ├── ai-assistant.js            #     AI assistant
    │   │   ├── prediction.js              #     Performance prediction
    │   │   ├── tickets.js                 #     QA tickets
    │   │   └── auth-ui.js, compat.js
    │   │
    │   ├── ui/                            #   UI components
    │   │   ├── chart-setup.js             #     Chart.js registration (import from HERE)
    │   │   ├── chart-*.js                 #     Chart modules (art, brands, themes, etc.)
    │   │   ├── router.js                  #     Client-side routing
    │   │   ├── dark-mode.js               #     Dark mode toggle
    │   │   ├── filter-dropdowns.js        #     Filter UI
    │   │   ├── pagination.js              #     Table pagination
    │   │   ├── panel-details.js           #     Side panel system
    │   │   ├── search.js                  #     Search
    │   │   ├── tooltip-manager.js         #     Tooltip system
    │   │   ├── ui-export.js               #     Export functionality
    │   │   └── renderers/                 #     Render helpers
    │   │
    │   └── config/                        #   Static config
    │       ├── theme-breakdowns.json      #     Theme → sub-theme mapping
    │       ├── mechanics.js               #     Mechanics definitions
    │       └── provider-urls.js           #     Provider logo/URL mapping
    │
    ├── tests/                             # Test suite (105 files, 1,607 tests)
    │   ├── setup.js                       #     Test environment setup
    │   ├── unit/                          #     52 test files — core logic tests
    │   ├── data-validation/               #     35 test files — data integrity checks
    │   ├── enforcement/                   #     16 test files — rule enforcement
    │   ├── integration/                   #     17 test files — cross-module tests
    │   ├── components/                    #     1 test file — UI component tests
    │   ├── alignment/                     #     1 test file — cross-file alignment
    │   ├── monitoring/                    #     1 test file — health monitoring
    │   ├── visual-regression/             #     2 test files — visual diff tests
    │   ├── e2e/                           #     Playwright end-to-end (spec file)
    │   └── utils/                         #     Test utilities
    │
    ├── data/                              # Data + pipelines + pipeline docs
    │   │
    │   │── [SOURCE DATA]
    │   ├── game_data_master.json          #   THE source of truth (4,550 games) — PROTECTED
    │   ├── eilers_source.csv              #   Original Eilers performance CSV data
    │   ├── Data Download Theme (4).xlsx   #   Original Eilers theme XLSX export
    │   ├── games.parquet                  #   DuckDB-ready parquet (built from master)
    │   ├── games_processed.json           #   Processed game data (built from master)
    │   │
    │   │── [PIPELINE CONFIG / MAPS]
    │   ├── confidence_map.json            #   Confidence scores per game
    │   ├── theme_consolidation_map.json   #   Theme normalization mapping
    │   ├── franchise_mapping.json         #   Franchise/brand grouping
    │   ├── staged_art_characterization.json #  Staged art data (pre-merge to master)
    │   ├── help_page_index.json           #   Provider help page URLs
    │   ├── rules_index.json               #   Rules HTML page index
    │   ├── rules_game_matches.json        #   Game ↔ rules page matching
    │   │
    │   │── [GROUND TRUTH]
    │   ├── ground_truth_ags.json          #   GT: 228 games, 207 with features (97% F1)
    │   ├── ground_truth_art_v2.json       #   Art GT (20 games)
    │   ├── ground_truth_themes.json       #   Theme GT
    │   │
    │   │── [ART PIPELINE]
    │   ├── classify_art_v2.py             #   Art classification (2,979 lines) — main
    │   ├── classify_art.py                #   Art classification v1 (legacy)
    │   ├── redownload_screenshots_v2.py   #   Screenshot repair/download
    │   ├── spot_check.py                  #   Art spot-check tool
    │   ├── run_input_experiment.py        #   Input combination experiments
    │   ├── test_vision_approaches.py      #   Vision approach testing
    │   ├── art_pipeline/                  #   Art results, reviews, corrections, gate
    │   │   ├── results.json               #     2,701 classified games
    │   │   ├── user_reviews.json          #     335 reviewed games (262 human)
    │   │   ├── corrections.json           #     178 corrections
    │   │   ├── batch_gate.json            #     Gate state (OPEN/CLOSED)
    │   │   ├── config.json                #     Model config, targets
    │   │   ├── ground_truth.json          #     Art-specific GT (20 games)
    │   │   ├── cost_experiment_results.json
    │   │   ├── input_experiment_results.json
    │   │   └── run_log.json               #     Batch run history
    │   ├── screenshots/                   #   2,760 game screenshots
    │   ├── ART_PIPELINE_HANDOFF.md        #   Art pipeline docs
    │   │
    │   │── [FEATURES PIPELINE]
    │   ├── extract_game_profile.py        #   Features/themes extraction (4,310 lines)
    │   ├── sc_extract.py                  #   SlotCatalog extraction + 95% F1 gate
    │   ├── download_all_rules.py          #   Download HTML rules pages
    │   ├── smart_match.py                 #   Fuzzy game-to-rules matching
    │   ├── test_extract_game_profile.py   #   Pytest for extraction pipeline
    │   ├── rules_html/                    #   8,860 HTML rules pages (input)
    │   ├── rules_text/                    #   Extracted text from rules pages
    │   ├── PHASE1_TRUTH_MASTER.md         #   Features pipeline docs / trusted sources
    │   │
    │   │── [PROVIDER / SCRAPING]
    │   ├── _provider_scrape.py            #   Provider data scraper
    │   ├── _lnw_scrape.py                 #   LNW-specific scraper
    │   ├── _sc_expand_batch.py            #   SlotCatalog batch expansion
    │   ├── scrape_game_descriptions.py    #   Game description scraper
    │   ├── scrape_provider_descriptions.py
    │   ├── clean_import_xlsx.py           #   XLSX import/cleaning
    │   │
    │   │── [STAGING / INTERMEDIATE]
    │   ├── _provider_specs.json           #   Scraped provider specs
    │   ├── _sc_*.json                     #   SlotCatalog intermediate data
    │   ├── _bragg_specs.json, _evo_scrape_list.json, etc.  # Provider-specific
    │   ├── staged_specs_external.json     #   Staged external specs
    │   ├── staged_best_of_sources.json    #   Best-of source selections
    │   ├── extraction_checkpoint.json     #   Extraction resume checkpoint
    │   │
    │   │── [LEGACY + BACKUPS]
    │   ├── _legacy/                       #   Legacy files
    │   │   ├── classification_validation.json  # Historical 30-game F1 benchmark
    │   │   ├── ground_truth_ags_backup_pre95.json  # Pre-95% GT snapshot
    │   │   ├── ags_vocabulary.json        #     Legacy feature/theme vocabulary
    │   │   ├── feature_vocabulary.json    #     Legacy feature names
    │   │   ├── games_master.json          #     Old master format
    │   │   ├── calibration_*.json         #     Calibration history
    │   │   ├── rules_classification_*.json #    Per-provider classification results
    │   │   └── sc_*.json, match_*.py, etc.
    │   ├── _backup_20260319/              #   Validated GT source (features restored from here)
    │   ├── _backup_2026-03-26T14-15-04/   #   Another backup (identical to 0319)
    │   ├── _backup_20260406_pre_year_strip/ # Pre-year-strip backup
    │   ├── _backup_pre_year_reset/        #   Pre-year-reset backup
    │   └── _qa_tickets/                   #   QA ticket reports (13 tickets)
    │
    └── docs/                              # Active reference docs
        ├── ARCHITECTURE.md
        ├── EILERS_METHODOLOGY.md
        ├── PROJECT_STRUCTURE.md
        ├── VERIFICATION_SOURCES.md
        ├── README.md
        ├── README-TESTING.md
        ├── STYLE_SYSTEM_README.md
        └── Z-INDEX-SCALE.md
```

---

## Where New Files Go

| File type | Location | Why |
|-----------|----------|-----|
| **Agent role definition** | `agents/` | One file per agent. Agents read their own role file. |
| **Pipeline code + docs** | `game_analytics_export/data/` | Co-located with code. Never separated. |
| **Enforcement rules** | `.cursor/rules/` | Always-loaded by Cursor. Keep each under 500 lines. |
| **Live state / memory** | `.cursor/rules/atlas-working-memory.mdc` | Single file. Updated by Atlas each session. |
| **Master plan / backlog** | `MASTER_PLAN.md` (root) | Parsed by sessionStart hook. Updated after each session. |
| **Active reference docs** | `docs/` or `game_analytics_export/docs/` | Living docs that agents reference regularly. |
| **Agent task prompts** | `agents/prompts/<agent>.md` | Atlas updates, user `@`-references. One file per agent, overwritten each task. |
| **Old one-shot prompts** | `docs/archive/` | Historical prompts no longer active. |
| **Historical docs** | `docs/archive/` | Old prompts, postmortems, reports. Out of active context. |
| **Test files** | `game_analytics_export/tests/<type>/` | unit, data-validation, enforcement, integration, e2e |
| **Hooks** | `.cursor/hooks/` | Registered in `.cursor/hooks.json`. Bash scripts. |
| **Data files** | `game_analytics_export/data/` | JSON, CSV, parquet. Protected by hook. |
| **Staging / intermediate** | `game_analytics_export/data/_*.json` | Prefixed with `_`. Working data, not production. |
| **Backups** | `game_analytics_export/data/_backup_*/` | Dated backup dirs. Don't delete — forensic value. |
| **Legacy files** | `game_analytics_export/data/_legacy/` | Historical snapshots. Reference only. |
| **Validation scripts** | `scripts/` | Standalone validation (phase 0–5). |
| **Deploy scripts** | `game_analytics_export/deploy/` | Windows IIS deployment. |
| **Config (build/lint)** | `game_analytics_export/` root | vite, vitest, tailwind, postcss, prettier configs. |
| **Static config (runtime)** | `game_analytics_export/src/config/` | Theme breakdowns, mechanics defs, provider URLs. |

**Rules for keeping it clean:**
1. No orphan docs at root — everything has a home in the table above
2. Pipeline docs stay next to their code — never move to a separate `docs/` folder
3. One-shot artifacts get archived after use — don't let old prompts pile up at root
4. Every new doc referenced from `AGENTS.md` or an agent role file — no dead-end files
5. `AGENTS.md` stays under 100 lines — pointer map, not encyclopedia
6. Staging/intermediate files prefixed with `_` — easy to distinguish from production data
7. Backups are dated dirs under `data/_backup_*/` — never delete, they have forensic value

---

## Hooks (Automated Guardrails)

Hooks fire automatically in Cursor. No agent can bypass them.

| Hook | Trigger | What it does |
|------|---------|-------------|
| `validate-atlas-memory.sh` | Session start | Injects live data counts, gate status, drift detection, master plan summary |
| `protect-data-files.sh` | Before file write | Blocks direct writes to `game_data_master.json`, GT, parquet |
| `block-dangerous-commands.sh` | Before shell cmd | Blocks `rm -rf` on data dirs, `--force-gate`, `git push --force` to main |
| `track-edits.sh` | After file edit | Tracks edited files, categorizes as pipeline/rules/dev code |
| `verify-on-stop.sh` | Agent finishes | If pipeline code was edited → forces verification (regression, gate) |

---

## Quality Gates

| Gate | Threshold | Enforced by |
|------|-----------|-------------|
| Art theme accuracy | ≥97% adjusted | `classify_art_v2.py` batch gate |
| Art overall accuracy | ≥95% adjusted | Same batch gate |
| Features F1 | ≥95% micro F1 | `sc_extract.py --validate-features` |
| Tests | 1,607 tests, 0 failures | Pre-commit hook (vitest) |
| Formatting | Prettier | Pre-commit hook |

---

## How to Give an Agent a Task

1. Atlas writes the task to `agents/prompts/<agent>.md` (living prompt file)
2. User opens a new chat and types: `@agents/prompts/art.md go` (or dev, qa, etc.)
3. The agent reads `AGENTS.md` (via sessionStart hook), its role file, and the prompt
4. After the agent finishes, `verify-on-stop` hook enforces verification
5. User returns to Atlas. Atlas launches `/verifier` subagent to confirm results.
6. Atlas updates the prompt file with the next task.

**No copy-pasting needed.** Atlas keeps the prompt files current. User just `@` references them.

### Prompt Files

| File | Agent | Current task |
|------|-------|-------------|
| `agents/prompts/art.md` | Art | Batch 7 + reclassify batch 1-2 |
| `agents/prompts/dev.md` | Dev | Fix AI code error handling |
| `agents/prompts/security.md` | Security | CSP tightening (backlog) |
| `agents/prompts/qa.md` | QA | Full QA pass (after art integration) |

### Verifier Subagent

`.cursor/agents/verifier.md` — a lightweight readonly subagent that Atlas auto-launches to verify work. Runs tests, checks regression, validates data integrity. Uses `model: fast` for cost efficiency.
