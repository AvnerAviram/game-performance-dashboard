#!/usr/bin/env python3
"""
enrich_websearch.py — Game enrichment via Claude Web Search (3-stage pipeline).

Architecture (based on "Taxonomy Trap" research + Anthropic best practices):

  Stage 0 (CATALOG FETCH): Direct HTTP fetch of provider product pages.
  No LLM calls — pure HTML parsing. $0 cost per game.
  Currently supports: AGS, Red Tiger, Hacksaw Gaming, Konami, Nolimit City,
  Aristocrat, Light & Wonder, Everi, Inspired Gaming (~147/520 games = 28%).
  Falls back gracefully on 404/unreachable.

  Stage 1 (EXTRACT): Claude searches the web with its built-in web_search tool
  and describes game features/themes/specs in free-form natural language.
  No vocabulary constraint — Claude observes and reports what it finds.
  Catalog data from Stage 0 is merged into raw extraction.

  Stage 2 (NORMALIZE): A fast LLM call maps the free-form descriptions to our
  canonical taxonomy using FEATURE DEFINITION CARDS (IS/NOT/YES/NO per feature)
  and CONFIDENCE GATING (features >= 5, themes >= 4). No hardcoded rules.

  Post-processing: synonym-based safety net only.

Key design choices (research-backed):
  - Examples > instructions for classification (PIAST 2026)
  - Negative examples reduce false positives (multiple 2025 papers)
  - Confidence scoring triggers self-verification (CISC / CSFT papers)
  - "Allow model to say no" reduces hallucination (Anthropic docs)
  - CoT actually HURTS classification by 7% — keep prompts direct (Jan 2026)

Adding a new provider to Stage 0:
  1. Find the provider's product page URL pattern (e.g., provider.com/games/{slug}/)
  2. Verify it returns server-rendered HTML (not JS-only) via urllib
  3. Add entry to PROVIDER_CATALOG_CONFIG with provider names + URL + extractor
  4. Write an _extract_<name>(html) function that parses the HTML for features/themes
  5. Register the extractor in _EXTRACTORS dict
  6. Test with: python3 -c "from enrich_websearch import fetch_provider_catalog; ..."

  Providers tested but NOT supported (JS-rendered or blocked):
  - IGT (46 games): JS-rendered, 404 on server-side fetch
  - White Hat Studios (27): no game-specific pages
  - Blueprint Gaming (17): returns 403 (blocks bots)
  - Playtech (16): B2B only, no consumer catalog
  - NetEnt (16): no individual game pages
  - Greentube (13): JS-rendered catalog pages
  - Big Time Gaming (8): Squarespace (JS-rendered)
  - Lightning Box, Gaming Realms, Reel Play: blocked

Data files (in same directory):
  - games_master.json        : Source of all game records
  - ground_truth_ags.json    : Ground truth for accuracy comparison
  - ags_vocabulary.json      : Known themes/features lists
  - synonym_mapping.json     : Alias → canonical name mappings

Models:
  - claude-sonnet-4-20250514 : Stage 1 (web search) — do NOT use alias "claude-sonnet-4-6" (529 errors)
  - claude-haiku-4-5   : Stage 2 (normalization) — fast, cheap, sufficient

Usage:
    python3 enrich_websearch.py --ids game-009-capital_gains --verbose
    python3 enrich_websearch.py --pilot 10 --verbose
    python3 enrich_websearch.py --provider AGS --verbose
    python3 enrich_websearch.py --all
"""

import argparse
import json
import os
import re
import sys
import time
import traceback
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import anthropic

# ---------------------------------------------------------------------------
# PATHS
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
MASTER_PATH = SCRIPT_DIR / "games_master.json"
DASHBOARD_PATH = SCRIPT_DIR / "games_dashboard.json"
META_PATH = SCRIPT_DIR / "games_dashboard_meta.json"
CHECKPOINT_PATH = SCRIPT_DIR / "enrichment_checkpoint.json"
GROUND_TRUTH_PATH = SCRIPT_DIR / "ground_truth_ags.json"
VOCABULARY_PATH = SCRIPT_DIR / "ags_vocabulary.json"
SYNONYM_PATH = SCRIPT_DIR / "synonym_mapping.json"
ENV_PATH = SCRIPT_DIR / ".env"

# ---------------------------------------------------------------------------
# LOAD ENV + API CLIENT
# ---------------------------------------------------------------------------
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().strip().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

CLIENT = anthropic.Anthropic()
EXTRACT_MODEL = "claude-sonnet-4-20250514"
NORM_MODEL = "claude-haiku-4-5"

# ---------------------------------------------------------------------------
# GATE: vocabulary-lock — canonical features/themes loaded from ags_vocabulary.json
# Do NOT add features here without also adding a Definition Card, post-processing
# rule (if needed), and SlotCatalog map entries. All must stay in sync.
# ---------------------------------------------------------------------------
_vocab = json.loads(VOCABULARY_PATH.read_text()) if VOCABULARY_PATH.exists() else {}
KNOWN_THEMES: List[str] = _vocab.get("themes", [])
KNOWN_FEATURES: List[str] = _vocab.get("features", [])

_synonyms = json.loads(SYNONYM_PATH.read_text()) if SYNONYM_PATH.exists() else {}
_FEATURE_ALIAS_MAP: Dict[str, str] = {}
for _canonical, _aliases in _synonyms.get("feature_aliases", {}).items():
    for _alias in _aliases:
        _FEATURE_ALIAS_MAP[_alias.lower()] = _canonical
_THEME_ALIAS_MAP: Dict[str, str] = {}
for _canonical, _aliases in _synonyms.get("theme_aliases", {}).items():
    for _alias in _aliases:
        _THEME_ALIAS_MAP[_alias.lower()] = _canonical


# ---------------------------------------------------------------------------
# CONFIG VALIDATION — detect contradictions between synonym mapping & prompts
# ---------------------------------------------------------------------------
def validate_config(verbose: bool = True) -> List[str]:
    """Check synonym_mapping.json for internal contradictions and taxonomy gaps.

    Returns a list of warning/error messages. Empty list = all clear.
    """
    issues: List[str] = []

    feat_aliases = _synonyms.get("feature_aliases", {})
    theme_aliases = _synonyms.get("theme_aliases", {})

    # 1. Check for aliases that appear in multiple canonical groups
    seen_feat: Dict[str, str] = {}
    for canonical, aliases in feat_aliases.items():
        for alias in aliases:
            key = alias.lower()
            if key in seen_feat and seen_feat[key] != canonical:
                issues.append(
                    f"DUPLICATE ALIAS: '{alias}' maps to BOTH "
                    f"'{seen_feat[key]}' AND '{canonical}'"
                )
            seen_feat[key] = canonical

    seen_theme: Dict[str, str] = {}
    for canonical, aliases in theme_aliases.items():
        for alias in aliases:
            key = alias.lower()
            if key in seen_theme and seen_theme[key] != canonical:
                issues.append(
                    f"DUPLICATE ALIAS: '{alias}' maps to BOTH "
                    f"'{seen_theme[key]}' AND '{canonical}'"
                )
            seen_theme[key] = canonical

    # 2. Check that canonical features in vocabulary exist in synonym mapping
    for feat in KNOWN_FEATURES:
        if feat not in feat_aliases:
            issues.append(f"MISSING ALIAS GROUP: canonical feature '{feat}' has no synonym group")

    for theme in KNOWN_THEMES:
        if theme not in theme_aliases:
            issues.append(f"MISSING ALIAS GROUP: canonical theme '{theme}' has no synonym group")

    # 3. Warn about known contradictions (stacked wilds ≠ wild reels, etc.)
    wild_reels_aliases = {a.lower() for a in feat_aliases.get("Wild Reels", [])}
    contradictions = {"stacked wilds", "stacked wild", "stacking wilds"}
    found = wild_reels_aliases & contradictions
    if found:
        issues.append(
            f"CONTRADICTION: '{found.pop()}' in Wild Reels aliases "
            f"contradicts normalization prompt (stacked wilds ≠ Wild Reels)"
        )

    # GATE: slotcatalog-map-validation — every non-None value must be a KNOWN_FEATURE
    for raw_label, canonical in _SLOTCATALOG_FEATURE_MAP.items():
        if canonical is not None and canonical not in KNOWN_FEATURES:
            issues.append(
                f"SLOTCATALOG MAP ERROR: '{raw_label}' maps to '{canonical}' "
                f"which is NOT in KNOWN_FEATURES"
            )

    # GATE: definition-card-validation — every KNOWN_FEATURE must have a definition card
    norm_prompt = _build_normalize_system_prompt()
    known_upper = {f.upper() for f in KNOWN_FEATURES}
    for feat in KNOWN_FEATURES:
        card_header = "\n" + feat.upper() + ":"
        if card_header not in norm_prompt:
            issues.append(
                f"MISSING DEFINITION CARD: '{feat}' is in ags_vocabulary.json but has "
                f"no '{feat.upper()}:' card in _build_normalize_system_prompt()"
            )
    # Check for stale cards: feature-like headers in prompt that aren't in vocabulary
    import re as _re
    for m in _re.finditer(r'\n([A-Z][A-Z ]+):\n  IS:', norm_prompt):
        card_name = m.group(1)
        if card_name not in known_upper:
            issues.append(
                f"STALE DEFINITION CARD: '{card_name}:' card exists in normalize prompt "
                f"but is NOT in ags_vocabulary.json — remove the card"
            )

    if verbose and issues:
        print(f"\n{'='*60}")
        print(f"CONFIG VALIDATION: {len(issues)} issue(s) found")
        for issue in issues:
            print(f"  ⚠  {issue}")
        print(f"{'='*60}\n")
    elif verbose:
        print("CONFIG VALIDATION: All clear")

    return issues


# ---------------------------------------------------------------------------
# GATE: synonym-normalization — raw names mapped to canonical via synonym_mapping.json
# ---------------------------------------------------------------------------
def normalize_features(raw_features: List[str], verbose: bool = False) -> List[str]:
    """Map feature names to canonical names via synonym_mapping.json."""
    normalized = []
    for raw in raw_features:
        key = raw.strip().lower()
        canonical = _FEATURE_ALIAS_MAP.get(key)
        if canonical:
            if verbose and canonical != raw.strip():
                print(f"    [NORM] feature '{raw}' -> '{canonical}'")
            normalized.append(canonical)
        else:
            normalized.append(raw.strip())
    return sorted(set(normalized))


def normalize_themes(raw_themes: List[str], verbose: bool = False) -> List[str]:
    """Map theme names to canonical names via synonym_mapping.json."""
    normalized = []
    for raw in raw_themes:
        key = raw.strip().lower()
        canonical = _THEME_ALIAS_MAP.get(key)
        if canonical:
            if verbose and canonical != raw.strip():
                print(f"    [NORM] theme '{raw}' -> '{canonical}'")
            normalized.append(canonical)
        else:
            normalized.append(raw.strip())
    return sorted(set(normalized))


# GATE: confidence-gating — features below 5 / themes below 4 are dropped
CONFIDENCE_THRESHOLD = 4  # themes
FEATURE_CONFIDENCE_THRESHOLD = 5  # features need higher confidence (reduces FPs)

# Provider official website URLs (for dashboard provider links)
# Next enrichment batch: the agent should populate missing entries via web search
PROVIDER_WEBSITES: Dict[str, str] = {
    "AGS": "https://playags.com",
    "NetEnt": "https://www.netent.com",
    "Pragmatic Play": "https://www.pragmaticplay.com",
    "IGT": "https://www.igt.com",
    "Aristocrat": "https://www.aristocrat.com",
    "Scientific Games": "https://www.scientificgames.com",
    "Everi": "https://www.everi.com",
    "Konami": "https://www.konamigaming.com",
    "Light & Wonder": "https://www.lnw.com",
    "Play'n GO": "https://www.playngo.com",
    "Microgaming": "https://www.microgaming.co.uk",
    "Yggdrasil": "https://www.yggdrasilgaming.com",
    "Red Tiger": "https://www.redtiger.com",
    "Blueprint Gaming": "https://www.blueprintgaming.com",
    "Big Time Gaming": "https://www.bigtimegaming.com",
    "ELK Studios": "https://www.elkstudios.com",
    "Hacksaw Gaming": "https://www.hacksawgaming.com",
    "Push Gaming": "https://www.pushgaming.com",
    "NoLimit City": "https://www.nolimitcity.com",
    "Relax Gaming": "https://www.relaxgaming.com",
    "Fortune Factory Studios": "https://playags.com",
    "Incredible Technologies": "https://www.itsgames.com",
    "Bluberi": "https://www.bluberi.com",
    "Zitro": "https://www.zitrogames.com",
    "Aruze Gaming": "https://www.aruzegaming.com",
}

PROVIDER_DOMAINS: Dict[str, str] = {
    "AGS": "playags.com, interactive.playags.com",
    "NetEnt": "netent.com, games.netent.com",
    "Pragmatic Play": "pragmaticplay.com",
    "IGT": "igt.com",
    "Aristocrat": "aristocrat.com",
    "Scientific Games": "scientificgames.com",
    "Everi": "everi.com",
    "Konami": "konamigaming.com",
    "Light & Wonder": "lnw.com, scientificgames.com",
    "Play'n GO": "playngo.com",
    "Microgaming": "microgaming.co.uk",
    "Yggdrasil": "yggdrasilgaming.com",
    "Red Tiger": "redtiger.com",
    "Blueprint Gaming": "blueprintgaming.com",
    "Big Time Gaming": "bigtimegaming.com",
    "ELK Studios": "elkstudios.com",
    "Hacksaw Gaming": "hacksawgaming.com",
    "Push Gaming": "pushgaming.com",
    "NoLimit City": "nolimitcity.com",
    "Relax Gaming": "relaxgaming.com",
}


# ---------------------------------------------------------------------------
# STAGE 0: PROVIDER CATALOG LOOKUP (direct fetch, no search needed)
#
# Each provider's product page URL is predictable from the game name.
# We fetch the page and extract structured data (features, themes, specs).
# Cost: $0 (HTTP only). Handles 404s gracefully.
# ---------------------------------------------------------------------------
PROVIDER_CATALOG_CONFIG: List[Dict] = [
    {
        "providers": ["AGS", "Crazy Tooth Studio", "Oros Gaming"],
        "url": "https://interactive.playags.com/game/{slug}/",
        "extractor": "ags",
        "demo_url": "https://interactive.playags.com/game/{slug}/",
    },
    {
        "providers": ["Red Tiger Gaming", "Red Tiger"],
        "url": "https://www.redtiger.com/games/{slug}",
        "extractor": "redtiger",
    },
    {
        "providers": ["Hacksaw Gaming"],
        "url": "https://www.hacksawgaming.com/games/{slug}",
        "extractor": "hacksaw",
    },
    {
        "providers": ["Konami"],
        "url": "https://www.konamigaming.com/games/all-games/details/{slug}",
        "extractor": "konami",
    },
    {
        "providers": ["Nolimit City", "NoLimit City"],
        "url": "https://www.nolimitcity.com/games/{slug}/",
        "extractor": "nolimitcity",
        "demo_url": "https://nolimitcity.com/demo/{pascal_slug}?showNavbar=true",
    },
    {
        "providers": ["Aristocrat"],
        "url": "https://www.aristocratgaming.com/emea/slots/games/{slug}",
        "extractor": "aristocrat",
    },
    {
        "providers": ["Light & Wonder", "Light And Wonder", "Light &amp Wonder"],
        "url": "https://igaming.lnw.com/games/{slug}/",
        "extractor": "lnw",
    },
    {
        "providers": ["Everi"],
        "url": "https://www.everi.com/games/library/{slug}/",
        "extractor": "everi",
    },
    {
        "providers": ["Inspired Gaming", "Inspired", "Inspired Gamin",
                       "Inspired Entertainment"],
        "url": "https://inseinc.com/interactive/games/{slug}/",
        "extractor": "inspired",
    },
]

_PROVIDER_TO_CONFIG: Dict[str, Dict] = {}
for _cfg in PROVIDER_CATALOG_CONFIG:
    for _p in _cfg["providers"]:
        _PROVIDER_TO_CONFIG[_p] = _cfg


def _slugify(name: str) -> str:
    """Convert game name to URL slug: lowercase, hyphens, no special chars."""
    slug = name.lower().strip()
    slug = slug.replace("'", "").replace("\u2019", "")
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    return slug.strip('-')


def _pascal_slugify(name: str) -> str:
    """Convert game name to PascalCase slug (e.g. 'The Crypt' → 'TheCrypt')."""
    return re.sub(r'[^a-zA-Z0-9]', '', name.title().replace("'", "").replace("\u2019", ""))


def _slotcatalog_slugify(name: str) -> str:
    """Convert game name to SlotsCatalog URL slug (e.g. 'Le Bandit' → 'Le-Bandit')."""
    slug = name.strip()
    slug = slug.replace("'", "").replace("\u2019", "")
    slug = re.sub(r'[^a-zA-Z0-9\s]+', '', slug)
    slug = re.sub(r'\s+', '-', slug)
    return slug


def get_demo_url(game_name: str, provider: str) -> Optional[str]:
    """Build a demo URL for the game. Falls back to SlotsCatalog (globally accessible)."""
    config = _PROVIDER_TO_CONFIG.get(provider)
    if config and "demo_url" in config:
        slug = _slugify(game_name)
        pascal_slug = _pascal_slugify(game_name)
        return config["demo_url"].format(slug=slug, pascal_slug=pascal_slug)
    sc_slug = _slotcatalog_slugify(game_name)
    return f"https://slotcatalog.com/en/slots/{sc_slug}"


_CATALOG_SLUG_MAP = {
    "gems-crystals": "Gems & Crystals",
    "7s": "7s",
    "hold-and-spin": "Hold and Spin",
    "cash-on-reels": "Cash On Reels",
    "free-spins": "Free Spins",
    "static-jackpot": "Static Jackpot",
    "wild-reels": "Wild Reels",
    "pick-bonus": "Pick Bonus",
    "expanding-reels": "Expanding Reels",
}


def _catalog_slug_to_name(slug: str) -> str:
    """Convert a URL slug from the catalog back to a display name."""
    if slug in _CATALOG_SLUG_MAP:
        return _CATALOG_SLUG_MAP[slug]
    return slug.replace('-', ' ').title()


def _fetch_html(url: str, timeout: int = 15) -> Optional[str]:
    """Fetch a URL, return HTML string or None on any error."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/120.0.0.0 Safari/537.36"),
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            return resp.read().decode("utf-8", errors="replace")
    except (urllib.error.HTTPError, urllib.error.URLError, OSError):
        return None


def _extract_ags(html: str) -> Dict:
    """Extract structured data from AGS interactive.playags.com pages."""
    result: Dict = {}

    features_match = re.findall(r'game-features/([^/]+)/', html)
    if features_match:
        result["features"] = [_catalog_slug_to_name(f) for f in features_match]

    themes_match = re.findall(r'game-themes/([^/]+)/', html)
    if themes_match:
        result["themes"] = [_catalog_slug_to_name(t) for t in themes_match]

    rtp_vals = re.findall(r'(\d{2}\.\d+)%', html)
    if rtp_vals:
        result["rtp"] = max(float(r) for r in rtp_vals)

    layout_match = re.search(r'Reel Layout\s*</[^>]*>\s*(\d+)\s*[×x]\s*(\d+)', html)
    if layout_match:
        result["reels"] = int(layout_match.group(1))
        result["rows"] = int(layout_match.group(2))

    lines_match = re.search(r'Lines / Ways / Pays\s*</[^>]*>\s*([^<]+)', html)
    if lines_match:
        lines_text = lines_match.group(1).strip()
        num = re.search(r'(\d+)', lines_text)
        if num:
            result["paylines_value"] = int(num.group(1))
        result["paylines_kind"] = "Ways" if "ways" in lines_text.lower() else "Lines"

    vol_match = re.search(r'Volatility\s*</[^>]*>\s*([^<]+)', html)
    if vol_match:
        v = vol_match.group(1).strip()
        if v:
            result["volatility"] = v

    return result


def _html_to_text(html: str) -> str:
    """Strip HTML tags and normalize whitespace."""
    text = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.DOTALL)
    text = re.sub(r'<style[^>]*>.*?</style>', ' ', text, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&lt;[^&]*&gt;', ' ', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'&#\d+;', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def _extract_redtiger(html: str) -> Dict:
    """Red Tiger: server-rendered React page with features described in text."""
    text = _html_to_text(html)
    result: Dict = {}

    rtp_vals = re.findall(r'(\d{2}\.\d+)\s*%', text)
    if rtp_vals:
        result["rtp"] = max(float(r) for r in rtp_vals)

    feat_section = re.search(
        r'Game Features?\s+(.*?)(?:PLEASE GAMBLE|Winners|LIVE|Part of|$)',
        text, re.DOTALL
    )
    if feat_section:
        raw = feat_section.group(1).strip()
        sentences = [s.strip() for s in raw.split('.')
                     if len(s.strip()) > 10 and len(s.strip()) < 300]
        if sentences:
            result["features_raw"] = sentences[:6]

    for v in ("Low", "Medium", "High", "Very High"):
        if re.search(rf'Volatility\s*{v}', text, re.IGNORECASE):
            result["volatility"] = v
            break

    layout = re.search(r'(\d)\s*[×xX]\s*(\d)', text)
    if layout:
        result["reels"] = int(layout.group(1))
        result["rows"] = int(layout.group(2))

    return result


def _extract_hacksaw(html: str) -> Dict:
    """Hacksaw Gaming: plain HTML with FEATURES section and named features."""
    text = _html_to_text(html)
    result: Dict = {}

    rtp_vals = re.findall(r'(\d{2}\.\d+)\s*%', text)
    if rtp_vals:
        result["rtp"] = max(float(r) for r in rtp_vals)

    feat_section = re.search(
        r'FEATURES?\s+(.*?)(?:ABOUT|GAME INFO|PLEASE|RESPONSIBLE|$)',
        text, re.DOTALL | re.IGNORECASE
    )
    if feat_section:
        raw = feat_section.group(1).strip()
        feature_names = re.findall(r'([A-Z][A-Z\s&\']{3,})', raw)
        features = []
        skip_words = {"THE", "AND", "FOR", "WITH", "WHENEVER", "THIS",
                      "EACH", "WILL", "THAT", "DURING", "WHAT",
                      "FEATURES", "SPECIAL SYMBOLS", "MALTA",
                      "ABOUT", "RESPONSIBLE", "GAMBLING", "CURACAO"}
        for fn in feature_names:
            fn = re.sub(r'\s+[A-Z]$', '', fn.strip())
            if (fn and 4 < len(fn) < 40
                    and fn not in skip_words
                    and not re.match(r'^[A-Z]{2}\s', fn)):
                features.append(fn.title())
        if features:
            result["features_raw"] = list(dict.fromkeys(features))

    for v in ("Low", "Medium", "High", "Very High", "Extreme"):
        if re.search(rf'Volatility[:\s]*{v}', text, re.IGNORECASE):
            result["volatility"] = v
            break

    maxwin = re.search(r'Max\s*Win[:\s]*([\d,x]+)', text, re.IGNORECASE)
    if maxwin:
        result["max_win"] = maxwin.group(1)

    return result


def _extract_konami(html: str) -> Dict:
    """Konami Gaming: description follows 'Game Details {GameName}'."""
    text = _html_to_text(html)
    result: Dict = {}

    desc_match = re.search(
        r'Game Details\s+(.{20,}?)(?:View Game|View more|Market Type|Game Type|'
        r'Compatible|SeleXion|Game Categories|Not Applicable)',
        text
    )
    if desc_match:
        raw = desc_match.group(1).strip()[:800]
        result["description"] = raw[:500]
        sentences = [s.strip() for s in re.split(r'[!.]', raw)
                     if len(s.strip()) > 10]
        if sentences:
            result["features_raw"] = sentences[:10]

    return result





def _extract_nolimitcity(html: str) -> Dict:
    """Nolimit City: specs table + 'Game Features' section with named mechanics."""
    text = _html_to_text(html)
    result: Dict = {}

    rtp_match = re.search(r'(\d{2}\.\d+)%\s*RTP', text)
    if rtp_match:
        result["rtp"] = float(rtp_match.group(1))

    reels_match = re.search(r'(\d+)[-–](\d+)\s*Reels/Rows', text)
    if reels_match:
        result["reels"] = int(reels_match.group(1))
        result["rows"] = int(reels_match.group(2))

    maxwin = re.search(r'([\d\s]+)\s*x\s*bet\s*Max\s*payout', text, re.IGNORECASE)
    if maxwin:
        result["max_win"] = maxwin.group(1).strip().replace(' ', '')

    desc_match = re.search(r'games\s+\w[\w\s]+?\s+(.*?)Demo\s+Playin', text, re.DOTALL)
    if desc_match:
        raw = desc_match.group(1).strip()
        if len(raw) > 15:
            result["description"] = raw[:500]

    feat_section = re.search(r'Game Features\s+(.*?)(?:Play\s+Demo|Related|$)',
                             text, re.DOTALL)
    if feat_section:
        raw = feat_section.group(1).strip()
        sentences = [s.strip() for s in re.split(r'[.•]', raw)
                     if len(s.strip()) > 10 and len(s.strip()) < 200]
        if sentences:
            result["features_raw"] = sentences[:10]

    return result


def _extract_aristocrat(html: str) -> Dict:
    """Aristocrat Gaming: 'GAME FEATURES' section with named features."""
    text = _html_to_text(html)
    result: Dict = {}

    desc_match = re.search(r"(Unleash|Enjoy|Experience|Discover|Step into)(.+?)(?=GAME FEATURES)", text)
    if desc_match:
        result["description"] = (desc_match.group(1) + desc_match.group(2)).strip()[:500]

    feat_section = re.search(
        r"GAME FEATURES\s+(?:RELATED GAMES\s+)?GAME FEATURES\s+(.*?)(?:RELATED GAMES|PICK YOUR|$)",
        text, re.DOTALL
    )
    if feat_section:
        raw = feat_section.group(1).strip()
        features = re.split(
            r"(?=Cash Collect|Free (?:Games|Spins)|Match-3|Jackpot|Wild|Bonus|Hold|Wheel|Nudg|Pick|Respin|Scatter)",
            raw
        )
        features = [f.strip() for f in features if len(f.strip()) > 10]
        if features:
            result["features_raw"] = features[:10]

    return result


def _extract_lnw(html: str) -> Dict:
    """Light & Wonder (igaming.lnw.com): structured specs + Key Features + Description."""
    text = _html_to_text(html)
    result: Dict = {}

    rtp_match = re.search(r"RTP:\s*([\d.]+%(?:\s*\|\s*[\d.]+%)*)", text)
    if rtp_match:
        rtps = re.findall(r"(\d+\.?\d*)%", rtp_match.group(1))
        if rtps:
            result["rtp"] = max(float(r) for r in rtps)

    reels_match = re.search(r"Reels:\s*(\d+)\s*Reels", text)
    if reels_match:
        result["reels"] = int(reels_match.group(1))

    lines_match = re.search(r"Lines:\s*(\d+)", text)
    if lines_match:
        result["paylines_value"] = int(lines_match.group(1))

    maxwin = re.search(r"Top Prize:\s*([\d,]+\.?\d*)x", text)
    if maxwin:
        result["max_win"] = maxwin.group(1).replace(",", "")

    feat_section = re.search(r"Key Features\s+(?:expand_more\s+)?(.*?)(?:Description|$)", text, re.DOTALL)
    if feat_section:
        raw = feat_section.group(1).strip()
        features = [f.strip() for f in re.split(r"\n+", raw)
                    if len(f.strip()) > 3 and "expand_more" not in f]
        if features:
            result["features_raw"] = features[:10]

    desc_section = re.search(r"Description\s+(?:expand_more\s+)?(.*?)(?:GAME ID|Play Demo|Access|$)", text, re.DOTALL)
    if desc_section:
        desc = desc_section.group(1).strip()
        if len(desc) > 20:
            result["description"] = desc[:500]

    return result


def _extract_everi(html: str) -> Dict:
    """Everi Games: 'GAME OVERVIEW' section with structured specs."""
    text = _html_to_text(html)
    result: Dict = {}

    reels_match = re.search(r"Reels:\s*(\d+)", text)
    if reels_match:
        result["reels"] = int(reels_match.group(1))

    lines_match = re.search(r"Lines:\s*(\d+)", text)
    if lines_match:
        result["paylines_value"] = int(lines_match.group(1))

    vol_match = re.search(r"Volatility:\s*(\d+)\s*of\s*5", text)
    if vol_match:
        vol_map = {"1": "Very Low", "2": "Low", "3": "Medium", "4": "High", "5": "Very High"}
        result["volatility"] = vol_map.get(vol_match.group(1), "Medium")

    prog_match = re.search(r"Progressive:\s*([^\n]+)", text)
    if prog_match:
        result["features_raw"] = [prog_match.group(0).strip()]

    desc_section = re.search(r"(?:GAME OVERVIEW.*?Volatility[^\n]*\n)(.*?)(?:GAME OVERVIEW|$)", text, re.DOTALL)
    if not desc_section:
        desc_section = re.search(r"Skip to Main Content\s+.*?\n\n(.*?)(?:GAME OVERVIEW|$)", text, re.DOTALL)
    if desc_section:
        desc = desc_section.group(1).strip()
        if len(desc) > 20:
            result["description"] = desc[:500]

    return result


def _extract_inspired(html: str) -> Dict:
    """Inspired Entertainment (inseinc.com): prose-heavy pages with RTP/reels header.
    Site sometimes renders in Portuguese (ROLOS, LINHAS) depending on geo.
    """
    text = _html_to_text(html)
    result: Dict = {}

    rtp_match = re.search(r"RTP:\s*([\d,\.]+)%", text)
    if rtp_match:
        result["rtp"] = rtp_match.group(1).replace(",", ".") + "%"

    reels_match = re.search(r"(?:Reels|ROLOS|REELS):\s*(\d+[Xx×]\d+)", text, re.IGNORECASE)
    if reels_match:
        result["reels"] = reels_match.group(1).upper().replace("×", "X")

    lines_match = re.search(
        r"(?:Win Lines|LINHAS DE VIT[OÓ]RIA|PAYLINES|Pay Lines):\s*(\d+)", text, re.IGNORECASE
    )
    if lines_match:
        result["paylines_value"] = int(lines_match.group(1))

    title_match = re.search(r"^(.*?)(?:\s*\|)", text)
    if title_match:
        result["title"] = title_match.group(1).strip()

    header_end = re.search(
        r"(?:PRÊMIO MÁXIMO|MAX PRIZE|MAX WIN)[:\s]*[\w$€£R\s\d,\.]+?\s+(?=[A-Z][a-z])",
        text
    )
    if header_end:
        desc_start = header_end.end()
    else:
        spec_match = re.search(r"RTP:\s*[\d,\.]+%.*?(?:\d{3}[,\.]\d{3}|\d+x)\s+", text)
        if spec_match:
            desc_start = spec_match.end()
        else:
            desc_start = 0

    footer_start = text.find("Office Locator")
    if footer_start < 0:
        footer_start = len(text)

    desc = text[desc_start:footer_start].strip()
    if len(desc) > 50:
        result["description"] = desc[:800]

    return result


# GATE: slotcatalog-map — deterministic label→canonical mapping. Values must be in
# KNOWN_FEATURES or None. Validated by --validate. Do NOT add entries without
# verifying the mapping against 3+ real games.
_SLOTCATALOG_FEATURE_MAP: Dict[str, Optional[str]] = {
    "free spins": "Free Spins",
    "additional free spins": "Free Spins",
    "free spins mode choosing": "Free Spins",
    "freespins": "Free Spins",
    "hold and win": "Hold and Spin",
    "hold & win": "Hold and Spin",
    "lock it link": "Hold and Spin",
    "multiplier": "Multiplier",
    "random multiplier": "Multiplier",
    "wilds with multipliers": "Multiplier",
    "free spins multiplier": "Multiplier",
    "fixed jackpots": "Static Jackpot",
    "fixed jackpot": "Static Jackpot",
    "progressive jackpot": "Progressive Jackpot",
    "megaways": "Megaways",
    "multiway (+1024)": "Expanding Reels",
    "dynamic reels": "Expanding Reels",
    "reelset changing": "Expanding Reels",
    "cascading reels": "Cascading Reels",
    "cascading": "Cascading Reels",
    "avalanche": "Cascading Reels",
    "tumble": "Cascading Reels",
    "tumbling reels": "Cascading Reels",
    "buy bonus": "Buy Bonus",
    "feature buy": "Buy Bonus",
    "bonus buy": "Buy Bonus",
    "buy feature": "Buy Bonus",
    "sticky wilds": "Sticky Wilds",
    "sticky wild": "Sticky Wilds",
    "sticky symbols": "Sticky Wilds",
    "expanding wilds": "Expanding Wilds",
    "expanding wild": "Expanding Wilds",
    "expanding wild with re-spin": "Expanding Wilds",
    "gamble": "Gamble Feature",
    "double up": "Gamble Feature",
    "risk game": "Gamble Feature",
    "risk/gamble (double) game": "Gamble Feature",
    "mystery symbol": "Mystery Symbols",
    "mystery symbols": "Mystery Symbols",
    "colossal symbols": "Colossal Symbols",
    "giant symbols": "Colossal Symbols",
    "mega symbol (3x3)": "Colossal Symbols",
    "mega symbol (2x2)": "Colossal Symbols",
    "stacked symbols": "Stacked Symbols",
    "action stacked": "Stacked Symbols",
    "stack": "Stacked Symbols",
    "wild reels": "Wild Reels",
    "pick bonus": "Pick Bonus",
    "bonusgame: pick objects": None,
    "nudge": "Nudges",
    "nudge feature": "Nudges",
    "nudging": "Nudges",
    "wheel": "Wheel",
    "bonus wheel": "Wheel",
    "spin the wheel": "Wheel",
    "cash on reels": "Cash On Reels",
    "cash collector": "Cash On Reels",
    "respins": "Respin",
    "symbol swap": "Symbol Transformation",
    "symbols collection (energy)": "Persistence",
    "pot collection": "Persistence",
    "collector meter": "Persistence",
    "collection meter": "Persistence",
    "persistent wild": "Persistence",
    "persistent wilds": "Persistence",
    "meter feature": "Persistence",
    "pot feature": "Persistence",
    "building feature": "Persistence",
    "upgrade path": "Persistence",
}


def _extract_slotcatalog(html: str) -> Dict:
    """Extract structured data from slotcatalog.com game pages.

    SlotCatalog uses a consistent format with Features:, Theme:, RTP:, etc.
    in the sidebar/attributes section. Used as universal fallback catalog.

    Produces both `features_raw` (for LLM normalization) and `features`
    (deterministically mapped) so that known SlotCatalog terms bypass
    LLM confidence gating.
    """
    result: Dict = {}

    feat_match = re.search(r'Features:\s*(.*?)(?:Other tags|Theme)', html, re.DOTALL)
    if feat_match:
        raw = re.sub(r'<[^>]+>', ' ', feat_match.group(1)).strip()
        feats = [f.strip() for f in raw.split(',') if f.strip()]
        result["features_raw"] = feats

        mapped: List[str] = []
        for f in feats:
            canonical = _SLOTCATALOG_FEATURE_MAP.get(f.lower())
            if canonical:
                mapped.append(canonical)
        result["features"] = sorted(set(mapped))

    theme_match = re.search(r'Theme:\s*(.*?)(?:Other tags|Features)', html, re.DOTALL)
    if theme_match:
        raw = re.sub(r'<[^>]+>', ' ', theme_match.group(1)).strip()
        result["themes"] = [t.strip() for t in raw.split(',') if t.strip()]

    rtp = re.search(r'RTP:\s*([\d.]+)%', html)
    if rtp:
        result["rtp"] = float(rtp.group(1))

    layout = re.search(r'Layout:\s*([\d\-x]+)', html)
    if layout:
        parts = layout.group(1).split('-')
        if len(parts) >= 1:
            result["reels"] = int(parts[0]) if parts[0].isdigit() else None
        if len(parts) >= 2:
            result["rows"] = int(parts[1]) if parts[1].isdigit() else None

    vol = re.search(r'Variance:\s*(\w+)', html)
    if vol:
        result["volatility"] = vol.group(1)

    ways = re.search(r'Betways:\s*([\d,]+)', html)
    if ways:
        val = ways.group(1).replace(',', '')
        result["paylines_value"] = int(val) if val.isdigit() else None
        result["paylines_kind"] = "Ways"

    desc_match = re.search(
        r'<meta[^>]*property="og:description"[^>]*content="([^"]*)"', html
    )
    if desc_match:
        result["description"] = desc_match.group(1)[:500]

    return result


_EXTRACTORS = {
    "ags": _extract_ags,
    "redtiger": _extract_redtiger,
    "hacksaw": _extract_hacksaw,
    "konami": _extract_konami,
    "nolimitcity": _extract_nolimitcity,
    "aristocrat": _extract_aristocrat,
    "lnw": _extract_lnw,
    "everi": _extract_everi,
    "inspired": _extract_inspired,
    "slotcatalog": _extract_slotcatalog,
}


def _generate_slug_variants(game_name: str) -> List[str]:
    """Generate slug variants for catalog URL resolution.
    Some providers use shortened names (e.g. 'mighty-pyramid' instead of
    'mo-mummy-mighty-pyramid'). Try the full slug first, then progressively
    shorter suffixes.
    """
    full = _slugify(game_name)
    variants = [full]
    parts = full.split("-")
    if len(parts) > 2:
        for start in range(1, min(len(parts), 3)):
            variants.append("-".join(parts[start:]))
    return variants


def _generate_slotcatalog_slugs(game_name: str) -> List[str]:
    """Generate candidate SlotCatalog URL slugs for a game name.

    SlotCatalog uses inconsistent slug formats: sometimes lowercase-hyphenated,
    sometimes Title-Case-Hyphenated, sometimes with filler words removed.
    Try multiple variants and let HTTP 404 filter the wrong ones.
    """
    name = game_name.strip()
    seen: List[str] = []

    def _add(s: str) -> None:
        if s and s not in seen:
            seen.append(s)

    _add(_slotcatalog_slugify(name))
    _add(re.sub(r'\s+', '-', name.lower()))

    no_filler = re.sub(r'\b(and|the|a)\b', '', name, flags=re.IGNORECASE).strip()
    no_filler = re.sub(r'\s+', '-', no_filler.lower()).replace('--', '-').strip('-')
    _add(no_filler)

    no_suffix = re.sub(
        r'\s*(hold\s+and\s+win|hold\s+&\s+win)\b', '', name, flags=re.IGNORECASE
    ).strip()
    if no_suffix != name:
        _add(re.sub(r'\s+', '-', no_suffix.lower()))

    stripped = re.sub(
        r'\s*(megaways|jackpot\s+king|power\s+combo|jackpot\s+royale'
        r'|deluxe|extreme)\s*$',
        '', name, flags=re.IGNORECASE
    ).strip()
    if stripped and stripped != name:
        _add(_slotcatalog_slugify(stripped))
        _add(re.sub(r'\s+', '-', stripped.lower()))

    words = name.split()
    if len(words) >= 3:
        _add(re.sub(r'\s+', '-', (words[-1] + ' ' + ' '.join(words[:-1])).lower()))
    if len(words) >= 2:
        _add(re.sub(r'\s+', '-', ' '.join(reversed(words))).lower())

    return seen


def _fetch_slotcatalog_fallback(game_name: str,
                                verbose: bool = False) -> Optional[Dict]:
    """Try SlotCatalog.com as a universal fallback catalog.

    SlotCatalog covers most providers with structured feature/theme data.
    Cost: $0 (plain HTTP). Tried only when no provider-specific catalog exists
    or when the provider-specific catalog returns nothing.
    """
    slugs = _generate_slotcatalog_slugs(game_name)
    extractor_fn = _EXTRACTORS["slotcatalog"]

    for slug in slugs:
        url = f"https://slotcatalog.com/en/slots/{slug}"
        if verbose:
            print(f"  [SLOTCATALOG] Trying {url}")

        html = _fetch_html(url)
        if not html:
            continue

        if '<title>404' in html or 'Page not found' in html:
            continue

        result = extractor_fn(html)
        result["source_url"] = url
        result["catalog_source"] = "slotcatalog"

        has_data = (result.get("features") or result.get("themes")
                    or result.get("features_raw") or result.get("rtp")
                    or result.get("description"))
        if has_data:
            if verbose:
                f = result.get("features") or result.get("features_raw")
                t = result.get("themes")
                print(f"  [SLOTCATALOG] Found: features={f}, themes={t}")
            return result

    if verbose:
        print(f"  [SLOTCATALOG] No page found for any slug variant")
    return None


def fetch_provider_catalog(game_name: str, provider: str,
                           verbose: bool = False) -> Optional[Dict]:
    """Fetch structured data from the provider's product catalog page.

    Tries the provider-specific URL pattern with slug variants first.
    Falls back to SlotCatalog.com as a universal catalog if no provider-specific
    config exists or it returns nothing.
    Handles 404s gracefully and detects soft-404 pages.
    Returns dict with features, themes, specs if found, None otherwise.
    """
    config = _PROVIDER_TO_CONFIG.get(provider)
    if config:
        extractor_name = config["extractor"]
        extractor_fn = _EXTRACTORS.get(extractor_name)
        if extractor_fn:
            slugs = _generate_slug_variants(game_name)
            for slug in slugs:
                url = config["url"].format(
                    slug=slug, pascal_slug=_pascal_slugify(game_name)
                )
                if verbose:
                    print(f"  [CATALOG] Fetching {url}")

                html = _fetch_html(url)
                if not html:
                    continue

                text_preview = _html_to_text(html)[:300]
                if "404" in text_preview and "Page Not Found" in text_preview:
                    if verbose:
                        print(f"  [CATALOG] Soft 404, trying next slug...")
                    continue

                result = extractor_fn(html)
                result["source_url"] = url

                if verbose:
                    f = result.get("features") or result.get("features_raw")
                    t = result.get("themes")
                    print(f"  [CATALOG] Found: features={f}, themes={t}, "
                          f"rtp={result.get('rtp')}")

                has_data = (result.get("features") or result.get("themes")
                            or result.get("features_raw") or result.get("rtp")
                            or result.get("description"))
                if has_data:
                    return result

                if verbose:
                    print(f"  [CATALOG] Page loaded but no structured data")

            if verbose:
                print(f"  [CATALOG] Provider catalog empty, trying SlotCatalog")

    return _fetch_slotcatalog_fallback(game_name, verbose=verbose)


# ---------------------------------------------------------------------------
# STAGE 1: FREE-FORM WEB SEARCH EXTRACTION
# ---------------------------------------------------------------------------
def build_extract_prompt(game_name: str, provider: str) -> str:
    """Build the Stage 1 prompt. No vocabulary constraint — free-form observation."""
    domains = PROVIDER_DOMAINS.get(provider, "")
    domain_hint = ""
    if domains:
        primary_domain = domains.split(",")[0].strip()
        domain_hint = f"""
1. PROVIDER'S OWN PRODUCT PAGE (most authoritative — has exact feature lists):
   Search: "{game_name}" {primary_domain}
   Provider product catalog pages list exact features, themes, and specs. This is your most important search.
"""
    else:
        domain_hint = f"""
1. PROVIDER'S OWN PRODUCT PAGE (most authoritative — has exact feature lists):
   Search: "{game_name}" {provider} official product page game catalog
   Provider product catalog pages list exact features, themes, and specs.
"""

    return f"""You are a slot game researcher. Search the web to find accurate, detailed data about the slot game "{game_name}" by {provider}.

SEARCH STRATEGY (follow this priority order):
{domain_hint}
2. SLOT DATABASES (structured data):
   Search: "{game_name}" {provider} slotcatalog OR vegasslotsonline
   These databases have structured game specifications.

3. REVIEW SITES (detailed descriptions):
   Search: "{game_name}" {provider} slot review features
   Review pages describe how features work.

IMPORTANT:
- You are researching "{game_name}" by {provider}. NOT a different game or variant.
- Describe what you ACTUALLY find. Do not guess or infer features that aren't described.
- If a provider product page lists specific feature names (e.g. "Cash On Reels", "Free Spins"), include them — these are authoritative.
- Be THOROUGH: specifically check for ALL of these common slot mechanics:
  * Free spins / bonus spins
  * Hold and Spin / Hold & Win / Lock and Respin / Money Charge bonus
  * Jackpot tiers (Mini/Minor/Major/Grand or similar fixed jackpots)
  * Cash values on symbols / coin values on reels
  * Pick bonus / pick-and-win rounds
  * Expanding or growing reel grids
  * Wild reels (entire reels turning wild)
  * Multiplier wilds or win multipliers
  * Respin features
  * Wheel bonus
  * Persistent meters, pots, collectors, or building mechanics
  * Nudge features

After searching, output a JSON object with your findings. Use your own natural words for themes and features — describe them as you see them, do not try to normalize or standardize:
{{
  "themes_raw": ["describe each visual/thematic element you see"],
  "features_raw": ["describe each gameplay mechanic/feature you find, in your own words, with brief context of how it works — be exhaustive, list EVERY mechanic"],
  "symbols": ["list every symbol name found: e.g. Wild, Scatter, Diamond, Gold Bar, Ace, King, etc."],
  "reels": 5,
  "rows": 3,
  "paylines_kind": "Lines" or "Ways" or null,
  "paylines_value": 243 or null,
  "rtp": 96.5 or null,
  "volatility": "Low" | "Medium" | "Medium-High" | "High" | "Very High" or null,
  "max_win": "5000x" or null,
  "min_bet": 0.20 or null,
  "max_bet": 100.00 or null,
  "description": "Brief 1-sentence description of the game" or null,
  "demo_url": "URL to play a free demo of this game (if found)" or null,
  "completeness": 5
}}

"completeness" (1-5): Rate how thorough your findings are.
  5 = Found detailed review pages with full feature breakdowns
  4 = Found good info, confident I have the main features
  3 = Found some info but details are sparse, might be missing features
  2 = Very little info found, likely incomplete
  1 = Almost nothing found about this specific game

Output ONLY the JSON object, no other text."""


COMPLETENESS_THRESHOLD = 3


def call_web_search(
    game_name: str, provider: str, verbose: bool = False,
    model_override: Optional[str] = None,
) -> Tuple[Optional[Dict], Dict]:
    """Execute Stage 1: web search extraction.

    Returns (raw_extraction_dict, meta_dict).
    """
    model = model_override or EXTRACT_MODEL
    prompt = build_extract_prompt(game_name, provider)
    meta = {"searches": 0, "sources": [], "model": model}

    max_retries = 3
    for attempt in range(max_retries):
        try:
            resp = CLIENT.messages.create(
                model=model,
                max_tokens=4096,
                temperature=0,
                messages=[{"role": "user", "content": prompt}],
                tools=[{
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": 3,
                }],
            )

            extracted = None
            all_text = []
            for block in resp.content:
                btype = getattr(block, "type", None)
                if btype == "web_search_tool_result":
                    meta["searches"] += 1
                    results = getattr(block, "content", [])
                    if isinstance(results, list):
                        for r in results:
                            if hasattr(r, "url"):
                                meta["sources"].append({
                                    "url": r.url,
                                    "title": getattr(r, "title", ""),
                                })
                elif btype == "text":
                    all_text.append(block.text)

            full_text = "\n".join(all_text).strip()
            json_match = re.search(r'\{[\s\S]*\}', full_text)
            if json_match:
                try:
                    extracted = json.loads(json_match.group())
                except json.JSONDecodeError:
                    if "```" in full_text:
                        code_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', full_text)
                        if code_match:
                            try:
                                extracted = json.loads(code_match.group(1))
                            except json.JSONDecodeError:
                                pass

            usage = getattr(resp, "usage", None)
            if usage:
                st = getattr(usage, "server_tool_use", None)
                if st:
                    meta["searches"] = getattr(st, "web_search_requests", meta["searches"])

            if verbose:
                print(f"  [EXTRACT] {meta['searches']} web searches, {len(meta['sources'])} sources")
                if extracted:
                    raw_t = extracted.get("themes_raw") or []
                    raw_f = extracted.get("features_raw") or []
                    print(f"  [EXTRACT] raw_themes={raw_t}")
                    print(f"  [EXTRACT] raw_features={raw_f}")
                    print(f"  [EXTRACT] symbols={extracted.get('symbols', [])}")
                    print(f"  [EXTRACT] rtp={extracted.get('rtp')} vol={extracted.get('volatility')} reels={extracted.get('reels')}x{extracted.get('rows')}")

            return extracted, meta

        except (anthropic.RateLimitError, anthropic.APIStatusError) as e:
            status = getattr(e, "status_code", 0)
            is_retriable = isinstance(e, anthropic.RateLimitError) or status in (429, 529, 500, 502, 503)
            if is_retriable and attempt < max_retries - 1:
                wait = 30 * (attempt + 1)
                label = "overloaded" if status == 529 else "rate limited"
                if verbose:
                    print(f"  [EXTRACT] API {label} ({status}), waiting {wait}s (attempt {attempt+1}/{max_retries})...")
                time.sleep(wait)
            elif is_retriable:
                if verbose:
                    print(f"  [EXTRACT ERROR] API retries exhausted ({status})")
                return None, meta
            else:
                if verbose:
                    print(f"  [EXTRACT ERROR] API error {status}: {e}")
                return None, meta

        except Exception as e:
            if verbose:
                print(f"  [EXTRACT ERROR] {e}")
                traceback.print_exc()
            return None, meta

    return None, meta


def call_verification_search(
    game_name: str, provider: str, existing_features: List[str],
    verbose: bool = False, model_override: Optional[str] = None,
) -> Optional[Dict]:
    """Stage 1.5: targeted follow-up search when initial extraction is sparse.

    Uses different search angles to find features the first pass may have missed.
    Returns supplemental raw extraction to merge with the original.
    """
    model = model_override or EXTRACT_MODEL
    features_found = ", ".join(existing_features) if existing_features else "very few"

    prompt = f"""You are a slot game researcher doing a FOLLOW-UP search for "{game_name}" by {provider}.

A previous search found these features: {features_found}
But the search quality was low — important details may have been missed.

Search with DIFFERENT queries than a basic review search. Try:
- "{game_name} {provider} bonus features guide"
- "{game_name} slot free spins wild features"
- "{game_name} {provider} game rules paytable"

Report ONLY NEW gameplay features/mechanics not already listed above.
If you find nothing new, return empty lists.

Output JSON:
{{
  "features_raw": ["any NEW features found that weren't in the original search"],
  "symbols": ["any NEW symbols found"],
  "rtp": null,
  "volatility": null
}}

Output ONLY the JSON object."""

    meta = {"searches": 0, "sources": [], "model": model}

    try:
        resp = CLIENT.messages.create(
            model=model,
            max_tokens=2048,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
            tools=[{
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 2,
            }],
        )

        all_text = []
        for block in resp.content:
            btype = getattr(block, "type", None)
            if btype == "web_search_tool_result":
                meta["searches"] += 1
            elif btype == "text":
                all_text.append(block.text)

        full_text = "\n".join(all_text).strip()
        m = re.search(r'\{[\s\S]*\}', full_text)
        if m:
            result = json.loads(m.group())
            new_features = result.get("features_raw") or []
            if verbose:
                print(f"  [VERIFY] {meta['searches']} searches, found {len(new_features)} new features")
                for f in new_features:
                    print(f"    + {f[:80]}")
            return result
    except (anthropic.RateLimitError, anthropic.APIStatusError) as e:
        status = getattr(e, "status_code", 0)
        is_retriable = isinstance(e, anthropic.RateLimitError) or status in (429, 529, 500, 502, 503)
        if is_retriable:
            if verbose:
                print(f"  [VERIFY] API error ({status}), waiting 30s and retrying...")
            time.sleep(30)
            try:
                resp = CLIENT.messages.create(
                    model=model, max_tokens=2048, temperature=0,
                    messages=[{"role": "user", "content": prompt}],
                    tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 2}],
                )
                all_text = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
                full_text = "\n".join(all_text).strip()
                m = re.search(r'\{[\s\S]*\}', full_text)
                if m:
                    return json.loads(m.group())
            except Exception:
                pass
        if verbose:
            print(f"  [VERIFY] API error, skipping")
    except Exception as e:
        if verbose:
            print(f"  [VERIFY ERROR] {e}")

    return None


# ---------------------------------------------------------------------------
# STAGE 2: NORMALIZE TO CANONICAL TAXONOMY
# Few-shot examples + confidence gating. No hardcoded rules.
# ---------------------------------------------------------------------------
def _build_normalize_system_prompt() -> str:
    """Build the CACHEABLE system prompt for Stage 2 normalization.

    This prompt is IDENTICAL for every game — it contains:
    - Canonical taxonomy lists
    - All few-shot examples (positive + negative)
    - Classification instructions and output format

    Cached via Anthropic prompt caching (90% discount on input tokens after 1st call).
    """
    themes_list = ", ".join(KNOWN_THEMES)
    features_list = ", ".join(KNOWN_FEATURES)

    return f"""You are classifying slot game features and themes into a canonical taxonomy.

CANONICAL FEATURES: {features_list}
CANONICAL THEMES: {themes_list}

IMPORTANT EXCLUSIONS:
- Do NOT classify "PowerXStream" / "Power XStream" / "Power X Stream" as Expanding Reels. PowerXStream is a WAYS-based win evaluation mechanic (like 243 ways), not an expanding reel set. Always map PowerXStream references to null.

═══════════════════════════════════════
FEATURE DEFINITION CARDS
For each feature: what it IS, what it is NOT, and examples.
Only classify a raw feature if it clearly matches a definition.
IMPORTANT: A single raw feature can match MULTIPLE definitions.
If "xNudge Wild expands to cover entire reel" → classify as BOTH Nudges AND Wild Reels.
═══════════════════════════════════════

FREE SPINS:
  IS: A bonus round awarding free spins (reels spin without bet deduction). Triggered by scatter/bonus symbols.
  NOT: Regular spins. Respins. "Spin" in UI buttons. Retriggers are part of Free Spins, not separate.
  YES: "3 scatters trigger 10 free spins with extra wilds" → conf:5

HOLD AND SPIN:
  IS: A DEDICATED bonus where special symbols LOCK on the grid and remaining positions RESPIN to collect more locked symbols. Known as: Hold & Win, Lock & Spin, Money Charge, Lightning Link, All Aboard, Dragon Link, Jackpot Respins, Money Link. Must have BOTH: (1) symbols locking in place on a grid, AND (2) remaining positions re-spinning with a counter that resets on new locks.
  NOT: Regular respins. Simple re-spin mechanics where symbols happen to stay. Free spins with sticky/locked wilds (that's Free Spins, not H&S). "Collecting 3 wilds locks reels and respins" during free spins (that's a free spins modifier, not H&S). Vague "hold-style" or "respin" without explicit lock-grid-respin-counter mechanics.
  YES: "Money Charge: 6+ coins trigger lock-and-respin bonus" → conf:5
  YES: "Jackpot Respins triggered by 6+ scatters, symbols lock, respins reset to 3 on new scatter" → conf:5
  NO: "Re-spins feature - collecting 3 wild symbols during free spins locks triggering reels and spins others again" → null (free spins modifier with sticky wilds, not a dedicated H&S bonus)
  NO: "Re-spin feature when numbers are marked with spin symbol - locks in place and respins other reels" → null (simple respin mechanic, not a dedicated lock-grid-respin H&S bonus)
  NO: "Cash Collect: coin prizes landed inside the Mummy Zone are awarded" → this is Cash On Reels, NOT Hold and Spin
  NO: "Hold & Spin-style bonus" without explicit lock+respin+counter description → null

STATIC JACKPOT:
  IS: A jackpot system with fixed-value prize tiers. Includes: named tiers (Mini/Minor/Major/Grand), fixed jackpots, linked progressives, "jackpot bonus" features, and instant jackpot prizes. If a game mentions "jackpot" or "jackpots" as a feature (not just max win), classify as Static Jackpot. IMPORTANT: virtually ALL Hold and Spin / Hold & Win games include Static Jackpot tiers — if a game has Hold and Spin, it almost certainly has Static Jackpot too. Also includes "Epic Strike", "Jackpot Royale", "Lightning Link" style jackpot systems.
  NOT: Max win caps ("max win 2500x"). Truly variable community/pooled jackpots explicitly described as shared across a network of players.
  YES: "Four-tier jackpot: Mini ($50), Minor ($100), Major ($500), Grand ($5000)" → conf:5
  YES: "Four linked progressive jackpots" or "progressive jackpot tiers" → conf:5
  YES: "Jackpot Feature bonus" or "Jackpot Bonus" → conf:5
  YES: "Five different jackpot levels" → conf:5
  YES: "Four fixed jackpots triggered when prize coin and collect symbol appear" → conf:5
  YES: "Progressive Jackpot" (bare label) → conf:5 (catalogs label fixed-tier jackpots as "progressive")
  YES: "Instant jackpots" or "Epic Strike Tower instant jackpots" → conf:5
  YES: "Multiple jackpots" or "jackpots available" → conf:4 (likely fixed-tier)
  YES: "Hold & Win with jackpot prizes" → conf:5 (H&W always has SJ tiers)
  YES: "Bonus Win collection with Bronze, Silver, Gold meters" → conf:5 (named-tier collection)
  YES: "Jackpots available through wheel bonus: Major 2000x, Grand 15000x" → conf:5 (named jackpot tiers even if inside wheel)
  NO: "Maximum win of 2500x" → null (max win cap, not a jackpot feature)
  NO: "Community jackpot shared across all players on network" → null (truly pooled/networked)

WILD REELS:
  IS: A DEDICATED FEATURE where one or more entire reels RANDOMLY turn fully wild on their own, independent of where individual wild symbols land. The key test: do reels turn wild WITHOUT a wild symbol landing and expanding? The reels must act as WILD (substituting for other symbols).
  NOT: "Expanding Wilds" where a wild symbol grows to fill its reel. Stacked wilds. Regular wilds. "Stacks" features where special symbols expand to cover reels. Any mechanic where a symbol LANDS first and then EXPANDS to cover the reel. Decorative reel effects (gold/colored backgrounds) that do NOT make the reel act as a wild substitute.
  YES: "Random Wild Reels feature: 1-3 reels randomly turn fully wild each spin" → conf:5
  YES: "Hot Hot feature that randomly turns entire reel wild" → conf:5 (random reel wild = Wild Reels)
  NO: "Expanding Wilds - wilds expand to cover entire reels during free spins" → null (a wild lands, then expands — that's expanding wilds, not Wild Reels)
  NO: "Free spins with expanding wilds that turn entire reels wild" → null (expanding wilds mechanic triggered by a wild symbol landing)
  NO: "Special symbol on reel 5 expands gold backgrounds to cover entire reels" → null (expansion triggered by a symbol, not random wild reels)
  NO: "Gold reel feature where reels randomly turn gold during base game" → null (decorative gold background for jackpot tracking, not wild substitution)
  NO: "Reels turn gold to track jackpot progress" → null (gold decoration, not wild reels)
  NO: "Stacked Wilds on reels 2-4" → null
  NO: "Wild Re-Spin with reel 2 fully wild" → null (a single reel going wild as part of a respin is not the Wild Reels feature)
  NO: "Coin collection fills circles above reels, three coins trigger wild reel transformation" → null (collection mechanic triggering a transformation, not a random wild reel feature)

CASH ON REELS:
  IS: Symbols that display their OWN cash/credit values directly on the reels as a visible feature. Includes games where cash/coin/token symbols with explicit credit/multiplier values land on the reels, even if those symbols also feed into a bonus. The key: symbols with VALUES printed on them appear on the reel grid.
  NOT: Coin collection mechanics where coins fly OFF the reels to external meters/collectors (that's Persistence). "Win What You See" number steppers. Cash values that exist ONLY as text in a paytable, not displayed on symbols.
  YES: "Fireball symbols with credit values 20x-1500x appear in base game AND trigger Cash Eruption bonus" → conf:5
  YES: "6+ Cash Volt symbols = instant win cash prize (6=5x, 9=50x, 15=2500x)" → conf:5
  YES: "Cash Bonus - gold tokens with credit values land on reels" → conf:5 (tokens with values = COR)
  YES: "Cash Collect feature - cash symbols with bet multiplier values appear on reels" → conf:5
  YES: "Money Ball symbols with credit values land on reels during gameplay" → conf:5
  NO: "Coin collection feature - coins land and fill circles/meters ABOVE reels" → null (collection to external meters = Persistence, not COR)
  NO: "Coin collection mechanic where coins fly to tikis/meters on screen" → null (collection/persistence mechanic, not COR)
  NO: "Instant Win symbols that collect all values" → null (generic H&S collect mechanic description, not COR)
  NO: "Win What You See: numbers on reels concatenate to form payout amount" → null (base mechanic of stepper)
  NO: "Collecting cash prizes during the All Aboard lock-and-respin feature" → null (part of H&S)

EXPANDING REELS:
  IS: The reel SET physically grows — more rows added, more ways-to-win unlocked dynamically. Includes: xWays (Nolimit City), Megaways (BTG), Infinity Reels (ReelPlay), any mechanic where the grid size or number of ways CHANGES during gameplay.
  NOT: Colossal/Super Symbols (2x2, 3x3 bigger versions). Expanding wilds. Static configurations. Fixed "1024 ways" that never changes. PowerXStream / Power XStream (this is a fixed ways-based win evaluation, NOT expanding reels).
  YES: "xWays: mystery symbols expand reels to increase ways from 4096 to 46656" → conf:5
  YES: "Megaways mechanic with up to 117,649 ways to win" → conf:5
  YES: "Infinity Reels: new reels added to the right with each cascade" → conf:5
  YES: "Reels expand from 3x5 to 5x5 during free spins increasing ways from 243 to 3125" → conf:5
  NO: "Super Symbols: 2x2 and 3x3 oversized versions" → null (Colossal Symbols ≠ Expanding Reels)
  NO: "1024 ways to win" → null (static ways count, not expanding)
  NO: "PowerXStream mechanics for 243 ways to win" → null (PowerXStream is a ways evaluation mechanic, not expanding reels)
  NO: "PowerXStream evaluation method for pays" → null (same — fixed ways evaluation, not grid expansion)

NUDGES:
  IS: A NAMED feature where reels shift UP or DOWN after stopping to improve combinations. "xNudge", "Nudge Feature", "Symbol Nudge" are Nudges. Must be a recognizable, NAMED game mechanic where "nudge" is in the feature name.
  NOT: Cascading/tumbling/avalanche reels. Regular reel stopping. "Second chance" mechanics. Any mechanic described as a reel shifting/moving that is NOT explicitly called a "nudge" or "Nudge Feature" by name.
  YES: "xNudge Wild drops to bottom position step by step" → conf:5
  YES: "Nudge feature: reels nudge up or down to complete winning combinations" → conf:5
  NO: "Second chance feature - reel 5 nudges upward 2-3 positions for another chance" → null (retry mechanic, not a named Nudge feature)

MULTIPLIER:
  IS: A feature where wins are multiplied by a factor greater than 1x. Includes wild multipliers, free spins with increasing multipliers, random multipliers, win multipliers, and multiplier trails/ladders. The game must explicitly feature multiplier values (2x, 3x, 5x, etc.) as a recognizable mechanic.
  NOT: Standard wild substitution without multiplier. Base paytable payouts. Maximum win potential expressed as a multiplier of bet (e.g. "max win 5000x"). Jackpot values expressed as multipliers.
  YES: "Wild symbols carry random 2x or 3x multipliers" → conf:5
  YES: "Free spins with increasing multiplier: starts at 1x, increases by 1x each cascade" → conf:5
  YES: "Random Multiplier: any spin can randomly apply 2x-10x multiplier" → conf:5
  YES: "Multiplier trail in bonus: collect symbols to advance 2x→3x→5x→10x" → conf:5
  NO: "Maximum win of 5000x total bet" → null (max win cap, not a feature)
  NO: "Wild symbol substitutes for all symbols" → null (basic wild, no multiplier attached)
  NO: "If four of a kind with no bolt, reel 5 nudges upward for another chance at bonus" → null (retry/second chance, not a named Nudge feature)
  NO: "Reel shift mechanic for another opportunity" → null (generic shift, not named Nudge)

PICK BONUS:
  IS: A dedicated bonus round where the player picks from MANY hidden items and EACH pick reveals an individual prize. The picking IS the bonus game itself (not just a selection screen). Includes jackpot pick games where you pick objects to reveal jackpot levels.
  NOT: Gate/selector (choosing between bonus modes like "pick free spins or hold and spin"). Match-3 auto-triggered jackpot. Bonus entry selection where you choose WHICH bonus to play. Choosing between options at the start of a bonus.
  YES: "Pick from 12 treasure chests to reveal instant cash prizes" → conf:5
  YES: "Pick bonus: choose stones to reveal hidden prizes until you find the collect symbol" → conf:5
  YES: "Jackpot Pick bonus - pick from 12 objects to reveal one of four jackpots" → conf:5 (picking objects to reveal jackpots = Pick Bonus)
  YES: "Pick bonus triggered by 3 or more scatter symbols" → conf:5 (dedicated pick round triggered by scatters)
  NO: "Pick a door to enter Free Spins or Hold and Spin" → null (gate/selector, not Pick Bonus)
  NO: "Choose between free spins or fortune blast bonus" → null (bonus mode selector, not Pick Bonus)
  NO: "Free Spins Pick Bonus - choose between free spins options" → null (selecting bonus parameters, not a pick-objects prize game)

RESPIN:
  IS: A NAMED, STANDALONE respin mechanic with its own visual identity and clear trigger. Specific reels spin again after a distinct triggering event.
  NOT: Cascading/tumbling/avalanche reels. Hold and Spin respins. Minor side-effects where another feature incidentally awards a respin (e.g., "boost symbols raise values and award respins" — that's a bonus trigger, not a standalone Respin feature). Vague "respins" without clear standalone identity.
  YES: "Special symbol on reel 3 triggers respin of reels 1 and 5" → conf:5
  YES: "Zero Respin: when a zero appears on a losing spin, blank reels respin" → conf:5 (named mechanic)
  NO: "Cascading: winning symbols disappear, new ones tumble down" → null
  NO: "Boost symbols raise paytable values and award respins" → null (side-effect, not standalone)
  NO: "Jackpot Respins: 6+ scatters trigger respins, symbols lock, counter resets on new scatter" → this is Hold and Spin (lock + respin + counter reset), NOT standalone Respin

WHEEL:
  IS: A standalone BONUS wheel triggered by specific symbols, with multiple prize SEGMENTS (cash, multipliers, jackpots). The wheel IS the main bonus feature.
  NOT: Gamble/double-up wheels after wins. Jackpot determination wheels (spin to pick which tier, e.g. "jackpot wheel spun to determine tier won" — that's part of Static Jackpot). Selection mechanisms. Prize ladders.
  YES: "Gold Coins trigger spinning bonus wheel with cash and jackpot segments" → conf:5
  NO: "Gamble: spin wheel to double or lose winnings" → null
  NO: "Jackpot wheel spun to determine which tier is won" → classify as Static Jackpot if named tiers exist, not Wheel

PERSISTENCE:
  IS: A feature where game state visibly accumulates or persists across spins. Includes: persistent wilds, collector meters, pot/meter collection systems, growing/building mechanics, symbol upgrade paths, and any visible accumulator that tracks progress. If the player can SEE a meter, pot, collection counter, or building progress that changes across spins, that is Persistence.
  NOT: Sticky wilds that only appear WITHIN a free spins bonus round (that's part of Free Spins). Standard jackpot accumulation displays. Simple win counters.
  YES: "Persistent Wild: wild symbol stays on the reel for the next 3 base game spins" → conf:5
  YES: "Collector meter tracks progress across spins" → conf:5
  YES: "Pots of gold accumulate coins toward bonus trigger" → conf:5 (visible pot collection = Persistence)
  YES: "Build houses from straw to brick" → conf:5 (building/upgrade progression = Persistence)
  YES: "Chickens grow fatter with golden riches" → conf:5 (visual growth mechanic = Persistence)
  YES: "Fill meters to unlock bonus tiers" → conf:5 (meter-based progression = Persistence)
  YES: "Zone Multipliers that build across spins" → conf:5 (accumulating zones = Persistence)
  YES: "Symbol upgrade path during gameplay" → conf:4 (upgrade progression = Persistence)
  NO: "Sticky wilds during free spins only" → null (bonus-internal, not base game persistence)
  NO: "Progressive jackpot display" → null (standard jackpot UI, not a gameplay feature)

BUY BONUS:
  IS: An option to purchase direct entry into a bonus round (usually free spins) for a fixed cost, bypassing the normal trigger. Known as: Feature Buy, Bonus Buy, Ante Bet.
  NOT: Regular bonus triggers. Increased-bet options that just change odds.
  YES: "Buy Feature: pay 80x bet to enter free spins directly" → conf:5
  NO: "Ante Bet increases RTP" → conf:3 (borderline, include if labeled as buy option)

CASCADING REELS:
  IS: After a win, winning symbols are removed and new symbols fall/tumble into the gaps, potentially creating chain wins. Known as: Avalanche, Tumble, Tumbling Reels, Rolling Reels, Reactions, Gravity Reels, CashCade.
  NOT: Regular reel spins. Expanding reels. Symbol swaps.
  YES: "Avalanche: winning symbols explode and new ones fall from above" → conf:5
  YES: "Cascading wins where symbols disappear and new ones drop in" → conf:5

MEGAWAYS:
  IS: The Big Time Gaming Megaways mechanic where each reel shows a variable number of symbols per spin (2-7), creating up to 117,649 ways to win. Licensed to many providers.
  NOT: Fixed ways-to-win (e.g. "243 ways"). PowerXStream. Standard expanding reels without the variable-symbol-count mechanic.
  YES: "Megaways mechanic with up to 117,649 ways to win" → conf:5
  YES: "Megaways engine with variable reel sizes" → conf:5
  NO: "1024 ways to win" → null (fixed ways, not Megaways)

STICKY WILDS:
  IS: Wild symbols that remain locked in position for multiple spins or for the duration of a bonus round.
  NOT: Regular wilds. Expanding wilds (which grow but don't persist). Walking wilds (which move).
  YES: "Sticky wilds remain in place for 3 consecutive spins" → conf:5
  YES: "Wilds lock in place during free spins and stay for remaining spins" → conf:5

EXPANDING WILDS:
  IS: A wild symbol that expands to cover an entire reel (or section) when it lands. The expansion is triggered by the wild symbol itself landing.
  NOT: Wild Reels (random full-reel wilds without a symbol landing first). Stacked wilds (pre-stacked, not expanding). Regular wilds.
  YES: "Wild expands to cover entire reel when it appears" → conf:5
  NO: "Stacked wilds cover 3 positions" → null (stacked, not expanding)

GAMBLE FEATURE:
  IS: An optional post-win feature where the player can risk their winnings for a chance to double (or more) them. Known as: Double Up, Risk Game, Card Gamble.
  NOT: Regular gameplay. Bonus selection screens.
  YES: "Gamble: guess card color to double winnings" → conf:5
  YES: "Risk/Gamble feature available after any win" → conf:5

MYSTERY SYMBOLS:
  IS: Special symbols that land on the reels and then all transform into the same random symbol, creating potential big wins.
  NOT: Regular scatter or wild symbols. Symbol transformations that are not "mystery reveal" style.
  YES: "Mystery symbols all reveal the same random symbol" → conf:5
  YES: "Mystery stacks land and transform into matching symbols" → conf:5

COLOSSAL SYMBOLS:
  IS: Oversized symbols (2x2, 3x3, or larger) that appear on the reels, covering multiple positions.
  NOT: Expanding wilds. Regular large paytable icons. Stacked symbols (vertically stacked, not oversized).
  YES: "Giant 3x3 symbol appears on the reels" → conf:5
  YES: "Colossal symbols cover a 2x2 area" → conf:5

PROGRESSIVE JACKPOT:
  IS: A jackpot that grows over time as players place bets, with a portion of each bet contributing to the prize pool. The jackpot value increases until won.
  NOT: Fixed/static jackpots with set values. Standard bonus wins.
  YES: "Progressive jackpot that grows with every spin across the network" → conf:5
  YES: "Rising Rewards: progressive jackpots that increase as you play" → conf:5

STACKED SYMBOLS:
  IS: Symbols that appear in stacks of 2+ on a single reel, covering multiple consecutive positions vertically.
  NOT: Colossal/mega symbols (which cover multiple reels). Regular symbols. Expanding wilds.
  YES: "Stacked symbols on all reels in base game and free spins" → conf:5
  YES: "Action Stacked Symbols: full stacks of matching symbols" → conf:5

SYMBOL TRANSFORMATION:
  IS: A feature where symbols on the reels change/transform into other symbols (typically higher-value ones) to create or improve wins.
  NOT: Mystery symbols (all reveal same symbol). Cascading/tumbling. Wild substitution.
  YES: "Symbol swap: low-value symbols transform into high-value symbols" → conf:5
  YES: "Transforming symbols feature converts symbols to wilds" → conf:5

═══════════════════════════════════════
GENERAL RULES (apply to ALL features)
═══════════════════════════════════════
• UI conveniences (autoplay, turbo spin, selectable paylines) → null
• Bet configuration options → null
• Basic wild substitution without multiplier or full-reel coverage → null
• Board/trail games, skill games → null (not in taxonomy)
• Cluster Pays / Cluster Wins → null (not in taxonomy)
• Walking Wilds / Shifting Wilds → null (not in taxonomy)

CROSS-PROVIDER TERMINOLOGY (important for non-AGS games):
• "Megaways" = Megaways (the BTG mechanic)
• "Infinity Reels" = Expanding Reels (new reels added during gameplay)
• "PowerXStream" = NOT Expanding Reels (AGS ways expansion system, it's a WAYS mechanic not expanding reels)
• "Lightning Link" / "Dragon Link" / "Dollar Storm" / "Ultimate Fire Link" = Hold and Spin
• "Power Prizes" / "Money Collect" / "Cash Collect" with zone-collection = Cash On Reels
• "Scatter Pays" = NOT Cash On Reels (scatter wins are a payline mechanic)
• "Linked Progressive" / "Must Hit By Jackpot" with named tiers = Static Jackpot
• When UNSURE, classify as null — false negatives are better than false positives

═══════════════════════════════════════
THEME CLASSIFICATION
═══════════════════════════════════════
Match raw visual/setting descriptions to closest canonical theme. Multiple apply.
EXAMPLES:
  "Finance/bank vault environment" → "Money"
  "Gold bars, stacks of cash" → "Gold"
  "Diamond/gem theme with crystal tones" → "Gems & Crystals"
  "Fiery backdrop, flames" → "Fire"
  "Classic 7s and BAR symbols, retro" → "7s"
  "Animal characters" → "Animals"
  "Classic Las Vegas feel" → "Las Vegas"
  "Ancient Egyptian pyramids" → "Egyptian"
  "Undead, zombies, vampires, werewolves" → "Mythical"
  "Dragons, unicorns, mythical creatures" → "Mythical"

For each raw item, decide: does it match a feature definition above? Rate confidence 1-5.
If unsure or no clear match → null.
Features require conf >= {FEATURE_CONFIDENCE_THRESHOLD} (higher bar — FPs are costly).
Themes require conf >= {CONFIDENCE_THRESHOLD}.

Output JSON:
{{
  "feature_map": [
    {{"raw": "brief raw description", "canonical": "Feature Name" or null, "conf": 5}}
  ],
  "theme_map": [
    {{"raw": "brief raw description", "canonical": "Theme Name" or null, "conf": 5}}
  ],
  "features": ["only canonical features with conf >= {FEATURE_CONFIDENCE_THRESHOLD}"],
  "themes": ["only canonical themes with conf >= {CONFIDENCE_THRESHOLD}"]
}}

Output ONLY the JSON object."""


# Cache the system prompt once at module load (it never changes across games)
_NORMALIZE_SYSTEM_PROMPT = _build_normalize_system_prompt()


def build_normalize_prompt(game_name: str, provider: str, raw_extraction: Dict) -> str:
    """Build the game-specific user message for Stage 2 normalization."""
    raw_themes = raw_extraction.get("themes_raw") or []
    raw_features = raw_extraction.get("features_raw") or []

    return f"""CLASSIFY THIS GAME: "{game_name}" by {provider}

RAW FEATURES: {json.dumps(raw_features)}
RAW THEMES: {json.dumps(raw_themes)}"""


def call_normalize(
    game_name: str, provider: str, raw_extraction: Dict,
    verbose: bool = False,
) -> Optional[Dict]:
    """Execute Stage 2: confidence-gated normalization via few-shot examples.

    Uses Anthropic prompt caching: the system prompt (few-shot examples) is
    cached after the first call — subsequent calls pay only 10% for it.
    """
    user_prompt = build_normalize_prompt(game_name, provider, raw_extraction)

    max_retries = 3
    for attempt in range(max_retries):
        try:
            resp = CLIENT.messages.create(
                model=NORM_MODEL,
                max_tokens=1500,
                temperature=0,
                system=[{
                    "type": "text",
                    "text": _NORMALIZE_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": user_prompt}],
            )
            text = resp.content[0].text.strip()
            m = re.search(r'\{[\s\S]*\}', text)
            if not m:
                return None

            result = json.loads(m.group())

            # GATE: confidence-enforcement — rebuild features/themes from maps
            # Do not trust model's arrays; they sometimes include below-threshold items
            # GATE: unknown-feature-rejection — only canonical features/themes pass
            verified_features: set = set()
            for fm in result.get("feature_map", []):
                canon = fm.get("canonical")
                conf = fm.get("conf", 0)
                raw = fm.get("raw", "")[:60]
                if canon and canon not in KNOWN_FEATURES:
                    if verbose:
                        print(f"    [REJECT] '{raw}' → {canon} (not in KNOWN_FEATURES)")
                    continue
                if canon and conf >= FEATURE_CONFIDENCE_THRESHOLD:
                    verified_features.add(canon)
                    if verbose:
                        print(f"    [PASS] '{raw}' → {canon} (conf:{conf})")
                elif verbose:
                    gate_label = canon or "None"
                    print(f"    [DROP] '{raw}' → {gate_label} (conf:{conf})")

            verified_themes: set = set()
            for tm in result.get("theme_map", []):
                canon = tm.get("canonical")
                conf = tm.get("conf", 0)
                raw = tm.get("raw", "")[:60]
                if canon and canon not in KNOWN_THEMES:
                    if verbose:
                        print(f"    [REJECT] '{raw}' → {canon} (not in KNOWN_THEMES)")
                    continue
                if canon and conf >= CONFIDENCE_THRESHOLD:
                    verified_themes.add(canon)
                    if verbose:
                        print(f"    [PASS] '{raw}' → {canon} (conf:{conf})")
                elif verbose:
                    gate_label = canon or "None"
                    print(f"    [DROP] '{raw}' → {gate_label} (conf:{conf})")

            features = sorted(verified_features)
            themes = sorted(verified_themes)

            model_features = set(result.get("features") or [])
            model_themes = set(result.get("themes") or [])
            stripped_f = model_features - verified_features
            stripped_t = model_themes - verified_themes
            if verbose:
                if stripped_f:
                    print(f"  [GATE] Stripped model features below threshold: {sorted(stripped_f)}")
                if stripped_t:
                    print(f"  [GATE] Stripped model themes below threshold: {sorted(stripped_t)}")
                print(f"  [NORM] features={features} themes={themes}")

            return {
                "features": features,
                "themes": themes,
                "feature_map": result.get("feature_map", []),
                "theme_map": result.get("theme_map", []),
            }

        except (anthropic.RateLimitError, anthropic.APIStatusError) as e:
            status = getattr(e, "status_code", 0)
            is_retriable = isinstance(e, anthropic.RateLimitError) or status in (429, 529, 500, 502, 503)
            if is_retriable and attempt < max_retries - 1:
                wait = 30 * (attempt + 1)
                if verbose:
                    print(f"  [NORM] API error ({status}), waiting {wait}s...")
                time.sleep(wait)
            else:
                if verbose:
                    print(f"  [NORM ERROR] API error: {e}")
                return None

        except Exception as e:
            if verbose:
                print(f"  [NORM ERROR] {e}")
            return None

    return None


# ---------------------------------------------------------------------------
# FULL PIPELINE: Stage 1 → Stage 2 → Post-processing
# ---------------------------------------------------------------------------
def enrich_one_game(
    game: Dict, verbose: bool = False,
    extract_model: Optional[str] = None,
) -> Tuple[Dict, Dict]:
    """Enrich a single game using the 2-stage web search pipeline.

    Returns (dashboard_record, meta_record).
    """
    game_name = game["name"]
    provider_info = game.get("provider", {})
    provider = provider_info.get("display_name") or provider_info.get("studio") or "Unknown"

    if verbose:
        print(f"\n{'='*60}")
        print(f"ENRICHING: {game_name} ({game['id']})")
        print(f"  Provider: {provider}")

    # ---- Stage 0: Provider catalog lookup (direct fetch, no LLM cost) ----
    catalog = fetch_provider_catalog(game_name, provider, verbose)

    # ---- Stage 1: Free-form web search extraction ----
    if verbose:
        print("  [STAGE 1] Free-form web search extraction...")

    raw_extraction, ws_meta = call_web_search(
        game_name, provider, verbose, model_override=extract_model
    )
    if not raw_extraction:
        if catalog and (catalog.get("features_raw") or catalog.get("description")):
            if verbose:
                print("  [FALLBACK] Web search failed, using catalog data only")
            raw_extraction = {
                "features_raw": catalog.get("features_raw", []),
                "themes_raw": catalog.get("themes", []),
                "description": catalog.get("description"),
                "rtp": catalog.get("rtp"),
                "reels": catalog.get("reels"),
                "rows": catalog.get("rows"),
                "symbols": [],
                "completeness": 2,
            }
            ws_meta["fallback"] = "catalog_only"
        else:
            raise ValueError(f"Web search extraction failed for {game_name}")

    completeness = raw_extraction.get("completeness", 5)
    if verbose:
        print(f"  [QUALITY] Extraction completeness: {completeness}/5")
    ws_meta["completeness"] = completeness

    if completeness < 3:
        if verbose:
            print(f"  [RETRY] Low quality ({completeness}/5), retrying web search...")
        time.sleep(5)
        retry_extraction, retry_meta = call_web_search(
            game_name, provider, verbose, model_override=extract_model
        )
        if retry_extraction:
            retry_completeness = retry_extraction.get("completeness", 0)
            if verbose:
                print(f"  [RETRY] Retry completeness: {retry_completeness}/5")
            if retry_completeness > completeness:
                raw_extraction = retry_extraction
                ws_meta = retry_meta
                completeness = retry_completeness
                ws_meta["completeness"] = completeness
                ws_meta["retried"] = True
                if verbose:
                    print(f"  [RETRY] Using retry result (better quality)")
            else:
                if verbose:
                    print(f"  [RETRY] Keeping original (retry not better)")

    # ---- Merge catalog data into extraction (catalog is authoritative) ----
    if catalog:
        ws_meta["catalog_source"] = catalog.get("source_url")
        for field in ("rtp", "volatility", "reels", "rows",
                      "paylines_kind", "paylines_value", "description"):
            if catalog.get(field) and not raw_extraction.get(field):
                raw_extraction[field] = catalog[field]

        catalog_raw_features = catalog.get("features_raw", [])
        if catalog_raw_features:
            existing = raw_extraction.get("features_raw") or []
            raw_extraction["features_raw"] = existing + catalog_raw_features
            if verbose:
                print(f"  [CATALOG] Injecting raw features into extraction: {catalog_raw_features}")

    # ---- Stage 2: Normalize to canonical taxonomy ----
    if verbose:
        print("  [STAGE 2] Normalizing to canonical taxonomy...")

    catalog_features = catalog.get("features", []) if catalog else []
    catalog_themes = catalog.get("themes", []) if catalog else []

    normalized = call_normalize(game_name, provider, raw_extraction, verbose)
    if not normalized:
        raise ValueError(f"Normalization failed for {game_name}")

    # ---- Post-processing: merge catalog + web search, synonym safety net ----
    final_features = normalized.get("features") or []
    final_themes = normalized.get("themes") or []

    if catalog_features:
        catalog_features_norm = normalize_features(catalog_features, verbose=False)
        merged = sorted(set(final_features) | set(catalog_features_norm))
        if verbose and set(catalog_features_norm) - set(final_features):
            added = set(catalog_features_norm) - set(final_features)
            print(f"  [CATALOG+] Added from provider catalog: {added}")
        final_features = merged

    if catalog_themes:
        catalog_themes_norm = normalize_themes(catalog_themes, verbose=False)
        merged = sorted(set(final_themes) | set(catalog_themes_norm))
        if verbose and set(catalog_themes_norm) - set(final_themes):
            added = set(catalog_themes_norm) - set(final_themes)
            print(f"  [CATALOG+] Added from provider catalog: {added}")
        final_themes = merged

    if verbose:
        print(f"  [POST] Synonym normalization: {len(final_features)} features, {len(final_themes)} themes")
    final_features = normalize_features(final_features, verbose)
    final_themes = normalize_themes(final_themes, verbose)

    raw_text = ' '.join(raw_extraction.get("features_raw") or []).lower()
    feature_map = normalized.get("feature_map", [])

    # GATE: catalog-bypass — catalog-confirmed features skip post-processing strips
    catalog_confirmed = set(catalog_features_norm) if catalog_features else set()

    # GATE: pxs-er-strip — PowerXStream evidence is NOT Expanding Reels
    if "Expanding Reels" in final_features and "Expanding Reels" not in catalog_confirmed:
        er_items = [i for i in feature_map if i.get("canonical") == "Expanding Reels"]
        all_pxs = er_items and all(
            any(w in (i.get('raw', '')).lower() for w in ['powerxstream', 'power x stream', 'power xstream', 'pxs'])
            for i in er_items
        )
        if all_pxs:
            final_features = [f for f in final_features if f != "Expanding Reels"]
            if verbose:
                print("  [POST] Stripped Expanding Reels (PowerXStream-only evidence)")

    # GATE: expanding-wilds-wr-strip — expanding wilds evidence is NOT Wild Reels
    if "Wild Reels" in final_features and "Wild Reels" not in catalog_confirmed:
        wr_items = [i for i in feature_map if i.get("canonical") == "Wild Reels"]
        all_expanding = wr_items and all(
            any(w in (i.get('raw', '')).lower() for w in ['expanding wild', 'expand to fill', 'expands to cover', 'transform entire reel'])
            for i in wr_items
        )
        if all_expanding:
            final_features = [f for f in final_features if f != "Wild Reels"]
            if verbose:
                print("  [POST] Stripped Wild Reels (expanding-wilds-only evidence)")

    # GATE: interactive-cor-strip — interactive mini-game evidence is NOT Cash On Reels
    if "Cash On Reels" in final_features and "Cash On Reels" not in catalog_confirmed:
        cor_items = [i for i in feature_map if i.get("canonical") == "Cash On Reels"]
        all_interactive = cor_items and all(
            any(w in (i.get('raw', '')).lower() for w in ['tap them', 'catch', 'dive down', 'interactive'])
            for i in cor_items
        )
        if all_interactive:
            final_features = [f for f in final_features if f != "Cash On Reels"]
            if verbose:
                print("  [POST] Stripped Cash On Reels (interactive mini-game, not COR)")

    # GATE: hs-sj-safety — Hold and Spin virtually always has Static Jackpot tiers
    if "Hold and Spin" in final_features and "Static Jackpot" not in final_features:
        final_features.append("Static Jackpot")
        if verbose:
            print("  [POST] Added Static Jackpot (Hold and Spin → SJ safety net, 100% GT correlation)")

    # GATE: pick-gate-strip — gate/selector evidence is NOT Pick Bonus
    if "Pick Bonus" in final_features and "Pick Bonus" not in catalog_confirmed:
        pb_items = [i for i in feature_map if i.get("canonical") == "Pick Bonus"]
        gate_kw = ['gate', 'selector', 'choose between', 'choose which', 'pick a door',
                   'select which bonus', 'pick a mode', 'select between', 'vault selection',
                   'choose one of', 'select one of', 'pick which bonus']
        all_gate = pb_items and all(
            any(w in (i.get('raw', '')).lower() for w in gate_kw)
            for i in pb_items
        )
        if all_gate:
            final_features = [f for f in final_features if f != "Pick Bonus"]
            if verbose:
                print("  [POST] Stripped Pick Bonus (gate/selector evidence, not Pick Bonus)")

    # ---- Build output records ----
    master_perf = game.get("performance", {})
    master_release = game.get("release", {})

    quality = "verified"
    if not final_themes:
        quality = "partial"
    elif not final_features:
        quality = "partial"

    demo_url = get_demo_url(game_name, provider) or raw_extraction.get("demo_url")
    catalog_url = catalog.get("source_url") if catalog else None

    dashboard_rec = {
        "id": game["id"],
        "name": game_name,
        "description": raw_extraction.get("description"),
        "provider": provider,
        "studio": provider_info.get("studio", provider),
        "parent_company": provider_info.get("parent", provider),
        "provider_website": PROVIDER_WEBSITES.get(provider_info.get("studio", provider)) or PROVIDER_WEBSITES.get(provider, ""),
        "theme_primary": final_themes[0] if final_themes else None,
        "theme_secondary": final_themes[1] if len(final_themes) > 1 else None,
        "themes_all": final_themes,
        "features": final_features,
        "symbols": raw_extraction.get("symbols") or [],
        "mechanic_primary": game.get("mechanic", {}).get("primary", "Slot"),
        "reels": raw_extraction.get("reels"),
        "rows": raw_extraction.get("rows"),
        "paylines_kind": raw_extraction.get("paylines_kind"),
        "paylines_count": raw_extraction.get("paylines_value"),
        "rtp": raw_extraction.get("rtp"),
        "volatility": raw_extraction.get("volatility"),
        "max_win": raw_extraction.get("max_win"),
        "min_bet": raw_extraction.get("min_bet"),
        "max_bet": raw_extraction.get("max_bet"),
        "release_year": master_release.get("year"),
        "release_month": master_release.get("month"),
        "theo_win": master_perf.get("theo_win"),
        "market_share_pct": master_perf.get("market_share_percent"),
        "percentile": master_perf.get("percentile"),
        "anomaly": master_perf.get("anomaly"),
        "demo_url": demo_url,
        "catalog_url": catalog_url,
        "data_quality": quality,
        "source_tier": "claude_web_search+2stage",
    }

    meta_rec = {
        "web_searches": ws_meta.get("searches", 0),
        "web_sources": ws_meta.get("sources", [])[:10],
        "extract_model": ws_meta.get("model", EXTRACT_MODEL),
        "norm_model": NORM_MODEL,
        "completeness": completeness,
        "verification_triggered": ws_meta.get("verification_searches", False),
        "raw_themes": raw_extraction.get("themes_raw") or [],
        "raw_features": raw_extraction.get("features_raw") or [],
        "raw_symbols": raw_extraction.get("symbols") or [],
        "feature_map": normalized.get("feature_map", []),
        "theme_map": normalized.get("theme_map", []),
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "enriched_at": datetime.now(timezone.utc).isoformat(),
    }

    return dashboard_rec, meta_rec


# ---------------------------------------------------------------------------
# GROUND TRUTH COMPARISON
# ---------------------------------------------------------------------------
FEW_SHOT_NAMES: set = set()


def _name_match(a: str, b: str) -> bool:
    def norm(s):
        return s.lower().replace("'", "").replace("!", "").replace("\u2019", "").strip()
    return norm(a) == norm(b)


def compare_with_ground_truth(dashboard_records: List[Dict]):
    """Compare enrichment output against ground truth and print accuracy metrics."""
    if not GROUND_TRUTH_PATH.exists():
        print("\nNo ground truth file found.")
        return

    gt = json.loads(GROUND_TRUTH_PATH.read_text())
    if not gt:
        return

    total = feat_tp = feat_fp = feat_fn = 0
    theme_match = theme_total = 0

    print(f"\n{'='*60}")
    print("GROUND TRUTH COMPARISON")
    print(f"{'='*60}")

    for rec in dashboard_records:
        game_name = rec["name"]
        if game_name in FEW_SHOT_NAMES:
            continue

        gt_entry = None
        for gt_name, gt_data in gt.items():
            if _name_match(game_name, gt_name):
                gt_entry = gt_data
                break

        if not gt_entry:
            continue

        total += 1
        gt_themes = set(gt_entry.get("themes", []))
        gt_features = set(gt_entry.get("features", []))
        our_themes = set(rec.get("themes_all") or [])
        our_features = set(rec.get("features") or [])

        theme_total += 1
        if gt_themes & our_themes:
            theme_match += 1

        tp = len(gt_features & our_features)
        fp = len(our_features - gt_features)
        fn = len(gt_features - our_features)
        feat_tp += tp
        feat_fp += fp
        feat_fn += fn

        print(f"\n  {game_name}:")
        print(f"    GT themes:   {sorted(gt_themes)}")
        print(f"    Our themes:  {sorted(our_themes)}")
        print(f"    Theme:       {'MATCH' if gt_themes & our_themes else 'MISS'}")
        print(f"    GT features: {sorted(gt_features)}")
        print(f"    Our features:{sorted(our_features)}")
        missing = gt_features - our_features
        extra = our_features - gt_features
        if missing:
            print(f"    MISSING:     {sorted(missing)}")
        if extra:
            print(f"    EXTRA:       {sorted(extra)}")
        if not missing and not extra:
            print(f"    ** PERFECT MATCH **")

    if total == 0:
        print("\n  No test games found in ground truth.")
        return

    precision = feat_tp / (feat_tp + feat_fp) if (feat_tp + feat_fp) else 0
    recall = feat_tp / (feat_tp + feat_fn) if (feat_tp + feat_fn) else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0

    print(f"\n{'─'*40}")
    print(f"  ACCURACY ({total} test games):")
    print(f"    Feature Precision: {precision:.0%} ({feat_tp} correct / {feat_tp + feat_fp} extracted)")
    print(f"    Feature Recall:    {recall:.0%} ({feat_tp} found / {feat_tp + feat_fn} expected)")
    print(f"    Feature F1:        {f1:.0%}")
    print(f"    Theme Accuracy:    {theme_match}/{theme_total} have overlap")
    print(f"{'─'*40}")


# ---------------------------------------------------------------------------
# CHECKPOINT + DATA LOADING
# ---------------------------------------------------------------------------
def load_checkpoint() -> Dict:
    if CHECKPOINT_PATH.exists():
        return json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
    return {"version": 5, "total": 0, "done": 0, "failed": 0, "games": {}}


def save_checkpoint(cp: Dict):
    tmp = CHECKPOINT_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(cp, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.rename(CHECKPOINT_PATH)


# ---------------------------------------------------------------------------
# BATCH API SUPPORT (50% cost savings, async processing)
# ---------------------------------------------------------------------------
BATCH_DIR = SCRIPT_DIR / "batch_jobs"


def submit_batch_extraction(
    games: List[Dict], extract_model: Optional[str] = None,
) -> str:
    """Submit Stage 1 extraction for all games as a batch job.

    Returns the batch ID for polling.
    """
    model = extract_model or EXTRACT_MODEL
    BATCH_DIR.mkdir(exist_ok=True)

    requests = []
    for game in games:
        game_name = game["name"]
        provider_info = game.get("provider", {})
        provider = provider_info.get("display_name") or provider_info.get("studio") or "Unknown"
        prompt = build_extract_prompt(game_name, provider)

        requests.append({
            "custom_id": game["id"],
            "params": {
                "model": model,
                "max_tokens": 4096,
                "temperature": 0,
                "messages": [{"role": "user", "content": prompt}],
                "tools": [{
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": 3,
                }],
            },
        })

    batch = CLIENT.messages.batches.create(requests=requests)
    batch_id = batch.id
    print(f"  Batch submitted: {batch_id} ({len(requests)} games)")
    print(f"  Model: {model}")
    print(f"  Status: {batch.processing_status}")

    batch_meta = {
        "batch_id": batch_id,
        "model": model,
        "game_count": len(requests),
        "game_ids": [g["id"] for g in games],
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    meta_path = BATCH_DIR / f"{batch_id}.json"
    meta_path.write_text(json.dumps(batch_meta, indent=2) + "\n")

    return batch_id


def poll_batch(batch_id: str) -> Optional[Dict]:
    """Check batch status and retrieve results if complete."""
    batch = CLIENT.messages.batches.retrieve(batch_id)
    status = batch.processing_status
    counts = batch.request_counts

    print(f"  Batch {batch_id}: {status}")
    print(f"    Succeeded: {counts.succeeded}, Failed: {counts.errored}, "
          f"Processing: {counts.processing}, Pending: {counts.canceled or 0}")

    if status != "ended":
        return None

    results = {}
    for result in CLIENT.messages.batches.results(batch_id):
        gid = result.custom_id
        if result.result.type == "succeeded":
            resp = result.result.message
            all_text = []
            meta = {"searches": 0, "sources": []}
            for block in resp.content:
                btype = getattr(block, "type", None)
                if btype == "web_search_tool_result":
                    meta["searches"] += 1
                    content = getattr(block, "content", [])
                    if isinstance(content, list):
                        for r in content:
                            if hasattr(r, "url"):
                                meta["sources"].append({"url": r.url, "title": getattr(r, "title", "")})
                elif btype == "text":
                    all_text.append(block.text)

            full_text = "\n".join(all_text).strip()
            m = re.search(r'\{[\s\S]*\}', full_text)
            if m:
                try:
                    extracted = json.loads(m.group())
                    results[gid] = {"extraction": extracted, "meta": meta}
                except json.JSONDecodeError:
                    results[gid] = {"error": "JSON parse failed"}
            else:
                results[gid] = {"error": "No JSON in response"}
        else:
            results[gid] = {"error": str(result.result)}

    return results


def load_master() -> List[Dict]:
    data = json.loads(MASTER_PATH.read_text(encoding="utf-8"))
    return data.get("games", [])


def select_games(all_games: List[Dict], args) -> List[Dict]:
    if args.ids:
        id_set = set(args.ids.split(","))
        return [g for g in all_games if g["id"] in id_set]
    if args.pilot:
        ags = [g for g in all_games
               if isinstance(g.get("provider"), dict)
               and g["provider"].get("display_name") == "AGS"]
        return ags[:args.pilot]
    if args.provider:
        return [g for g in all_games
                if isinstance(g.get("provider"), dict)
                and g["provider"].get("display_name", "").lower() == args.provider.lower()]
    return all_games


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Enrich games via 2-stage Claude web search pipeline"
    )
    parser.add_argument("--ids", type=str, help="Comma-separated game IDs")
    parser.add_argument("--pilot", type=int, help="Run on N AGS games")
    parser.add_argument("--provider", type=str, help="Run on all games from a provider")
    parser.add_argument("--all", action="store_true", help="Run on all games")
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--delay", type=float, default=30.0,
                        help="Seconds between games (default 30, avoids rate limits on web search)")
    parser.add_argument("--fresh", action="store_true", help="Ignore checkpoint, re-enrich all")
    parser.add_argument("--extract-model", type=str, default=None,
                        help=f"Override extraction model (default: {EXTRACT_MODEL}). "
                             f"Use 'claude-haiku-4-5' for 3x cheaper extraction.")
    parser.add_argument("--batch-submit", action="store_true",
                        help="Submit Stage 1 as a batch job (50%% cheaper, async)")
    parser.add_argument("--batch-poll", type=str, default=None,
                        help="Poll a batch job by ID and process results")
    parser.add_argument("--skip-enriched", action="store_true",
                        help="Skip games already in games_dashboard.json with features (zero-cost re-run)")
    parser.add_argument("--validate", action="store_true",
                        help="Run config validation and exit (checks synonym/prompt consistency)")
    parser.add_argument("--strict-adapters", action="store_true",
                        help="Abort on any config issue (required for proof/audit runs)")
    parser.add_argument("--no-ddg", action="store_true",
                        help="Disable DuckDuckGo fallback search (required for proof/audit runs — DDG is remediation-only)")
    parser.add_argument("--force", action="store_true",
                        help="Override config validation block (NOT recommended — use only for debugging)")
    parser.add_argument("--symbols-only", action="store_true",
                        help="Only fill empty symbols (runs Stage 1 only, preserves existing features/themes)")
    args = parser.parse_args()

    # ---- Validate config on every run (BLOCKS by default) ----
    issues = validate_config(verbose=args.verbose)
    if args.validate:
        if issues:
            print(f"\n{len(issues)} issue(s) found. Fix before running enrichment.")
            sys.exit(1)
        else:
            print("All config checks passed.")
        sys.exit(0)
    elif issues:
        if args.force:
            print(f"  WARNING: {len(issues)} config issue(s) detected but --force is set. Proceeding.")
        else:
            print(f"  BLOCKED: {len(issues)} config issue(s) detected. Run --validate for details.")
            print("  Pipeline refuses to run with config issues (safety gate).")
            print("  Fix the issues, or pass --force to override (NOT recommended).")
            sys.exit(1)

    # ---- Batch mode: submit or poll ----
    if args.batch_submit:
        all_games = load_master()
        games = select_games(all_games, args)
        if not games:
            print("No games selected.")
            sys.exit(1)
        print(f"Submitting batch extraction for {len(games)} games...")
        batch_id = submit_batch_extraction(games, args.extract_model)
        print(f"\nBatch submitted! To check results:")
        print(f"  python3 enrich_websearch.py --batch-poll {batch_id} --verbose")
        return

    if args.batch_poll:
        print(f"Polling batch {args.batch_poll}...")
        results = poll_batch(args.batch_poll)
        if results is None:
            print("Batch not complete yet. Try again later.")
            return
        succeeded = sum(1 for v in results.values() if "extraction" in v)
        failed = sum(1 for v in results.values() if "error" in v)
        print(f"\nBatch complete: {succeeded} succeeded, {failed} failed")

        all_games = load_master()
        game_map = {g["id"]: g for g in all_games}
        dashboard_records = []
        meta_records = {}

        # GATE: batch-merge — merge new results into existing dashboard, never overwrite
        batch_ids = set(results.keys())
        if DASHBOARD_PATH.exists():
            existing = json.loads(DASHBOARD_PATH.read_text(encoding="utf-8"))
            for rec in existing:
                if rec["id"] not in batch_ids:
                    dashboard_records.append(rec)
        if META_PATH.exists():
            existing_meta = json.loads(META_PATH.read_text(encoding="utf-8"))
            if isinstance(existing_meta, dict):
                for k, v in existing_meta.items():
                    if k not in batch_ids:
                        meta_records[k] = v

        for gid, result in results.items():
            if "error" in result:
                print(f"  [FAIL] {gid}: {result['error']}")
                continue

            game = game_map.get(gid)
            if not game:
                continue

            game_name = game["name"]
            provider_info = game.get("provider", {})
            provider = provider_info.get("display_name") or provider_info.get("studio") or "Unknown"
            raw_extraction = result["extraction"]
            ws_meta = result["meta"]

            # GATE: batch-catalog-injection — catalog fetch MUST happen during batch-poll
            catalog = fetch_provider_catalog(game_name, provider, args.verbose)
            if catalog:
                ws_meta["catalog_source"] = catalog.get("source_url")
                for field in ("rtp", "volatility", "reels", "rows",
                              "paylines_kind", "paylines_value", "description"):
                    if catalog.get(field) and not raw_extraction.get(field):
                        raw_extraction[field] = catalog[field]
                catalog_raw_features = catalog.get("features_raw", [])
                if catalog_raw_features:
                    existing = raw_extraction.get("features_raw") or []
                    raw_extraction["features_raw"] = existing + catalog_raw_features
                    if args.verbose:
                        print(f"  [CATALOG] Injecting: {catalog_raw_features}")

            completeness = raw_extraction.get("completeness", 5)
            if args.verbose:
                print(f"\n  {game_name}: completeness={completeness}/5")

            if completeness <= COMPLETENESS_THRESHOLD:
                if args.verbose:
                    print(f"  [VERIFY] Running follow-up search for {game_name}...")
                existing_raw = [f[:60] for f in (raw_extraction.get("features_raw") or [])]
                supplement = call_verification_search(
                    game_name, provider, existing_raw, args.verbose,
                    model_override=args.extract_model,
                )
                if supplement:
                    new_f = supplement.get("features_raw") or []
                    if new_f:
                        raw_extraction["features_raw"] = (raw_extraction.get("features_raw") or []) + new_f
                    new_s = supplement.get("symbols") or []
                    if new_s:
                        raw_extraction["symbols"] = (raw_extraction.get("symbols") or []) + new_s

            normalized = call_normalize(game_name, provider, raw_extraction, args.verbose)
            if not normalized:
                print(f"  [FAIL] {game_name}: normalization failed")
                continue

            final_features = normalized.get("features") or []
            final_themes = normalized.get("themes") or []

            catalog_features = catalog.get("features", []) if catalog else []
            catalog_themes = catalog.get("themes", []) if catalog else []
            if catalog_features:
                catalog_features_norm = normalize_features(catalog_features, verbose=False)
                added = set(catalog_features_norm) - set(final_features)
                if added and args.verbose:
                    print(f"  [CATALOG+] Added from provider catalog: {added}")
                final_features = sorted(set(final_features) | set(catalog_features_norm))
            if catalog_themes:
                catalog_themes_norm = normalize_themes(catalog_themes, verbose=False)
                added = set(catalog_themes_norm) - set(final_themes)
                if added and args.verbose:
                    print(f"  [CATALOG+] Added themes from catalog: {added}")
                final_themes = sorted(set(final_themes) | set(catalog_themes_norm))

            final_features = normalize_features(final_features, args.verbose)
            final_themes = normalize_themes(final_themes, args.verbose)

            raw_text = ' '.join(raw_extraction.get("features_raw") or []).lower()
            feature_map = normalized.get("feature_map") or []

            # GATE: catalog-bypass (batch path)
            catalog_confirmed = set(normalize_features(catalog.get("features", []), verbose=False)) if catalog else set()

            # GATE: pxs-er-strip (batch path)
            if "Expanding Reels" in final_features and "Expanding Reels" not in catalog_confirmed:
                er_items = [i for i in feature_map if i.get("canonical") == "Expanding Reels"]
                all_pxs = er_items and all(
                    any(w in (i.get('raw', '')).lower() for w in ['powerxstream', 'power x stream', 'pxs'])
                    for i in er_items
                )
                if all_pxs:
                    final_features = [f for f in final_features if f != "Expanding Reels"]
                    if args.verbose:
                        print("  [POST] Stripped Expanding Reels (PXS-only evidence)")

            # GATE: expanding-wilds-wr-strip (batch path)
            if "Wild Reels" in final_features and "Wild Reels" not in catalog_confirmed:
                wr_items = [i for i in feature_map if i.get("canonical") == "Wild Reels"]
                all_expanding = wr_items and all(
                    any(w in (i.get('raw', '')).lower() for w in ['expanding wild', 'expand to fill', 'expands to cover', 'transform entire reel'])
                    for i in wr_items
                )
                if all_expanding:
                    final_features = [f for f in final_features if f != "Wild Reels"]
                    if args.verbose:
                        print("  [POST] Stripped Wild Reels (expanding-wilds-only evidence)")

            # GATE: interactive-cor-strip (batch path)
            if "Cash On Reels" in final_features and "Cash On Reels" not in catalog_confirmed:
                cor_items = [i for i in feature_map if i.get("canonical") == "Cash On Reels"]
                all_interactive = cor_items and all(
                    any(w in (i.get('raw', '')).lower() for w in ['tap them', 'catch', 'dive down', 'interactive'])
                    for i in cor_items
                )
                if all_interactive:
                    final_features = [f for f in final_features if f != "Cash On Reels"]
                    if args.verbose:
                        print("  [POST] Stripped Cash On Reels (interactive mini-game)")

            # GATE: hs-sj-safety (batch path)
            if "Hold and Spin" in final_features and "Static Jackpot" not in final_features:
                final_features.append("Static Jackpot")
                if args.verbose:
                    print("  [POST] Added Static Jackpot (H&S → SJ safety net)")

            # GATE: pick-gate-strip (batch path)
            if "Pick Bonus" in final_features and "Pick Bonus" not in catalog_confirmed:
                pb_items = [i for i in feature_map if i.get("canonical") == "Pick Bonus"]
                gate_kw = ['gate', 'selector', 'choose between', 'choose which', 'pick a door',
                           'select which bonus', 'pick a mode', 'select between', 'vault selection',
                           'choose one of', 'select one of', 'pick which bonus']
                all_gate = pb_items and all(
                    any(w in (i.get('raw', '')).lower() for w in gate_kw)
                    for i in pb_items
                )
                if all_gate:
                    final_features = [f for f in final_features if f != "Pick Bonus"]
                    if args.verbose:
                        print("  [POST] Stripped Pick Bonus (gate/selector evidence)")

            master_perf = game.get("performance", {})
            master_release = game.get("release", {})

            demo_url = get_demo_url(game_name, provider)

            dashboard_rec = {
                "id": gid,
                "name": game_name,
                "description": raw_extraction.get("description"),
                "provider": provider,
                "studio": provider_info.get("studio", provider),
                "parent_company": provider_info.get("parent", provider),
                "theme_primary": final_themes[0] if final_themes else None,
                "theme_secondary": final_themes[1] if len(final_themes) > 1 else None,
                "themes_all": final_themes,
                "features": final_features,
                "symbols": raw_extraction.get("symbols") or [],
                "mechanic_primary": game.get("mechanic", {}).get("primary", "Slot"),
                "reels": raw_extraction.get("reels"),
                "rows": raw_extraction.get("rows"),
                "paylines_kind": raw_extraction.get("paylines_kind"),
                "paylines_count": raw_extraction.get("paylines_value"),
                "rtp": raw_extraction.get("rtp"),
                "volatility": raw_extraction.get("volatility"),
                "max_win": raw_extraction.get("max_win"),
                "min_bet": raw_extraction.get("min_bet"),
                "max_bet": raw_extraction.get("max_bet"),
                "release_year": master_release.get("year"),
                "release_month": master_release.get("month"),
                "theo_win": master_perf.get("theo_win"),
                "market_share_pct": master_perf.get("market_share_percent"),
                "percentile": master_perf.get("percentile"),
                "anomaly": master_perf.get("anomaly"),
                "demo_url": demo_url,
                "data_quality": "verified" if final_themes and final_features else "partial",
                "source_tier": "claude_web_search+2stage+batch",
            }
            dashboard_records.append(dashboard_rec)
            meta_records[gid] = {
                "web_searches": ws_meta.get("searches", 0),
                "extract_model": args.extract_model or EXTRACT_MODEL,
                "norm_model": NORM_MODEL,
                "completeness": completeness,
                "batch_id": args.batch_poll,
                "enriched_at": datetime.now(timezone.utc).isoformat(),
            }

        # GATE: final-output-validation — reject any non-canonical features before write
        for rec in dashboard_records:
            if rec.get("features"):
                bad = [f for f in rec["features"] if f not in KNOWN_FEATURES]
                if bad:
                    print(f"  [FINAL-GATE] Stripping non-canonical features from {rec['name']}: {bad}")
                    rec["features"] = [f for f in rec["features"] if f in KNOWN_FEATURES]

        if dashboard_records:
            DASHBOARD_PATH.write_text(
                json.dumps(dashboard_records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            META_PATH.write_text(
                json.dumps(meta_records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"\nSaved {len(dashboard_records)} games to {DASHBOARD_PATH.name}")
            test_records = [r for r in dashboard_records if r["name"] not in FEW_SHOT_NAMES]
            compare_with_ground_truth(test_records)
        return

    if not any([args.ids, args.pilot, args.provider, args.all]):
        parser.print_help()
        sys.exit(1)

    ext_model = args.extract_model or EXTRACT_MODEL
    print(f"Pipeline:    2-stage (Extract → Normalize)")
    print(f"Extract:     {ext_model} + web_search tool (completeness scored)")
    print(f"Normalize:   {NORM_MODEL} (few-shot + confidence >= {CONFIDENCE_THRESHOLD})")
    print(f"Vocabulary:  {len(KNOWN_THEMES)} themes, {len(KNOWN_FEATURES)} features")

    all_games = load_master()
    games = select_games(all_games, args)
    print(f"Selected:    {len(games)} games")

    cp = load_checkpoint() if not args.fresh else {
        "version": 5, "total": 0, "done": 0, "failed": 0, "games": {}
    }
    cp["total"] = len(games)

    dashboard_records: List[Dict] = []
    meta_records: Dict[str, Dict] = {}

    # Load existing data for merge and --skip-enriched
    enriched_ids: set = set()
    existing_by_id: Dict[str, Dict] = {}
    existing_meta_all: Dict[str, Dict] = {}
    target_ids = {g["id"] for g in games}
    if DASHBOARD_PATH.exists():
        existing = json.loads(DASHBOARD_PATH.read_text(encoding="utf-8"))
        for rec in existing:
            existing_by_id[rec["id"]] = rec
            if rec["id"] not in target_ids:
                dashboard_records.append(rec)
            if args.skip_enriched and rec.get("features"):
                enriched_ids.add(rec["id"])
    if META_PATH.exists():
        all_meta = json.loads(META_PATH.read_text(encoding="utf-8"))
        if isinstance(all_meta, dict):
            existing_meta_all = all_meta
            for k, v in all_meta.items():
                if k not in target_ids:
                    meta_records[k] = v

    done_count = 0
    fail_count = 0

    for i, game in enumerate(games):
        gid = game["id"]

        if args.symbols_only:
            existing_rec = existing_by_id.get(gid)
            if existing_rec and existing_rec.get("symbols"):
                dashboard_records.append(existing_rec)
                if gid in existing_meta_all:
                    meta_records[gid] = existing_meta_all[gid]
                done_count += 1
                continue

            print(f"[{i+1}/{len(games)}] Symbols-only: {game['name']} ({gid})")
            try:
                provider_info = game.get("provider", {})
                provider = provider_info.get("display_name") or provider_info.get("studio") or "Unknown"
                raw_extraction, ws_meta = call_web_search(
                    game["name"], provider, args.verbose, model_override=args.extract_model
                )
                new_symbols = (raw_extraction or {}).get("symbols") or []
                if existing_rec:
                    rec = existing_rec.copy()
                    rec["symbols"] = new_symbols
                    dashboard_records.append(rec)
                else:
                    dashboard_rec, meta_rec = enrich_one_game(
                        game, verbose=args.verbose, extract_model=args.extract_model,
                    )
                    dashboard_records.append(dashboard_rec)
                    meta_records[gid] = meta_rec
                done_count += 1
                if args.verbose:
                    print(f"  [SYMBOLS] Got {len(new_symbols)} symbols: {new_symbols[:5]}")
            except Exception as e:
                print(f"  [ERROR] {e}")
                if existing_rec:
                    dashboard_records.append(existing_rec)
                fail_count += 1

            cp["done"] = done_count
            cp["failed"] = fail_count
            save_checkpoint(cp)
            if i < len(games) - 1:
                time.sleep(args.delay)
            continue

        if args.skip_enriched and gid in enriched_ids:
            print(f"[{i+1}/{len(games)}] SKIP (already enriched): {game['name']}")
            if gid in existing_by_id:
                dashboard_records.append(existing_by_id[gid])
            if gid in existing_meta_all:
                meta_records[gid] = existing_meta_all[gid]
            done_count += 1
            continue

        if not args.fresh and gid in cp["games"] and cp["games"][gid].get("status") == "done":
            print(f"[{i+1}/{len(games)}] SKIP (done): {game['name']}")
            if "dashboard" in cp["games"][gid]:
                dashboard_records.append(cp["games"][gid]["dashboard"])
                meta_records[gid] = cp["games"][gid].get("meta", {})
            done_count += 1
            continue

        print(f"[{i+1}/{len(games)}] Enriching: {game['name']} ({gid})")

        try:
            dashboard_rec, meta_rec = enrich_one_game(
                game, verbose=args.verbose, extract_model=args.extract_model,
            )
            dashboard_records.append(dashboard_rec)
            meta_records[gid] = meta_rec

            cp["games"][gid] = {
                "status": "done",
                "at": datetime.now(timezone.utc).isoformat(),
                "dashboard": dashboard_rec,
                "meta": meta_rec,
            }
            done_count += 1

        except Exception as e:
            print(f"  [ERROR] {e}")
            if args.verbose:
                traceback.print_exc()
            # GATE: preserve-on-failure — keep existing dashboard record if enrichment fails
            if gid in existing_by_id:
                dashboard_records.append(existing_by_id[gid])
                print(f"  [PRESERVE] Kept existing dashboard record for {game['name']}")
            cp["games"][gid] = {
                "status": "failed",
                "error": str(e),
                "at": datetime.now(timezone.utc).isoformat(),
            }
            fail_count += 1

        cp["done"] = done_count
        cp["failed"] = fail_count
        save_checkpoint(cp)

        if i < len(games) - 1:
            time.sleep(args.delay)

    # GATE: final-output-validation (sync path) — reject non-canonical features before write
    for rec in dashboard_records:
        if rec.get("features"):
            bad = [f for f in rec["features"] if f not in KNOWN_FEATURES]
            if bad:
                print(f"  [FINAL-GATE] Stripping non-canonical features from {rec['name']}: {bad}")
                rec["features"] = [f for f in rec["features"] if f in KNOWN_FEATURES]

    DASHBOARD_PATH.write_text(
        json.dumps(dashboard_records, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    META_PATH.write_text(
        json.dumps(meta_records, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"\nDone! {done_count} enriched, {fail_count} failed")
    print(f"Output: {DASHBOARD_PATH.name}, {META_PATH.name}")

    test_records = [r for r in dashboard_records if r["name"] not in FEW_SHOT_NAMES]
    compare_with_ground_truth(test_records)


if __name__ == "__main__":
    main()
