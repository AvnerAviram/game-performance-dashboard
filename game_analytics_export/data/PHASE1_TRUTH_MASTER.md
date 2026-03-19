# Game Enrichment — Single Source of Truth

**If you are a new AI agent: start here.** This is the only file you need to understand the enrichment pipeline. Everything runs from `game_analytics_export/data/`.

---

## Prerequisites

```bash
# 1. Python 3.10+ with these packages
pip install anthropic requests beautifulsoup4 lxml

# 2. API key — create .env in game_analytics_export/data/
echo "ANTHROPIC_API_KEY=sk-ant-..." > game_analytics_export/data/.env

# 3. Node v20 (for dashboard tests, NOT needed for pipeline)
fnm use 20  # or nvm use 20

# 4. Dashboard test suite (run after ANY change)
cd game_analytics_export && npx vitest run
# Currently: 183 tests, 13 files, all passing
```

---

## BEFORE ANY CHANGE (mandatory pre-flight)

**Every agent MUST run these before AND after modifying any pipeline code, vocabulary, synonym mapping, definition cards, or post-processing rules:**

```bash
cd game_analytics_export/data/

# 1. Record baseline metrics BEFORE your change
python3 -c "
import json, re
with open('ground_truth_ags.json') as f: gt = json.load(f)
with open('games_dashboard.json') as f: dash = json.load(f)
def norm(n): return re.sub(r'[^a-z0-9]', '', (n or '').lower())
d = {norm(g.get('name','')): g for g in dash}
tp=fp=fn=0
for gn, gd in gt.items():
    if gd.get('data_status') in ('insufficient','table_game'): continue
    gf = set(gd.get('features',[]));
    if not gf: continue
    p = set(d.get(norm(gn),{}).get('features',[]))
    tp+=len(gf&p); fp+=len(p-gf); fn+=len(gf-p)
pr=tp/(tp+fp) if tp+fp else 0; re_=tp/(tp+fn) if tp+fn else 0; f1=2*pr*re_/(pr+re_) if pr+re_ else 0
print(f'BASELINE: TP={tp} FP={fp} FN={fn} | P={pr*100:.1f}% R={re_*100:.1f}% F1={f1*100:.1f}%')
"

# 2. Validate config consistency
python3 enrich_websearch.py --validate

# 3. Test on ONE game with --verbose (look for unexpected behavior)
PYTHONUNBUFFERED=1 python3 enrich_websearch.py --ids "game-001-cash_eruption" --verbose --fresh --strict-adapters --no-ddg --delay 5

# 4. Re-run metrics AFTER your change — F1 MUST NOT drop below 95%
# If F1 drops: REVERT your change immediately.

# 5. Run dashboard tests (from game_analytics_export/, NOT data/)
cd .. && npx vitest run && cd data/
# All 183 tests must pass. If any fail, your change broke something.
```

**After editing `ground_truth_ags.json`:** ALWAYS re-run the metrics script immediately. Verify F1 did not regress. If it did, your GT edit introduced an error — investigate before proceeding.

---

## Quick Start

```bash
cd game_analytics_export/data/

# Check current accuracy (should be >=95% F1)
python3 -c "
import json, re
with open('ground_truth_ags.json') as f: gt = json.load(f)
with open('games_dashboard.json') as f: dash = json.load(f)
def norm(n): return re.sub(r'[^a-z0-9]', '', (n or '').lower())
dash_by_norm = {norm(g.get('name','')): g for g in dash}
tp = fp = fn = 0
for gname, gdata in gt.items():
    if gdata.get('data_status') in ('insufficient', 'table_game'): continue
    gt_feats = set(gdata.get('features', []))
    if not gt_feats: continue
    dg = dash_by_norm.get(norm(gname), {})
    pred = set(dg.get('features', []))
    tp += len(gt_feats & pred)
    fp += len(pred - gt_feats)
    fn += len(gt_feats - pred)
prec = tp/(tp+fp) if tp+fp else 0
rec = tp/(tp+fn) if tp+fn else 0
f1 = 2*prec*rec/(prec+rec) if prec+rec else 0
print(f'TP={tp} FP={fp} FN={fn}')
print(f'Precision={prec*100:.1f}% Recall={rec*100:.1f}% F1={f1*100:.1f}%')
"

# Validate pipeline config consistency
python3 enrich_websearch.py --validate

# Enrich specific games (MUST include --strict-adapters --no-ddg for proof/audit)
PYTHONUNBUFFERED=1 python3 enrich_websearch.py --ids "game-001-cash_eruption" --verbose --fresh --strict-adapters --no-ddg --delay 15

# Batch mode (50% cheaper, async)
python3 enrich_websearch.py --batch-submit --ids "game-001-cash_eruption,game-002-huff_n_even_more_puff" --strict-adapters --no-ddg --fresh
python3 enrich_websearch.py --batch-poll <batch_id> --verbose --strict-adapters --no-ddg
```

---

## Current State (2026-03-16)

- **Games in master**: 643
- **Games in dashboard**: 642 (594 with features, 48 without)
- **F1: 95.4%** | Precision: 97.0% | Recall: 93.8%
- **Perfect matches**: 112 / 137 evaluable GT games (81.8%)
- **TP=393, FP=12, FN=26**
- **Canonical features (11)**: Cash On Reels, Expanding Reels, Free Spins, Hold and Spin, Nudges, Persistence, Pick Bonus, Respin, Static Jackpot, Wheel, Wild Reels

---

## DO NOT (hard rules for any agent)

1. **DO NOT weaken confidence thresholds.** Features require conf >= 5, themes >= 4. These are enforced in code (see `# GATE:` comments in `enrich_websearch.py`).
2. **DO NOT re-add Multiplier or Sidebets.** Both were deliberately removed from the taxonomy. Multiplier is stripped unconditionally in code.
3. **DO NOT skip post-processing rules.** They catch systematic LLM misclassifications (PXS, expanding wilds, interactive mini-games). Catalog-confirmed features bypass these strips.
4. **DO NOT overwrite dashboard data.** Batch-poll MERGES new results with existing `games_dashboard.json` entries. Never truncate.
5. **DO NOT use `claude-sonnet-4-6` alias** — it returns 529 errors with `web_search` tool. Use `claude-sonnet-4-20250514`.
6. **DO NOT use `web_search_20260209`** — reliability issues. Use `web_search_20250305`.
7. **DO NOT reduce web search `max_uses` below 3** without validating accuracy on the full GT set.
8. **DO NOT make game-specific hacks.** All fixes must be generalizable (card updates, post-processing rules, synonym mappings).
9. **DO NOT add features to `ags_vocabulary.json`** without also adding a Feature Definition Card in `_build_normalize_system_prompt()`, a post-processing rule if needed, and SlotCatalog map entries. The vocabulary file, cards, synonym map, and SlotCatalog map must stay in sync. `--validate` checks this.
10. **DO NOT add entries to `_SLOTCATALOG_FEATURE_MAP`** that map to a canonical feature without verifying the mapping is correct. Bad mappings here inject false positives with no LLM review. Each new mapping must be validated against 3+ real games.
11. **DO NOT edit post-processing rules in only ONE code path.** The sync path (~line 1720) and batch-poll path (~line 2220) have DUPLICATED post-processing logic. If you change one, you MUST change the other identically. Search for `# GATE:` comments to find both.
12. **DO NOT run proof/audit enrichment without `--strict-adapters --no-ddg`.** Strict-adapters ensures zero config issues (hard abort). No-DDG ensures deterministic results (DDG web search is for remediation/discovery only — pin sources, then re-run without it).
13. **DO NOT skip proof or audit steps.** Both are required. Proof validates pipeline output; audit validates data quality (theme + features are hard truth).

---

## Proof & Audit Runs (mandatory for any production enrichment)

All proof and audit runs must follow these rules:

1. **Always use `--strict-adapters`** — causes hard `sys.exit(1)` on any config issue.
2. **Always use `--no-ddg`** — DDG is remediation-only (discover sources, pin them, then rerun without DDG).
3. **Proof + Audit are both required** — never skip either.
4. **Theme + features are hard truth in audits:**
   - Theme audit criteria: `no_2domain_AB_consensus:theme`
   - Features audit criteria: `no_AB_consensus_or_tierA:mechanic.features`
5. **All audit runs must surface theme/features explicitly** and fail loudly when they regress.
6. **On failure: continue remediation, sleep, retry** — never quit the cycle.

---

## Key Files

| File | Purpose |
|------|---------|
| `enrich_websearch.py` | **The pipeline.** Everything in one file: extraction, normalization, post-processing, batch support. **Also contains all 11 Feature Definition Cards** (IS/NOT/YES/NO examples) inside `_build_normalize_system_prompt()` (~line 1319). These cards are the core classification logic. |
| `games_master.json` | Source of truth for game list (643 games). **Structure: `{"metadata":{}, "games":[...]}`** — NOT a flat array. Access games via `data["games"]`. Fields: id, name, provider, studio, mechanic, rtp, volatility, theo_win, etc. |
| `games_dashboard.json` | **Enrichment output.** Features, themes, symbols, descriptions, demo URLs for 642 games. Loaded by DuckDB in the dashboard. |
| `games_dashboard_meta.json` | Per-game enrichment metadata (completeness, model used, batch ID, timestamp). |
| `ground_truth_ags.json` | Ground truth for accuracy measurement (173 entries, 137 evaluable). Used by `compare_with_ground_truth()` and the metrics scripts. |
| `ags_vocabulary.json` | Canonical vocabulary: 26 themes, 11 features. Loaded at pipeline startup as `KNOWN_FEATURES` / `KNOWN_THEMES`. |
| `synonym_mapping.json` | Post-LLM normalization aliases (maps variant names → canonical names). |
| `theme_consolidation_map.json` | Maps 375 raw themes → 24 dashboard categories. Applied at DuckDB load time. |
| `enrichment_checkpoint.json` | Resume support for sync runs. |
| `.env` | `ANTHROPIC_API_KEY` (gitignored). |

### Critical Files — DO NOT DELETE

These files are essential to the pipeline and/or dashboard. **Never remove them.**

| File | Why it's critical |
|------|-------------------|
| `enrich_websearch.py` | The entire enrichment pipeline + all Feature Definition Cards |
| `games_master.json` | Pipeline input — list of all 643 games with base metadata. Without it, enrichment cannot run. |
| `games_dashboard.json` | Pipeline output + DuckDB data source. The dashboard renders this. |
| `ground_truth_ags.json` | 173-entry ground truth. Required for F1 accuracy measurement. Irreplaceable — built through manual verification. |
| `ags_vocabulary.json` | Canonical feature/theme lists. Pipeline refuses to start without it. |
| `synonym_mapping.json` | Normalization aliases. Pipeline loads at startup. |
| `theme_consolidation_map.json` | Theme grouping for dashboard. DuckDB loads it at startup. |
| `audit_features.py` | Systematic FP detection script for feature audits. |
| `PHASE1_TRUTH_MASTER.md` | This file — the single runbook. |

Files that are **safe to regenerate** (not critical to preserve):

| File | Why it's safe |
|------|---------------|
| `enrichment_checkpoint.json` | Auto-generated during sync runs. Can be deleted to force fresh re-enrichment. |
| `games_dashboard_meta.json` | Regenerated by pipeline alongside `games_dashboard.json`. |
| `__pycache__/` | Python bytecode cache. Auto-generated. |

---

## `games_dashboard.json` Schema

The file is a **flat JSON array** (not wrapped in `{ "games": [...] }`). Each element has these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Game ID from `games_master.json` |
| `name` | string | yes | Display name |
| `features` | string[] | no | Canonical feature names (from the 11) |
| `themes_all` | string[] | no | All detected themes |
| `theme_primary` | string | no | Primary theme |
| `theme_secondary` | string | no | Secondary theme |
| `symbols` | string[] | no | Detected game symbols |
| `description` | string | no | Game description from web |
| `demo_url` | string | no | Link to playable demo |
| `provider` | string | yes | Provider name |
| `studio` | string | yes | Studio name |
| `parent_company` | string | no | Parent company |
| `provider_website` | string | no | Provider official website URL (from PROVIDER_WEBSITES dict) |
| `mechanic_primary` | string | yes | Primary mechanic (e.g., "Slot") |
| `reels` | number | no | Reel count |
| `rows` | number | no | Row count |
| `paylines_count` | number | no | Payline/ways count |
| `paylines_kind` | string | no | "Lines" or "Ways" |
| `rtp` | number | no | Return to player % |
| `volatility` | string | no | "Low"/"Medium"/"High"/"Very High" |
| `theo_win` | number | no | Theoretical win index |
| `market_share_pct` | number | no | Market share percentage |
| `percentile` | string | no | Performance percentile |
| `anomaly` | string | no | "high" or "low" |
| `release_year` | number | no | Release year |
| `release_month` | number | no | Release month |
| `data_quality` | string | no | "verified" or "partial" |
| `source_tier` | string | no | Pipeline source info |

**Critical:** `features` arrays must ONLY contain names from the 11 canonical features. Any other value is a bug.

---

## Pipeline Architecture

The pipeline has 3 layers, run in sequence for each game:

### Layer 0: Provider Catalog (free, deterministic)

Direct HTTP fetch from provider websites + SlotCatalog.com fallback. Returns structured features, themes, RTP, specs.

**9 provider-specific extractors** (~149/643 games = 23% coverage):

| Provider | Extractor | Games |
|----------|-----------|-------|
| AGS (+Crazy Tooth, Oros) | `ags` | 23+ |
| Light & Wonder | `lnw` | 36 |
| Inspired Gaming | `inspired` | 29 |
| Aristocrat | `aristocrat` | 20 |
| Everi | `everi` | 18 |
| Red Tiger | `redtiger` | 11 |
| Konami | `konami` | 8 |
| Hacksaw Gaming | `hacksaw` | 6 |
| Nolimit City | `nolimitcity` | 1 |

**SlotCatalog.com universal fallback** covers ALL other providers. Deterministic mapping (`_SLOTCATALOG_FEATURE_MAP`) converts high-confidence labels directly to canonical features.

**Cannot add** (JS-rendered or blocked): IGT, White Hat, Blueprint, Playtech, NetEnt, Greentube, BTG, Lightning Box, Gaming Realms, Reel Play. These use SlotCatalog fallback.

### Layer 1: Web Search Extraction (Claude Sonnet + web_search tool)

Free-form extraction using Claude Sonnet with the `web_search` tool. Finds features, themes, symbols, specs, description from web sources. ~2.5 searches per game.

- Model: `claude-sonnet-4-20250514`
- Tool: `web_search_20250305`
- Completeness score: 1-5/5. If <= 3, triggers verification search.

### Layer 2: Normalization (Claude Haiku + Feature Definition Cards)

Maps raw extraction output to canonical taxonomy using definition cards.

- Model: `claude-haiku-4-5`
- Prompt caching: ~90% savings after first call
- Confidence gating: features >= 5, themes >= 4 (enforced in code, not just prompt)

---

## Code Gates in `enrich_websearch.py`

Every gate is marked with `# GATE:` comments in the code. These are the programmatic enforcement points:

1. **Confidence gating** — Features below conf 5 and themes below conf 4 are stripped from the output, regardless of what the LLM returns.
2. **Multiplier strip** — Unconditional removal. Multiplier is not in the taxonomy.
3. **PowerXStream ER strip** — If all Expanding Reels evidence is PXS-only, strip ER. Skipped if catalog confirms ER.
4. **Expanding-wilds WR strip** — If all Wild Reels evidence is expanding-wilds-only, strip WR. Skipped if catalog confirms WR.
5. **Interactive COR strip** — If all Cash On Reels evidence is interactive mini-game, strip COR. Skipped if catalog confirms COR.
6. **Catalog data merge** — After LLM normalization, catalog-confirmed features are merged in.
7. **Synonym normalization** — Post-LLM normalization via `synonym_mapping.json`.
8. **Batch-poll merge** — New batch results are merged with existing dashboard data, never overwritten.
9. **Vocabulary lock** — `KNOWN_FEATURES` and `KNOWN_THEMES` are loaded from `ags_vocabulary.json` at startup. Any feature returned by the LLM that is not in `KNOWN_FEATURES` is rejected.
10. **Unknown-feature rejection** — After normalization, features not in the canonical 11 are silently dropped. This prevents LLM hallucination from leaking into output.
11. **SlotCatalog map validation** — `--validate` checks that every value in `_SLOTCATALOG_FEATURE_MAP` is either `None` or a member of `KNOWN_FEATURES`.
12. **Final-output-validation** — Immediately before writing `games_dashboard.json`, ALL records are scanned. Any feature not in `KNOWN_FEATURES` is stripped with a log message. Exists in BOTH sync and batch-poll paths (~line 2330 and ~line 2449).
13. **Definition card validation** — `--validate` (and every startup) checks that every feature in `ags_vocabulary.json` has a matching definition card (`FEATURE_NAME:`) in the normalize prompt. Also catches stale cards for removed features. Prevents adding a feature without teaching the LLM about it.
14. **Config-block by default** — Pipeline **refuses to run** if any config validation issue is detected. No `--strict-adapters` needed — blocking is the default. Use `--force` to override (not recommended). This prevents any agent from accidentally running with broken config.
15. **Preserve-on-failure** — If a game fails enrichment in the sync path, its **existing** dashboard record is preserved (not dropped). Prevents data loss from API flakes or transient errors.

**DUAL-PATH WARNING:** Gates 2-5 and 12 exist in TWO places: the sync path (`enrich_one_game()`, ~line 1710) and the batch-poll path (`main()` under `--batch-poll`, ~line 2210). If you modify post-processing in one path, you MUST apply the same change to the other. Always search for `# GATE:` to find both.

---

## Feature Definition Cards

Each of the 11 canonical features has a definition card in `_build_normalize_system_prompt()`:

```
FEATURE_NAME:
  IS: What this feature is (1-2 sentences)
  NOT: Common confusions / what to exclude
  YES: "raw text example" → conf:5
  NO: "raw text example" → null (why)
```

Key classification rules (learned from calibration):

- **Cash On Reels + H&S coexistence**: Cash-value symbols in BASE GAME that also trigger H&S → classify BOTH. Cash values ONLY within H&S round → only H&S.
- **"Win What You See" / Concatenation games**: Number-only steppers where amounts ARE the mechanic → NOT Cash On Reels.
- **Static Jackpot includes "linked progressive"**: Named-tier jackpots (Mini/Minor/Major/Grand) described as "progressive" → Static Jackpot.
- **Jackpots within Wheel**: Jackpots ONLY as wheel segments → Wheel, NOT Static Jackpot.
- **Hold and Spin**: Must have BOTH lock + respin. Vague "hold-style" language → null.
- **Respin**: Must be named, standalone mechanic. Minor side-effects → NOT Respin.
- **Persistence**: Must be truly permanent. Collection meters that reset → NOT Persistence.
- **Expanding Reels**: PowerXStream is NOT Expanding Reels.
- **Wild Reels**: Expanding wilds that cover a reel are NOT Wild Reels (they expand, they don't make the reel wild for all spins).
- xNudge Wild covering entire reel = BOTH Nudges AND Wild Reels.
- Stacked Wilds ≠ Wild Reels. Cascading ≠ Respin. Super Symbols ≠ Expanding Reels.
- Catalog "Progressive Jackpot" → Static Jackpot (deterministic mapping).

---

## Post-Processing Rules

Run AFTER LLM normalization, BEFORE writing output. Catalog-confirmed features bypass rules 2-4.

1. **Multiplier strip** (unconditional): Remove Multiplier from features.
2. **PXS → NOT ER**: All ER evidence is PowerXStream-only → strip ER. **Skipped if catalog confirms ER.**
3. **Expanding wilds → NOT WR**: All WR evidence is expanding-wilds-only → strip WR. **Skipped if catalog confirms WR.**
4. **Interactive → NOT COR**: All COR evidence is interactive mini-game → strip COR. **Skipped if catalog confirms COR.**

---

## Model Configuration

- **Extraction**: `claude-sonnet-4-20250514` (do NOT use `claude-sonnet-4-6` alias)
- **Normalization**: `claude-haiku-4-5`
- **Web search tool**: `web_search_20250305` (NOT `20260209`)
- **Batch API**: 50% discount on model tokens via `--batch-submit` / `--batch-poll`
- If changing models, test with a single game first, then full GT set.

---

## Cost

**Full run (643 games, Batch Sonnet)**: ~$45-50

- Web search: ~$16 (35%)
- Stage 1 Sonnet tokens (batch 50% off): ~$23 (50%)
- Stage 2 Haiku tokens (cached): ~$3 (7%)
- Re-runs for failed games: ~$3 (8%)

---

## Ground Truth & Accuracy

### GT structure
- **Total GT entries**: 173 (153 AGS + 20 non-AGS canary games)
- **Evaluable**: 137 (after excluding 23 `insufficient` + 8 `table_game` + 5 no-features)
- **Confidence thresholds**: Features >= 5 (strict), Themes >= 4 (lenient)
- **Programmatic gating**: enforced in code, not just prompt

### GT exclusion flags
- `insufficient` (23 games): No usable web data, not in master, or variant mismatch
- `table_game` (8 games): Blackjack/card games, not slots

### Non-AGS canary games (1 per blind-spot provider)

| Provider | Game | Source |
|----------|------|--------|
| White Hat Studios | Majestic Fury Megaways JRE | whitehatstudios.com |
| Playtech | Breaking Bad Collect Em And Link | goldennuggetcasino.com |
| NetEnt | Divine Fortune Megaways | game rules |
| Greentube | Diamond Cash Mighty Elephant | slotcatalog.com |
| Play'n GO | Buffalo Of Wealth | slot review site |
| Gaming Realms | Cash Eruption Slingo | game rules |
| Big Time Gaming | Extra Chilli Megaways | evolution.com |
| Reel Play | Hypernova Megaways | relax-gaming.com |
| Fortune Factory | Gold Blitz Fortunes | web search + SlotCatalog |
| Iron Dog Studio | Diamond Charge Hold And Win | game rules |
| Lightning Box | Money Link Great Immortals | slotcatalog.com |

### Current accuracy (F1=95.4%)

**Remaining 12 FPs** (10 games): Mostly borderline COR cases (6), Slingo+ER (2), plus 4 isolated edge cases.

**Remaining 26 FNs** (15 games): All data gaps — branded/exclusive games (BetMGM, FanDuel, Hard Rock) or features not listed in any source. 11 of 15 games have completeness ≤ 3.

---

## GT Corrections Log

**Round 1 (early calibration):** Blazin Bank Run +H&S, Dragon Diamond +SJ, Rakin Bacon +ER, Gold Blitz Fortunes expanded to 6 features.

**Round 2 (FP review with user, 23 items):** Majestic Fury MW JRE +Wheel/H&S, Meow Meow Madness +COR, Panda Blessings +COR, Cash Eruption Slingo +FS, 2x Spin Cycle +FS/SJ, Spin Bonanza +FS, Vegas Stacks +WR, Wolf Queen +ER, FanDuel Cash Haul +COR, Cluck Cluck Cash +Persistence.

**Round 3 (regression fix):** Cash Machine Jackpots +SJ, Shou Hu Shen +WR, Goddess Treasures +PB, Gold Blitz Fortunes +H&S.

**Round 4 (post-batch FP review):** Capital Gains/Cash Cow/Grand Royale/Mo Mummy/Royal Reels/Rakin' Bacon JBB/JBW +PB, Golden Money +SJ, Cash Eruption Slingo +COR, Rakin' Bacon Triple Oink +H&S.

**Round 5 (COR investigation):** River Dragons/Riches of the Nile/Blazin Bank Run/Hypernova MW/Luck and Luxury +COR (all confirmed via web search evidence).

**Round 6 (taxonomy correction):** Rakin Bacon -ER (PXS-only evidence, not true ER).

**Round 7 (audit-script FP sweep):** Capital Gains -PB, Blazin Bank Run -PB (both gate/selector, not Pick Bonus — vault triggers bonus-mode choice). Phoenix Fa -ER (PXS-only, no grid expansion). The Wild Life Extreme -WR (expanding wilds, not Wild Reels). Mega Fire Blaze Legacy Of The Tiger -WR (expanding tiger wilds, not Wild Reels). Added `pick-gate-strip` GATE rule to pipeline. Created `audit_features.py` for systematic FP detection.

---

## Taxonomy Changes

### Multiplier REMOVED (2025-03-15)

Multiplier was removed from the canonical feature list (user decision). Rationale: Multiplier is a modifier inside other features, not a standalone feature.

Applied to: vocabulary files, synonym mapping, definition cards, SlotCatalog map, post-processing strip, GT entries (102), dashboard entries (95), normalization prompt.

### Sidebets REMOVED (2026-02-25)

Sidebets was removed from the canonical feature list. Rationale: Sidebets is a table-game concept, not a slot feature.

Applied to: `ags_vocabulary.json` (removed from features list), `games_dashboard.json` (stripped from all game records). Canonical features reduced from 12 → 11.

---

## Card Fixes Log

**Round 1:** H&S +Jackpot Respins/Money Link aliases. Respin -Jackpot Respins. SJ +named tier variants.

**Round 2:** WR strengthened NOT (expanding wilds, collection-triggered). COR tightened (exclude coin collection, H&S-only). H&S clarified lock+respin+counter. PB excluded bonus selectors. Nudges required "nudge" name. ER excluded PXS.

**Round 3:** WR +NO for decorative gold backgrounds. COR rebalanced (cash symbols with values on reels = YES, even if feeding into bonuses). PB +jackpot-pick games. Nudges +more NO examples for "second chance" shifts.

---

## Batch Processing (COMPLETED)

All 643 games processed (2026-03-16).

**Bugs fixed during batch:**
1. **Dashboard overwrite**: batch-poll now merges, not overwrites.
2. **Missing catalog injection**: batch-poll now runs Stage 0 catalog fetch.
3. **Catalog bypass**: post-processing skips strip if catalog confirms the feature.

---

## Resilience Features

1. **API retry**: 3 retries on 429/529/500/502/503 with exponential backoff (30s, 60s, 90s)
2. **Catalog fallback**: If web search fails, catalog-only mode
3. **Quality retry**: If completeness < 3/5, re-runs web search
4. **Loop resilience**: Individual game failures don't crash the batch
5. **Checkpoint**: Progress saved per game, resume without `--fresh`

---

## How to Add a New Provider Catalog

1. Test if provider website serves static HTML:
   ```bash
   python3 -c "
   from enrich_websearch import _fetch_html, _html_to_text
   html = _fetch_html('https://www.PROVIDER.com/games/GAME-SLUG/')
   if html:
       text = _html_to_text(html)
       print(f'OK: {len(text)} chars')
       print(text[:300])
   else:
       print('FAILED — JS-rendered or blocked')
   "
   ```
2. If it works: add entry to `PROVIDER_CATALOG_CONFIG`, write `_extract_<key>(html)` function, register in `_EXTRACTORS`.
3. If blocked: SlotCatalog fallback handles it automatically.

---

## How to Add GT for a New Provider

1. Find the game on the provider's website or demo site
2. Record: themes, features (from our 11 canonical only)
3. Add to `ground_truth_ags.json`:
   ```json
   "Game Name": {
     "themes": ["Theme1", "Theme2"],
     "features": ["Feature1", "Feature2"],
     "provider": "Provider Name",
     "source": "where you verified"
   }
   ```
4. Run enrichment on the game and compare with `--verbose`

---

## Theme Consolidation

Raw themes (375 unique values) are mapped to **24 consolidated categories** via `theme_consolidation_map.json`.

The map is applied at DuckDB load time (`duckdb-client.js`) to populate the `theme_consolidated` column. The raw `theme_primary` is preserved.

**Categories**: Classic, Fruit, Animals, Adventure, Asian, Egyptian, Greek & Roman, Casino & Vegas, Fantasy & Magic, Nature, Food & Drink, Wealth & Gems, Seasonal & Holiday, Western, Fire & Elements, Ocean & Pirates, Horror & Dark, Sports & Vehicles, Cultural, Arcade, Entertainment, Space & Sci-Fi, Irish & Celtic, War & Military.

When adding a new theme to the pipeline output, you MUST also add it to `theme_consolidation_map.json`. Unmapped themes show as-is in the dashboard.

---

## Running Commands

```bash
# All commands from: game_analytics_export/data/

# Validate config
python3 enrich_websearch.py --validate

# Enrich specific games (sync) — ALWAYS use --strict-adapters --no-ddg
PYTHONUNBUFFERED=1 python3 enrich_websearch.py --ids "game-001-cash_eruption" --verbose --fresh --strict-adapters --no-ddg --delay 15

# Batch mode (50% cheaper) — ALWAYS use --strict-adapters --no-ddg
python3 enrich_websearch.py --batch-submit --ids "<comma-separated-ids>" --strict-adapters --no-ddg --fresh
python3 enrich_websearch.py --batch-poll <batch_id> --verbose --strict-adapters --no-ddg

# Full run
python3 enrich_websearch.py --all --batch-submit --strict-adapters --no-ddg

# Re-run only games missing features (zero cost for already-enriched games)
python3 enrich_websearch.py --all --skip-enriched --verbose --strict-adapters --no-ddg

# Run metrics
python3 -c "
import json, re
with open('ground_truth_ags.json') as f: gt = json.load(f)
with open('games_dashboard.json') as f: dash = json.load(f)
def norm(n): return re.sub(r'[^a-z0-9]', '', (n or '').lower())
dash_by_norm = {norm(g.get('name','')): g for g in dash}
tp = fp = fn = 0
for gname, gdata in gt.items():
    if gdata.get('data_status') in ('insufficient', 'table_game'): continue
    gt_feats = set(gdata.get('features', []))
    if not gt_feats: continue
    dg = dash_by_norm.get(norm(gname), {})
    pred = set(dg.get('features', []))
    tp += len(gt_feats & pred)
    fp += len(pred - gt_feats)
    fn += len(gt_feats - pred)
prec = tp/(tp+fp) if tp+fp else 0
rec = tp/(tp+fn) if tp+fn else 0
f1 = 2*prec*rec/(prec+rec) if prec+rec else 0
print(f'TP={tp} FP={fp} FN={fn}')
print(f'Precision={prec*100:.1f}% Recall={rec*100:.1f}% F1={f1*100:.1f}%')
print(f'F1 target: >=95%. Current: {f1*100:.1f}%')
"
```
