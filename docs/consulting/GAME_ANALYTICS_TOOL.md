# AI-Powered Game Intelligence Platform

> Multi-pipeline analytics system using Claude Vision to index 5,000+ slot games across performance, mechanics, and visual design DNA.

---

## At a Glance

| | |
|---|---|
| **Scale** | 5,124 games indexed across performance, mechanics, and art |
| **Accuracy** | 97% feature extraction (F1), 97.4% screenshot classification, 92% art theme (spot-check) |
| **Cost** | ~$0.008/game for full visual classification; 672 games classified for ~$4 |
| **Governance** | Code-enforced batch gates, 50+ human review rounds, 1,689 automated tests |
| **Operating model** | Human-in-the-loop calibration with measurable quality improvement per round |

---

## The Problem

The slot game industry has thousands of titles. Performance data exists (market share, player indices, revenue metrics) — but **design intelligence** is unstructured: locked in screenshots, scattered across rules PDFs, and impossible to query at scale.

No commercial database connects **how a game looks and plays** with **how it performs in market**.

We built that connection.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA SOURCES                               │
│  Eilers CSV (performance)  │  SlotCatalog  │  Provider sites │
└─────────────────┬───────────────────┬───────────────────────┘
                  │                   │
         ┌────────▼────────┐  ┌───────▼────────┐
         │ Feature Pipeline │  │ Screenshot      │
         │ (HTML → Claude)  │  │ Acquisition     │
         │ ~8,800 rules     │  │ 4,071 images    │
         └────────┬────────┘  └───────┬────────┘
                  │                   │
                  │           ┌───────▼────────┐
                  │           │ Prescreen       │
                  │           │ (Haiku: $0.0001)│
                  │           └───────┬────────┘
                  │                   │
                  │           ┌───────▼────────┐
                  │           │ Art Pipeline    │
                  │           │ (Sonnet Vision) │
                  │           │ 6 dimensions    │
                  │           └───────┬────────┘
                  │                   │
         ┌────────▼───────────────────▼────────┐
         │         game_data_master.json        │
         │    5,124 games • unified schema      │
         └────────────────────┬────────────────┘
                              │
                     ┌────────▼────────┐
                     │   Dashboard      │
                     │   (DuckDB WASM)  │
                     │   In-browser SQL │
                     └─────────────────┘
```

---

## How We Use Claude Vision

### The Hard Problem

Classify slot game art across **6 dimensions** from a single screenshot — with constrained, searchable vocabularies:

- **53 themes** (Egyptian, Norse, Wild West, Fantasy, etc.)
- **26 colors** with area-percentage estimation
- **134 character terms** mapping to 34 categories
- **125+ background elements** across effects, scene, and decor
- **Mood/tone** (e.g., Dark/Mysterious, Bright/Fun, Luxurious)
- **Narrative archetypes**

### Key Technical Decisions

**1. Dual-image strategy**

We send Claude **two versions** of each screenshot:
- Full gameplay image (for theme, colors, characters)
- Reel-grid-masked image (for background elements only)

This solves the #1 error class: confusing spinning reel symbols with background scenery. A ship on the reels is a symbol, not a scene element.

**2. Structured IS/IS NOT classification cards**

Not open-ended prompts. Each dimension has explicit decision boundaries:

> **Example: Color Classification Card (excerpt)**
>
> *IS: The actual pigment/hue visible in the game's background, frame, and overall palette.*
> *NOT: The color of individual reel symbols. The color described in the game name.*
>
> **DARK BACKGROUNDS DOMINATE — DO NOT IGNORE THEM:**
> Most slot games have large dark backgrounds. A Black/Gray/Dark Blue background covering 50-70% of screen IS the dominant color — report it FIRST.
>
> **SATURATED ACCENTS ARE SMALLER THAN THEY LOOK:**
> Purple, Neon Blue, Gold glow LOOK dominant because they're vivid — but measure their PIXEL AREA. A glowing border covers much less area than it appears. Usually 10-15%, not 25%+.
>
> *A game 85% dark blue with thin gold trim → only ["Dark Blue"]*
> *A game 50% black + 30% gold → ["Black", "Gold"]*

**3. Tiered model cascade**

| Stage | Model | Cost | Purpose |
|-------|-------|------|---------|
| Download filter | Haiku | $0.0001/image | Cheap yes/no during scraping |
| Screenshot classification | Sonnet | $0.003/image | Gameplay vs promotional vs rules |
| Full art classification | Sonnet (cached) | $0.008/game | All 6 dimensions |
| Feature extraction (text) | Sonnet | $0.005/game | Mechanics from HTML rules |

**4. Cost optimization stack**

- **Prompt caching** — system prompt reused across calls (~90% input savings)
- **Batch API** — 50% discount for bulk classification runs
- **Deterministic pre-filters** — size gates before any API call
- **Checkpointed progress** — save after every game (no wasted runs)

---

## Quality Control: Human-in-the-Loop

We run AI classification like a **managed production capability**, not a demo.

### The Loop

```
Classify batch
    → Generate interactive HTML review grid
    → Human marks each game OK / Fix (with notes)
    → Analyze error patterns
    → Fix prompt / vocabulary / corrections
    → Re-classify known errors
    → Regression on ground truth
    → Gate opens → Next batch
```

### Review Interface

[SCREENSHOT: 01-batch-e-spotcheck.png]

*20-game spot-check grid: gameplay screenshots with color classification bars, theme/character metadata, and human OK/Fix verdicts. Each color segment shows its estimated area percentage.*

### Color Calibration (3 Rounds)

[SCREENSHOT: 02-color-calibration-r3.png]

*40-game calibration at 25% threshold: multi-segment color bars show raw percentages, gold borders mark colors passing threshold, orange cards flag previously-incorrect games for re-evaluation.*

We iterated the color prompt across 3 human review rounds on 40 stratified games:
- **Round 1** (20% threshold, baseline prompt): 77% accuracy
- **Round 2** (shade-aware prompt, dark-background bias fix): 75%
- **Round 3** (25% threshold + anti-overestimation rules): **82.5%**

### Full Multi-Dimension Review

[SCREENSHOT: 04-batch24-4dim.png]

*Per-game 4-dimension classification review: Theme, Colors, Characters, and Elements — each independently verified by a human reviewer.*

### Code-Enforced Batch Gate

The system **cannot scale a bad prompt**. A code-enforced gate blocks batch runs (>10 games) until:
- Previous batch spot-checked
- Regression passes ground truth thresholds
- Known errors fixed and verified
- Gate auto-closes after every run — no bypass flag exists

This was implemented after a documented incident where 400 games were classified on a flawed prompt (~$4 wasted).

---

## Feature Extraction from Rules Pages

**Input:** ~8,800 HTML game rules pages scraped from casino sites.

**Process:** Claude reads the structured HTML and extracts mechanics to a canonical **30-feature vocabulary** with explicit IS/IS NOT cards:

> **Example: Hold and Spin**
>
> *IS: A DEDICATED bonus where special symbols LOCK on the grid and remaining positions RESPIN to collect more locked symbols. Must have BOTH: (1) symbols locking in place, AND (2) remaining positions re-spinning with a counter that resets on new locks.*
>
> *KNOWN AS: Hold & Win, Lock & Spin, Money Charge Bonus, Lightning Link, Dragon Link, Cash Eruption, Fire Link...*
>
> *NOT: Regular respins. Free spins with sticky wilds. Vague "hold-style" without explicit lock-grid-respin-counter mechanics.*

**Result:** 3,674 games with structured mechanics at **97% micro-F1** (validated against 228 ground-truth games).

---

## The Dashboard

The classified data powers an interactive analytics platform:

- **Performance-indexed bubble landscapes** — Theme, Color, Provider, RTP band dimensions plotted against market performance
- **Game detail panel** — Screenshot + stacked color bar + mechanics + art metadata + similar games
- **Game Lab / Blueprint Advisor** — Score new game concepts against historical performance data
- **AI Assistant** — Chat with the data using live SQL context

[SCREENSHOT: Dashboard bubble chart — placeholder for live capture]

---

## Results

| Metric | Value |
|--------|-------|
| Games indexed | 5,124 |
| Features extracted (97% F1) | 3,674 |
| Art classified (with latest prompt) | 3,693 |
| Gameplay screenshots acquired | 4,071 |
| Human review rounds | 50+ |
| Automated tests | 1,689 |
| Cost per art classification | ~$0.008/game (direct), ~$0.004 (batch) |
| Full 672-game batch | ~$4.01 total |
| Screenshot acquisition (673 images) | ~$5.35 total |

---

## Trust & Limits

Credibility requires acknowledging where the system is production-grade versus where human review still dominates:

| Dimension | Accuracy | Status |
|-----------|----------|--------|
| Feature extraction | 97% F1 | Production-grade |
| Screenshot prescreen | 97.4% | Production-grade |
| Art theme | 92% spot-check (99% adjusted) | Production-grade |
| Art colors (25% threshold) | 82.5% (Top-1: 88%) | Calibrated, in production |
| Art characters | 90% spot-check | Production-grade |
| Art elements | ~65% spot-check | Known vision limitation, improving |
| Coverage | 3,693 / 5,124 classified | ~1,400 games remaining |

The elements dimension remains the hardest for vision models — distinguishing what's "in the background" from what's "on the reels" requires spatial reasoning that current models handle inconsistently. Our dual-image masking approach improved this significantly but it's not yet at production threshold.

---

## What This Enables

For game studios and operators, this system answers questions that were previously unanswerable at scale:

- *"What visual themes are oversaturated vs. underserved in high-performance segments?"*
- *"Which mechanic combinations correlate with above-average market share?"*
- *"How should we position our next game's art and features given competitive landscape?"*
- *"Which of our games are visual outliers in their theme category — and does that help or hurt?"*

---

*Built by [Your Company Name] using Claude (Anthropic) for vision and text classification, DuckDB WASM for in-browser analytics, and a custom multi-pipeline orchestration framework.*
