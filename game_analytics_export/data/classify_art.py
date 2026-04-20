#!/usr/bin/env python3
"""
Art classification pipeline for SC-reviewed games.
Uses Claude Sonnet with v3 prompt + post-processing.
Saves progress incrementally and can resume from last checkpoint.
"""

import json
import os
import re
import sys
import time

from bs4 import BeautifulSoup

SC_DIR = os.path.join(os.path.dirname(__file__), '_legacy', 'sc_cache')
GT_PATH = os.path.join(os.path.dirname(__file__), 'ground_truth_themes.json')
ENV_PATH = os.path.join(os.path.dirname(__file__), '.env')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'art_classification_results.json')
CHECKPOINT_INTERVAL = 50

VALID_THEMES = [
    "Egyptian/Pharaoh", "Ancient Greece/Rome", "Norse/Viking Realm", "Aztec/Mayan",
    "Asian Temple/Garden", "Arabian Palace/Bazaar", "Indian/South Asian",
    "Medieval Castle", "Prehistoric/Primordial", "Irish/Celtic Highlands",
    "Jungle/Rainforest", "Deep Ocean/Underwater", "Tropical Island/Beach",
    "Arctic/Snow", "Desert/Sahara", "Mountain/Volcano", "Savanna/Wildlife",
    "Prairie/Plains/Grassland", "Australian Outback", "Sky/Clouds",
    "Lakeside/River/Fishing Dock", "Farm/Countryside", "Forest/Woodland",
    "Fantasy/Fairy Tale", "Haunted Manor/Graveyard", "Outer Space",
    "Urban/Modern City", "Neon/Cyber City", "Casino Floor", "Luxury/VIP",
    "Wild West/Frontier", "Pirate Ship/Port", "Crime/Heist", "Sports",
    "Music/Entertainment", "Food/Cooking", "Mexican/Latin Village",
    "Steampunk/Victorian", "Circus/Carnival", "Branded/Licensed",
    "Classic Slots", "Fruit Machine", "Candy/Sweet World",
    "Royal Palace/Court", "Treasure Cave/Mine", "Tavern/Saloon",
    "Laboratory/Workshop", "Festive/Holiday",
]
VALID_THEMES_SET = set(VALID_THEMES)

VALID_MOODS = [
    "Epic/Grand/Heroic", "Dark/Mysterious", "Bright/Fun/Cheerful", "Spooky/Horror/Creepy",
    "Romantic/Dreamy", "Adventurous/Exciting", "Serene/Peaceful/Zen", "Intense/Action/Thrilling",
    "Nostalgic/Retro", "Cartoon/Playful/Fun", "Luxurious/Opulent", "Rugged/Gritty",
]
VALID_MOODS_SET = set(VALID_MOODS)

VALID_CHARS = [
    "No Characters (symbol-only game)", "Leprechaun", "Dragon", "Wizard/Sorcerer",
    "Warrior/Knight", "King/Queen/Royalty", "Explorer/Adventurer", "Pirate",
    "Mermaid/Siren", "Fairy/Elf", "Vampire/Werewolf", "Cowboy",
    "Egyptian Deity (Ra, Anubis, Cleopatra)", "Greek/Roman God",
    "Norse God (Odin, Thor, Loki)", "Wild Animals (lion, wolf, eagle, bear)",
    "Sea Creatures (fish, octopus, shark)", "Mythical Beast (phoenix, griffin, unicorn)",
    "Robot/Android", "Celebrity/Licensed Character", "Ninja/Samurai",
    "Alien/Extraterrestrial", "Detective/Spy", "Luchador/Fighter",
]

VALID_STYLES = [
    "Realistic 3D", "Stylized 2.5D", "Cartoon/Illustrated", "Pixel Art/Retro",
    "Photographic/Cinematic", "Minimalist/Flat", "Hand-drawn/Artistic", "Comic Book/Pop Art",
]

VALID_COLORS = [
    "Warm (golds, reds, ambers)", "Cool (blues, silvers, purples)",
    "Dark (blacks, deep tones, shadows)", "Bright/Vibrant (saturated, neon)",
    "Earthy (greens, browns, natural)", "Pastel (soft, muted tones)",
    "Metallic/Jewel Tones (rich, shimmering)", "Monochrome/Grayscale",
]


def load_api_key():
    with open(ENV_PATH) as f:
        for line in f:
            if line.startswith('ANTHROPIC_API_KEY='):
                return line.strip().split('=', 1)[1]
    raise RuntimeError('ANTHROPIC_API_KEY not found in .env')


def build_training_ref():
    with open(GT_PATH) as f:
        gt = json.load(f)
    lines = []
    for g in gt['games']:
        name = g['game_name'].split(' Slot')[0].split(' Demo')[0].strip()
        if len(name) > 35:
            name = name[:35].strip()
        sec = f", secondary: {g['art_theme_secondary']}" if g.get('art_theme_secondary') else ""
        branded = ", is_branded=true" if g.get('is_branded') else ""
        chars = ""
        if g.get('art_characters'):
            chars = f", characters: {', '.join(g['art_characters'][:2])}"
        mood = f", mood: {g['art_mood']}" if g.get('art_mood') else ""
        lines.append(f'  "{g["art_theme"]}": {name}{sec}{branded}{chars}{mood}')
    return '\n'.join(lines)


def build_system_prompt(training_ref):
    return f"""You are an expert slot game visual art classifier. Classify each game's visual art based on its name and human-written review.

CRITICAL RULES:
1. VOCABULARY LOCK: You MUST use ONLY the exact string values from the lists below. NEVER paraphrase, combine, or invent values. Copy the value exactly as written, character for character.
2. art_theme = the PRIMARY visual SETTING/ENVIRONMENT. Ask: "Where is this game visually set?"
3. art_theme_secondary = a clearly present SECONDARY setting, or null. MUST also be from the THEME list exactly.
4. PRIMARY vs SECONDARY: The PRIMARY theme is what defines the game's visual world.
   - If the game's core identity is a specific setting (e.g., tropical island, jungle) and holiday elements (Santa, Christmas trees) are added as decoration, the core setting is PRIMARY and Festive/Holiday is SECONDARY.
   - If the game is fundamentally built around a holiday (name starts with "Santa", "Christmas", etc., review calls it "holiday-themed"), then Festive/Holiday is PRIMARY.
5. For branded/licensed games (movies, TV, board games): set is_branded=true. Use the game's visual setting as art_theme (e.g., Crime/Heist for a crime drama). Use "Branded/Licensed" as art_theme ONLY when no other visual setting is dominant.
6. Classify VISUAL ART, not gameplay mechanics.
7. art_theme and art_theme_secondary are PLACES/SETTINGS. Mood values like "Romantic/Dreamy" or "Nostalgic/Retro" are NOT valid themes.

VERIFIED TRAINING EXAMPLES:
{training_ref}

ALLOWED VALUES (use EXACTLY as written):
THEME: {json.dumps(sorted(VALID_THEMES))}
CHARACTER: {json.dumps(VALID_CHARS)}
MOOD: {json.dumps(VALID_MOODS)}
STYLE: {json.dumps(VALID_STYLES)}
COLOR: {json.dumps(VALID_COLORS)}

Return ONLY a raw JSON object (no markdown, no backticks):
{{"art_theme": "...", "art_theme_secondary": "..." or null, "art_characters": [...], "art_mood": "...", "art_style": "...", "art_color_tone": "...", "art_narrative": "one sentence", "is_branded": true/false}}"""


def extract_review(fname):
    path = os.path.join(SC_DIR, fname)
    with open(path, encoding='utf-8', errors='replace') as f:
        html = f.read()
    soup = BeautifulSoup(html, 'html.parser')
    h1 = soup.find('h1')
    name = h1.get_text(strip=True) if h1 else fname.replace('.html', '')
    review_h2 = soup.find('h2', string=re.compile(r'Review', re.IGNORECASE))
    review_text = ''
    if review_h2:
        current = review_h2.find_next_sibling()
        while current:
            if current.name == 'h2':
                break
            t = current.get_text(strip=True) if current.name else ''
            if t and len(t) > 20:
                review_text += t + '\n'
            current = current.find_next_sibling()
    return name, review_text


def post_process(result):
    """Fix known error patterns deterministically."""
    fixes = []

    if result.get('art_theme_secondary') and result['art_theme_secondary'] in VALID_MOODS_SET:
        fixes.append(f"secondary '{result['art_theme_secondary']}' is a mood → null")
        result['art_theme_secondary'] = None

    if result.get('art_theme') and result['art_theme'] in VALID_MOODS_SET:
        if result.get('art_theme_secondary') and result['art_theme_secondary'] in VALID_THEMES_SET:
            fixes.append(f"primary '{result['art_theme']}' is a mood → swapped with secondary")
            result['art_theme'] = result['art_theme_secondary']
            result['art_theme_secondary'] = None
        else:
            fixes.append(f"primary '{result['art_theme']}' is a mood → needs re-classify")
            result['_needs_reclassify'] = True

    if result.get('art_theme_secondary') and result['art_theme'] == result['art_theme_secondary']:
        fixes.append(f"primary == secondary → nulled secondary")
        result['art_theme_secondary'] = None

    if result.get('art_theme_secondary') and result['art_theme_secondary'] not in VALID_THEMES_SET:
        fixes.append(f"secondary '{result['art_theme_secondary']}' invalid → null")
        result['art_theme_secondary'] = None

    return result, fixes


def classify_game(client, system_prompt, fname):
    name, review = extract_review(fname)
    if not review or len(review) < 50:
        return None, name, 'no review'

    resp = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system=system_prompt,
        messages=[{"role": "user", "content": f"Game: {name}\nReview: {review[:2000]}"}],
    )
    raw = resp.content[0].text.strip()
    raw = re.sub(r'^```\w*\n?', '', raw)
    raw = re.sub(r'\n?```$', '', raw)
    result = json.loads(raw)

    result, fixes = post_process(result)
    return result, name, fixes


def main():
    sys.stdout.reconfigure(line_buffering=True)
    import anthropic

    api_key = load_api_key()
    client = anthropic.Anthropic(api_key=api_key)
    training_ref = build_training_ref()
    system_prompt = build_system_prompt(training_ref)

    with open('/tmp/full_batch_list.json') as f:
        todo = json.load(f)

    existing = {}
    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH) as f:
            data = json.load(f)
        for r in data.get('results', []):
            existing[r['file']] = r

    print(f"Total to classify: {len(todo)}", flush=True)
    print(f"Already classified: {len(existing)}", flush=True)

    results = list(existing.values())
    errors = 0
    vocab_violations = 0
    post_fixes = 0
    reclassify_list = []

    for i, tg in enumerate(todo):
        if tg['file'] in existing:
            continue

        try:
            result, name, fixes = classify_game(client, system_prompt, tg['file'])
            if result is None:
                continue

            if fixes and isinstance(fixes, list) and fixes:
                post_fixes += 1
                print(f"  FIX #{i + 1} {tg['file'][:30]}: {'; '.join(fixes)}", flush=True)

            tv = result['art_theme'] in VALID_THEMES_SET
            sv = result.get('art_theme_secondary') is None or result['art_theme_secondary'] in VALID_THEMES_SET
            if not tv or not sv:
                vocab_violations += 1
                print(
                    f"  VOCAB #{i + 1}: {tg['file']} → {result['art_theme']} / {result.get('art_theme_secondary')}",
                    flush=True,
                )

            if result.get('_needs_reclassify'):
                reclassify_list.append(tg['file'])
                del result['_needs_reclassify']

            results.append(
                {
                    'file': tg['file'],
                    'name': name,
                    'art_theme': result['art_theme'],
                    'art_theme_secondary': result.get('art_theme_secondary'),
                    'art_mood': result.get('art_mood', ''),
                    'art_characters': result.get('art_characters', []),
                    'art_style': result.get('art_style', ''),
                    'art_color_tone': result.get('art_color_tone', ''),
                    'art_narrative': result.get('art_narrative', ''),
                    'is_branded': result.get('is_branded', False),
                }
            )
            existing[tg['file']] = results[-1]
        except Exception as e:
            errors += 1
            print(f"  ERROR #{i + 1}: {tg['file']}: {e}", flush=True)
            if 'credit balance' in str(e).lower():
                print('API credits exhausted. Saving checkpoint.', flush=True)
                break

        classified = len(results)
        if classified % CHECKPOINT_INTERVAL == 0:
            with open(OUTPUT_PATH, 'w') as f:
                json.dump({'results': results, 'stats': {'classified': classified, 'errors': errors}}, f, indent=2)
            print(
                f"  ...{classified} classified ({errors} err, {vocab_violations} vocab, {post_fixes} fixes)",
                flush=True,
            )
        time.sleep(0.3)

    with open(OUTPUT_PATH, 'w') as f:
        json.dump({'results': results, 'stats': {'classified': len(results), 'errors': errors}}, f, indent=2)

    print(f'\n=== FULL BATCH COMPLETE ===', flush=True)
    print(f'Classified: {len(results)}', flush=True)
    print(f'Errors: {errors}', flush=True)
    print(f'Vocab violations: {vocab_violations}', flush=True)
    print(f'Post-process fixes: {post_fixes}', flush=True)
    print(f'Need re-classification: {len(reclassify_list)}', flush=True)

    if reclassify_list:
        print(f'\nRe-classifying {len(reclassify_list)} games...', flush=True)
        for fname in reclassify_list:
            print(f'  {fname}', flush=True)

    from collections import Counter

    tc = Counter(r['art_theme'] for r in results)
    print(f'\nTheme distribution ({len(tc)} unique):', flush=True)
    for t, c in tc.most_common(20):
        print(f'  {t:<30s} x{c} ({c / len(results) * 100:.1f}%)', flush=True)
    if len(tc) > 20:
        print(f'  ... {len(tc) - 20} more', flush=True)


if __name__ == '__main__':
    main()
