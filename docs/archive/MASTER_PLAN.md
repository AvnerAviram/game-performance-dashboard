# Games Analytics Tool — Master Plan

> Last reviewed: 2026-04-29
>
> This file is the single source of truth for what to work on next.
> Updated by Atlas after each session. Parsed by the sessionStart hook
> so every agent sees a status summary automatically.

## Status Key

- `[ ]` backlog — not started
- `[~]` in-progress — actively being worked on
- `[x]` done — completed and verified
- `[!]` blocked — waiting on dependency or user input

---

## Phase 0: Art Classification Quality

- [x] **A1** Fix `.jpeg` extension bug
- [x] **A2** Per-dimension gates (OK%-based: theme ≥87%, chars ≥85%, elements ≥60%, colors ≥88%)
- [x] **A3** Reclassify legacy batch 1-2 games with improved prompt
- [x] **A4** Classify all games — 2,726 total classified
- [x] **A5** Fix misleading adj% → replaced with OK%, Res%, Wtd%
- [x] **A6** Screenshot pre-screening — implemented, determined unreliable, stopped
- [x] **A7** Remove post-processing hallucination source (THEME_ELEMENT_HINTS, DESC_ELEMENT_KEYWORDS)
- [x] **A8** Fix duplicate element removal bug
- [x] **A9** Add Resolved% metric to regression
- [x] **A10** FINAL PASS — reclassify all 2,726 games with clean pipeline (~$27) — DONE. Res%: theme 98.1%, chars 97.9%, elements 96.3%, colors 98.1%
- [ ] **A11** Investigate alternative screenshot sources for ~130 unfixable bad-quality games
- [x] **A12** Dashboard integration — merge art results into game_data_master.json — DONE. 2,726 games merged, stale fields removed, tests pass
- [ ] **A13** Source screenshots for ~1,554 slots with no screenshot (only 2,726/4,201 slots classified)

## Phase 1: Dashboard Data Quality + UX Fixes (parallel — ready NOW)

Dev agent work, independent of Art pipeline.

- [x] **D1** Fix AI code error handling — ApiError catch, isAuthError check, 5 tests
- [ ] **D2** Release dates consistency — verify OGPD shown consistently across all pages
- [x] **D3** Top Mechanics chart — verified correct (Smart Index desc, indexAxis y)
- [x] **D4** Dark mode toggle — verified correct (18px = symmetric 4px gap)
- [x] **D5** X-ray mode — already works correctly (starts off, closes on outside click)
- [x] **D6** Overview chart headers — all 6 bubble sections linked with onclick + hover
- [x] **D7** Brand Landscape hover — coordinates unified to clientX - rect.left
- [x] **D8** Brand validation — FRANCHISE_BLOCKLIST (19 words), minGames ≥ 2
- [x] **D9** Cluster bubbles — alpha increased (bg 0.3, border 0.6)
- [x] **D10** DuckDB tests — kept excluded (need WASM runtime), comment added
- [x] **D11** Themes pie chart — DoughnutController + ArcElement registered, doughnut on overview
- [x] **D12** Game screenshot in panel — /api/screenshot/:slug route, onerror fallback

## Phase 2: Art Insights Overhaul (A10 + A12 DONE — READY)

- [x] **P2A** Data Foundation — art data merged into master, stale fields dropped, accessors updated
- [~] **P2B** Fix metrics layer — update getArtColorToneMetrics (array), getArtComboMetrics (theme x elements), drop art_mood/art_style from metrics + renderer
- [ ] **P2C** Bubble Charts — generic factory + character/element/color/narrative landscapes
- [ ] **P2D** Combo Visualization — heatmap (Theme x Elements default + dropdown), recipe explorer, top combos table
- [ ] **P2E** Smart Analytics — opportunity gaps, character impact, color psychology, provider strategies

## Phase 3: Knowledge + Documentation

- [x] **K1** Knowledge hub — AGENTS.md, agent roles, prompt files
- [x] **K2** Agent-to-agent handoff system — living prompt files
- [x] **K3** Compliance hooks — 5 hooks active
- [ ] **K4** Atlas self-improvement — proactive metric/BS detection
- [ ] **K5** Document classification methodology
- [ ] **K6** Update pipeline handoff docs

## Phase 3.5: Production-Grade Cleanup (NEXT — plan ready)

Full plan: `/Users/avner/.cursor/plans/production_grade_cleanup_0d5606f8.plan.md`

- [ ] **C1** Security fixes — XSS in prediction/ai-assistant, screenshot API auth, volData crash, xray tally bug
- [ ] **C2** Raw field access elimination — ~25 UI files switch to F.* accessors
- [ ] **C3** DuckDB consistency — fix INSERT chain, add art_theme_secondary, align parquet/JSON schemas, escape ILIKE
- [ ] **C4** Server/client alignment — dimension-filter, provider normalization, volatility normalization
- [ ] **C5** Dead code removal — mood/style, stale aliases, misleading copy, duplicate panel close
- [ ] **C6** Enforcement tests — shrink whitelist, ban raw art fields, ban old theme names, E2E
- [ ] **C7** Test utility alignment + minor hygiene

## Phase 4: Theme Ranking Overhaul (after cleanup)

Current Smart Index formula `(avgTheo * sqrt(gameCount)) / globalAvgTheo` is sensitive to outliers and small sample sizes (e.g. Mountain/Volcano ranked #2 with only 10 games due to one outlier game "Cash Eruption").

**Proposed solution** (researched — Eilers & Krejcik, IMDB, SlotsRank):

- [ ] **R1** Replace Smart Index with **Bayesian Weighted Rating** (IMDB formula): `WR = (v/(v+m)) * R + (m/(v+m)) * C` where `v` = game count, `m` = confidence threshold (median category count), `R` = theme avg theo (Winsorized), `C` = global avg theo
- [ ] **R2** Apply **Winsorized Mean** (cap outliers at P95) before computing `R` — prevents single high-performer from inflating small theme averages
- [ ] **R3** Add **Confidence Indicator** (1-4 signal bars) based on 95% CI width: 4 bars = tight CI (large sample), 1 bar = wide CI (small sample)
- [ ] **R4** Default all dashboard pages to **Slots only** with a game type dropdown selector
- [ ] **R5** Add category filter `<select>` to Themes, Mechanics, Providers HTML pages (Overview already has it)
- [ ] **R6** Update `themeAliases` in prediction.js to use art_theme vocabulary

## Phase 5: Advanced Features (future)

- [ ] **F1** Comprehensive QA system — automated spot-checking
- [ ] **F2** Game design document generator
- [ ] **F3** Source screenshots for ~1,554 slots with no screenshot (extends A13)
