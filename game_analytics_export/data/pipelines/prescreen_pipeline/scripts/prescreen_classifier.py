#!/usr/bin/env python3
"""
Screenshot Classifier
Classifies screenshots as gameplay / promotional / splash_screen / rules_page.
Only gameplay screenshots are usable for art classification.

Pipeline:
1. Claude Vision (Sonnet, 1568px): classify all screenshots
2. Regression testing against user-reviewed ground truth (290 images)
3. Iterative prompt refinement (V5 prompt, 97.4% accuracy)

Usage:
  python prescreen_classifier.py --classify --limit 10     # classify new screenshots
  python prescreen_classifier.py --classify --full          # re-classify all screenshots
  python prescreen_classifier.py --regression              # test against GT
  python prescreen_classifier.py --stats                   # show results
"""

import base64
import json
import os
import sys
import time
from io import BytesIO
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)

SCRIPT_DIR = Path(__file__).parent
PIPELINE_DIR = SCRIPT_DIR.parent
STATE_DIR = PIPELINE_DIR / "state"
GT_DIR = PIPELINE_DIR / "gt"
GT_PATH = GT_DIR / "ground_truth.json"
RESULTS_PATH = STATE_DIR / "prescreen_results.json"
REGRESSION_LOG_PATH = STATE_DIR / "regression_log.json"
PROMPT_PATH = PIPELINE_DIR / "prompt.txt"

sys.path.insert(0, str(PIPELINE_DIR.parent))
from config import SCREENSHOTS_DIR, ENV_FILE

SCREENSHOT_DIR = str(SCREENSHOTS_DIR)
MAX_LONG_EDGE = 1568
JPEG_QUALITY = 85
MODEL = "claude-sonnet-4-20250514"


def load_api_key():
    """Load API key from .env file."""
    # Check pipelines .env first (has the real key)
    pipelines_env = Path(__file__).parent.parent.parent / ".env"
    for env_path in [str(pipelines_env), str(ENV_FILE)]:
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("ANTHROPIC_API_KEY="):
                        val = line.strip().split("=", 1)[1].strip('"').strip("'")
                        if val and not val.startswith("your-"):
                            return val
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key and not key.startswith("your-"):
        return key
    raise ValueError("No ANTHROPIC_API_KEY found in .env or environment")


def load_prompt():
    """Load the classification prompt from file."""
    if PROMPT_PATH.exists():
        return PROMPT_PATH.read_text().strip()
    return DEFAULT_PROMPT


DEFAULT_PROMPT = """Look at this image. Is it a screenshot of an actual slot machine game being played?

A GAMEPLAY screenshot shows:
- Slot reels with symbols clearly visible
- Game UI elements (spin button, bet amount, balance)
- The game actively in a playable state

NOT gameplay includes:
- Promotional artwork or logos
- Game thumbnails or cover images
- Loading screens or splash screens
- Rules/paytable pages
- Bonus selection screens before gameplay starts
- Images too small or blurry to determine

Answer exactly one word: gameplay or not_gameplay"""


def prepare_image(image_path):
    """Resize image for Claude Vision — downscale only if larger than MAX_LONG_EDGE."""
    from PIL import Image

    img = Image.open(image_path)
    img = img.convert("RGB")
    w, h = img.size
    long_edge = max(w, h)
    if long_edge > MAX_LONG_EDGE:
        scale = MAX_LONG_EDGE / long_edge
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return base64.standard_b64encode(buf.getvalue()).decode("utf-8")


def classify_image(client, image_path, prompt):
    """Send image to Claude and get classification."""
    img_data = prepare_image(image_path)

    response = client.messages.create(
        model=MODEL,
        max_tokens=10,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": img_data,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )

    answer = response.content[0].text.strip().lower().replace(".", "").replace(",", "")
    if "splash" in answer:
        return "splash_screen"
    if "rules" in answer:
        return "rules_page"
    if "promotional" in answer or "promo" in answer:
        return "promotional"
    if answer in ("gameplay", "game play", "yes"):
        return "gameplay"
    if "gameplay" in answer:
        return "gameplay"
    return "promotional"


def run_regression():
    """Test classifier against ground truth and report accuracy.
    GT format: list of {file, label, user_label} where label is gameplay/not_gameplay/borderline."""
    import anthropic

    gt = json.loads(GT_PATH.read_text())
    if isinstance(gt, dict):
        gt_list = [{"file": v.get("file", ""), "label": v.get("label", ""), "game": v.get("game", k)} for k, v in gt.items()]
    else:
        gt_list = gt

    testable = []
    skipped = 0
    missing = 0
    for entry in gt_list:
        fname = entry.get("file", "")
        label = entry.get("user_label", entry.get("label", ""))
        if label == "borderline":
            skipped += 1
            continue
        base = fname.replace(".html", "")
        img_path = None
        for ext in [".jpg", ".jpeg", ".png", ".webp"]:
            candidate = os.path.join(SCREENSHOT_DIR, base + ext)
            if os.path.exists(candidate):
                img_path = candidate
                break
        if not img_path:
            missing += 1
            continue
        expected_norm = "gameplay" if label == "gameplay" else "not_gameplay"
        testable.append({"file": fname, "img_path": img_path, "expected": expected_norm, "game": base})

    print(f"Ground truth: {len(gt_list)} total, {len(testable)} testable, {skipped} borderline skipped, {missing} missing files")
    if not testable:
        print("No testable GT entries.")
        return

    prompt = load_prompt()
    print(f"Prompt: {prompt[:80]}...")
    print(f"Model: {MODEL}")
    print()

    api_key = load_api_key()
    client = anthropic.Anthropic(api_key=api_key)

    correct = 0
    wrong = 0
    results = []

    for entry in testable:
        predicted = classify_image(client, entry["img_path"], prompt)
        pred_norm = "gameplay" if predicted == "gameplay" else "not_gameplay"
        is_correct = pred_norm == entry["expected"]
        if is_correct:
            correct += 1
        else:
            wrong += 1
        results.append({
            "game": entry["game"],
            "expected": entry["expected"],
            "predicted": predicted,
            "correct": is_correct,
        })
        status = "✓" if is_correct else "✗"
        print(f"  {status} {entry['game']:45s} expected={entry['expected']:15s} got={predicted}")
        time.sleep(0.3)

    total = correct + wrong
    accuracy = correct / total * 100 if total > 0 else 0
    print(f"\n{'='*50}")
    print(f"REGRESSION RESULTS")
    print(f"  Accuracy: {accuracy:.1f}% ({correct}/{total})")

    tp = sum(1 for r in results if r["expected"] == "gameplay" and r["predicted"] == "gameplay")
    fp = sum(1 for r in results if r["expected"] == "not_gameplay" and r["predicted"] == "gameplay")
    fn = sum(1 for r in results if r["expected"] == "gameplay" and r["predicted"] != "gameplay")
    tn = sum(1 for r in results if r["expected"] == "not_gameplay" and r["predicted"] != "gameplay")
    print(f"  TP={tp} TN={tn} FP={fp} FN={fn}")
    if tp + fp > 0:
        print(f"  Precision: {tp/(tp+fp)*100:.1f}%")
    if tp + fn > 0:
        print(f"  Recall: {tp/(tp+fn)*100:.1f}%")

    import hashlib
    log_entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": MODEL,
        "prompt_hash": hashlib.sha256(prompt.encode()).hexdigest()[:12],
        "accuracy": accuracy,
        "total": total,
        "correct": correct,
        "wrong": wrong,
        "details": results,
    }
    log = []
    if REGRESSION_LOG_PATH.exists():
        log = json.loads(REGRESSION_LOG_PATH.read_text())
    log.append(log_entry)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    REGRESSION_LOG_PATH.write_text(json.dumps(log, indent=2))
    print(f"\nRegression log saved ({len(log)} runs total)")


def run_classify(limit=None, full=False):
    """Classify screenshots. Use --full to re-classify all (ignoring existing results)."""
    import anthropic

    results = {}
    if not full and RESULTS_PATH.exists():
        results = json.loads(RESULTS_PATH.read_text())

    all_screenshots = [
        f
        for f in os.listdir(SCREENSHOT_DIR)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    ]

    if full:
        pending = all_screenshots
    else:
        pending = [f for f in all_screenshots if f.replace(os.path.splitext(f)[1], "") not in results]
    if limit:
        pending = pending[:limit]

    print(f"Total screenshots: {len(all_screenshots)}")
    print(f"Already classified: {len(results)}")
    print(f"Pending: {len(pending)}")
    if full:
        print(f"  (--full mode: re-classifying everything)")

    if not pending:
        print("Nothing to classify.")
        return

    prompt = load_prompt()
    api_key = load_api_key()
    client = anthropic.Anthropic(api_key=api_key)

    cost_est = len(pending) * 0.003
    print(f"Estimated cost: ~${cost_est:.2f} ({len(pending)} images × ~$0.003/image, Sonnet Vision @ 1568px)")
    print()

    counts = {"gameplay": 0, "promotional": 0, "rules_page": 0, "size_gate": 0, "error": 0}

    for i, fname in enumerate(pending):
        slug = fname.replace(os.path.splitext(fname)[1], "")
        fpath = os.path.join(SCREENSHOT_DIR, fname)
        file_size = os.path.getsize(fpath)

        try:
            predicted = classify_image(client, fpath, prompt)
            results[slug] = {"classification": predicted, "reason": "claude_vision", "size": file_size}
            counts[predicted] = counts.get(predicted, 0) + 1

            if i < 5 or (i + 1) % 50 == 0:
                print(f"  [{i+1}/{len(pending)}] {slug} → {predicted} ({file_size//1024}KB)")
        except Exception as e:
            results[slug] = {"classification": "error", "reason": str(e), "size": file_size}
            counts["error"] += 1
            print(f"  [{i+1}/{len(pending)}] ERROR {slug}: {e}")

        if (i + 1) % 25 == 0:
            RESULTS_PATH.write_text(json.dumps(results, indent=2))
            print(f"  ... saved checkpoint ({i+1}/{len(pending)})", flush=True)

        time.sleep(0.3)

    RESULTS_PATH.write_text(json.dumps(results, indent=2))
    print(f"\nDone: {counts}")
    print(f"Saved to: {RESULTS_PATH}")


def show_stats():
    """Show current state of pre-screening."""
    if RESULTS_PATH.exists():
        results = json.loads(RESULTS_PATH.read_text())
        stats = {}
        for v in results.values():
            cls = v.get("classification", "unknown")
            stats[cls] = stats.get(cls, 0) + 1
        print("Pre-screen results:")
        for k, v in sorted(stats.items(), key=lambda x: -x[1]):
            print(f"  {k}: {v}")
        print(f"  Total: {len(results)}")
    else:
        print("No pre-screen results yet.")

    if REGRESSION_LOG_PATH.exists():
        log = json.loads(REGRESSION_LOG_PATH.read_text())
        print(f"\nRegression history ({len(log)} runs):")
        for entry in log[-5:]:
            print(f"  {entry['timestamp']}: {entry['accuracy']:.1f}% ({entry['correct']}/{entry['total']})")


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--regression" in args:
        run_regression()
    elif "--classify" in args:
        limit = None
        full = "--full" in args
        if "--limit" in args:
            idx = args.index("--limit")
            limit = int(args[idx + 1])
        run_classify(limit, full=full)
    elif "--stats" in args:
        show_stats()
    else:
        print("Usage:")
        print("  python prescreen_classifier.py --regression")
        print("  python prescreen_classifier.py --classify --limit 50")
        print("  python prescreen_classifier.py --classify --full          # re-classify all")
        print("  python prescreen_classifier.py --stats")
