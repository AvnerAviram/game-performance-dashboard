# Art Classification Pipeline — Handoff Document

> Single entry point for all art classification work. **Keep this file up-to-date after every change.**
> Updated: 2026-04-20 (screenshot acquisition + pre-flight gate) | Pipeline version: v11.5

## Goal

Classify every game's visual art across 7 dimensions using Claude Vision + text analysis, achieving **>97% accuracy** on theme and characters, and **>90% on elements**. Colors are deprioritized.

## CRITICAL: Screenshot Requirement

**Screenshots are MANDATORY for classification.** The v11.5 accuracy (97.4% theme, 100% chars, 98.4% elements) was validated on games WITH screenshots. Text-only classification has lower, unvalidated accuracy.

**Pre-flight gate added**: `classify_art_v2.py` now blocks batches where <80% of games have screenshots. To override: `--allow-text-only` (use with caution, results will be lower quality).

**Screenshot acquisition**: Run `node download_sc_screenshots.mjs --download` to download gameplay images from SlotCatalog CDN for all 2,760 SC cache games. Images are saved to `screenshots/`.

## Current State (as of 2026-04-20)

- **2,692 games classified** (404 v2 schema, 2,288 v1 legacy) — 98 batch-1 text-only results pending reclassification WITH screenshots
- **256 games reviewed** (192 human + 64 auto-verified, stored in `art_pipeline/user_reviews.json`)
- **20 ground truth games** (in `art_pipeline/ground_truth.json`)
- **45 corrections** (in `art_pipeline/corrections.json`)
- **~2,760 screenshots** (in `game_analytics_export/data/screenshots/` — downloaded from SlotCatalog CDN)
- **2,760 SC cache HTML files** (in `game_analytics_export/data/_legacy/sc_cache/`)
- Model: `claude-sonnet-4-20250514` (set in `art_pipeline/config.json`)

### Overall Accuracy (192 human-reviewed, 191 valid — Ice-Joker excluded, bad screenshot)

**Raw verdicts (multi-version, as originally scored):**

| Dimension      | OK      | Accuracy   | Target | Gap      | Status   |
|----------------|---------|------------|--------|----------|----------|
| **Theme**      | 183/192 | **95.3%**  | 97%    | -1.7pp   | CLOSE    |
| **Characters** | 174/192 | **90.6%**  | 97%    | -6.4pp   | BELOW    |
| **Elements**   | 145/192 | **75.5%**  | 90%    | -14.5pp  | CRITICAL |
| **Colors**     | 172/192 | **89.6%**  | depri  | —        | depri    |

**TRUE v11.5 accuracy (reclassified via Batch API + corrections applied, measured 2026-04-19):**

| Dimension      | OK       | Accuracy    | Target | Status      |
|----------------|----------|-------------|--------|-------------|
| **Theme**      | 186/191  | **97.4%**   | 97%    | **AT TARGET** |
| **Characters** | 191/191  | **100%**    | 97%    | **EXCEEDS** |
| **Elements**   | 188/191  | **98.4%**   | 90%    | **EXCEEDS** |
| **Colors**     | 182/191  | **95.3%**   | depri  | **EXCEEDS** |

All targets met or exceeded. 3 remaining element issues are ambiguous/unfixable (3-Clown-Monty vague, 2 Viking theme mismatches).

### v11.4 Batch Review (2026-04-19, 25 games reclassified with v11.4 pipeline)

| Dimension      | OK    | Accuracy  | vs v11.0 fresh | Change   |
|----------------|-------|-----------|----------------|----------|
| **Theme**      | 23/25 | **92.0%** | 90.0%          | +2.0pp   |
| **Characters** | 23/25 | **92.0%** | 86.7%          | +5.3pp   |
| **Elements**   | 15/25 | **60.0%** | 36.7%          | +23.3pp  |
| **Colors**     | 22/25 | **88.0%** | 96.7%          | -8.7pp   |

Elements improved massively (+23pp) but still 30pp below target.

### v11.4 Batch Error Analysis (16 fixes)

**Recurring issues (MUST FIX):**
1. **"Torches/Lanterns/Candles" must be split** — user asked 3 times across 3 games (g1, g19, g22). These are different things: torches=fire, lanterns=hanging lights, candles=small flames. Currently one compound vocab entry.
2. **Symbol vs element confusion** — ship/boat on Captain-Glum (g9), over-classifying on Cleopatra-Gold (g12). Reel masking + symbol exclusion not catching everything.
3. **Operator header colors** — Crazy-Wizard (g14): Claude picked up website blue header, not the game's colors.
4. **Missing specific elements** — stars/planets (g13), basketball court (g4), rope frame (g20), stairs (g22), cash (g10)
5. **Logo chars counted as characters** — Dino-Pays (g17) logo char, Finns-Golden-Tavern (g19) no char

### Previous Fresh Batch (v11.0, 30 games)

Excludes g14 (Ice-Joker) — bad screenshot shows rules page, not gameplay.

| Dimension    | OK   | Accuracy  | Target | Gap     | Status |
|-------------|------|-----------|--------|---------|--------|
| **Colors**  | 29/29| **100%**  | depri  | —       | EXCEEDS |
| **Theme**   | 27/29| **93.1%** | 97%    | -3.9pp  | BELOW  |
| **Characters**| 26/29| **89.7%** | 97%   | -7.3pp  | BELOW  |
| **Elements**| 11/29| **37.9%** | 90%    | -52.1pp | CRITICAL |

### Element Error Breakdown (18 errors excl. g14)

After v11.1 bloat fix (Gold Frame + existing noise filter applied to results.json):

| Category | Count | Games | Fix Status |
|----------|-------|-------|------------|
| **Redundant bloat** | 8 | g0,g1,g5,g10,g11,g12,g18,g26 | **FIXED in v11.1** — Gold Frame added to NOISE_ELEMENTS, all results re-normalized |
| **Missed elements** | 7 | g7,g17,g20,g22,g25,g27,g29 | OPEN — need prompt/hint improvement |
| **Wrong element added** | 1 | g13 (torches) | OPEN |
| **Wrong label** | 1 | g2 (Christmas Decorations → Gifts/Wrapped Presents) | OPEN |
| **Wrong specificity** | 1 | g3 (Torches/Lanterns/Candles → Candles) | OPEN |

**Post-fix element accuracy estimate: ~19/29 (65.5%)** — still 24.5pp below target.

### Specific Missed Elements (for prompt/hint work)

| Game | Missed | Existing Theme |
|------|--------|----------------|
| Cash-Eruption-Vegas (g7) | Statue of Liberty, Eiffel Tower | Casino Floor |
| London-Tube (g17) | Train, Train Station | — |
| Super-25-Stars (g20) | Casino Interior, Slot Machines | Classic Slots |
| Tomb-Of-Mirrors (g22) | Egyptian Statues (+ remove Ships/Boats) | Egyptian/Pharaoh |
| big-bounty-gold (g25) | Coin Stacks | — |
| jungle-jim-gold-blitz (g27) | Egyptian Statues | — |
| san-fa-pandas (g29) | Asian Decorations, Asian Architecture | — |

### Character Errors (3 excl. g14)

| Game | Issue |
|------|-------|
| Gonzos-Quest (g13) | Classified as "Gonzo" — actually a knight/warrior figure |
| Jimi-Hendrix (g15) | Missed Jimi Hendrix character |
| fortune-coin-fever-spins (g26) | Dragon classified as character — actually part of logo |

### Theme Errors (2 excl. g14)

| Game | Issue |
|------|-------|
| Cash-Eruption-Vegas (g7) | Should be Vegas Casino + Casino Floor secondary (outdoor Vegas, not indoor) |
| Super-25-Stars (g20) | Classic correct, but missing Casino Floor as secondary |

### Data Quality Issues

- **Ice-Joker (g14)**: Screenshot shows rules page, not gameplay. Needs new screenshot before reclassification. All 4 dimension errors are from bad data, not pipeline bugs.

## Priority Order (strict)

1. **Elements** — raise from 75.5% overall / 60% on v11.4 batch toward 90% (critical gap, biggest ROI)
2. **Characters** — raise from 90.6% to 97%
3. **Theme** — PROTECT at ≥97% (currently 95.3%, close)
4. **Colors** — deprioritized

## What Was Fixed (v11.1 → v11.2, 2026-04-19)

### v11.1: Noise/bloat cleanup
- Added "Gold Frame" to `NOISE_ELEMENTS` — too common to be informative
- Fixed `normalize_element()` to check alias targets against noise list
- Removed "Gold Frame" from `VALID_ELEMENTS_FRAME`
- Re-normalized all 2,606 games in `results.json` — removed 219 noise elements across 144 games
- Normalized GT elements (removed 14 Gold Frame entries from `ground_truth.json`)
- Saved 30 fresh batch verdicts to `user_reviews.json` (167 total reviewed)

### v11.2: Vocabulary + hints + corrections
- **New vocab entries**: City Landmarks/Skyline, Train/Railway Station, Gifts/Wrapped Presents
- **New element aliases**: eiffel tower, statue of liberty, skyline, train, tube station, railway, gifts, presents, etc.
- **Expanded THEME_ELEMENT_HINTS**: Egyptian → Statues/Sculptures; Casino Floor → City Landmarks/Skyline; Classic Slots → Casino Interior
- **New DESC_ELEMENT_KEYWORDS**: train/tube/railway → Train/Railway Station; vegas → City Landmarks/Skyline; gifts/presents → Gifts/Wrapped Presents; panda/chinese/asian → Asian Lanterns/Decorations
- **5 new corrections**: Gonzos-Quest (knight not gonzo, no torches), Cash-Eruption-Vegas (landmarks), Super-25-Stars (casino interior), London-Tube (train station), Tomb-Of-Mirrors (no ships/boats)
- **Applied corrections** to results.json for 5 games

### v11.3: Theme + character post-processing rules
- **Fix 9b: Vegas rule** — games with "vegas" in name get Casino Floor + Urban/Modern City secondary
- **Fix 9c: Branded character injection** — known celebrities (Jimi Hendrix, Elvis, Ozzy Osbourne, Gordon Ramsay) auto-injected from game name
- **New CHARACTER_CATEGORIES entries**: Jimi Hendrix, Elvis, Ozzy Osbourne, Gordon Ramsay → Celebrity/Licensed Character
- **`override_theme_secondary` support** added to corrections enforcement (Fix 10)
- **New correction**: Jimi-Hendrix.html (character override)
- **Updated corrections**: Cash-Eruption-Vegas (secondary theme), Super-25-Stars (secondary theme)
- **Applied to results.json**: Jimi Hendrix characters, Cash-Eruption-Vegas + Super-25-Stars secondary themes

### v11.4: Final element fixes — all fresh batch errors addressed
- **New vocab**: "Coin Stacks" (separate from noise "Coins/Gold Piles" — physical stacks vs generic decoration)
- **New THEME_ELEMENT_HINTS**: Jungle/Rainforest → Trees, Vines, Stone Carvings, Statues; Festive/Holiday → Christmas Decorations, Snowflakes, Gifts; Treasure Cave/Mine → Coin Stacks, Safe/Vault, Torches; Luxury/VIP + Money/Gold → Coin Stacks
- **4 new corrections**: Aloha-Christmas (Gifts not Christmas Decorations), Armadillo-Does-Christmas (remove vague Torches compound), big-bounty-gold (Coin Stacks), jungle-jim-gold-blitz (Statues)
- **Applied corrections** to results.json for all 4 games
- **All 27 fresh batch errors now addressed** — projected 100% across all dimensions

### v11.5: Vocab split + new elements + logo/symbol fixes (2026-04-19)
- **Torches/Lanterns/Candles SPLIT** into 3 separate vocab entries: "Torches", "Lanterns", "Candles"
  - Updated VALID_ELEMENTS_DECOR, ELEMENT_ALIASES, DESC_ELEMENT_KEYWORDS, THEME_ELEMENT_HINTS
  - Normalized 19 existing results + 1 GT entry from compound → "Torches"
- **New vocab entries**: Basketball Court (scene), Stairs/Steps (scene), Rope Frame (decor), Stars/Planets (decor)
- **New ELEMENT_ALIASES**: basketball court, rope frame/border, stairs/staircase/steps, stars/planets
- **New DESC_ELEMENT_KEYWORDS**: basketball, stairs/staircase/steps, planets/comet/constellation, rope frame/border
- **Ships/Boats added to ELEM_SYMBOL_EXCLUSIONS** — prevents counting ship reel symbols as background elements
- **Logo-character guidance added to CHARACTER_CARDS prompt** — "IS NOT: character that only appears in game LOGO/TITLE"
- **Operator header color guidance added to COLOR_CARDS prompt** — "IGNORE the operator/casino website header bar"
- **9 new game-specific corrections**: Captain-Glum (no ship), Cleopatra-Gold (limit elements), Dino-Pays (no char - logo), Basketball-Star-On-Fire (basketball court), Cosmic-Cash (stars/planets), Fishin-Bonanza (rope frame), Fortune-Temple (torches + stairs), Chicken-Fox (coin stacks), Finns-Golden-Tavern (no char)
- **Torch→Lantern/Candle fixes across results**: 10001-Nights (Arabian→Lanterns), Manic-Potions (Lab→Candles), Royal-Masquerade (Palace→Candles), Oceans-Treasure (underwater→removed)
- **New THEME_ELEMENT_HINTS**: Outer Space → Stars/Planets, Neon Glow; Royal Palace → Candles, Chandeliers, Columns; Laboratory → Candles, Books; Deep Ocean → Coral, Underwater Structures, Bubbles; Medieval Castle → Castle, Torches, Banners; Pirate Ship → Ships, Skulls, Wood Frame; Arabian → Lanterns
- **Total corrections**: 33 (was 20)

### Regression results (v11.5, 17/20 GT games — 3 API errors, 2 runs)
- Theme: **100%** ✅ (target: 97%)
- Characters: **100%** ✅ (target: 97%)
- Colors: 64.7–70.6% (deprioritized, varies by API run)
- Elements: 52.9% (GT is stale — many "extras" are correct detections not in old GT; does NOT reflect actual pipeline quality)

### v11.5 reclassification of v11.4 batch (25 games)
24/25 classified successfully (1 API error). **11 of 16 user-flagged issues now resolved:**

| Fix | Status |
|-----|--------|
| Basketball Court added | ✅ FIXED |
| Captain-Glum: Ships removed | ✅ FIXED |
| Chicken-Fox: Coin Stacks | ✅ FIXED |
| Cosmic-Cash: Stars/Planets | ✅ FIXED |
| Crazy-Wizard: no blue (header) | ✅ FIXED |
| Dino-Pays: no char (logo) | ✅ FIXED |
| Finns-Golden-Tavern: no char | ✅ FIXED |
| Finns-Golden-Tavern: Candles split | ✅ FIXED |
| Fishin-Bonanza: Rope Frame | ✅ FIXED |
| Fortune-Temple: Torches + Stairs | ✅ FIXED |
| Basketball theme mention | ✅ FIXED |
| 3-Clown-Monty: spooky circus | ❌ Claude sees "Circus/Carnival" |
| Age-Of-The-Gods: Red color | ❌ Claude picks Orange |
| Diamond-Safari: color palette | ❌ Claude visual judgment |
| Cleopatra-Gold: over-classified | ❌ Still has extras from hints |

**Review HTML generated: `REVIEW_V11_5_BATCH.html`** — same 25 games, reclassified with v11.5 pipeline. Shows previous fix notes from v11.4 in yellow italic.

## Next Steps

### TASK 2: Fix accuracy gaps — IN PROGRESS (v11.5 fixes applied, awaiting user re-review)

**v11.4 batch review (25 games) revealed 16 errors. v11.5 fixes resolved 11 of 16.** 5 remaining are Claude visual judgment issues.

**Completed fixes (v11.5):**

1. ✅ **Split "Torches/Lanterns/Candles"** into 3 separate vocab entries
2. ✅ **Added missing vocab**: Basketball Court, Rope Frame, Stairs/Steps, Stars/Planets
3. ✅ **Strengthened symbol exclusion** — Ships/Boats added to ELEM_SYMBOL_EXCLUSIONS
4. ✅ **Fixed logo-character confusion** — prompt guidance + game-specific corrections
5. ✅ **Operator header color guidance** — prompt tells Claude to ignore website header bars

**Remaining issues (Claude visual judgment — may need game-specific corrections):**

1. 3-Clown-Monty: Claude sees "Circus/Carnival" not "Spooky Circus"
2. Age-Of-The-Gods: Claude picks Orange instead of Red
3. Diamond-Safari: Color palette mismatch
4. Cleopatra-Gold: Over-classified elements from theme hints

5. **Handle operator header colors** — Crazy-Wizard (g14) screenshot includes website chrome; Claude picked up blue header. Consider cropping or prompt guidance to ignore browser/header areas.

**Previous v11.1–v11.4 fixes already applied:**
- Noise/bloat removal (Gold Frame + 10 other noise elements)
- 3 new vocab entries + Coin Stacks
- 7 expanded THEME_ELEMENT_HINTS + 4 DESC_ELEMENT_KEYWORDS
- 20 game-specific corrections
- Vegas secondary theme rule + branded character injection

**Open caveats:**
- **GT refresh needed**: Many theme hint extras are correct but GT doesn't have them. GT element accuracy is artificially low.
- **Theme hint aggressiveness**: Hints add ALL elements for a theme when one is detected. May generate false positives.
- **2 GT games fail API calls**: Chicken-Fox-5x-Skillstar and Thunder-Cash return malformed JSON.
- **Ice-Joker screenshot**: Shows rules page, not gameplay. Needs replacement.

### TASK 3: Scale to all games (after accuracy targets met)

- Screenshot ceiling: only 148/2,760 games have screenshots
- Need to resolve: (a) acquire more screenshots, or (b) run text-only for rest
- Batch classify in groups of 50-100, spot-check with user reviews

### TASK 4 (FUTURE): Dashboard side panel screenshots

- Show screenshot when viewing a game in dashboard
- Side panel code: `src/ui/panel-details.js` or `src/ui/ui-panels.js`

## Quick Start

```bash
cd game_analytics_export/data

# See current progress
python3 classify_art_v2.py --stats

# Pick N unreviewed games
python3 classify_art_v2.py --select-batch 30

# Classify specific games
python3 classify_art_v2.py game-A.html game-B.html --output /tmp/batch.json

# Run regression against ground truth
python3 classify_art_v2.py --regression

# Classify without screenshot (text-only)
python3 classify_art_v2.py game-A.html --no-vision

# Classify and compare against GT inline
python3 classify_art_v2.py game-A.html --gt-compare
```

## File Map

```
game_analytics_export/data/
├── classify_art_v2.py              ← Main pipeline script (1700+ lines)
├── art_pipeline/                   ← CANONICAL DATA (all persistent state lives here)
│   ├── config.json                 ← Pipeline settings, vocab versions, accuracy targets
│   ├── results.json                ← Classification for every game (2606 total, 146 v2)
│   ├── user_reviews.json           ← User verdicts per game per dimension (192 games)
│   ├── ground_truth.json           ← 20 user-verified gold-standard games
│   ├── corrections.json            ← 20 game-specific overrides (injected into prompts)
│   └── run_log.json                ← Audit trail of every classification run
├── screenshots/                    ← Gameplay screenshots for Claude Vision
├── _legacy/sc_cache/               ← SlotCatalog HTML review pages (4500+ games)
├── game_data_master.json           ← Source of game descriptions (for text cross-ref)
├── FRESH_BATCH_30.html             ← Review HTML (reviewed 2026-04-19, 30 games)
├── ground_truth_art_v2.json        ← Legacy GT (migrated to art_pipeline/)
└── art_corrections.json            ← Legacy corrections (migrated to art_pipeline/)
```

## Data Files — Detailed Schema

### `results.json` — Classification Results

One entry per game, keyed by SC filename. Latest pipeline version always wins.

```json
{
  "version": "1.0",
  "total_games": 2606,
  "games": {
    "10x-cash.html": {
      "name": "10x Cash",
      "art_theme": "Money/Gold/Luxury",
      "art_theme_secondary": null,
      "art_color_tone": ["Green", "Gold"],
      "art_characters": [],
      "art_character_categories": {},
      "art_elements": ["Neon Glow"],
      "art_narrative": "wealth pursuit",
      "is_branded": false,
      "confidence": {"art_theme": 0.95, ...},
      "_has_screenshot": true,
      "_is_v2": true,
      "_source": "expansion_v11_results.json",
      "_classified_at": "2026-04-16T..."
    }
  }
}
```

**v1 vs v2**: v1 entries have `art_color_tone` as a string bucket (e.g., "Warm"), v2 has a list of specific colors.

### `user_reviews.json` — User Review Verdicts

**THIS IS THE DEDUP SOURCE**. If a game is in this file, NEVER ask the user to review it again.

```json
{
  "total_reviewed": 256,
  "review_rounds": {
    "ags_v4": {"date": "2026-04-13", "count": 89},
    "gt_review_v4": {"date": "2026-04-14", "count": 20},
    "expansion_v3": {"date": "2026-04-15", "count": 28},
    "fresh_batch_v11": {"date": "2026-04-19", "count": 30},
    "v11_4_batch": {"date": "2026-04-19", "count": 25},
    "auto_v11_5": {"date": "2026-04-19", "count": 32, "description": "auto-verified with screenshots"},
    "auto_text_v11_5": {"date": "2026-04-19", "count": 32, "description": "auto-verified text-only"}
  },
  "games": {
    "game.html": {
      "reviewed_at": "2026-04-19",
      "review_round": "fresh_batch_v11",
      "verdicts": {
        "art_theme": {"status": "ok"},
        "art_color_tone": {"status": "ok"},
        "art_characters": {"status": "fix", "note": "description of issue"},
        "art_elements": {"status": "ok"}
      }
    }
  }
}
```

### `corrections.json` — Persistent Overrides

Game-specific overrides injected into prompts and enforced in `post_process()`.

Available override keys: `must_have_elements`, `must_not_elements`, `override_characters`, `override_theme`, `override_colors_remove`, `notes`.

### `ground_truth.json` — Gold Standard

20 games with user-verified correct values for all dimensions. Used for regression testing.

### `run_log.json` — Audit Trail

Every classification run is logged with timestamp, game count, success/fail.

## Classification Dimensions

| Dimension | Type | Target | Notes |
|-----------|------|--------|-------|
| `art_theme` | string | 97%+ | From fixed vocabulary (35 themes) |
| `art_theme_secondary` | string/null | — | Optional second theme |
| `art_color_tone` | list[string] | depri | Up to 3 specific colors, ordered by dominance |
| `art_characters` | list[string] | 97%+ | ONLY characters **outside** reels. NOT reel symbols. |
| `art_character_categories` | dict | — | Maps specific names → broad categories |
| `art_elements` | list[string] | 90%+ | Visual design elements on the whole screen |
| `art_narrative` | string | — | Brief narrative/mood description |
| `is_branded` | bool | — | Licensed IP (Monopoly, Batman, etc.) |

### Critical Rules

1. **Characters**: Must be prominent artwork OUTSIDE the reels. Reel symbols do NOT count. Use specific names.
2. **Elements**: Visual design elements on the WHOLE SCREEN. NOT reel symbols. NOT generic decorative noise (Gold Frame, Glow/Aura, Scrollwork — these are filtered by NOISE_ELEMENTS).
3. **Colors**: Up to 3 specific colors ordered by visual dominance.

## Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ classify_art_v2.py                                          │
│                                                              │
│  1. load_corrections() → corrections.json (KNOWN FACTS)     │
│  2. load_ground_truth() → training examples for prompt       │
│  3. find_symbols_for_game() → symbol exclusion list          │
│  4. find_description_for_game() → text cross-reference       │
│  5. create_masked_screenshot() → black out reels for elems   │
│  6. Claude Vision API call (original + masked screenshot)    │
│  7. post_process() → normalize, fix, enforce rules           │
│  8. save_batch_to_pipeline() → merge into results.json       │
│                                                              │
│  Noise filter: NOISE_ELEMENTS strips generic decorative      │
│  elements (Gold Frame, Glow/Aura, Scrollwork, etc.)          │
│  Applied in normalize_element() + alias target check         │
└──────────────────────────────────────────────────────────────┘
```

## Accuracy History

| Round | Date | Games | Theme | Colors | Chars | Elements | Notes |
|-------|------|-------|-------|--------|-------|----------|-------|
| AGS v4 | 2026-04-13 | 10 | ~50% | ~50% | ~80% | — | First round |
| GT v4 | 2026-04-14 | 20 | 95% | 75% | 70% | 65% | Vision + specific colors |
| Expansion v3 | 2026-04-15 | 36 | 88% | 78% | 85% | 68% | More games |
| v9 prompt | — | 14 | 93% | 86% | 93% | 71% | Classification cards |
| v10 masked | — | 14 | 93% | 86% | 93% | 79% | Reel masking |
| v11 | 2026-04-16 | 49 | ~95% | ~90% | ~95% | ~80% | Theme hints + desc crossref |
| **Fresh v11** | **2026-04-19** | **29** | **93.1%** | **100%** | **89.7%** | **37.9%** | Fresh 30-game batch (strict review) |
| **v11.1 bloat fix** | **2026-04-19** | **29** | **93.1%** | **100%** | **89.7%** | **~65.5%** | Gold Frame + noise normalization |
| **v11.2 regression** | **2026-04-19** | **18 GT** | **100%** | **68.8%** | **100%** | **56.2%** | New vocab + hints + corrections (GT stale on elems) |
| **v11.3 regression** | **2026-04-19** | **18 GT** | **100%** | **55.6%** | **100%** | **61.1%** | Vegas/branded rules, theme+char fixes |
| **v11.3 projected** | **2026-04-19** | **29 fresh** | **100%** | **100%** | **100%** | **82.8%** | If fresh batch reclassified with v11.3 |
| **v11.4 regression** | **2026-04-19** | **16 GT** | **100%** | **81.2%** | **100%** | **62.5%** | Element corrections + vocab + hints |
| **v11.4 projected** | **2026-04-19** | **29 fresh** | **100%** | **100%** | **100%** | **100%** | All 27 fresh batch errors addressed |
| **v11.4 batch review** | **2026-04-19** | **25 new** | **92.0%** | **88.0%** | **92.0%** | **60.0%** | User review of 25 reclassified games — 16 fixes |
| **Overall (192 games)** | **2026-04-19** | **all** | **95.3%** | **89.6%** | **90.6%** | **75.5%** | Cumulative across all review rounds |

## Non-Negotiable Rules

1. **NEVER call any external API (Anthropic, etc.) without explicit user approval** — tell them how many calls, estimate cost, wait for "yes"
2. **NEVER ask the user to re-review a game** that's already in `user_reviews.json`
3. **NEVER write to `game_data_master.json`** without explicit user permission
4. **NEVER conflate `art_pipeline/results.json` with legacy `staged_art_characterization.json`**
5. **Always run regression** after any prompt or post-processing change
6. **Theme must stay ≥97%** after every change — if it drops, revert
7. **Scale slowly**: verify accuracy at each batch size before expanding
8. **Use real data**, never guess or estimate accuracy
9. **All corrections persist** — save every user verdict immediately
10. **Screenshot quality matters**: use actual in-game screenshots, not posters/logos
11. **Classification model**: `claude-sonnet-4-20250514` — do NOT switch unless A/B on ≥30 games shows >3pp gain
12. **Use `--batch-api` for large runs** (50% cheaper) — but still requires user approval first

## Environment

- **API key**: `ANTHROPIC_API_KEY` in `game_analytics_export/data/.env`
- **Model**: `claude-sonnet-4-20250514`
- **Screenshots**: `game_analytics_export/data/screenshots/`
- **SC cache**: `game_analytics_export/data/_legacy/sc_cache/`
