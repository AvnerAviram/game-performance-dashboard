# Art Classification Plan

**Goal**: >97% accuracy on theme, characters, mood, elements, narrative for all 4,201 slots.
**Rule**: NEVER write to `game_data_master.json` without explicit user approval.

---

## Current State (committed master)

| Tier | Games | Data Available | SC Cache |
|------|-------|----------------|----------|
| A | 3,061 | Borgata/BetMGM HTML (richest) | 2,089 also in SC |
| B | 655 | Symbols only (no description) | 391 also in SC |
| C | 591 | Name only (nothing) | 257 in SC |
| — | 334 | Name only, NOT in SC | 0 |
| **Total** | **4,201** | | **2,737 in SC** |

**SC cache**: 2,760 SlotCatalog pages on disk (`data/_legacy/sc_cache/`).
Verified identical to live SC site (same text, same tags).

**Art fields in master**: ZERO. All previous art work was reverted.

---

## Process (small steps, verify each)

### Step 1: Test on 2 games

- Pick 2 games from SC cache (1 with Borgata HTML + SC, 1 name-only + SC)
- Extract SC review text from local cache
- Classify art dimensions by reading the review (theme, characters, mood, elements, narrative)
- Verify classification against live web search
- Show user results

### Step 2: Test on 5 more games

- Same process, 5 games across tiers
- Track accuracy: how many dimensions are correct vs web verification?
- Fix any classification issues found
- Show user results

### Step 3: Test on 20 games

- If Steps 1-2 are >97%, expand to 20
- Must still be >97% against external verification
- Show user results

### Step 4: Batch the rest

- Only after Step 3 passes >97%
- Write to `staged_art_characterization.json` (NOT master)
- Run validation tests
- Show user accuracy report
- User approves → merge to master

### Step 5: Fill remaining 334 games

- These have no SC cache and no Borgata data
- Options: scrape SC for them, use casino.guru, or flag as low-confidence
- User decides

---

## Data Sources (priority order)

1. **Borgata/BetMGM HTML** (`data/rules_html/`) — 3,061 games, richest source
2. **SlotCatalog cache** (`data/_legacy/sc_cache/`) — 2,760 pages with human reviews + theme tags
3. **slot.report API** — 5,598 games, theme tags only (cross-check)
4. **Web search** — manual verification for spot-checks

## Validation Method

Every classification is checked against **external sources** (SC theme tags, slot.report, web reviews).
NOT against our own descriptions. Self-referential validation is banned.

## Classification Pipeline

Uses `data/sc_extract.py` (existing) which:
- Extracts human-written review text from SC HTML
- Sends to Claude with few-shot examples
- Post-processes with hard gates (>95% F1 features, >90% F1 themes)
- Needs adaptation for art dimensions (characters, mood, elements, narrative)
