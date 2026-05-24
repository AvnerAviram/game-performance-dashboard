#!/usr/bin/env python3
"""Classify a single screenshot image. Called by download scripts to verify gameplay.

Usage:
  python3 classify_single.py /path/to/image.jpg
  → prints one word: gameplay / promotional / splash_screen / rules_page

Exit code 0 = success, 1 = error.
"""
import base64
import os
import sys
from io import BytesIO
from pathlib import Path

MAX_LONG_EDGE = 1568
JPEG_QUALITY = 85
MODEL = "claude-sonnet-4-20250514"

PIPELINE_DIR = Path(__file__).parent.parent.parent / "prescreen_pipeline"
PROMPT_PATH = PIPELINE_DIR / "prompt.txt"

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import ENV_FILE


def load_api_key():
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
    raise ValueError("No ANTHROPIC_API_KEY found")


def classify(image_path):
    import anthropic
    from PIL import Image

    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    long_edge = max(w, h)
    if long_edge > MAX_LONG_EDGE:
        scale = MAX_LONG_EDGE / long_edge
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY)
    img_data = base64.standard_b64encode(buf.getvalue()).decode("utf-8")

    prompt = PROMPT_PATH.read_text().strip() if PROMPT_PATH.exists() else "Is this gameplay? Answer: gameplay or promotional"

    client = anthropic.Anthropic(api_key=load_api_key())
    response = client.messages.create(
        model=MODEL,
        max_tokens=10,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img_data}},
                {"type": "text", "text": prompt},
            ],
        }],
    )

    answer = response.content[0].text.strip().lower().replace(".", "").replace(",", "")
    if "splash" in answer:
        return "splash_screen"
    if "rules" in answer:
        return "rules_page"
    if "promotional" in answer or "promo" in answer:
        return "promotional"
    if "gameplay" in answer or answer in ("gameplay", "game play", "yes"):
        return "gameplay"
    return "promotional"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 classify_single.py <image_path>", file=sys.stderr)
        sys.exit(1)
    try:
        result = classify(sys.argv[1])
        print(result)
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)
