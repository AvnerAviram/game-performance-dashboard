"""
SlotCatalog Review Extraction Pipeline.
Extracts features, themes, and specs from SC human-written reviews using Claude.

Usage:
  python sc_extract.py --test-extractor          # Test text extractor on cached pages
  python sc_extract.py --validate-features       # Feature validation (HARD GATE >95% F1)
  python sc_extract.py --validate-themes         # Theme validation (target >90% F1)
  python sc_extract.py --validate-specs          # Validate SC specs vs GT (100% match)
  python sc_extract.py --validate-all            # Run all validations
  python sc_extract.py --extract-game "Name"     # Extract a single game from SC
"""

import json
import os
import sys
import re
import time
import argparse
from pathlib import Path
from collections import Counter

DATA_DIR = Path(__file__).parent
GT_PATH = DATA_DIR / "ground_truth_ags.json"
MASTER_PATH = DATA_DIR / "game_data_master.json"
SC_CACHE_DIR = DATA_DIR / "_legacy" / "sc_cache"
OVERLAP_PATH = DATA_DIR / "_legacy" / "gt_sc_overlap.json"

from extract_game_profile import (
    FEATURE_DEFINITION_CARDS,
    THEME_TAXONOMY,
    CANONICAL_FEATURE_NAMES,
    post_process,
    compare_with_gt,
    call_claude,
)

# ─── SC Page Fetching ─────────────────────────────────────────────

SC_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
}
SC_DELAY = 1.5


def slug_variants(name):
    """Generate possible SC URL slugs from game name."""
    clean = name.replace("\u2019", "").replace("'", "").replace("\u2122", "").replace("\u00ae", "")
    clean = clean.replace(":", " ")

    bases = [clean]
    roman_map = {'II': '2', 'III': '3', 'IV': '4'}
    for r, a in roman_map.items():
        if f' {r}' in clean:
            bases.append(clean.replace(f' {r}', f' {a}'))

    slugs = []
    for base in bases:
        slug = re.sub(r'[^a-zA-Z0-9\s-]', '', base).strip()
        slug = re.sub(r'\s+', '-', slug)
        slugs.append(slug)
        slugs.append(slug.lower())

    return list(dict.fromkeys(slugs))


def fetch_sc_page(name, provider=None, cache=True):
    """Fetch a SC page. Always saves HTML to sc_cache/ for later reuse."""
    import urllib.request

    SC_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    slugs = slug_variants(name)
    if provider and provider != 'unknown':
        p_slug = re.sub(r'[^a-zA-Z0-9-]', '', provider.replace(' ', '-').replace("'", ''))
        for base_slug in slugs[:2]:
            slugs.append(f"{base_slug}-{p_slug}")

    # Check cache first
    for slug in slugs[:6]:
        cache_path = SC_CACHE_DIR / f"{slug}.html"
        if cache and cache_path.exists():
            html = cache_path.read_text(encoding='utf-8', errors='replace')
            if 'Provider:' in html or 'Features:' in html:
                return html, slug, str(cache_path)

    # Fetch from web
    for slug in slugs[:4]:
        try:
            url = f"https://www.slotcatalog.com/en/slots/{slug}"
            req = urllib.request.Request(url, headers=SC_HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                html = resp.read().decode('utf-8', errors='replace')

            if '404' in html[:500] and 'Page not found' in html[:1000]:
                continue
            if 'Provider:' not in html and 'Features:' not in html:
                continue

            # Always save to cache for later reuse (art extraction, etc.)
            cache_path = SC_CACHE_DIR / f"{slug}.html"
            cache_path.write_text(html, encoding='utf-8')

            return html, slug, url

        except Exception:
            continue

    return None, None, None


# ─── Review Text Extraction (Deterministic) ───────────────────────

def extract_review_text(html):
    """Extract human-written review prose from SC HTML.

    INCLUDE: Review paragraphs, feature descriptions, pros/cons, review summary.
    EXCLUDE: Attributes table, "If you appreciate..." recommendations,
             image captions, YouTube embeds, author bio, navigation, demo version.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, 'html.parser')

    for tag in soup.find_all(['script', 'style', 'nav', 'header', 'footer',
                               'meta', 'link', 'noscript', 'iframe', 'svg',
                               'button', 'input', 'form', 'select']):
        tag.decompose()

    review_h2 = soup.find('h2', string=re.compile(r'Review', re.IGNORECASE))
    if not review_h2:
        return None, False

    lines = []
    in_exclude = False
    current = review_h2.find_next_sibling()

    while current:
        tag_name = current.name if current.name else None

        # Stop at next H2 (different section)
        if tag_name == 'h2':
            break

        classes = current.get('class', []) if hasattr(current, 'get') else []
        class_str = ' '.join(classes) if isinstance(classes, list) else str(classes)

        if tag_name == 'h3':
            text = current.get_text(strip=True)
            if text:
                # Exclude recommendation and demo sections
                if re.search(r'if you appreciate|also try|similar slots|related slots',
                             text, re.IGNORECASE):
                    in_exclude = True
                elif re.search(r'demo version|demo play', text, re.IGNORECASE):
                    in_exclude = True
                else:
                    in_exclude = False
                    lines.append(f"\n[SECTION] {text}")

        elif in_exclude:
            pass

        # Skip non-content divs
        elif 'imgText' in class_str or 'youtubeContent' in class_str:
            pass

        elif 'authorBlock' in class_str or 'authorDesc' in class_str:
            pass

        # Pros/cons block — useful summary info
        elif 'pros-cons' in class_str:
            text = current.get_text(separator=' | ', strip=True)
            if text:
                lines.append(f"\n[PROS/CONS] {text}")

        elif tag_name in ('p', 'div'):
            text = current.get_text(strip=True)
            if text and len(text) > 20:
                if not re.search(r'Author\s*(?:&|and)\s*Content\s*Writer', text):
                    lines.append(text)

        elif tag_name in ('ul', 'ol'):
            items = current.find_all('li')
            for item in items:
                text = item.get_text(strip=True)
                if text and len(text) > 10:
                    lines.append(f"  - {text}")

        current = current.find_next_sibling()

    if not lines:
        return None, False

    review_text = '\n'.join(lines).strip()

    has_author = bool(soup.find('a', href=re.compile(r'/en/team/')))
    is_human = has_author or len(review_text) > 1200

    return review_text, is_human


def extract_sc_specs(html):
    """Extract specs from SC attributes table (NOT from review).
    Only used after validation proves accuracy >= 100%.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, 'html.parser')
    specs = {}

    attrs_rows = []
    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all(['th', 'td'])
            if len(cells) == 2:
                key = cells[0].get_text(strip=True).lower().rstrip(':').strip()
                val = cells[1].get_text(strip=True)
                attrs_rows.append((key, val))

    for key, val in attrs_rows:
        if 'rtp' in key:
            m = re.search(r'(\d+\.?\d*)\s*%', val)
            if m:
                specs['rtp'] = float(m.group(1))

        elif key in ('variance', 'volatility'):
            vol_map = [
                ('very high', 'Very High'),
                ('low-med', 'Low-Medium'), ('low-medium', 'Low-Medium'),
                ('med-high', 'Medium-High'), ('medium-high', 'Medium-High'),
                ('medium', 'Medium'), ('med', 'Medium'),
                ('high', 'High'),
                ('low', 'Low'),
                ('adjusted', None),
            ]
            v_lower = val.lower().strip()
            for pattern, normalized in vol_map:
                if pattern in v_lower:
                    specs['volatility'] = normalized
                    break

        elif 'max win' in key:
            m = re.search(r'x?([\d,]+\.?\d*)', val)
            if m:
                specs['max_win'] = f"{m.group(1).replace(',', '')}x"

        elif key == 'layout':
            m = re.match(r'(\d+)\s*x\s*(\d+)', val)
            if m:
                specs['reels'] = int(m.group(1))
                specs['rows'] = int(m.group(2))
                specs['grid_config'] = f"{m.group(1)}x{m.group(2)}"

        elif 'betways' in key or 'paylines' in key:
            specs['paylines'] = val

        elif 'min bet' in key:
            m = re.search(r'[\d.]+', val)
            if m:
                specs['min_bet'] = float(m.group())

        elif 'max bet' in key:
            m = re.search(r'[\d.]+', val)
            if m:
                specs['max_bet'] = float(m.group())

    return specs


# ─── Claude Prompt for SC Reviews ─────────────────────────────────

def build_sc_system_prompt():
    """System prompt adapted for editorial review text (not HTML rules pages)."""
    return f"""You are a slot game feature extraction expert. You analyze EDITORIAL REVIEW TEXT from SlotCatalog.com and extract structured game profile data.

IMPORTANT: The input is a human-written review (editorial prose), NOT an HTML rules page. The reviewer describes the game's features, mechanics, and experience in natural language. You must identify the ACTUAL GAME FEATURES from the review prose.

## FEATURE CLASSIFICATION RULES
You MUST only use features from the following taxonomy. Each classification rule tells you what IS and what is NOT that feature.

{FEATURE_DEFINITION_CARDS}

## CRITICAL CLASSIFICATION RULES
1. GATEWAY vs PICK BONUS: If a review mentions choosing between bonus modes (like "Free Spins or Hold and Spin"), that is a GATEWAY/SELECTOR — NOT a Pick Bonus.
2. Hold and Spin does NOT automatically imply Static Jackpot: Only classify Static Jackpot if the review explicitly mentions named prize tiers (Mini/Minor/Major/Grand).
3. Each feature should be a MAIN game feature, not a sub-mechanic of another feature.
4. HOLD AND SPIN BOUNDARY: When a game has Hold and Spin, the following are PART OF that H&S feature:
   - Coin/prize symbols that lock during H&S = NOT Cash On Reels
   - Respins within H&S = NOT Respin
   - "All positions filled" grand prize = part of H&S
5. EVIDENCE FROM REVIEW: Only classify features the reviewer ACTUALLY DESCRIBES or NAMES. The reviewer may mention features briefly; still classify them if the mechanic is clearly described.
6. IGNORE comparison games: The reviewer may mention other games for comparison (e.g., "similar to Bonanza"). Only extract features for the GAME BEING REVIEWED, not comparison games.
7. Provider-specific naming: Different providers call features by different names. Look for the MECHANIC, not the marketing name.
8. MULTIPLIER vs MULTIPLIER WILD: Default to "Multiplier" unless wilds carry VARIABLE per-symbol multiplier values.
9. INNER FEATURE RULE: Mechanics that only occur WITHIN a bonus (e.g., wilds that lock during Free Spins) are characteristics of the parent feature, not standalone features. EXCEPTION: Multiplier is always standalone.
10. Confidence scoring: Only assign confidence 4 or 5 to features you are CERTAIN about. Use 3 for borderline.
11. CASCADING REELS requires explicit mechanic: Only if reviewer describes winning symbols removed and new ones falling in.
12. STATIC JACKPOT without H&S: Named jackpot tiers (Mini/Minor/Major/Grand) mentioned anywhere = Static Jackpot.
13. PERSISTENCE requires BASE GAME carry-over: Collect symbols that trigger immediate bonuses are NOT Persistence.
14. MULTIPLIER from reviews — BE CONSERVATIVE: Only classify Multiplier if the review describes a DEDICATED multiplier mechanic (progressive multiplier in free spins, random multiplier applied to wins, multiplier feature with its own name). Do NOT add Multiplier just because the word "multiplier" appears casually or the reviewer mentions a "2x" payout. If unsure, do NOT add Multiplier.
15. STICKY WILDS from reviews: Only classify if the reviewer explicitly calls them "sticky wilds" or describes wilds that persist in the BASE GAME. Wilds that lock during bonus rounds are NOT Sticky Wilds.
16. EXPANDING WILDS vs WILD REELS: If the review mentions wilds that "cover" or "fill" an entire reel, that is WILD REELS, not Expanding Wilds. Expanding Wilds is specifically a single symbol that expands. If unsure which wild type, use the more conservative classification.
17. REVIEW LIMITATIONS: Editorial reviews do NOT describe every game feature. Only extract features the reviewer ACTUALLY describes or names. Do NOT infer features that "should" exist. If a feature is not mentioned, do NOT add it.
18. BUY BONUS from reviews: Only classify if the reviewer explicitly describes paying a fixed cost to trigger a bonus. Do NOT add Buy Bonus from generic mentions like "bonus purchase option".

## THEME TAXONOMY
{THEME_TAXONOMY}

## OUTPUT FORMAT
Return a JSON object with this exact structure:
{{
  "features": [
    {{
      "name": "<canonical feature name from taxonomy>",
      "operator_name": "<what the reviewer calls this feature>",
      "context": "<quote or paraphrase from the review where this was identified>",
      "description": "<1-2 sentence description of how this feature works>",
      "confidence": <1-5, where 5 = certain>
    }}
  ],
  "theme_primary": "<single most dominant theme>",
  "themes_all": ["<theme1>", "<theme2>", ...],
  "specs": {{
    "rtp": <number or null>,
    "volatility": "<Low|Medium-Low|Medium|Medium-High|High|Very High or null>",
    "max_win": "<string like '5000x' or null>",
    "reels": <number or null>,
    "rows": <number or null>,
    "paylines": "<number or string like '243 ways' or null>",
    "grid_config": "<string like '5x3' or null>",
    "win_evaluation": "<'lines' or 'ways' or 'cluster' or null>",
    "description": "<2-3 sentence game description>"
  }}
}}

Return ONLY valid JSON. No markdown, no commentary outside the JSON."""


def build_sc_user_prompt(game_name, review_text, examples=None, provider=None):
    """Build user prompt for SC review extraction."""
    parts = []

    if examples:
        parts.append("Here are examples of correct extractions from SC reviews:\n")
        for ex in examples:
            parts.append(f"─── EXAMPLE: {ex['name']} ───")
            review = ex.get('review_text', '')
            parts.append(f"REVIEW TEXT:\n{review[:2500]}")
            expected_compact = json.dumps(ex['expected'], separators=(',', ':'))
            parts.append(f"\nCORRECT EXTRACTION:\n{expected_compact}")
            parts.append("")

    parts.append(f"─── NOW EXTRACT FOR: {game_name} ───")
    if provider:
        parts.append(f"Provider/Studio: {provider}")
    parts.append(f"REVIEW TEXT:\n{review_text}")
    parts.append(f"\nExtract the complete game profile for {game_name}. Return ONLY the JSON.")

    return "\n".join(parts)


# ─── SC-specific post-processing ──────────────────────────────────

def post_process_sc(extraction, game_name="", review_text=""):
    """SC-specific post-processing wrapping the main post_process."""
    # Remove any Multiplier added by Claude before passing to post_process,
    # so the HTML-based multiplier detection in post_process doesn't stack
    if extraction and 'features' in extraction:
        multiplier_from_claude = [f for f in extraction['features']
                                  if f.get('name', '').lower() == 'multiplier']
        # Keep Multiplier only if Claude gave it confidence >= 5
        extraction['features'] = [
            f for f in extraction['features']
            if f.get('name', '').lower() != 'multiplier' or f.get('confidence', 0) >= 5
        ]

    extraction = post_process(extraction, game_name, review_text)

    if not extraction or 'features' not in extraction:
        return extraction

    # SC reviews mention comparison games — aggressive low-confidence filter
    extraction['features'] = [
        f for f in extraction['features']
        if f.get('confidence', 5) >= 4
    ]

    # Remove Sticky Wilds if context mentions "bonus" or "free spins" only
    extraction['features'] = [
        f for f in extraction['features']
        if not (f['name'] == 'Sticky Wilds' and
                any(kw in (f.get('context', '') + f.get('description', '')).lower()
                    for kw in ['bonus', 'free spin', 'free game']))
    ]

    # Remove post-process-added Multiplier for SC (too many false positives from review text)
    extraction['features'] = [
        f for f in extraction['features']
        if not (f['name'] == 'Multiplier' and
                f.get('context', '').startswith('Post-processing'))
    ]

    return extraction


# ─── Full Extraction Pipeline ─────────────────────────────────────

def extract_from_sc(game_name, provider=None, examples=None, use_cache=True):
    """Full pipeline: fetch SC page -> extract review -> Claude -> post-process."""
    html, slug, source = fetch_sc_page(game_name, provider, cache=use_cache)
    if not html:
        return None, {"status": "sc_page_not_found"}

    review_text, is_human = extract_review_text(html)
    if not review_text:
        return None, {"status": "no_review_text", "slug": slug}

    sc_specs = extract_sc_specs(html)

    system_prompt = build_sc_system_prompt()
    user_prompt = build_sc_user_prompt(game_name, review_text, examples, provider)

    extraction, usage = call_claude(system_prompt, user_prompt)
    if not extraction:
        return None, {"status": "claude_error", "slug": slug}

    extraction = post_process_sc(extraction, game_name, review_text)

    extraction['_meta'] = {
        'source': 'slotcatalog_review',
        'slug': slug,
        'is_human_review': is_human,
        'review_chars': len(review_text),
        'sc_specs': sc_specs,
        'usage': {
            'input_tokens': usage.input_tokens if usage else 0,
            'output_tokens': usage.output_tokens if usage else 0,
        }
    }

    return extraction, {"status": "ok", "slug": slug, "is_human": is_human}


# ─── Validation Functions ─────────────────────────────────────────

def load_gt():
    with open(GT_PATH) as f:
        return json.load(f)


def get_overlap_games():
    """Get GT games that have SC pages with review text."""
    if OVERLAP_PATH.exists():
        with open(OVERLAP_PATH) as f:
            overlap = json.load(f)
        return [g for g in overlap if g.get('found') and g.get('review_chars', 0) > 400]
    return []


def split_train_test(overlap_games, train_ratio=0.5):
    """Split overlap games into training (few-shot) and test (validation) sets.

    Only HUMAN review games (>1200 chars or has_author) are used.
    Alternates assignment: odd-indexed → train, even-indexed → test,
    ensuring both sets get a mix of rich and sparse human reviews.
    """
    human_games = [g for g in overlap_games
                   if g.get('review_chars', 0) > 1200 or g.get('has_author', False)]
    human_games.sort(key=lambda g: (-g.get('n_features', 0), -g.get('review_chars', 0)))

    train_names = set()
    test_names = set()
    for i, g in enumerate(human_games):
        if i % 2 == 0:
            train_names.add(g['name'])
        else:
            test_names.add(g['name'])

    if len(train_names) < 5:
        print(f"WARNING: only {len(train_names)} training games. May need more overlap.")

    return train_names, test_names


def build_sc_training_examples(train_names, gt):
    """Build few-shot examples from GT games with SC reviews."""
    examples = []
    for name in sorted(train_names):
        if name not in gt:
            continue

        provider = gt[name].get('provider', 'unknown')
        html, slug, _ = fetch_sc_page(name, provider)
        if not html:
            continue

        review_text, is_human = extract_review_text(html)
        if not review_text or len(review_text) < 300:
            continue

        gt_data = gt[name]
        features_list = [{"name": f, "confidence": 5} for f in gt_data.get('features', [])]
        themes = gt_data.get('themes', [])

        examples.append({
            'name': name,
            'review_text': review_text,
            'expected': {
                'features': features_list,
                'theme_primary': themes[0] if themes else None,
                'themes_all': themes,
            }
        })

    return examples


def validate_features(test_names, gt, examples, verbose=True):
    """Run feature extraction on test set, compute F1."""
    results = []
    total_tp = total_fp = total_fn = 0
    theme_f1_sum = 0
    theme_count = 0

    for name in sorted(test_names):
        if name not in gt:
            continue

        gt_data = gt[name]
        gt_features = gt_data.get('features', [])
        gt_themes = gt_data.get('themes', [])
        provider = gt_data.get('provider', 'unknown')

        if verbose:
            print(f"\n{'='*60}")
            print(f"GAME: {name} (provider: {provider})")
            print(f"GT features: {gt_features}")

        extraction, meta = extract_from_sc(name, provider, examples)
        if not extraction:
            if verbose:
                print(f"  SKIP: {meta.get('status', 'unknown')}")
            continue

        comparison = compare_with_gt(extraction, gt_features, gt_themes)

        if verbose:
            extracted_features = [f['name'] for f in extraction.get('features', [])]
            print(f"Extracted: {extracted_features}")
            print(f"  F1={comparison['f1']:.3f}  P={comparison['precision']:.3f}  R={comparison['recall']:.3f}")
            print(f"  TP: {comparison['tp']}")
            if comparison['fp']:
                print(f"  FP: {comparison['fp']}")
            if comparison['fn']:
                print(f"  FN: {comparison['fn']}")
            if 'theme_f1' in comparison:
                print(f"  Theme F1={comparison['theme_f1']:.3f}  TP={comparison.get('theme_tp',[])}  FP={comparison.get('theme_fp',[])}  FN={comparison.get('theme_fn',[])}")

        total_tp += len(comparison['tp'])
        total_fp += len(comparison['fp'])
        total_fn += len(comparison['fn'])

        if 'theme_f1' in comparison:
            theme_f1_sum += comparison['theme_f1']
            theme_count += 1

        results.append({
            'name': name,
            'provider': provider,
            'comparison': comparison,
            'review_chars': extraction.get('_meta', {}).get('review_chars', 0),
            'is_human': extraction.get('_meta', {}).get('is_human_review', False),
        })

        time.sleep(0.5)

    if not results:
        print("\nNo games extracted successfully.")
        return results

    micro_p = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    micro_r = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0
    micro_f1 = 2 * micro_p * micro_r / (micro_p + micro_r) if (micro_p + micro_r) > 0 else 0
    macro_f1 = sum(r['comparison']['f1'] for r in results) / len(results)
    macro_theme_f1 = theme_f1_sum / theme_count if theme_count else 0

    print(f"\n{'='*60}")
    print(f"FEATURE VALIDATION RESULTS ({len(results)} games)")
    print(f"  Micro F1:  {micro_f1:.3f} (P={micro_p:.3f}, R={micro_r:.3f})")
    print(f"  Macro F1:  {macro_f1:.3f}")
    print(f"  TP={total_tp}, FP={total_fp}, FN={total_fn}")
    print(f"  HARD GATE: {'PASS' if micro_f1 >= 0.95 else 'FAIL'} (need >= 0.95)")
    print(f"\nTHEME VALIDATION ({theme_count} games)")
    print(f"  Macro Theme F1: {macro_theme_f1:.3f}")
    print(f"  Target: {'PASS' if macro_theme_f1 >= 0.90 else 'FAIL'} (target >= 0.90)")

    return results


def validate_specs(overlap_games, gt, verbose=True):
    """Validate SC attributes table specs against GT.
    HARD GATE: 100% match on RTP, reels, rows.
    """
    results = []

    for game in overlap_games:
        name = game['name']
        if name not in gt:
            continue

        gt_data = gt[name]
        gt_specs = gt_data.get('specs', {})
        if not gt_specs:
            continue

        html, slug, _ = fetch_sc_page(name, game.get('provider', 'unknown'))
        if not html:
            continue

        sc_specs = extract_sc_specs(html)
        if not sc_specs:
            continue

        mismatches = {}
        matches = {}

        for field in ['rtp', 'reels', 'rows']:
            gt_val = gt_specs.get(field)
            sc_val = sc_specs.get(field)
            if gt_val is not None and sc_val is not None:
                if field == 'rtp':
                    match = abs(float(gt_val) - float(sc_val)) < 0.05
                else:
                    match = int(gt_val) == int(sc_val)

                if match:
                    matches[field] = (gt_val, sc_val)
                else:
                    mismatches[field] = (gt_val, sc_val)

        result = {
            'name': name, 'matches': matches, 'mismatches': mismatches,
            'sc_specs': sc_specs,
            'gt_specs': {k: gt_specs.get(k) for k in ['rtp', 'reels', 'rows', 'volatility']}
        }
        results.append(result)

        if verbose:
            status = "PASS" if not mismatches else "FAIL"
            print(f"  {status:5s} | {name:40s} | matches={list(matches.keys())} | mismatches={mismatches}")

    if results:
        total_checks = sum(len(r['matches']) + len(r['mismatches']) for r in results)
        total_matches = sum(len(r['matches']) for r in results)
        accuracy = total_matches / total_checks if total_checks > 0 else 0

        print(f"\nSPECS VALIDATION ({len(results)} games, {total_checks} checks)")
        print(f"  Accuracy: {accuracy:.1%} ({total_matches}/{total_checks})")
        print(f"  HARD GATE: {'PASS' if accuracy >= 1.0 else 'FAIL'} (need 100%)")

    return results


# ─── CLI ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='SC Review Extraction Pipeline')
    parser.add_argument('--test-extractor', action='store_true',
                        help='Test text extractor on cached pages')
    parser.add_argument('--validate-features', action='store_true',
                        help='Feature validation (HARD GATE >95%% F1)')
    parser.add_argument('--validate-themes', action='store_true',
                        help='Theme validation (target >90%% F1)')
    parser.add_argument('--validate-specs', action='store_true',
                        help='Validate SC specs vs GT (100%% match)')
    parser.add_argument('--validate-all', action='store_true',
                        help='Run all validations')
    parser.add_argument('--extract-game', type=str,
                        help='Extract a single game from SC')
    parser.add_argument('--limit', type=int, default=None,
                        help='Limit number of games to process')
    args = parser.parse_args()

    if args.test_extractor:
        print("=== Testing SC Review Text Extractor ===\n")
        overlap = get_overlap_games()

        for game in overlap[:args.limit or 5]:
            name = game['name']
            provider = game.get('provider', 'unknown')
            html, slug, source = fetch_sc_page(name, provider)
            if not html:
                print(f"  {name}: page not found")
                continue

            review_text, is_human = extract_review_text(html)
            print(f"\n{'='*60}")
            print(f"GAME: {name} (slug: {slug})")
            print(f"Human review: {is_human} | Source: {source}")
            print(f"Review text ({len(review_text) if review_text else 0} chars):")
            if review_text:
                print(review_text[:600])
                print("...")
            else:
                print("  [No review text extracted]")
            time.sleep(SC_DELAY)

    elif args.validate_features or args.validate_all:
        print("=== Feature Validation (HARD GATE >95% F1) ===\n")
        gt = load_gt()
        overlap = get_overlap_games()
        train_names, test_names = split_train_test(overlap)

        print(f"Overlap: {len(overlap)} games")
        print(f"Train: {len(train_names)} games: {sorted(train_names)}")
        print(f"Test:  {len(test_names)} games: {sorted(test_names)}\n")
        print("Building training examples...")

        examples = build_sc_training_examples(train_names, gt)
        print(f"Built {len(examples)} few-shot examples\n")

        if args.limit:
            test_names = set(list(sorted(test_names))[:args.limit])

        results = validate_features(test_names, gt, examples)

        output_path = DATA_DIR / "_legacy" / "sc_feature_validation.json"
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        print(f"\nResults saved to {output_path}")

    elif args.validate_specs:
        print("=== Specs Validation (HARD GATE 100% on RTP/reels/rows) ===\n")
        gt = load_gt()
        overlap = get_overlap_games()
        results = validate_specs(overlap[:args.limit] if args.limit else overlap, gt)

        output_path = DATA_DIR / "_legacy" / "sc_specs_validation.json"
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        print(f"\nResults saved to {output_path}")

    elif args.extract_game:
        name = args.extract_game
        print(f"Extracting from SC: {name}")
        extraction, meta = extract_from_sc(name)
        if extraction:
            print(json.dumps(extraction, indent=2))
        else:
            print(f"Failed: {meta}")

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
