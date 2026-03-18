#!/usr/bin/env python3
"""
Feature quality audit — detect potential false positives across the dataset.

Runs 4 checks:
  1. Pick Bonus gate confusion  — games tagged Pick Bonus whose description
     suggests a gate/selector rather than a real pick game.
  2. Provider-level outliers     — features that appear in <10% of a provider's
     games, making them statistically suspicious.
  3. Feature combination anomalies — feature pairs that almost never co-occur,
     suggesting one may be wrong.
  4. Description-feature mismatch — features whose typical keywords don't
     appear anywhere in the game description.

Usage:
    python3 audit_features.py                   # full audit
    python3 audit_features.py --feature "Pick Bonus"  # audit one feature only
    python3 audit_features.py --provider AGS    # audit one provider only
    python3 audit_features.py --json            # machine-readable output
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

DASHBOARD = Path(__file__).parent / "games_dashboard.json"

GATE_WORDS = [
    "choose between", "pick a door", "select a bonus", "select which",
    "pick which bonus", "choose your", "gate", "selector",
    "pick a mode", "pick your bonus", "choose free spins or",
]
PICK_POSITIVE = [
    "pick from", "reveal prizes", "hidden prizes", "reveal cash",
    "pick objects", "treasure chests", "pick and click", "pick items",
    "reveal instant", "choose stones", "pick bonus",
]

FEATURE_KEYWORDS = {
    "Pick Bonus": {
        "positive": ["pick", "reveal", "hidden", "chest", "pick bonus"],
        "negative": ["gate", "selector", "choose between", "choose which", "pick a door"],
    },
    "Cash On Reels": {
        "positive": ["cash on reel", "coin", "money symbol", "collect", "prize landing"],
        "negative": ["mini-game", "interactive", "arcade"],
    },
    "Expanding Reels": {
        "positive": ["expanding reel", "extra row", "reel expansion", "grow"],
        "negative": ["powerxstream", "pxs", "power x stream"],
    },
    "Wild Reels": {
        "positive": ["wild reel", "entire reel wild", "full reel", "stacked wild"],
        "negative": ["expanding wild"],
    },
    "Hold and Spin": {
        "positive": ["hold and spin", "hold & spin", "respin", "lock and spin", "money charge"],
        "negative": [],
    },
    "Wheel": {
        "positive": ["wheel", "spin the wheel", "wheel bonus", "fortune wheel"],
        "negative": [],
    },
    "Persistence": {
        "positive": ["persist", "carry over", "accumulate", "collect across", "meter", "progress"],
        "negative": [],
    },
    "Nudges": {
        "positive": ["nudge", "nudging"],
        "negative": [],
    },
}

PROVIDER_OUTLIER_THRESHOLD = 0.10  # flag if < 10% of provider's games have this feature
MIN_PROVIDER_GAMES = 5             # only flag providers with enough games to be meaningful


def _provider_name(g):
    p = g.get("provider", "Unknown")
    if isinstance(p, dict):
        return p.get("display_name", p.get("studio", "Unknown"))
    return p or "Unknown"


def load_games(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def check_pick_gate_confusion(games):
    """Flag games with 'Pick Bonus' whose description suggests gate/selector."""
    flags = []
    for g in games:
        if "Pick Bonus" not in (g.get("features") or []):
            continue
        desc = (g.get("description") or "").lower()
        gate_matches = [w for w in GATE_WORDS if w in desc]
        positive_matches = [w for w in PICK_POSITIVE if w in desc]
        if gate_matches and not positive_matches:
            flags.append({
                "game": g["name"],
                "provider": _provider_name(g),
                "reason": f"Description has gate language ({', '.join(gate_matches)}) but no pick-bonus language",
                "description": g.get("description", ""),
            })
        elif not positive_matches and "vault" in desc:
            flags.append({
                "game": g["name"],
                "provider": _provider_name(g),
                "reason": "Description mentions 'vault' but no explicit pick-bonus language — may be gate/selector",
                "description": g.get("description", ""),
            })
    return flags


def check_provider_outliers(games, feature_filter=None, provider_filter=None):
    """Flag features that are rare for a given provider."""
    provider_games = defaultdict(list)
    for g in games:
        provider_games[_provider_name(g)].append(g)

    flags = []
    for provider, pg in provider_games.items():
        if provider_filter and provider != provider_filter:
            continue
        if len(pg) < MIN_PROVIDER_GAMES:
            continue
        feature_counts = Counter()
        for g in pg:
            for f in (g.get("features") or []):
                feature_counts[f] += 1

        for feat, count in feature_counts.items():
            if feature_filter and feat != feature_filter:
                continue
            ratio = count / len(pg)
            if ratio < PROVIDER_OUTLIER_THRESHOLD:
                game_names = [g["name"] for g in pg if feat in (g.get("features") or [])]
                flags.append({
                    "feature": feat,
                    "provider": provider,
                    "count": count,
                    "total": len(pg),
                    "pct": round(ratio * 100, 1),
                    "games": game_names,
                    "reason": f"Only {count}/{len(pg)} ({ratio:.0%}) of {provider} games have {feat}",
                })
    return sorted(flags, key=lambda x: x["pct"])


def check_description_mismatch(games, feature_filter=None):
    """Flag games where description doesn't contain keywords for assigned features."""
    flags = []
    for g in games:
        desc = (g.get("description") or "").lower()
        if not desc:
            continue
        for feat in (g.get("features") or []):
            if feature_filter and feat != feature_filter:
                continue
            kw = FEATURE_KEYWORDS.get(feat)
            if not kw:
                continue
            has_positive = any(w in desc for w in kw["positive"])
            has_negative = any(w in desc for w in kw["negative"]) if kw["negative"] else False
            if has_negative and not has_positive:
                flags.append({
                    "game": g["name"],
                "provider": _provider_name(g),
                "feature": feat,
                    "reason": f"Description has contradicting keywords for {feat}",
                    "description": desc,
                })
    return flags


def check_cooccurrence_anomalies(games):
    """Flag rare feature co-occurrence pairs (might indicate one is wrong)."""
    pair_counts = Counter()
    total = len(games)
    for g in games:
        feats = sorted(g.get("features") or [])
        for i, f1 in enumerate(feats):
            for f2 in feats[i + 1:]:
                pair_counts[(f1, f2)] += 1

    flags = []
    for (f1, f2), count in pair_counts.items():
        if count <= 2 and total > 100:
            games_with = [
                g["name"] for g in games
                if f1 in (g.get("features") or []) and f2 in (g.get("features") or [])
            ]
            flags.append({
                "pair": f"{f1} + {f2}",
                "count": count,
                "games": games_with,
                "reason": f"Rare combination ({count} games) — review whether both features are correct",
            })
    return sorted(flags, key=lambda x: x["count"])


def print_section(title, items, json_mode=False):
    if json_mode:
        return
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}")
    if not items:
        print("  (none found)")
        return
    for i, item in enumerate(items, 1):
        print(f"\n  [{i}] {item.get('game', item.get('pair', item.get('feature', '?')))}")
        for k, v in item.items():
            if k in ("game", "pair"):
                continue
            if k == "description" and len(str(v)) > 100:
                v = str(v)[:100] + "..."
            if k == "games" and isinstance(v, list):
                v = ", ".join(v[:5]) + (f" (+{len(v)-5} more)" if len(v) > 5 else "")
            print(f"     {k}: {v}")


def main():
    parser = argparse.ArgumentParser(description="Feature quality audit")
    parser.add_argument("--feature", help="Audit a specific feature only")
    parser.add_argument("--provider", help="Audit a specific provider only")
    parser.add_argument("--json", action="store_true", help="JSON output")
    args = parser.parse_args()

    games = load_games(DASHBOARD)
    if args.provider:
        games = [g for g in games if g.get("provider") == args.provider]

    results = {}

    gate_flags = check_pick_gate_confusion(games)
    results["pick_gate_confusion"] = gate_flags
    print_section("Pick Bonus vs Gate/Selector Confusion", gate_flags, args.json)

    outlier_flags = check_provider_outliers(
        load_games(DASHBOARD), args.feature, args.provider
    )
    results["provider_outliers"] = outlier_flags
    print_section("Provider-Level Feature Outliers (<10%)", outlier_flags, args.json)

    desc_flags = check_description_mismatch(games, args.feature)
    results["description_mismatch"] = desc_flags
    print_section("Description vs Feature Mismatch", desc_flags, args.json)

    cooc_flags = check_cooccurrence_anomalies(games)
    results["rare_cooccurrence"] = cooc_flags
    print_section("Rare Feature Co-occurrence", cooc_flags, args.json)

    total = sum(len(v) for v in results.values())
    if args.json:
        json.dump(results, sys.stdout, indent=2, ensure_ascii=False)
    else:
        print(f"\n{'=' * 70}")
        print(f"  TOTAL FLAGS: {total}")
        print(f"{'=' * 70}\n")

    return 0 if total == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
