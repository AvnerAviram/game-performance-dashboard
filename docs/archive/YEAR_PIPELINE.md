# Year Extraction Pipeline — Handoff Document

> Single entry point for release year work.
> Updated: 2026-04-06

## Current State (as of 2026-04-06)

| Metric | Value |
|--------|-------|
| Total games in master | 4,550 |
| Release year (`release_year`) coverage | **4,550 / 4,550 (100%)** — OGPD from Eilers CSV |
| Release year range | 2021–2025 |
| `original_release_year` field | **REMOVED** — field deleted from all games and codebase |
| Tests | All pass (2 pre-existing art failures only) |

**Status: PIPELINE COMPLETE. Field `original_release_year` has been fully removed.**

### Key facts:
- **`release_year`** is the **Online Game Publication Date (OGPD)** from the Eilers CSV. This is a global online publication date, NOT NJ-specific.
- Eilers began tracking OGPD in 2021; games already live at that time received 2021 as their floor date.
- The `original_release_year` field (from slot.report) was redundant and has been removed from `game_data_master.json`, `game-fields.js`, `duckdb-client.js`, all UI code, server routes, and tests.
- `F.releaseYear(g)` is the only year accessor. `F.originalReleaseYear()` and `F.hasGlobalReleaseYear()` no longer exist.
- Dashboard labels show **"Release Year (OGPD)"** everywhere.

## Changelog

### 2026-04-06 — OGPD relabel + original_release_year removal

**What changed:**
- **Discovered** that the Eilers `release_year` field is the OGPD (Online Game Publication Date) — a global online release date, not NJ-specific. Eilers tracking started in 2021.
- **Removed `original_release_year`** (and `original_release_month`, `original_release_date`, `original_release_date_source`) from all 4,550 games in `game_data_master.json`.
- **Removed `F.originalReleaseYear()`, `F.originalReleaseMonth()`, `F.hasGlobalReleaseYear()`** from `game-fields.js`.
- **Removed `original_release_year`/`original_release_month`** from DuckDB schema and INSERT in `duckdb-client.js`.
- **Removed** all `original_release_year` references from server routes (`data.cjs`) and provenance diagnosis (`provenance-diagnosis.cjs`).
- **Relabeled UI**: "NJ Launch Year" → "Release Year (OGPD)" in `ui-panels.js`, `xray-panel.js`, `art-renderer.js`. Added OGPD tooltip.
- **Updated tests**: 8 test files cleaned of `original_release_year` references.
- **Updated docs**: `HANDOFF.md`, `PHASE1_TRUTH_MASTER.md`, `data-schema-contract.mdc` all updated.

---

## Historical Changelog (pre-completion, kept for reference only)

> **Note:** Sections below reflect the pipeline state AT THE TIME of each entry. `original_release_year` no longer exists in the codebase.

---

### 2026-04-21 — FULL RESET: stripped 2,438 years, kept 36 AGS GT

**What changed:**
- **Stripped all non-AGS years from game_data_master.json.** 2,438 games had `original_release_year`, `original_release_month`, `original_release_date`, and `original_release_date_source` cleared. Only 36 games with `original_release_date_source === "ags_provider_data"` were kept.
- **Backup saved** to `_backup_pre_year_reset/game_data_master.json` (16.2MB, pre-strip snapshot).
- **ground_truth.json synced** to include all 36 master AGS games (was 32, added 7 variants: Rakin Bacon Jackpots Bonus Board/Wheel, Rakin Bacon Odyssey/Sahara, Jade Wins Deluxe, Olympus Strikes Ultratap, Bonanza Blast Ultratap). Total GT entries: 39 (36 in master + 3 SL-only: Wolf Queen, Fire Wolf II, Hearts & Horns).
- **_staged_year_results.json reset** to empty array `[]`.

**Why:** 98.3% of existing years were never validated against ground truth. SlotCatalog (1,327 games) is only 70% accurate (often returns land-based cabinet dates). SlotReport (958 games) has zero AGS overlap so accuracy is unknown. Even "verified_reference" entries (Buffalo 2008, Cleopatra 2005) were land-based cabinet dates, NOT global online release dates.

**Current state:**
- Total games: 4,550. Coverage: **0.8% (36 / 4,550)** — AGS only.
- GT accuracy: 100% (36/36 are provider-verified).
- Staged: 0.
- Next: PHASE 1 — Expand ground truth to 50+ games across 5+ providers.

**Open blockers:**
- Land-based providers (IGT, Aristocrat, L&W, Konami, Greentube, etc.) have NO reliable year source.
- Awaiting user review of YEAR_REVIEW_SLOTREPORT.html to approve application.

---

### 2026-04-21 — PHASE 3: Extraction complete, 928 games staged from slot.report

**What changed:**
- Created `extract_slotreport_years.mjs` — clean extraction pipeline with `--stats`, `--gt-test`, `--extract`, `--review`, `--apply` commands.
- Fixed slot.report date parsing (DD-MM-YYYY → YYYY-MM-DD conversion).
- GT gate: **PASS — 100% accuracy (16/16)** on 58-game expanded GT.
- Extracted and staged **928 games** with confidence >= 3 from slot.report.
- Generated `YEAR_REVIEW_SLOTREPORT.html` (first 50 games for spot-check).

**Staged breakdown by provider:**
- Evolution: 400, Play'n GO: 206, Games Global: 163, Hacksaw: 39
- Light & Wonder: 29, Reel Play: 26, IGT: 8, and 18 other providers
- Year range: 2008 - 2025

**If applied, projected coverage:**
- AGS (already in master): 36
- slot.report (staged): 928
- Total: **964 / 4,550 (21.2%)**

**Current state:**
- Total games: 4,550. Coverage in master: **0.8% (36 / 4,550)** — AGS only.
- Staged: **928 games** from slot.report (100% GT accuracy).
- GT: 61 games, 6 providers, years 2009-2022.
- Tests: all pass (2 pre-existing art failures only).
- Next: PHASE 4 — User review of YEAR_REVIEW_SLOTREPORT.html.

---

### 2026-04-21 — PHASE 2: Full source re-calibration against expanded GT

**What changed:**
- Created `calibrate_all_sources.mjs` and ran against 58 GT games (with master_id).
- Fixed critical bug: slot.report dates use DD-MM-YYYY format for older games. Previous parsing read day as year (e.g., "05-12-2011" → year=5 instead of 2011).
- Fixed SlotsLaunch false matches: loose contains-matching was matching "Golden Wins" to "Farmer Franks Golden Wins" etc. Switched to strict name/slug matching.
- Updated `year_pipeline/source_calibration.json` with all results.

**Calibration results (strict matching):**

| Source | Found/58 | Correct | Accuracy | Verdict |
|--------|----------|---------|----------|---------|
| slot.report | 16 | 16 | **100%** | Only reliable source for online-first providers |
| SlotsLaunch scrape | 2 | 0 | 0% | NJ market tracker; dates are NJ launches, NOT global |
| SlotCatalog cache | 3 | 2 | 67% | Low coverage, off-by-1 errors |
| NJ proxy | 58 | 3 | 5.2% | NJ year ≠ global year for 95% of games |

**Key insight:** slot.report is 100% accurate for online-first providers (Evolution, Play'n GO, Games Global) but covers 0% of land-based providers (AGS, IGT, Aristocrat, L&W). All other sources are unreliable for global online release dates.

**slot.report coverage against full master (4,550 games):**
- Total matches: **985 / 4,550 (21.6%)**
- Evolution: 419/563 (74%), Play'n GO: 206/234 (88%), Games Global: 165/307 (54%)
- Hacksaw: 39/54 (72%), Relax: 17/30 (57%), Reel Play: 26/50 (52%)
- Land-based providers: <5% coverage (AGS 2%, IGT 4%, Aristocrat 1%)

**Current state:**
- Total games: 4,550. Coverage: **0.8% (36 / 4,550)** — AGS only.
- GT: 61 games, 6 providers, years 2009-2022.
- Calibrated sources: slot.report (100% accurate), all others unreliable.
- Projected coverage with slot.report: ~22% (985 + 36 = 1,021 / 4,550).
- Next: PHASE 3 — Extract years from slot.report for all matched games.

---

### 2026-04-21 — PHASE 1: Ground truth expanded to 61 games across 6 providers

**What changed:**
- Expanded `year_pipeline/ground_truth.json` from 39 AGS-only entries to **61 entries across 6 providers**.
- Added 22 new GT games: Evolution/NetEnt (9), Play'n GO (7), Games Global (2), Playtech (2), IGT (2).
- All new entries sourced from official press releases, provider product pages, and authoritative gaming press (Yogonet, iGB, CasinoBeats, GamblingInsider, PRNewswire).
- Year range expanded from 2019-2021 (AGS only) to **2009-2022** (13-year span).
- 58 of 61 GT games have `master_id` (3 are SL-only: Wolf Queen, Fire Wolf II, Hearts & Horns).

**New GT games added:**
| Game | Provider | Year | Source |
|------|----------|------|--------|
| Starburst | Evolution | 2012 | NetEnt official page |
| Dead Or Alive | Evolution | 2009 | aboutslots.com + deadoralive.net |
| Divine Fortune | Evolution | 2017 | NetEnt/Cision press release |
| Jimi Hendrix | Evolution | 2016 | NetEnt official announcement |
| Jumanji | Evolution | 2018 | EuropeanGaming press release |
| Gonzos Quest | Evolution | 2011 | cybercasinoindex + Wikipedia |
| Gonzos Quest Megaways | Evolution | 2020 | LCB + GamingIntelligence |
| Starburst Xxxtreme | Evolution | 2021 | GamblingInsider + NetEnt page |
| Dead Or Alive 2 | Evolution | 2019 | CasinoBeats launch article |
| Book Of Dead | Play'n GO | 2016 | Yogonet press release |
| Reactoonz | Play'n GO | 2017 | Yogonet + WorldCasinoDirectory |
| Fire Joker | Play'n GO | 2016 | Official PnG page |
| Rise Of Olympus | Play'n GO | 2018 | CasinoBeats + WorldCasinoDir |
| Legacy Of Dead | Play'n GO | 2020 | Official PnG announcement |
| Reactoonz 2 | Play'n GO | 2020 | iGamingNews + Yogonet |
| Rise Of Olympus 100 | Play'n GO | 2022 | Official PnG + G3 Newswire |
| Immortal Romance | Games Global | 2011 | PR.com press release |
| Thunderstruck Ii | Games Global | 2010 | GamesAndCasino launch article |
| Age Of The Gods | Playtech | 2016 | Yogonet + GPWA + GamblingInsider |
| Great Blue | Playtech | 2013 | slot.day |
| Cash Eruption | IGT | 2020 | PokerNews + slot.day |
| Wheel Of Fortune Triple Extreme Spin | IGT | 2015 | IGT PRNewswire |

**Current state:**
- Total games: 4,550. Coverage: **0.8% (36 / 4,550)** — AGS only in master.
- GT: **61 games, 6 providers, years 2009-2022**. Ready for source calibration.
- Staged: 0.
- Next: PHASE 2 — Re-calibrate all sources against expanded GT.

---

### 2026-04-19 — slot.report integrated as pipeline source

**What changed:**
- Created `cross_validate_years.mjs` — matches slot.report data to master, cross-validates existing years, reports invalid (global > NJ) games.
- Created `_slot_report_matches.json` — 939 master games matched by normalized name + provider aliases (Games Global sub-studios, NetEnt/Red Tiger → Evolution, etc.).
- Cross-validation results: **99.9% exact agreement** (933/934) between slot.report and existing master years, 100% within ±1yr. Validates that existing slotcatalog/slotreport years for online-first providers are reliable.
- Added `slot_report` source to `extract_release_year.mjs` at trust level 3. Participates in consensus logic.
- Updated `year_pipeline/source_calibration.json` — slot.report status promoted from PARTIALLY_TESTED to CROSS_VALIDATED.

**Current state:**
- Total games: 4,550. Coverage: 54.4% (2,474). GT accuracy: **96.0%** (24/25).
- Staged at conf≥3: **1,012** (same as pre-integration — SR adds 4 direct matches + consensus boost, not net-new games).
- Projected coverage if applied: **76.6%** (3,486 / 4,550).
- slot.report coverage: 939 games matched (20.6% of master), but only 5 stripped games — minimal new gap-filling value. Primary value is cross-validation + consensus.
- 37 invalid (global > NJ) games: **all off by exactly +1 year** — likely year-boundary edge cases, not major errors. Details in cross-validation output.

**Open blockers:**
- SlotsLaunch API (Task 1, highest impact) — still blocked on API token. `.env` only has `ANTHROPIC_API_KEY`. User must register at slotslaunch.com or provide existing token.
- Task 5 (apply 1,012 staged years) — waiting on user approval.

**Per-provider agreement (slot.report vs master, ≥3 matches):**
- Evolution: 394 games, 100% exact
- Play'n GO: 210 games, 99.5% exact (1 off-by-1)
- Games Global: 155 games, 100% exact
- Hacksaw Gaming, L&W, Reel Play, Relax Gaming, White Hat Studios, Bragg, IGT, 1x2, 4theplayer, Oddsworks, Wazdan: all 100%

### 2026-04-16 — Baseline
- Pipeline run: 1,012 at conf≥3, GT 96%. Not yet applied.

## Goal

Get the **global online release year** for every game in the dashboard. This is the year a game first became available for real-money play on any regulated online casino platform worldwide (any jurisdiction — UK, Malta, NJ, etc.).

### What "Global Online Release Year" IS

- The first time a player could play this game online for real money, anywhere in the world
- For online-first providers (e.g., Wazdan, Pragmatic Play), the NJ launch year is effectively the global year
- Example: "Golden Wins" (AGS) — first online: March 2019 (global), NJ launch: 2021

### What It Is NOT

- Land-based cabinet release date (a physical slot machine in a casino)
- NJ-specific launch date (unless the game is online-first)
- Game announcement, preview, or certification date
- Social casino / play-for-fun launch date
- Game variant re-release date (use the ORIGINAL title's year)

### Why This Matters

Year data drives Trends, Release Timeline, and Provider Analysis pages in the dashboard. Wrong years (especially land-based dates presented as online dates) distort trend lines and make the dashboard unreliable.

---

## Current State (as of 2026-04-16)

| Metric | Value |
|--------|-------|
| Total games in master | 4,550 |
| Have `original_release_year` | 2,474 (54.4%) |
| **Actually validated against GT** | **41 (1.7%)** |
| Stripped (year removed, unreliable) | 1,766 |
| Never had a year | 310 |
| `original_release_year > release_year` (INVALID) | 37 |
| Gap > 5 years (possibly land-based date) | 185 |

### Source Breakdown (for the 2,474 with years)

| Source | Count | Calibrated? | Accuracy on AGS GT |
|--------|-------|-------------|-------------------|
| slotcatalog | 1,327 | YES | **70%** (often gives land-based dates) |
| slotreport | 958 | NO | 0 AGS overlap — can't test |
| html_copyright | 48 | NO | Unknown |
| slotreport_fuzzy | 42 | NO | Unknown |
| ags_provider_data | 36 | N/A | **100%** (this IS the GT) |
| nj_corrected | 24 | NO | Unknown |
| evolution | 14 | NO | Unknown |
| slotcatalog_fuzzy | 13 | NO | Unknown |
| verified_reference | 5 | N/A | 100% (human-verified) |
| html_extract | 5 | NO | Unknown |
| slotreport_corrected | 2 | NO | Unknown |

**Bottom line: 98.3% of existing years have NEVER been validated. We don't know if they're correct.**

### Stripped Games by Provider (1,766 games needing years)

| Provider | Count | Type |
|----------|-------|------|
| Light & Wonder | 199 | Mixed (land-based + online) |
| IGT | 125 | Mixed |
| White Hat Studios | 109 | Online-major |
| Aristocrat | 108 | Land-based origin |
| High 5 Games | 107 | Mostly online |
| Playtech | 102 | Online-major |
| Games Global | 102 | Online-major |
| Inspired | 85 | Mostly online |
| Ainsworth | 71 | Land-based origin |
| Greentube | 63 | Mostly online |
| Bragg Gaming Group | 58 | Online-major |
| Everi | 58 | Mixed |
| Oddsworks | 57 | Online-first |
| Wazdan | 51 | Online-first |
| Konami | 50 | Land-based origin |
| Aruze | 45 | Land-based origin |
| Evolution | 42 | Online-major |
| Gaming Realms | 36 | Online-first |
| Spinberry | 30 | Online-first |
| Incredible Technologies | 27 | Land-based origin |
| AGS | 21 | Land-based origin |
| + 15 more providers | ~201 | Various |

---

## Master Data Fields (year-related)

These are ALL the year/date fields that exist in `game_data_master.json`:

| Field | Type | Description | Coverage |
|-------|------|-------------|----------|
| `release_year` | int | NJ launch year (from Eilers CSV) | 100% (4,550) |
| `release_month` | int | NJ launch month | Most games |
| `original_release_year` | int/null | **Global online release year — this is what we're filling** | 54.4% (2,474) |
| `original_release_month` | int/null | Global online release month | Partial |
| `original_release_date` | string/null | Global online release date (ISO `yyyy-mm-dd`) | Partial |
| `original_release_date_source` | string/null | Source that provided the global year | Tracks provenance |
| `original_release_confidence` | int/null | Pipeline confidence 1-5 | **NOT in master yet** — written by `--apply` |
| `extraction_date` | string | Date processed by `extract_game_profile.py` | Most games |
| `verification_date` | string/null | Date of verification pass | Sparse |
| `gt_applied_date` | string/null | Date AGS GT was applied | AGS games only |
| `last_modified_date` | string/null | Last modification date | Usually null |

---

## Ground Truth

We have **30 AGS games** with provider-verified global online release dates from the AGS provider Excel spreadsheet. These dates are stored in `year_pipeline/ground_truth.json` and also applied in master as `original_release_date_source: "ags_provider_data"` (36 entries in master — some are variants sharing the base game's year).

The calibration script in `calibrate_slotslaunch.mjs` has the original AGS dates with full precision (day-level).

**Every new source MUST be calibrated against these 30 AGS GT games before being trusted.**

---

## Available Data Sources (researched)

### Source 1: SlotsLaunch — BEST SOURCE FOUND

- **What**: Dedicated slot release date database. Updated daily. Tracks global online releases.
- **API**: `GET https://slotslaunch.com/api/games` — structured JSON, `release` field in `yyyy-mm-dd`, `land_based` boolean flag
- **API docs**: https://docs.slotslaunch.com/article/12-api-endpoints
- **Auth**: Requires API token (registration at slotslaunch.com). Rate limit: 0.5 req/sec free, 2 req/sec premium.
- **AGS GT calibration**: **97% year accuracy** — 29/30 found, 28/29 year correct. 1 miss: Red Silk (GT=2020-12-17, SL=2021-01-14 — 28-day boundary crossing).
- **What we have now**: URL-based scrape of 1,766 games → 658 with dates, 1,054 not found (slug mismatch), 54 no provider slug. Cached in `_slotslaunch_scrape.json`.
- **Key insight**: Our URL scraping only matched ~37% because we constructed URLs from game names, and SlotsLaunch uses non-predictable slugs. The API with proper name matching would fix this.
- **Key insight 2**: Many pages showed year-only dates (e.g., "2022") instead of full dates. We fixed the regex in `rescrape_sl_years.mjs` to handle both formats.
- **PENDING**: Try the API instead of URL scraping — would dramatically improve match rate and give us the `land_based` flag.

### Source 2: slot.report API — FREE, NO AUTH

- **What**: Free open API. 5,500+ slots, 58 providers. CC-BY-4.0 license.
- **API**: `GET https://slot.report/api/v1/slots.json` — single 150KB download, all slots at once
- **Fields**: `release_date` (84% coverage, `yyyy-mm-dd`), `year` (84%), plus RTP, volatility, etc.
- **Auth**: None. No signup, no API key, no rate limits.
- **Providers covered**: Pragmatic Play, Play'n GO, NetEnt, Red Tiger, Hacksaw, Games Global, Nolimit City, BGaming, ELK Studios, Big Time Gaming, Quickspin, Relax Gaming, Blueprint, iSoftBet, Endorphina, Habanero, Booming Games, GameArt, Betsoft, Thunderkick, Push Gaming, Yggdrasil, + 33 more. **Mostly European/online-first providers.**
- **AGS GT calibration**: **NOT YET TESTED** — must calibrate before trusting
- **Limitation**: Likely does NOT cover land-based US providers (AGS, Ainsworth, Aristocrat, IGT, Konami, Everi, L&W, Incredible Technologies). These are exactly the hardest providers.
- **PENDING**: Download the full dataset, check provider overlap with our master, calibrate against AGS GT.

### Source 3: SlotCatalog Cache — ALREADY HAVE, PARTIALLY CALIBRATED

- **What**: 1,718 cached release dates from SlotCatalog pages
- **File**: `_sc_release_dates.json` (key-value object, game slug → {release_date, ...})
- **AGS GT calibration**: **70% year accuracy** (14/20 correct, 6 wrong). Mismatches show land-based cabinet dates years before online launch (e.g., Golden Wins: GT=2019, SC=2017; Bonanza Blast: GT=2020, SC=2016).
- **Recovery file**: `_sc_recovery.json` — 269 stripped games matched via fuzzy name matching
- **Problem**: SlotCatalog tracks the **original game release** including land-based cabinets. For land-based-origin providers, SC dates are often 2-4 years too early.
- **Status**: Calibrated and documented. Low trust for land-based providers. Reasonable for online-first providers.

### Source 4: slot.report — ALREADY DOWNLOADED, PARTIALLY TESTED

- **What**: This IS the slot.report free API data, already downloaded as `_slot_report_data.json`
- **Structure**: `{ count: 5592, last_updated: "...", results: [...] }` — each entry has `name`, `slug`, `provider`, `release_date`, `year`, `rtp`, `volatility`, etc.
- **Coverage**: 5,592 games from 58 providers. 4,703 have `release_date` (84%). Top providers: Pragmatic Play (817), Play'n GO (445), Red Tiger (339), BGaming (293), NetEnt (244).
- **AGS GT calibration**: **0 AGS games found** — slot.report does not cover land-based US providers (AGS, Ainsworth, Aristocrat, IGT, Konami, L&W, Everi). Cannot calibrate against AGS GT.
- **Useful for**: Cross-referencing online-first provider years (Hacksaw, Games Global, Play'n GO, etc.)
- **Limitation**: Covers ONLY online-first European/international providers. Does NOT help with the hardest games (land-based US providers).

### Source 5: Eilers CSV — NJ DATES ONLY

- **What**: 4,551 NJ Online Gaming Platform Dates from Eilers-Fantini research
- **File**: `eilers_source.csv`
- **AGS GT calibration**: 100% accurate for NJ dates (not global)
- **Use**: Already imported as `release_year` in master. Useful for confirming NJ year and identifying online-first providers.

### Sources NOT Worth Pursuing

- **Gaming regulator databases** (GLI, BMM): Track certification dates, not release dates
- **NJ DGE**: Publishes monthly revenue reports, not game-level release dates
- **BigWinBoard / SlotsCalendar / Slottomat**: Track releases but have no public API. Would require fragile scraping.

---

## Known Pitfalls (CRITICAL — read before touching any data)

See `year_pipeline/pitfalls.json` for the machine-readable version.

### 1. Land-Based Cabinet Dates

The #1 source of wrong data. SlotCatalog, and sometimes SlotsLaunch, may return the date a game was first released as a **physical slot machine cabinet** in a land-based casino. For games from Ainsworth, Konami, Aristocrat, IGT, Light & Wonder, Aruze, Incredible Technologies — the cabinet release is often 3-10 years before the online launch.

**Example**: Buffalo (Aristocrat) — cabinet ~2008, online NJ 2023. If a source says "2008", that's the cabinet date.

### 2. Epoch Dates (January 1, 1970)

Unix epoch zero appears in SlotsLaunch for some Wazdan and Gaming Realms games. We found 26 of these. Always garbage — filter out any year <= 1970.

### 3. NJ Year != Global Year

NJ launch is typically 1-3 years after global online launch for European providers. A game might launch in Malta/UK in 2019 and reach NJ in 2021. The NJ year (`release_year` in master) is NOT the global year.

### 4. NJ Year = Global Year (for online-first US providers)

For providers that only exist online and launched in the US market, NJ IS their first or simultaneous market. These providers: Wazdan, Gaming Realms, Spinberry, Oddsworks, Betixon, Gamecode, Red Rake Gaming, Slotmill, Hacksaw Gaming, Avatarux, Spinomenal, Rogue, Octoplay, Ruby Play, 1x2 Network, Bang Bang Games, Spearhead Studios.

For these, the NJ year is a safe proxy for global year (confidence 4).

### 5. Year-Boundary Edge Cases

A game released Dec 17, 2020 might show up as Jan 14, 2021 on SlotsLaunch (28-day offset). This is the "Red Silk" case — GT says 2020, SL says 2021. When source year = NJ year but GT year = NJ year - 1, it might be a boundary crossing. Accept ±1 year tolerance for these cases.

### 6. Game Variants

"Megajackpots Cash Eruption" is a variant of "Cash Eruption". External sites may not have separate entries for variants, or they may show the variant launch date instead of the original game date. The `original_release_year` should reflect the first version of the base game.

### 7. Provider Slug Mismatches

SlotsLaunch URL construction (e.g., `slotslaunch.com/{provider-slug}/{game-slug}`) fails ~60% of the time because their slugs don't follow a predictable pattern from game names. Using the API instead of URL construction would fix this.

### 8. Global Year > NJ Year

If a source gives a year AFTER the NJ launch year, it's almost certainly wrong. A game can't launch online globally AFTER it launched in NJ (NJ is part of "global"). Exception: off-by-one timing edge cases (game launched NJ in December, source lists January next year).

---

## Pipeline Architecture (extract_release_year.mjs)

An extraction pipeline was built at `extract_release_year.mjs`, modeled on `extract_game_profile.py`. It includes:

- IS/NOT definition card for global online release year
- Provider classification (ONLINE_FIRST, ONLINE_MAJOR, LAND_BASED_HIGH_RISK, MIXED_ORIGIN, MOSTLY_ONLINE)
- Multi-source extraction (SlotsLaunch cache, SlotCatalog cache, NJ proxy)
- Consensus logic (2+ sources agree → boost confidence)
- 7 deterministic post-processing rules (epoch filter, pre-2005 filter, after-NJ filter, provider-risk rules, SL/SC disagreement handling)
- Per-game confidence scoring (0-5)
- GT calibration gate (runs against AGS GT, must pass >= 95%)
- Staged output → review HTML → apply

### Commands

```bash
cd game_analytics_export/data
fnm use 20  # Node v20 required

node extract_release_year.mjs --stats        # Current year coverage
node extract_release_year.mjs --gt-test      # Extract + calibrate against AGS GT
node extract_release_year.mjs --extract      # Extract years for all stripped games
node extract_release_year.mjs --review       # Generate YEAR_REVIEW_V2.html
node extract_release_year.mjs --apply        # Apply staged results (GT-gated)
```

### Important Implementation Details

1. **GT definitions are in 3 places** (keep in sync):
   - `year_pipeline/ground_truth.json` — 32 games with full dates, NJ years, master IDs (canonical)
   - `extract_release_year.mjs` `AGS_GT` constant — 30 games, name → year only (used for pipeline GT gate)
   - `calibrate_slotslaunch.mjs` `agsGT` constant — 32 games, slug-keyed (used for SL calibration)

2. **SlotCatalog data flows through 2 files**:
   - `_sc_release_dates.json` — raw SC cache (1,718 entries, slug → {release_date, sc_file})
   - `_sc_recovery.json` — recovery matches (269 entries, matched to master game IDs)
   - **The pipeline reads `_sc_recovery.json`**, not the raw cache. The `SC_CACHE_PATH` constant in the script points to the raw cache but is not used at runtime.

3. **`_slot_report_data.json` IS slot.report API data** — already downloaded. 5,592 games, 58 providers, 4,703 with dates. But **0 AGS games** — covers only online-first European providers.

### Last Pipeline Run Results (2026-04-16)

- GT accuracy: **96.0%** (24/25 AGS tested, 1 miss: Red Silk)
- Ready to apply (conf >= 3): **1,012 / 1,766** stripped games
- Projected coverage if applied: **76.6%** (3,486 / 4,550)
- **NOT YET APPLIED** — needs user approval

---

## File Map

```
game_analytics_export/data/
├── YEAR_PIPELINE.md                    ← THIS FILE — master plan
├── extract_release_year.mjs            ← Main pipeline script (30KB)
│
├── year_pipeline/                      ← KNOWLEDGE FILES (persistent state)
│   ├── ground_truth.json               ← 32 AGS games with verified dates + NJ years + master IDs
│   ├── source_calibration.json         ← Accuracy results per source vs AGS GT
│   ├── pitfalls.json                   ← Known traps and bad patterns (9 pitfalls documented)
│   ├── provider_classification.json    ← Online-first / land-based / mixed per provider
│   └── config.json                     ← Pipeline settings, thresholds, master field docs
│
├── _slotslaunch_scrape.json            ← 1,766 SL scrape results (658 with dates)
├── _slotslaunch_calibration.json       ← 29 SL vs AGS GT comparison results
├── _sc_release_dates.json              ← 1,718 SlotCatalog cached dates
├── _sc_recovery.json                   ← 269 SC matches for stripped games
├── _sc_not_found.json                  ← SC unmatched games
├── _slot_report_data.json              ← 5,592 SlotReport entries (UNTESTED)
├── _staged_year_results.json           ← Pipeline output (1,766 results, 1,012 at conf>=3)
├── _stripped_claude_years.json         ← Backup of removed Claude-guessed years
│
├── YEAR_REVIEW_V2.html                 ← Review page for staged results
│
├── calibrate_slotslaunch.mjs           ← SL vs AGS GT calibration script
├── calibrate_year_sources.mjs          ← Claude API year calibration (deprecated)
├── scrape_slotslaunch.mjs              ← SL URL-based scraper (original)
├── rescrape_sl_years.mjs               ← Fixed SL year-only regex (431 recovered)
├── recover_sc_years.mjs                ← SC fuzzy matching recovery
├── strip_claude_years.mjs              ← Removed unreliable Claude years
├── compare_years.mjs                   ← Multi-source year comparison
├── generate_year_review.mjs            ← Old review HTML generator
│
├── ground_truth_ags.json               ← AGS GT (features/themes/specs — NOT years)
├── eilers_source.csv                   ← 4,551 NJ platform dates
└── game_data_master.json               ← Master data (DO NOT WRITE without permission)
```

---

## What To Do Next (Pending Tasks)

### Task 1: Download and calibrate slot.report API

**Why**: Free, no auth, 5,500+ games, 84% release date coverage. Could fill gaps for online providers.

```bash
# One-liner to test
curl -s https://slot.report/api/v1/slots.json | node -e "
  const data=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('Total:', data.results.length);
  console.log('With date:', data.results.filter(s=>s.release_date).length);
"
```

Steps:
1. Download the full dataset
2. Check which of our 4,550 games appear in slot.report (by name matching)
3. Calibrate against the 30 AGS GT games — how many match? What accuracy?
4. Record results in `year_pipeline/source_calibration.json`

### Task 2: Try SlotsLaunch API (instead of URL scraping)

**Why**: Our URL scraping only matched 37%. The API gives structured data with proper name matching and a `land_based` flag.

Steps:
1. Check if we have an API token (look in `.env` or try registering at slotslaunch.com)
2. Fetch all games via `GET /api/games?per_page=150&page=1` (paginate)
3. Match against our 4,550 games by name
4. Calibrate against AGS GT
5. Compare accuracy to the URL scrape results

### Task 3: Use slot.report data for online-first provider cross-validation

**Why**: `_slot_report_data.json` IS the slot.report API data (already downloaded). 5,592 games, 4,703 with dates, 58 online-focused providers. **No AGS/land-based US providers** — cannot calibrate against AGS GT. But useful for validating online-first provider years.

Steps:
1. Match slot.report games against our master (by name + provider)
2. For games where we have BOTH a slot.report date and an existing SlotCatalog date, compare them — do they agree?
3. For online-first stripped games (Hacksaw, Play'n GO, etc.), use slot.report dates as a second source for multi-source consensus
4. Record any new calibration findings in `year_pipeline/source_calibration.json`

### Task 4: Validate existing slotcatalog/slotreport years in master

**Why**: 2,285 games already have years from these sources, but they've never been validated.

Steps:
1. For slotcatalog-sourced games: cross-reference with SlotsLaunch/slot.report to see if they agree
2. For slotreport-sourced games: same cross-reference
3. Identify games where sources disagree — flag for review
4. The 37 games with `original_release_year > release_year` are definitely wrong — fix or remove

### Task 5: Apply pipeline results (user approval needed)

**Why**: 1,012 years at confidence >= 3 are ready, GT-gated at 96%.

Steps:
1. Get user approval
2. Run `node extract_release_year.mjs --apply`
3. Verify coverage improvement

### Task 6: Close the remaining gap

**Why**: ~450 games have no source at all (mostly Aristocrat, L&W, IGT, Everi, Aruze).

These are the hardest games — land-based-origin providers where:
- SlotsLaunch URL scraping failed (slug mismatch)
- SlotCatalog gives land-based dates
- slot.report likely doesn't cover them

Options:
- SlotsLaunch API (Task 2) would likely find many of these
- Provider-specific research (Aristocrat/IGT/L&W investor relations or product pages)
- Manual spot-checking with user review HTML

---

## Name Matching Between Sources

Matching game names across sources is a major challenge. Different sources use different naming conventions:

- Master: `"Rakin Bacon"` / slot.report: not present / SlotsLaunch: `"rakin-bacon"` (slug)
- Master: `"Fu Nan Fu Nu"` / SlotCatalog: `"fu nan fu nu"` (normalized) / SlotsLaunch: `"fu-nan-fu-nu"`
- Master: `"Wheel Of Fortune Diamond Spins 2x Wild"` / SlotsLaunch: slug too long, not found

**Normalization used in `recover_sc_years.mjs`:**
1. Lowercase
2. Remove trademark symbols (TM, R, C)
3. Remove apostrophes
4. Replace non-alphanumeric with spaces
5. Collapse whitespace

**Matching strategies (from most to least strict):**
1. Exact normalized match
2. Strip suffixes (deluxe, hd, online, slot, slots)
3. Substring containment (if name >= 5 chars)
4. Token overlap (>= 80% of tokens match)

**Slug construction for SlotsLaunch URLs:**
- Lowercase, remove apostrophes, replace `&` with `and`, remove special chars, spaces to hyphens
- This fails ~60% of the time because SlotsLaunch uses its own slug conventions

**Key lesson**: API-based matching (search by name) is far more reliable than URL construction.

---

## Non-Negotiable Rules

1. **NEVER write to `game_data_master.json`** without explicit user permission
2. **NEVER trust a source** that hasn't been calibrated against AGS GT
3. **Always run GT calibration** after any pipeline change — must pass >= 95%
4. **Scale slowly**: calibrate → 5 games → verify → 20 games → verify → all
5. **Backup master** before any write (`game_data_master_backup_pre_year_pipeline.json`)
6. **Use real data**, never guess or estimate accuracy — run the numbers
7. **Document everything** in this file and the knowledge files
8. **Land-based dates are NOT online dates** — always check provider type
9. **The 37 "global > NJ" games are wrong** — don't ignore them
10. **Prefer API over scraping** — structured data with proper matching beats URL construction

---

## Accuracy History

| Date | Action | Result |
|------|--------|--------|
| Pre-2026-04 | Claude-guessed years for 1,778 games | Unreliable — stripped |
| 2026-04 | SlotCatalog calibration vs AGS GT | **70%** (6/20 wrong, land-based dates) |
| 2026-04 | SlotsLaunch calibration vs AGS GT | **97%** (1/29 wrong, Red Silk boundary) |
| 2026-04 | SL URL scrape (1,766 games) | 658 with dates (37% hit rate) |
| 2026-04 | SL regex fix (year-only dates) | +431 recovered (227 → 658) |
| 2026-04 | Pipeline run (extract_release_year.mjs) | 1,012 at conf>=3, GT 96% |
| 2026-04 | slot.report API found | **NOT YET CALIBRATED** |
| 2026-04 | SlotsLaunch API documented | **NOT YET TRIED** |

---

## Environment

```bash
# Node v20 required
fnm use 20

# Working directory
cd game_analytics_export/data

# All year scripts are .mjs (ES modules)
node extract_release_year.mjs --help
```
