# Master Plan

> Last reviewed: 2026-04-24
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

## Phase 0: Art Classification Quality (CURRENT — gate for Phase 2)

Must reach and sustain >=95% overall adjusted accuracy.

- [ ] **A1** Fix `.jpeg` extension bug — 134 screenshots invisible to 4 functions in `classify_art_v2.py`
- [ ] **A2** Classify 59 remaining games (Batch 7, ~$0.59)
- [ ] **A3** Reclassify 528 batch 1-2 games with improved prompt (~$5.28)
- [ ] **A4** Fix sub-themes — too few per parent theme (e.g., Animals has only 4). `art_theme_secondary` exists in pipeline output but Art Insights page doesn't use it
- [ ] **A5** Element semantic dedup — same element has multiple names, must unify so designers aren't misled
- [ ] **A6** Enrich with online data — name-only art extraction is unreliable, Claude can't guess visual details from names alone
- [ ] **A7** Expand ground truth — currently only 20 games in `ground_truth.json`. Create GT for more games (especially problematic ones)
- [ ] **A8** Standing aspiration: overall >=95% adjusted, no shortcuts. Code-enforced in batch gate

## Phase 1: Dashboard Data Quality + UX Fixes (parallel with Phase 0)

Dev agent work, independent of Art pipeline.

- [ ] **D1** Release dates consistency — verify OGPD is shown consistently across Trends, Games page, all features
- [ ] **D2** Top Mechanics chart not sorted by bar length (Overview page)
- [ ] **D3** Dark mode toggle button — pixel-perfect fix, circle too far right
- [ ] **D4** X-ray mode: off by default after reload, panel closes on outside click
- [ ] **D5** Overview chart headers ("Top Themes", "Top Mechanics", "Top Games") should link to their respective pages
- [ ] **D6** Brand Landscape — hovering text label should highlight the bubble (Market Insights)
- [ ] **D7** Brand validation — "BOOK"/"KING"/"SECRETS" aren't real brands. Define what a brand IS, verify each
- [ ] **D8** Show cluster bubbles in Overview bubble charts (like Market Insights)
- [ ] **D9** DuckDB correctness tests — enable excluded `validate-duckdb-aggregations.test.js` and `duckdb-enforcement.test.js`

## Phase 2: Art Insights Overhaul (AFTER art >=95%)

Big rethink for game designers.

- [ ] **I1** Expand themes page to show sub-themes properly
- [ ] **I2** Rethink entire Art Insights page — what's useful for a game designer?
- [ ] **I3** Replace/improve Art Recipes — must be 100% data-driven, not speculative
- [ ] **I4** Interactive art selection in Game Lab Blueprint — select characters/environment/mood like features
- [ ] **I5** Certainty/confidence levels for each chart, table, trend on Art Insights
- [ ] **I6** Research: what do game designers actually need from art analytics?

## Phase 3: Knowledge + Documentation

- [ ] **K1** Document classification methodology — trial/error, GT calibration, prompts, what worked/didn't. MD file referenced from `ART_PIPELINE_HANDOFF.md`
- [ ] **K2** Update `ART_PIPELINE_HANDOFF.md` with test-writing guidance

## Phase 4: Advanced Features (future)

- [ ] **F1** Comprehensive data QA system — automated spot-checking across entire dashboard. Maybe integrate with x-ray mode. Never change data without user approval
- [ ] **F2** Game design document generator — Word doc from Game Lab Blueprint. Needs real-life examples from user
