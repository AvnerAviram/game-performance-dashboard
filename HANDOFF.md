# Handoff Document — Game Performance Dashboard

**Created**: Feb 25, 2026  
**Purpose**: Continue work in a fresh chat. IDE crashes due to large context.  
**Prior chats**: [Dashboard Enrichment & Hardening](8315d070-0260-4f58-9064-30ea46f33ee4)

---

## PROJECT OVERVIEW

A game analytics dashboard (Vanilla JS + Vite + Tailwind + DuckDB WASM) displaying 642 slot games with AI-enriched features, themes, and performance metrics. Data lives in `game_analytics_export/data/games_dashboard.json`.

**Key rule**: Follow `game_analytics_export/data/PHASE1_TRUTH_MASTER.md` as the single runbook.

---

## WHAT'S BEEN DONE (all sessions combined)

### Pipeline & Data
- Two-stage LLM pipeline (Claude Sonnet extract → Claude Haiku normalize) in `enrich_websearch.py`
- 11 canonical features: Free Spins, Static Jackpot, Hold and Spin, Cash On Reels, Expanding Reels, Wheel, Pick Bonus, Respin, Nudges, Wild Reels, Persistence
- "Sidebets" removed from vocabulary and data (was wrong — table game, not slot)
- "Hold & Win" normalized to "Hold and Win" in data
- Code gates: vocabulary-lock, unknown-feature-rejection, slotcatalog-map-validation, final-output-validation (both sync + batch paths), strict-adapters abort on config issues
- `--skip-enriched` flag for cost-saving re-runs
- Theme consolidation: 375 raw themes → 24 categories via `data/theme_consolidation_map.json`
- "Classic" category was split — colors moved out, "Fruit" category created

### Dashboard Rewiring
- DuckDB loads `games_dashboard.json` (not `games_master.json`)
- Schema includes: features, themes_all, symbols, description, demo_url, data_quality
- Theme consolidation map applied at DuckDB load time
- Mechanic normalization map at DuckDB load time

### Mechanics Page — REWIRED to use features
- `getMechanicDistribution()` now parses features JSON in JS (DuckDB WASM v1.28.0 lacks `from_json`)
- `getGamesByMechanic()` uses `features LIKE '%..%'`
- `getUniqueMechanics()` extracts from features JSON in JS
- Games table shows features (up to 2 + overflow count) instead of `mechanic_primary`
- Games filter dropdown populated from features
- Provider detail panel aggregates by features

### UI Features Added
- Play Demo button (green gradient via inline styles — Tailwind classes not in output.css)
- Symbols section (collapsible)
- Feedback form + serverless API (`api/feedback.js`)
- Performance Index tooltips improved (concise bullet format with emojis)

### Sorting Fix
- `filters.js` was sorting by `Avg Theo Win Index` instead of `Smart Index` — fixed all filter branches
- Tests updated to match

### Tests
- 183 tests across 13 files — ALL PASSING
- `validate-dashboard-schema.test.js` — 11 tests for schema, canonical features, theme map coverage
- Filter tests updated for Smart Index

---

## RECENTLY COMPLETED (latest session — Feb 25 2026)

1. **Mechanics click panel** — FIXED. Added `Static Jackpot`, `Wild Reels`, `Persistence` to `VALID_MECHANICS` in `src/config/mechanics.js`. Pipeline aliases already existed for others. `showMechanicDetails()` now works without a config definition (optional chaining).

2. **Pagination** — FIXED. Removed competing `pagination.js` (was overwriting `changeGamesPerPage`). `ui-providers-games.js` now has `GAMES_PER_PAGE = 100`. Per-page selector delegates correctly via `_setGamesPerPage`.

3. **"Unknown" in features** — FIXED. Games table shows "—" when no features. Game detail panel label changed from "Primary Mechanic" to "Game Type".

4. **Best Provider threshold** — Already had `MIN_GAMES_FOR_BEST = 5` in `overview-insights.js` line 68. No change needed.

5. **PHASE1_TRUTH_MASTER.md audit** — Fixed 7 doc issues + 2 code bugs:
   - 12→11 canonical features (Sidebets was removed but doc still listed it)
   - 23→24 theme categories (Fruit was added but doc still said 23)
   - Added missing code gates: final-output-validation (#12), strict-adapters abort (#13)
   - Added "Proof & Audit Runs" section with `--strict-adapters` + `--no-ddg` requirements
   - Added Sidebets removal to taxonomy changes section
   - Fixed vocabulary count in Key Files table (12→11)
   - **CODE FIX**: `--strict-adapters` was used in code but never registered as argparse argument (would crash at runtime). Added.
   - **CODE FIX**: `--no-ddg` was referenced in workspace rules but flag didn't exist in pipeline. Added (no-op today since pipeline uses Claude web_search, not DDG — flag exists so the workspace rule can be satisfied).

6. **GT comparison null-safety bug** — `compare_with_ground_truth()` crashed when features was `None`. Fixed.

7. **Pipeline validated end-to-end** — Ran 3 games total with `--strict-adapters --no-ddg`. All stages fired, F1 stable at 95.4%.

8. **New code gates added** (3):
   - **Definition card validation** (#13): `--validate` now checks every vocab feature has a definition card in the normalize prompt. Also catches stale cards for removed features. Found and removed leftover Sidebets card.
   - **Config-block by default** (#14): Pipeline hard-exits on any config issue — no need for `--strict-adapters`. Use `--force` to bypass (not recommended).
   - **Preserve-on-failure** (#15): Sync path now keeps existing dashboard record when enrichment fails (previously dropped it — found a live data loss bug during testing).

9. **Normalize prompt fixes** (3):
   - Removed stale Sidebets definition card (was still teaching LLM about a removed feature)
   - Fixed PowerXStream in cross-provider terminology (said "= Expanding Reels", now "= NOT Expanding Reels")
   - Fixed "13 features" → "11 features" reference

10. **Truth master completeness fixes** (4):
    - Added Prerequisites section (Python deps, .env setup, Node, test suite)
    - Documented `games_master.json` structure (`{"metadata":{}, "games":[...]}` not flat array)
    - Added test suite step (#5) to mandatory pre-flight checklist
    - All example commands now include `--strict-adapters --no-ddg`

## POTENTIAL REMAINING ISSUES

- 48 games still have no features (not enriched). Could run `--skip-enriched` to fill gaps.
- Some Tailwind gradient classes may not render (check `output.css` before using new utility classes — use inline styles as fallback)

---

## KEY FILES

| File | Purpose |
|---|---|
| `data/PHASE1_TRUTH_MASTER.md` | Single source of truth / runbook |
| `data/games_dashboard.json` | Main data file (642 games, flat JSON array) |
| `data/ags_vocabulary.json` | Canonical features/themes lists |
| `data/theme_consolidation_map.json` | 375 themes → 24 categories |
| `data/enrich_websearch.py` | AI enrichment pipeline |
| `src/lib/db/duckdb-client.js` | DuckDB WASM client (data loading, queries) |
| `src/lib/data.js` | Data layer (loads via DuckDB, calculates Smart Index) |
| `src/lib/filters.js` | Smart filters for themes/mechanics/games/providers |
| `src/ui/ui.js` | Main UI rendering (themes, mechanics, overview, anomalies) |
| `src/ui/ui-panels.js` | Game/provider/mechanic detail panels |
| `src/ui/ui-providers-games.js` | Games table + providers table rendering |
| `src/config/mechanics.js` | Mechanic definitions, aliases, tooltips (23 mechanics) |
| `src/pages/*.html` | Page templates |
| `tests/` | 13 test files, 183 tests |

## ENVIRONMENT

- Node v20 required (`fnm use 20`)
- Vite dev server: `cd game_analytics_export && npx vite`
- Tests: `cd game_analytics_export && npx vitest run`
- DuckDB WASM v1.28.0 (CDN) — does NOT support `from_json()`, use JS-side JSON parsing

## IMPORTANT CONSTRAINTS

- Always run tests after changes
- Follow PHASE1_TRUTH_MASTER.md rules (the ONLY runbook)
- Enrichment runs: always use `--strict-adapters --no-ddg` for proof/audit
- DDG web search is remediation-only (discover sources, pin them, then rerun without DDG)
- Tailwind classes in `output.css` are pre-built — many utility classes missing. Use inline styles for colors not available.
- The `mechanic_primary` field is legacy (Slot/Megaways/Slingo/Hold and Win). Real mechanics = `features` array.

---

## NEW CHAT PROMPT

Copy-paste this to start a fresh chat:

---

Read `HANDOFF.md` and `game_analytics_export/data/PHASE1_TRUTH_MASTER.md`. These are your only two reference docs.

**Project**: Game analytics dashboard (Vanilla JS + Vite + Tailwind + DuckDB WASM) with an AI enrichment pipeline for 642 slot games. The pipeline uses a 2-stage Claude API flow (Sonnet for web search extraction → Haiku for normalization to 11 canonical features). F1 accuracy is 95.4%. 183 tests all passing.

**What's done**: All enrichment, dashboard rewiring, UI fixes, sorting, filtering, pagination, mechanics page, theme consolidation (24 categories), 15 code gates (pipeline blocks on config issues by default, preserves data on failure, validates definition cards), and tests. Full details in `HANDOFF.md`.

**Critical rules**: Follow `PHASE1_TRUTH_MASTER.md` as the single runbook. The pipeline now blocks by default on config issues (no `--strict-adapters` needed — it's the default). Never add features without definition cards + synonym mapping + SlotCatalog entries. Both sync and batch code paths have duplicated post-processing — change both or neither. Always run `npx vitest run` after changes.

**Environment**: Node v20 (`fnm use 20`), working dir `game_analytics_export/`, tests via `npx vitest run`, dev server via `npx vite`, pipeline from `game_analytics_export/data/`. DuckDB WASM v1.28.0 does NOT support `from_json()` — use JS-side parsing. Python 3.10+ with `anthropic requests beautifulsoup4 lxml`. API key in `data/.env`.

**Prior chats**: [Dashboard Enrichment & Hardening](8315d070-0260-4f58-9064-30ea46f33ee4)

---
