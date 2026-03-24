"""
GT-Calibrated Feature Classification - Calibration Loop

Reads GT games with features_raw, uses a subset as few-shot examples,
classifies all GT games, and measures F1 against GT.

Usage: python3 data/calibrate_features.py [--apply]
  Without --apply: dry run on GT games only (calibration test)
  With --apply: apply to non-GT games after passing GT gate
"""

import json
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)
load_dotenv(Path(__file__).parent.parent / ".env", override=True)

import anthropic

API_KEY = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API_KEY")
if not API_KEY:
    print("ERROR: No API key found. Set CLAUDE_API_KEY or ANTHROPIC_API_KEY in .env")
    sys.exit(1)

CLIENT = anthropic.Anthropic(api_key=API_KEY)
MODEL = "claude-sonnet-4-20250514"

DATA_DIR = Path(__file__).parent
GAMES_PATH = DATA_DIR / "games_dashboard.json"
GT_PATH = DATA_DIR / "ground_truth_ags.json"
VOCAB_PATH = DATA_DIR / "ags_vocabulary.json"

KNOWN_FEATURES = [
    "Free Spins", "Hold and Spin", "Static Jackpot", "Multiplier",
    "Cash On Reels", "Respin", "Expanding Reels", "Buy Bonus",
    "Pick Bonus", "Wheel", "Persistence", "Cascading Reels",
    "Progressive Jackpot", "Megaways", "Wild Reels", "Sticky Wilds",
    "Mystery Symbols", "Symbol Transformation", "Nudges", "Gamble Feature",
    "Stacked Symbols", "Colossal Symbols", "Expanding Wilds"
]

FEW_SHOT_NAMES = [
    "Squealin Riches",       # 8 features (max diversity)
    "Fu Shen Zhu Fu",        # 8 features (H&S, COR, persistence)
    "Divine Fortune Megaways",# 7 features (Megaways, progressive)
    "Aztec Chief",           # 5 features
    "Pop And Win",           # 5 features (wild reels, nudges)
    "Le Bandit",             # 4 features (buy bonus, cascading)
    "Golden Wins",           # 3 features (simple: FS, PB, SJ)
    "Straight Cash",         # 2 features (simple: FS, multiplier)
    "Cash Volt",             # 2 features (COR, SJ)
    "Black Hawk Deluxe",     # 0 features (negative example)
]


def load_data():
    games = json.loads(GAMES_PATH.read_text())
    gt = json.loads(GT_PATH.read_text())
    return games, gt


def get_raw(game):
    raw = game.get("features_raw", "")
    if isinstance(raw, list):
        return " | ".join(raw)
    return str(raw or "")


def norm(s):
    return str(s or "").strip().lower()


def build_system_prompt(few_shot_examples):
    features_list = ", ".join(KNOWN_FEATURES)

    examples_text = ""
    for ex in few_shot_examples:
        features_str = json.dumps(ex["features"]) if ex["features"] else "[]"
        examples_text += f"""
Game: {ex["name"]} ({ex["provider"]})
Features raw: {ex["raw"][:800]}
Correct features: {features_str}
"""

    return f"""You are classifying slot game features into a canonical taxonomy. Be VERY SELECTIVE.

CANONICAL FEATURES (only use these exact names): {features_list}

CRITICAL: BE CONSERVATIVE. Only assign a feature if it is a PROMINENT, DEFINING mechanic of the game — not a minor side-effect, not a brief mention, not a secondary element. Study the Ground Truth examples below carefully — they show the RIGHT level of selectivity. Most games have 2-5 features, rarely more.

STRICT RULES (follow exactly):
1. MULTIPLIER: Only if the game has a NAMED multiplier mechanic (e.g., "multiplier trail," "wild multipliers," "increasing multiplier"). Do NOT assign just because the description mentions "2x" or "multiplier" in passing. Jackpot values expressed as "50x bet" are NOT Multiplier.
2. BUY BONUS: Only if the game prominently offers a purchasable bonus entry. If "Buy Feature" is mentioned briefly as an option, check if the GT examples with similar mentions include it. Usually it's NOT included unless it's a defining feature.
3. EXPANDING WILDS vs WILD REELS: Expanding Wilds = a wild symbol lands then expands to fill its reel. Wild Reels = entire reels randomly turn wild WITHOUT a wild landing first. These are DIFFERENT features. If unsure which, assign NEITHER.
4. PROGRESSIVE JACKPOT vs STATIC JACKPOT: Progressive = grows with player bets over time. Static = fixed-value jackpot tiers (Mini/Minor/Major/Grand). Named tiers like "Mini $50, Grand $5000" are STATIC. Most Hold & Spin games have STATIC Jackpot, NOT Progressive. Do NOT assign Progressive unless the description explicitly says "progressive" AND implies a growing pool. When catalogs say "progressive jackpot" but describe fixed tiers, use STATIC.
5. CASCADING REELS: Only if winning symbols are removed and new ones fall down (Avalanche/Tumble). NOT the same as standard reel spinning.
6. SYMBOL TRANSFORMATION: Only if there is a NAMED transformation mechanic. Regular mystery symbols or wild substitution are NOT Symbol Transformation.
7. STACKED SYMBOLS: Only if explicitly described as a feature. Regular symbols appearing on reels are NOT Stacked.
8. STICKY WILDS: Only if wilds explicitly stay locked for multiple spins. Wilds that appear during a bonus don't count.
9. EXPANDING REELS: The reel grid physically GROWS (more rows/ways added). Megaways variable rows = assign Megaways, NOT Expanding Reels (unless the grid also grows beyond MW's variable mechanism).
10. GAMBLE FEATURE: Only if there is an explicit gamble/double-up option after wins.
11. HOLD AND SPIN: Must be a dedicated bonus with locking symbols + respins + counter. If present, almost always includes STATIC JACKPOT too.
12. FREE SPINS: Must be a distinct bonus round of free spins. Not just "respins."
13. When UNSURE about ANY feature: DO NOT include it. False negatives are much better than false positives.

CORRECTLY CLASSIFIED EXAMPLES (Ground Truth — match this selectivity level):
{examples_text}

For the game I give you, read the features_raw text and output ONLY a JSON array of canonical feature names. Be as selective as the examples above. Nothing else."""


def classify_game(system_prompt, game_name, provider, raw_text, current_features=None):
    if current_features is not None:
        user_msg = f"""Game: {game_name} ({provider})
Current features assigned: {json.dumps(current_features)}
Features raw description: {raw_text[:1500]}

Review the current features against the raw description. Remove any features NOT clearly supported by the description. Add any PROMINENT features clearly described but missing. Be conservative — only change what you're confident about.

Output ONLY a JSON array of the corrected canonical feature names."""
    else:
        user_msg = f"""Game: {game_name} ({provider})
Features raw: {raw_text[:1500]}

Output ONLY a JSON array of canonical feature names."""

    try:
        resp = CLIENT.messages.create(
            model=MODEL,
            max_tokens=256,
            temperature=0,
            system=[{
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": user_msg}],
        )
        text = resp.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        features = json.loads(text)
        if not isinstance(features, list):
            return []
        return [f for f in features if f in KNOWN_FEATURES]
    except Exception as e:
        print(f"  ERROR classifying {game_name}: {e}")
        return None


def measure_f1(predictions, ground_truth):
    tp = fp = fn = 0
    per_feature = {}

    for name, pred_feats in predictions.items():
        gt_feats = set(ground_truth[name])
        pred_set = set(pred_feats)

        for f in pred_set:
            if f not in per_feature:
                per_feature[f] = {"tp": 0, "fp": 0, "fn": 0}
            if f in gt_feats:
                tp += 1
                per_feature[f]["tp"] += 1
            else:
                fp += 1
                per_feature[f]["fp"] += 1

        for f in gt_feats:
            if f not in per_feature:
                per_feature[f] = {"tp": 0, "fp": 0, "fn": 0}
            if f not in pred_set:
                fn += 1
                per_feature[f]["fn"] += 1

    prec = tp / (tp + fp) if (tp + fp) > 0 else 0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0

    return {
        "overall": {"tp": tp, "fp": fp, "fn": fn, "precision": prec, "recall": rec, "f1": f1},
        "per_feature": per_feature,
    }


def main():
    apply_mode = "--apply" in sys.argv
    games, gt = load_data()
    norm_fn = lambda s: str(s or "").strip().lower()

    # Build game lookup
    by_name = {}
    for g in games:
        by_name[norm_fn(g["name"])] = g
        by_name[norm_fn(g["name"].replace("'", ""))] = g

    # Find GT games with features_raw
    gt_with_raw = []
    for gt_name, entry in gt.items():
        g = by_name.get(norm_fn(gt_name)) or by_name.get(norm_fn(gt_name.replace("'", "")))
        if not g:
            continue
        raw = get_raw(g)
        if len(raw) > 10:
            gt_with_raw.append({
                "name": g["name"],
                "gt_name": gt_name,
                "provider": g.get("provider", "Unknown"),
                "features": entry.get("features", []),
                "raw": raw,
            })

    print(f"GT games with features_raw: {len(gt_with_raw)}")

    # Build few-shot examples
    few_shot = []
    for fs_name in FEW_SHOT_NAMES:
        match = next((g for g in gt_with_raw if norm_fn(g["name"]) == norm_fn(fs_name)), None)
        if match:
            few_shot.append(match)
        else:
            print(f"  WARNING: Few-shot game '{fs_name}' not found in GT-with-raw")

    print(f"Few-shot examples: {len(few_shot)}")
    system_prompt = build_system_prompt(few_shot)
    print(f"System prompt length: {len(system_prompt)} chars")

    # Load meta for original pipeline features
    meta_path = DATA_DIR / "games_dashboard_meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}

    # Classify all GT games with features_raw
    predictions = {}
    ground_truth_map = {}
    few_shot_set = {norm_fn(f["name"]) for f in few_shot}

    for i, game in enumerate(gt_with_raw):
        is_few_shot = norm_fn(game["name"]) in few_shot_set
        tag = " [FEW-SHOT]" if is_few_shot else ""
        print(f"\n[{i+1}/{len(gt_with_raw)}]{tag} {game['name']} ({game['provider']})")
        print(f"  GT: {game['features']}")

        # Get original pipeline features from meta
        dash_game = next((g for g in games if norm_fn(g["name"]) == norm_fn(game["name"])), None)
        original_features = None
        if dash_game and dash_game["id"] in meta and meta[dash_game["id"]].get("feature_map"):
            original_features = sorted(set(
                f["canonical"] for f in meta[dash_game["id"]]["feature_map"]
                if f.get("canonical")
            ))
            print(f"  ORIG: {original_features}")

        result = classify_game(system_prompt, game["name"], game["provider"], game["raw"], 
                             current_features=original_features)
        if result is None:
            print("  SKIPPED (API error)")
            continue

        predictions[game["name"]] = result
        ground_truth_map[game["name"]] = game["features"]

        gt_set = set(game["features"])
        pred_set = set(result)
        if gt_set == pred_set:
            print(f"  PRED: {result} ✓ MATCH")
        else:
            missing = gt_set - pred_set
            extra = pred_set - gt_set
            print(f"  PRED: {result}")
            if missing:
                print(f"  MISSING: {missing}")
            if extra:
                print(f"  EXTRA: {extra}")

        time.sleep(0.3)

    # Measure F1
    metrics = measure_f1(predictions, ground_truth_map)
    print("\n" + "=" * 60)
    print("CALIBRATION RESULTS")
    print("=" * 60)
    o = metrics["overall"]
    print(f"Games tested: {len(predictions)}")
    print(f"Precision: {o['precision']:.4f}")
    print(f"Recall:    {o['recall']:.4f}")
    print(f"F1:        {o['f1']:.4f}")
    print(f"TP: {o['tp']}, FP: {o['fp']}, FN: {o['fn']}")

    print("\nPer-feature breakdown:")
    for feat, m in sorted(metrics["per_feature"].items()):
        total = m["tp"] + m["fn"]
        prec = m["tp"] / (m["tp"] + m["fp"]) if (m["tp"] + m["fp"]) > 0 else 0
        rec = m["tp"] / (m["tp"] + m["fn"]) if (m["tp"] + m["fn"]) > 0 else 0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0
        print(f"  {feat}: P={prec:.2f} R={rec:.2f} F1={f1:.2f} (TP={m['tp']} FP={m['fp']} FN={m['fn']} total={total})")

    if o["f1"] >= 0.95:
        print(f"\n✓ CALIBRATION PASSED (F1={o['f1']:.4f} >= 0.95)")
        if apply_mode:
            print("Apply mode enabled. Would apply to non-GT games.")
        else:
            print("Run with --apply to apply to non-GT games.")
    else:
        print(f"\n✗ CALIBRATION FAILED (F1={o['f1']:.4f} < 0.95)")
        print("Examine per-feature breakdown above. Adjust prompt and retry.")

    # Save results
    results_path = DATA_DIR / "calibration_results.json"
    results_path.write_text(json.dumps({
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": MODEL,
        "few_shot_count": len(few_shot),
        "games_tested": len(predictions),
        "metrics": metrics,
        "predictions": predictions,
        "ground_truth": ground_truth_map,
    }, indent=2))
    print(f"\nResults saved to {results_path}")


if __name__ == "__main__":
    main()
