#!/usr/bin/env python3
"""
SlotCatalog Audit Agent
Cross-checks games_dashboard.json features against SlotCatalog data.
Produces sc_audit_report.json with per-game discrepancies.

Usage:
  python3 sc_audit.py                    # Full run on all games
  python3 sc_audit.py --gt-only          # Run only on GT games (control test)
  python3 sc_audit.py --limit 50         # Run on first N games
  python3 sc_audit.py --game "Starburst" # Run on a single game
  python3 sc_audit.py --resume           # Resume from last checkpoint
"""

import urllib.request
import urllib.parse
import re
import json
import time
import sys
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Canonical feature mapping: SlotCatalog tag (lowercase) -> our canonical name
# ---------------------------------------------------------------------------
SC_FEATURE_MAP = {
    "free spins": "Free Spins",
    "additional free spins": "Free Spins",
    "free spins mode choosing": "Free Spins",
    "freespins": "Free Spins",
    "hold and win": "Hold and Spin",
    "hold & win": "Hold and Spin",
    "lock it link": "Hold and Spin",
    "fixed jackpots": "Static Jackpot",
    "fixed jackpot": "Static Jackpot",
    "progressive jackpot": "Progressive Jackpot",
    "megaways": "Megaways",
    "multiway (+1024)": "Expanding Reels",
    "reelset changing": "Expanding Reels",
    "dynamic reels": "Expanding Reels",
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
    "multiplier": "Multiplier",
    "random multiplier": "Multiplier",
    "free spins multiplier": "Multiplier",
    "wilds with multipliers": "Multiplier",
}

# Tags to explicitly skip (not mappable to canonical features)
SKIP_TAGS = frozenset({
    "wild", "scatter symbols", "bonus game", "bonus symbols", "rtp range",
    "respin wild", "feature: random reward", "feature: substitution symbols",
    "random wilds / additional wilds", "additive symbol", "bothway",
    "starburst mechanic", "level up", "prize line", "cheats tool",
    "cluster pays", "expanding symbols", "walking symbols, moving wilds",
    "guaranteed wild in free spins", "respins with increasing win ways",
})

# Known name aliases: our dashboard name -> SlotCatalog slug
KNOWN_ALIASES = {
    "Clue Cash Mystery": "Cluedo-Cash-Mystery",
    "Cluedo Cash Mystery": "Cluedo-Cash-Mystery",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def slug_variants(name: str) -> list[str]:
    """Generate URL slug variants in priority order."""
    if name in KNOWN_ALIASES:
        return [KNOWN_ALIASES[name]]

    clean = re.sub(r"['''\u2122\u00ae\u2120]", "", name)
    clean = re.sub(r"\s*:\s*", " ", clean)
    clean = clean.strip()

    bases = [clean]

    # Roman numeral -> Arabic variant (e.g., "Fire Wolf II" -> "Fire Wolf 2")
    words = clean.split()
    for rom, arab in ROMAN_TO_ARABIC.items():
        if rom in words:
            alt = clean.replace(f" {rom}", f" {arab}")
            if alt not in bases:
                bases.append(alt)

    variants = []
    for base in bases:
        v1 = re.sub(r"\s+", "-", base)
        v1 = re.sub(r"[^a-zA-Z0-9-]", "", v1)
        v2 = v1.lower()

        if v1 not in variants:
            variants.append(v1)
        if v2 not in variants:
            variants.append(v2)

    # Truncated variant (drop last word for long names)
    if len(words) > 2:
        v3 = re.sub(r"[^a-zA-Z0-9-]", "", re.sub(r"\s+", "-", " ".join(words[:-1])))
        if v3 not in variants:
            variants.append(v3)

    return variants


def fetch_html(url: str, timeout: int = 15) -> str | None:
    """Fetch a URL, return HTML or None on failure."""
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None


def extract_features_from_html(html: str) -> tuple[list[str], list[str]]:
    """
    Extract canonical features from SlotCatalog HTML using multiple sources:
    1. Structured Features tags from Attributes section
    2. "Main game features" from review text
    3. Mechanics badge
    Returns (canonical_features, unmapped_tags).
    """
    canonical = set()
    unmapped = []

    # Source 1: Structured feature tags (links with slot-features in URL)
    feat_blocks = re.findall(
        r"Features:\s*((?:\[.*?\]\(.*?\)[\s,]*)+|(?:<a[^>]*>.*?</a>[\s,]*)+)",
        html, re.DOTALL
    )
    if not feat_blocks:
        feat_blocks = re.findall(
            r"Features:\s*(.*?)(?=Theme:|Other\s*tags:|\n\n)",
            html, re.DOTALL | re.IGNORECASE
        )

    raw_tags = []
    for block in feat_blocks:
        feats = re.findall(r"\[([^\]]+)\]\([^)]*slot-features[^)]*\)", block)
        if not feats:
            feats = re.findall(r">([^<]{3,50})</a>", block)
        raw_tags.extend(f.strip() for f in feats if f.strip())

    for sf in raw_tags:
        sf_low = sf.lower()
        if sf_low in SC_FEATURE_MAP:
            mapped = SC_FEATURE_MAP[sf_low]
            if mapped:
                canonical.add(mapped)
        elif sf_low not in SKIP_TAGS:
            unmapped.append(sf)

    # Source 2: "Main game features" from review text
    main_match = re.search(
        r"Main\s+game\s+features\s+(?:are|include):\s*(.*?)\.",
        html, re.IGNORECASE
    )
    if main_match:
        for feat in re.split(r",\s*", main_match.group(1)):
            feat_low = feat.strip().lower()
            if feat_low in SC_FEATURE_MAP and SC_FEATURE_MAP[feat_low]:
                canonical.add(SC_FEATURE_MAP[feat_low])

    # Source 3: Mechanics badge (Megaways, Megaclusters)
    mech_match = re.search(r"Mechanics:\s*.*?>(Megaways|Megaclusters)<", html)
    if mech_match:
        m = mech_match.group(1).lower()
        if m in SC_FEATURE_MAP and SC_FEATURE_MAP[m]:
            canonical.add(SC_FEATURE_MAP[m])

    return sorted(canonical), unmapped


def extract_specs_from_html(html: str) -> dict:
    """Extract game specs from SlotCatalog HTML."""
    specs = {}

    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)

    rtp_match = re.search(r"RTP[^:]{0,30}:\s*(\d{2,3}\.?\d*)\s*%", text)
    if rtp_match:
        specs["rtp"] = rtp_match.group(1) + "%"

    maxwin_match = re.search(r"Max\s*Win[^:]{0,30}:\s*x?([\d,]+\.?\d*)", text)
    if maxwin_match:
        specs["max_win"] = maxwin_match.group(1).replace(",", "")

    minbet_match = re.search(r"Min\s*bet[^:]{0,30}:\s*([\d.]+)", text)
    if minbet_match:
        specs["min_bet"] = float(minbet_match.group(1))

    maxbet_match = re.search(r"Max\s*bet[^:]{0,30}:\s*([\d.]+)", text)
    if maxbet_match:
        specs["max_bet"] = float(maxbet_match.group(1))

    var_match = re.search(
        r"Variance[^:]{0,30}:\s*(Low|Med|High|Low-Med|Med-High|Very High|N/A)",
        text, re.IGNORECASE
    )
    if var_match and var_match.group(1).upper() != "N/A":
        specs["variance"] = var_match.group(1)

    layout_match = re.search(r"Layout[^:]{0,30}:\s*(\d+)-(\d+)", text)
    if layout_match:
        specs["reels"] = int(layout_match.group(1))
        specs["rows"] = int(layout_match.group(2))

    betways_match = re.search(r"Betways[^:]{0,30}:\s*([\d,]+|Cluster\s*Pays|Megaclusters)", text)
    if betways_match:
        specs["betways"] = betways_match.group(1).replace(",", "")

    provider_match = re.search(r"Provider:\s*.*?>([^<]+)</a>", html)
    if provider_match:
        specs["sc_provider"] = provider_match.group(1).strip()

    return specs


ROMAN_TO_ARABIC = {
    "II": "2", "III": "3", "IV": "4", "V": "5",
    "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10",
}


def ddg_search_sc_url(name: str) -> str | None:
    """Search DuckDuckGo for a SlotCatalog page matching the game name."""
    query = urllib.parse.quote_plus(f"site:slotcatalog.com/en/slots {name}")
    search_url = f"https://duckduckgo.com/html/?q={query}"
    html = fetch_html(search_url, timeout=20)
    if not html:
        return None
    urls = re.findall(r'https?://(?:www\.)?slotcatalog\.com/en/slots/[A-Za-z0-9_-]+', html)
    seen = []
    for u in urls:
        if u not in seen:
            seen.append(u)
    return seen[0] if seen else None


def fetch_game(name: str, delay: float = 1.5) -> dict:
    """
    Fetch a single game from SlotCatalog.
    Tries direct slug variants first, then falls back to DuckDuckGo search.
    Returns a result dict with status, features, specs, etc.
    """
    time.sleep(delay)

    for slug in slug_variants(name):
        url = f"https://www.slotcatalog.com/en/slots/{slug}"
        html = fetch_html(url)
        if html and ("Features:" in html or "Provider:" in html):
            features, unmapped = extract_features_from_html(html)
            specs = extract_specs_from_html(html)
            return {
                "status": "found",
                "slug": slug,
                "url": url,
                "sc_features": features,
                "unmapped_tags": unmapped,
                "specs": specs,
            }

    # Fallback: DuckDuckGo search
    time.sleep(delay)
    ddg_url = ddg_search_sc_url(name)
    if ddg_url:
        html = fetch_html(ddg_url)
        if html and ("Features:" in html or "Provider:" in html):
            features, unmapped = extract_features_from_html(html)
            specs = extract_specs_from_html(html)
            slug = ddg_url.rsplit("/", 1)[-1]
            return {
                "status": "found",
                "slug": slug,
                "url": ddg_url,
                "sc_features": features,
                "unmapped_tags": unmapped,
                "specs": specs,
                "found_via": "ddg_search",
            }

    return {"status": "not_found", "slug": None, "url": None}


def compare_features(sc_features: list[str], dashboard_features: list[str]) -> dict:
    """Compare SlotCatalog features against dashboard features."""
    sc_set = set(sc_features)
    db_set = set(dashboard_features)

    tp = sc_set & db_set
    potential_fn = sc_set - db_set  # SC has it, we don't
    potential_fp = db_set - sc_set  # We have it, SC doesn't

    return {
        "match": len(potential_fn) == 0 and len(potential_fp) == 0,
        "confirmed": sorted(tp),
        "potential_fn": sorted(potential_fn),
        "potential_fp": sorted(potential_fp),
    }


def run_audit(games: list[dict], gt: dict | None = None,
              delay: float = 1.5, checkpoint_file: str | None = None) -> dict:
    """
    Run the full audit on a list of games.
    Returns the full report dict.
    """
    report = {"games": {}, "summary": {}}
    total = len(games)

    # Load checkpoint if resuming
    existing = {}
    if checkpoint_file and os.path.exists(checkpoint_file):
        with open(checkpoint_file) as f:
            existing = json.load(f).get("games", {})
        print(f"  Resuming from checkpoint: {len(existing)} games already done")

    found = 0
    not_found = 0
    matched = 0
    discrepancies = 0
    total_tp = total_fp = total_fn = 0

    for i, game in enumerate(games):
        name = game["name"]

        # Skip if already in checkpoint
        if name in existing:
            report["games"][name] = existing[name]
            if existing[name].get("status") == "found":
                found += 1
            else:
                not_found += 1
            continue

        print(f"  [{i+1}/{total}] {name}...", end=" ", flush=True)

        result = fetch_game(name, delay=delay)

        entry = {
            "provider": game.get("provider", ""),
            "status": result["status"],
            "sc_url": result.get("url"),
            "sc_slug": result.get("slug"),
        }

        if result["status"] == "found":
            found += 1
            entry["sc_features"] = result["sc_features"]
            entry["dashboard_features"] = game.get("features", [])
            entry["specs"] = result.get("specs", {})

            comparison = compare_features(
                result["sc_features"], game.get("features", [])
            )
            entry.update(comparison)

            if comparison["match"]:
                matched += 1
                print("MATCH")
            else:
                discrepancies += 1
                fn_str = f" FN={comparison['potential_fn']}" if comparison["potential_fn"] else ""
                fp_str = f" FP={comparison['potential_fp']}" if comparison["potential_fp"] else ""
                print(f"DELTA{fn_str}{fp_str}")

            # If GT available, calculate accuracy
            if gt and name in gt:
                gt_feats = set(gt[name].get("features", []))
                sc_set = set(result["sc_features"])
                entry["gt_tp"] = sorted(gt_feats & sc_set)
                entry["gt_fp"] = sorted(sc_set - gt_feats)
                entry["gt_fn"] = sorted(gt_feats - sc_set)
                total_tp += len(entry["gt_tp"])
                total_fp += len(entry["gt_fp"])
                total_fn += len(entry["gt_fn"])
        else:
            not_found += 1
            print("NOT FOUND")

        report["games"][name] = entry

        # Checkpoint every 50 games
        if checkpoint_file and (i + 1) % 50 == 0:
            report["summary"] = _build_summary(report["games"], found, not_found,
                                                matched, discrepancies,
                                                total_tp, total_fp, total_fn, total)
            with open(checkpoint_file, "w") as f:
                json.dump(report, f, indent=2)
            print(f"  ... checkpoint saved ({i+1}/{total})")

    report["summary"] = _build_summary(report["games"], found, not_found,
                                        matched, discrepancies,
                                        total_tp, total_fp, total_fn, total)
    return report


def _build_summary(games_data, found, not_found, matched, discrepancies,
                   total_tp, total_fp, total_fn, total):
    """Build summary stats."""
    prec = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    rec = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0

    # Per-provider stats
    provider_stats = {}
    for name, entry in games_data.items():
        prov = entry.get("provider", "Unknown")
        if prov not in provider_stats:
            provider_stats[prov] = {"found": 0, "not_found": 0, "matched": 0, "discrepancies": 0}
        if entry.get("status") == "found":
            provider_stats[prov]["found"] += 1
            if entry.get("match"):
                provider_stats[prov]["matched"] += 1
            else:
                provider_stats[prov]["discrepancies"] += 1
        else:
            provider_stats[prov]["not_found"] += 1

    # Top FN features (what SC has that we're missing most often)
    fn_counts = {}
    fp_counts = {}
    for entry in games_data.values():
        for feat in entry.get("potential_fn", []):
            fn_counts[feat] = fn_counts.get(feat, 0) + 1
        for feat in entry.get("potential_fp", []):
            fp_counts[feat] = fp_counts.get(feat, 0) + 1

    return {
        "total_games": total,
        "found_on_sc": found,
        "not_found_on_sc": not_found,
        "hit_rate": f"{100*found/total:.1f}%" if total > 0 else "N/A",
        "matched": matched,
        "discrepancies": discrepancies,
        "gt_accuracy": {
            "tp": total_tp, "fp": total_fp, "fn": total_fn,
            "precision": f"{100*prec:.1f}%",
            "recall": f"{100*rec:.1f}%",
            "f1": f"{100*f1:.1f}%",
        } if total_tp > 0 else None,
        "top_potential_fn": dict(sorted(fn_counts.items(), key=lambda x: -x[1])[:15]),
        "top_potential_fp": dict(sorted(fp_counts.items(), key=lambda x: -x[1])[:15]),
        "per_provider": provider_stats,
    }


def main():
    data_dir = Path(__file__).parent
    dashboard_path = data_dir / "games_dashboard.json"
    gt_path = data_dir / "ground_truth_ags.json"
    report_path = data_dir / "sc_audit_report.json"

    args = sys.argv[1:]

    with open(dashboard_path) as f:
        all_games = json.load(f)

    gt = None
    if gt_path.exists():
        with open(gt_path) as f:
            gt = json.load(f)

    # Filter based on args
    if "--game" in args:
        idx = args.index("--game")
        game_name = args[idx + 1]
        games = [g for g in all_games if game_name.lower() in g["name"].lower()]
        if not games:
            print(f"No game matching '{game_name}' found.")
            return
    elif "--gt-only" in args:
        if not gt:
            print("No ground_truth_ags.json found.")
            return
        gt_names = set(gt.keys())
        games = [g for g in all_games if g["name"] in gt_names]
        print(f"Running on {len(games)} GT games (out of {len(gt_names)} in GT)")
    elif "--limit" in args:
        idx = args.index("--limit")
        limit = int(args[idx + 1])
        games = all_games[:limit]
    else:
        games = all_games

    checkpoint = str(report_path) if "--resume" in args else None

    print(f"SlotCatalog Audit Agent")
    print(f"  Games to audit: {len(games)}")
    print(f"  GT games available: {len(gt) if gt else 0}")
    print(f"  Estimated time: ~{len(games)*1.7/60:.0f} minutes")
    print()

    report = run_audit(games, gt=gt, delay=1.5, checkpoint_file=checkpoint or str(report_path))

    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    s = report["summary"]
    print()
    print("=" * 70)
    print("AUDIT COMPLETE")
    print("=" * 70)
    print(f"  Found on SC: {s['found_on_sc']}/{s['total_games']} ({s['hit_rate']})")
    print(f"  Matched:     {s['matched']}")
    print(f"  Discrepancies: {s['discrepancies']}")
    if s.get("gt_accuracy"):
        ga = s["gt_accuracy"]
        print(f"  GT accuracy: P={ga['precision']} R={ga['recall']} F1={ga['f1']}")
    print(f"\n  Top potential FNs (SC has, we dont):")
    for feat, count in list(s["top_potential_fn"].items())[:10]:
        print(f"    {feat}: {count} games")
    print(f"\n  Top potential FPs (we have, SC doesnt):")
    for feat, count in list(s["top_potential_fp"].items())[:10]:
        print(f"    {feat}: {count} games")
    print(f"\n  Report saved to: {report_path}")


if __name__ == "__main__":
    main()
