#!/usr/bin/env python3
"""
Test 4 vision approaches for element detection:
  A) Directional scanning prompt (cheapest)
  B) Pre-crop into 4 regions + send alongside full image
  C) Two-pass (open description first, then structured extraction)
  D) Mask/blur inner reel area (user's idea)

Run on 5 games with worst element misses from v9.
"""

import base64
import json
import os
import re
import sys
import time
from io import BytesIO

from PIL import Image, ImageDraw, ImageFilter

sys.stdout.reconfigure(line_buffering=True)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SC_DIR = os.path.join(SCRIPT_DIR, '_legacy', 'sc_cache')
SCREENSHOT_DIR = os.path.join(SCRIPT_DIR, 'screenshots')

MODEL = 'claude-sonnet-4-20250514'

TEST_GAMES = [
    "Dancing-Drums-Explosion-Mega-Drop.html",
    "Fortunium.html",
    "Happy-Lucky.html",
    "15-Armadillos.html",
    "Elements-The-Awakening.html",
]

# What user said was missing for each game (from R3 corrections)
EXPECTED_MISSING = {
    "Dancing-Drums-Explosion-Mega-Drop.html": ["stone bull statue", "grass/fields"],
    "Fortunium.html": ["trees"],
    "Happy-Lucky.html": ["fireworks", "Asian decorations/lanterns"],
    "15-Armadillos.html": ["stone arch"],
    "Elements-The-Awakening.html": ["Victorian scenery/buildings"],
}


def load_api_key():
    env_path = os.path.join(SCRIPT_DIR, '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith('ANTHROPIC_API_KEY='):
                    return line.strip().split('=', 1)[1]
    return os.environ.get('ANTHROPIC_API_KEY')


def detect_media_type(filepath):
    with open(filepath, 'rb') as f:
        header = f.read(16)
    if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        return 'image/webp'
    if header[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if header[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    return 'image/jpeg'


def load_screenshot_pil(fname):
    slug = fname.replace('.html', '')
    for ext in ['.jpg', '.png', '.webp']:
        path = os.path.join(SCREENSHOT_DIR, slug + ext)
        if os.path.exists(path):
            return Image.open(path), path
    return None, None


def pil_to_b64(img, fmt='JPEG'):
    buf = BytesIO()
    if img.mode in ('RGBA', 'P'):
        img = img.convert('RGB')
    img.save(buf, format=fmt, quality=85)
    return base64.standard_b64encode(buf.getvalue()).decode('utf-8')


def image_block(b64_data, media_type='image/jpeg'):
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": b64_data},
    }


def extract_review(fname):
    from bs4 import BeautifulSoup
    fpath = os.path.join(SC_DIR, fname)
    if not os.path.exists(fpath):
        return fname.replace('.html', '').replace('-', ' '), ''
    with open(fpath, encoding='utf-8', errors='ignore') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    name_tag = soup.find('h1')
    name = name_tag.get_text(strip=True) if name_tag else fname.replace('.html', '')
    review_text = ''
    for h2 in soup.find_all('h2'):
        if 'review' in h2.get_text(strip=True).lower():
            current = h2.find_next_sibling()
            while current:
                if current.name == 'h2':
                    break
                t = current.get_text(strip=True) if current.name else ''
                if t and len(t) > 20:
                    review_text += t + '\n'
                current = current.find_next_sibling()
    return name, review_text


ELEMENT_EXTRACTION_PROMPT = """You are analyzing a slot game screenshot. List ALL visual elements you can see.

IMPORTANT: Only list elements that are OUTSIDE the reel grid (the spinning symbol area).
Look at: background scene, frame/border, side panels, top area, bottom area, decorations.

For each element, use short natural names like:
- Background: "mountains", "pyramids", "castle", "forest", "ocean", "village", "arena"
- Frame: "gold frame", "stone frame", "wood frame", "metal frame", "no frame"
- Objects: "statues", "columns", "torches", "lanterns", "bamboo", "vines", "chandeliers"
- Structures: "temple", "palace", "farmhouse", "Japanese garden", "stone arch"
- Effects: "fire/flames", "lightning", "fog", "snow", "fireworks"
- Decorations: "Asian lanterns", "hieroglyphs", "stone carvings", "banners", "skulls"

Return a JSON object:
{
  "elements_found": ["element1", "element2", ...],
  "scan_notes": "brief description of what you see in each area"
}"""


def run_approach_A(client, fname, img_pil, img_path, review_text, name):
    """Approach A: Directional scanning prompt added to existing pipeline."""
    b64 = pil_to_b64(img_pil)
    media = 'image/jpeg'  # pil_to_b64 always re-encodes as JPEG

    scanning_instruction = (
        "\n\nSCAN THE IMAGE SYSTEMATICALLY for elements outside the reel grid:\n"
        "1. TOP area above the reels — what is there?\n"
        "2. LEFT side panel — any objects, decorations, characters?\n"
        "3. RIGHT side panel — any objects, decorations, characters?\n"
        "4. BOTTOM area below the reels — anything?\n"
        "5. BACKGROUND visible through/behind the reel grid — landscape, buildings, sky?\n"
        "6. FRAME/BORDER — what material is it made of?\n"
        "For each region, note what you see. Then compile the full element list."
    )

    content = [
        image_block(b64, media),
        {"type": "text", "text": (
            f"Game: {name}\n\n"
            f"Screenshot above. List ALL visual elements OUTSIDE the reel grid.\n"
            f"Review excerpt: {review_text[:1500]}"
            f"{scanning_instruction}\n\n"
            f"{ELEMENT_EXTRACTION_PROMPT}"
        )},
    ]

    resp = client.messages.create(
        model=MODEL, max_tokens=800,
        messages=[{"role": "user", "content": content}],
    )
    return resp.content[0].text


def run_approach_B(client, fname, img_pil, img_path, review_text, name):
    """Approach B: Pre-crop into 4 regions + send alongside full image."""
    w, h = img_pil.size
    b64_full = pil_to_b64(img_pil)
    media = 'image/jpeg'

    crops = {
        "TOP": img_pil.crop((0, 0, w, int(h * 0.25))),
        "LEFT": img_pil.crop((0, int(h * 0.15), int(w * 0.2), int(h * 0.85))),
        "RIGHT": img_pil.crop((int(w * 0.8), int(h * 0.15), w, int(h * 0.85))),
        "BOTTOM": img_pil.crop((0, int(h * 0.75), w, h)),
    }

    content = [
        image_block(b64_full, media),
        {"type": "text", "text": "FULL GAME SCREENSHOT above. Below are zoomed-in crops of specific regions:\n"},
    ]

    for region_name, crop_img in crops.items():
        if crop_img.size[0] > 10 and crop_img.size[1] > 10:
            content.append(image_block(pil_to_b64(crop_img), 'image/jpeg'))
            content.append({"type": "text", "text": f"↑ ZOOMED: {region_name} region\n"})

    content.append({"type": "text", "text": (
        f"\nGame: {name}\n"
        f"Review excerpt: {review_text[:1500]}\n\n"
        f"Using ALL images above (full screenshot + zoomed regions), "
        f"list every visual element you see OUTSIDE the reel grid.\n\n"
        f"{ELEMENT_EXTRACTION_PROMPT}"
    )})

    resp = client.messages.create(
        model=MODEL, max_tokens=800,
        messages=[{"role": "user", "content": content}],
    )
    return resp.content[0].text


def run_approach_C(client, fname, img_pil, img_path, review_text, name):
    """Approach C: Two-pass. First open description, then structured extraction."""
    b64 = pil_to_b64(img_pil)
    media = 'image/jpeg'

    # Pass 1: Open-ended description
    pass1_content = [
        image_block(b64, media),
        {"type": "text", "text": (
            f"This is a screenshot of a slot game called '{name}'.\n\n"
            f"Describe in detail everything you see OUTSIDE the spinning reel area. "
            f"Scan systematically: top, left side, right side, bottom, background behind reels, frame/border. "
            f"Be extremely thorough — mention every decoration, structure, object, effect, "
            f"texture, and material you can identify. Don't miss anything."
        )},
    ]

    pass1_resp = client.messages.create(
        model=MODEL, max_tokens=600,
        messages=[{"role": "user", "content": pass1_content}],
    )
    description = pass1_resp.content[0].text

    # Pass 2: Structured extraction using description as context
    pass2_content = [
        image_block(b64, media),
        {"type": "text", "text": (
            f"Game: {name}\n\n"
            f"You previously analyzed this screenshot and found:\n"
            f"---\n{description}\n---\n\n"
            f"Now extract structured element data from your analysis.\n\n"
            f"{ELEMENT_EXTRACTION_PROMPT}"
        )},
    ]

    pass2_resp = client.messages.create(
        model=MODEL, max_tokens=800,
        messages=[{"role": "user", "content": pass2_content}],
    )
    return f"PASS1: {description}\n\n---PASS2---\n{pass2_resp.content[0].text}"


def run_approach_D(client, fname, img_pil, img_path, review_text, name):
    """Approach D: Mask/black out the inner reel area, then analyze."""
    w, h = img_pil.size

    # Typical slot layout: reels occupy roughly center 60% width, 50-70% height
    # starting ~15-20% from top, ~15-20% from each side
    reel_left = int(w * 0.18)
    reel_right = int(w * 0.82)
    reel_top = int(h * 0.18)
    reel_bottom = int(h * 0.82)

    masked = img_pil.copy()
    draw = ImageDraw.Draw(masked)
    draw.rectangle([reel_left, reel_top, reel_right, reel_bottom], fill=(0, 0, 0))

    b64_masked = pil_to_b64(masked)

    # Adapted prompt: no mention of "reel grid" or symbols since they're masked
    content = [
        image_block(b64_masked, 'image/jpeg'),
        {"type": "text", "text": (
            f"This is a slot game screenshot with the spinning reel area blacked out. "
            f"Everything you can see IS a visual design element of the game.\n\n"
            f"Game: {name}\n"
            f"Review excerpt: {review_text[:1500]}\n\n"
            f"List ALL visual elements visible in this image. Since the reel area is masked, "
            f"everything you see is background, frame, decoration, or effect.\n\n"
            f"Look carefully at:\n"
            f"- The background scene (landscape, buildings, sky, underwater, etc.)\n"
            f"- The frame/border around the black area (gold, stone, wood, metal, etc.)\n"
            f"- Decorative objects on all sides (statues, lanterns, torches, columns, etc.)\n"
            f"- Visual effects (fire, lightning, fog, fireworks, etc.)\n"
            f"- Any structures visible (temples, arches, houses, gardens, etc.)\n\n"
            f"Return a JSON object:\n"
            f'{{"elements_found": ["element1", "element2", ...], '
            f'"scan_notes": "brief description of what you see in each area"}}'
        )},
    ]

    resp = client.messages.create(
        model=MODEL, max_tokens=800,
        messages=[{"role": "user", "content": content}],
    )
    return resp.content[0].text


def parse_elements(raw_text):
    """Extract elements_found from response."""
    text = raw_text
    if '---PASS2---' in text:
        text = text.split('---PASS2---')[1]

    text = re.sub(r'^```\w*\n?', '', text.strip())
    text = re.sub(r'\n?```$', '', text)

    match = re.search(r'\{[^{}]*"elements_found"\s*:\s*\[.*?\][^{}]*\}', text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            return data.get('elements_found', [])
        except json.JSONDecodeError:
            pass

    match = re.search(r'"elements_found"\s*:\s*\[(.*?)\]', text, re.DOTALL)
    if match:
        items = re.findall(r'"([^"]+)"', match.group(1))
        return items

    return []


def main():
    import anthropic

    api_key = load_api_key()
    client = anthropic.Anthropic(api_key=api_key)

    approaches = {
        'A_scan': run_approach_A,
        'B_crop': run_approach_B,
        'C_twopass': run_approach_C,
        'D_mask': run_approach_D,
    }

    all_results = {}

    for fname in TEST_GAMES:
        name, review = extract_review(fname)
        img_pil, img_path = load_screenshot_pil(fname)
        if not img_pil:
            print(f"SKIP {fname}: no screenshot")
            continue

        print(f"\n{'='*70}")
        print(f"GAME: {name[:50]} ({img_pil.size[0]}x{img_pil.size[1]})")
        print(f"EXPECTED MISSING: {EXPECTED_MISSING.get(fname, [])}")
        print(f"{'='*70}")

        game_results = {}

        for label, func in approaches.items():
            print(f"\n  [{label}] Running...", end=' ', flush=True)
            t0 = time.time()
            try:
                raw = func(client, fname, img_pil, img_path, review, name)
                elapsed = time.time() - t0
                elements = parse_elements(raw)
                print(f"{elapsed:.1f}s — {len(elements)} elements")
                print(f"    Elements: {elements}")

                # Check which expected elements were found
                expected = EXPECTED_MISSING.get(fname, [])
                for exp in expected:
                    exp_lower = exp.lower()
                    found = any(exp_lower in e.lower() or e.lower() in exp_lower
                                for e in elements)
                    if not found:
                        found = any(
                            any(w in e.lower() for w in exp_lower.split('/'))
                            for e in elements
                        )
                    status = "FOUND" if found else "MISSED"
                    print(f"    Expected '{exp}': {status}")

                game_results[label] = {
                    'elements': elements,
                    'time': elapsed,
                    'raw': raw[:500],
                }
            except Exception as e:
                print(f"ERROR: {e}")
                game_results[label] = {'elements': [], 'error': str(e)}

        all_results[fname] = game_results

    # Summary
    print(f"\n\n{'='*70}")
    print("SUMMARY: Which approach found the most expected elements?")
    print(f"{'='*70}")

    for label in approaches:
        total_expected = 0
        total_found = 0
        total_elems = 0
        total_time = 0

        for fname in TEST_GAMES:
            if fname not in all_results:
                continue
            r = all_results[fname].get(label, {})
            elements = r.get('elements', [])
            total_elems += len(elements)
            total_time += r.get('time', 0)

            for exp in EXPECTED_MISSING.get(fname, []):
                total_expected += 1
                exp_lower = exp.lower()
                found = any(exp_lower in e.lower() or e.lower() in exp_lower for e in elements)
                if not found:
                    found = any(
                        any(w in e.lower() for w in exp_lower.split('/'))
                        for e in elements
                    )
                if found:
                    total_found += 1

        print(f"\n  {label}:")
        print(f"    Expected elements found: {total_found}/{total_expected}")
        print(f"    Avg elements/game: {total_elems/len(TEST_GAMES):.1f}")
        print(f"    Total API time: {total_time:.0f}s")

    # Save raw results
    with open('/tmp/vision_approach_comparison.json', 'w') as f:
        serializable = {}
        for fname, game_r in all_results.items():
            serializable[fname] = {}
            for label, r in game_r.items():
                serializable[fname][label] = {
                    'elements': r.get('elements', []),
                    'time': r.get('time', 0),
                }
        json.dump(serializable, f, indent=2)
    print(f"\nResults saved to /tmp/vision_approach_comparison.json")


if __name__ == '__main__':
    main()
