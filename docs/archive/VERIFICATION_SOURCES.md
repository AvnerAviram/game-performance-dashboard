# Verification Sources Status

## Current Implementation

### Source 1: CSV (Baseline)
- **What:** Performance data (theo_win, market_share_percent), release date, provider
- **Authority:** Regulated OGPD data - primary source of truth
- **Used for:** All games - required

### Source 2: SlotCatalog
- **What:** Game existence, specs (reels, rows, paylines, RTP, volatility), provider
- **Used for:** Verification (found = game exists) + data enrichment when available
- **Note:** SlotCatalog often returns null for specs - page structure varies

### Source 3: CSV_CORRECTIONS_LOG
- **What:** Pre-verified provider corrections with 2+ verification_sources
- **Used for:** Games where CSV provider is wrong (e.g. White Hat → Blueprint)
- **Counts as:** 2+ sources (each correction has URLs in verification_sources)

## Verification Logic

- **Relaxed (default):** CSV + SlotCatalog found = 2 sources ✓
- **Strict:** CSV + SlotCatalog provider match (requires non-null provider from SlotCatalog)
- **Corrected:** CSV_CORRECTIONS_LOG entry with 2+ sources = verified ✓

## Data We Preserve vs Enrich

| Field | Source | Enriched from SlotCatalog? |
|-------|--------|---------------------------|
| theme (primary, secondary, details) | games_master merge | No |
| mechanic (primary, features) | games_master merge | No |
| specs (reels, rows, paylines, rtp, volatility) | games_master merge | Yes, when null |
| provider | CSV or CSV_CORRECTIONS_LOG | Yes, when SlotCatalog returns it |
| performance | CSV | No (CSV is authoritative) |
| release | CSV | No |

## Gap: True 2-3 Independent Web Sources

The original plan called for:
- Provider site
- SlotCatalog  
- Casino operator or industry site

**Current:** We use CSV + SlotCatalog. CSV_CORRECTIONS_LOG provides 2+ sources for corrected games only.

**To add:** Would need scrapers for provider sites (e.g. IGT, Light & Wonder) or industry sites (AboutSlots, SlotBeats). Each requires custom selectors per site.

## Recommendation

- **For 500+ games now:** Use `--csv-only` (CSV authoritative) or run with web (CSV + SlotCatalog)
- **For stricter verification:** Add 2nd web source (e.g. AboutSlots API or provider site scraper)
- **Data completeness:** Theme/mechanic come from existing games_master merge. New games get minimal data; SlotCatalog enrichment fills specs when available.
