#!/usr/bin/env python3
"""
Input Source Experiment — GT-Only

Tests whether adding rules HTML text and/or game descriptions to the Claude prompt
improves classification accuracy beyond the baseline (SC review + screenshot).

Configs:
  A_baseline  SC review + screenshot + symbols + corrections (current pipeline)
  B_rules     Config A + extracted text from rules HTML
  C_desc      Config A + game description from master
  D_full      Config A + rules HTML text + game description

Scores all results against ground truth games that have all data sources.
"""

import json
import os
import re
import sys
import time
from datetime import datetime

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from classify_art_v2 import (
    SCRIPT_DIR, PIPELINE_DIR, MASTER_PATH, MODEL,
    load_api_key, load_ground_truth, load_corrections, load_game_symbols,
    load_game_descriptions, find_description_for_game, find_symbols_for_game,
    build_training_examples, build_system_prompt, build_user_message,
    extract_review, load_screenshot, create_masked_screenshot, post_process,
)

RULES_HTML_DIR = os.path.join(SCRIPT_DIR, 'rules_html')
RULES_MATCHES_PATH = os.path.join(SCRIPT_DIR, 'rules_game_matches.json')
RESULTS_OUT = os.path.join(PIPELINE_DIR, 'input_experiment_results.json')

ELIGIBLE_GAMES = [
    '88-Fortunes.html',
    'Ancient-Disco.html',
    'Basketball-Star.html',
    'Blazing-Bison-Gold-Blitz.html',
    'Cleopatra.html',
    'Faith.html',
    'He-He-Yang.html',
    'Mayan-Gold.html',
    'Reactoonz.html',
    'Starburst.html',
    'Stinkin-Rich.html',
    'Way-Out-Wilds.html',
]

CONFIGS = ['A_baseline', 'B_rules', 'C_desc', 'D_full']
DIMS = ['art_theme', 'art_characters', 'art_elements', 'art_color_tone']


def load_rules_text(sc_filename):
    """Extract clean text from rules HTML file for a game."""
    if not os.path.exists(RULES_MATCHES_PATH):
        return ''
    with open(RULES_MATCHES_PATH) as f:
        matches = json.load(f)

    slug = sc_filename.replace('.html', '').lower()
    name_preview = slug.replace('-', ' ')

    rules_slug = None
    for key, val in matches.items():
        if key.lower().replace(' ', '-') == slug or key.lower() == name_preview:
            rules_slug = val.get('slug', '')
            break

    if not rules_slug:
        return ''

    rules_path = os.path.join(RULES_HTML_DIR, rules_slug + '.html')
    if not os.path.exists(rules_path):
        return ''

    with open(rules_path) as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    for tag in soup(['script', 'style', 'nav', 'header', 'footer']):
        tag.decompose()
    text = soup.get_text(separator=' ', strip=True)
    return text[:1500]


def classify_single(client, system_prompt, fname, symbol_index, corrections_db,
                    desc_index, rules_text="", description_text=""):
    """Classify a single game with given extra inputs. Returns (result_dict, fixes_list)."""
    name, review = extract_review(fname)
    if not review or len(review) < 50:
        return None, ['no review']

    screenshot_b64, media_type = load_screenshot(fname)
    masked_b64 = None
    if screenshot_b64:
        masked_b64 = create_masked_screenshot(fname)

    name_preview = fname.replace('.html', '').replace('-', ' ')
    sym_names = find_symbols_for_game(symbol_index, name_preview)
    game_corrections = corrections_db.get(fname)
    game_desc = find_description_for_game(desc_index, name_preview)

    user_content = build_user_message(
        name, review, screenshot_b64, media_type,
        sym_names, game_corrections, masked_b64,
        rules_text=rules_text, description_text=description_text,
    )

    max_retries = 3
    for attempt in range(max_retries):
        resp = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = resp.content[0].text.strip()
        raw = re.sub(r'^```\w*\n?', '', raw)
        raw = re.sub(r'\n?```$', '', raw)

        # Try direct parse first, then extract JSON object from response
        try:
            result = json.loads(raw)
            break
        except json.JSONDecodeError:
            json_match = re.search(r'\{[\s\S]*\}', raw)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                    break
                except json.JSONDecodeError:
                    pass
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise

    result, fixes = post_process(result, name, sym_names, game_corrections, game_desc)
    result['_has_screenshot'] = screenshot_b64 is not None
    return result, fixes


def score_result(gt_game, result):
    """Score a single result against GT. Returns dict of dim→bool."""
    scores = {}
    for d in DIMS:
        gt_val = gt_game.get(d)
        r_val = result.get(d)
        if d in ('art_color_tone', 'art_characters', 'art_elements'):
            gt_set = set(gt_val) if isinstance(gt_val, list) else {gt_val}
            r_set = set(r_val) if isinstance(r_val, list) else {r_val}
            gt_set.discard(None)
            r_set.discard(None)
            scores[d] = gt_set <= r_set
        else:
            scores[d] = gt_val == r_val
    return scores


def print_summary(all_scores, per_game_deltas):
    """Print comparison table to stdout."""
    print(f"\n{'=' * 70}")
    print(f"INPUT SOURCE EXPERIMENT — RESULTS")
    print(f"{'=' * 70}")
    print(f"\n{'Config':<15s}", end='')
    for d in DIMS:
        label = d.replace('art_', '').replace('_tone', '')
        print(f"  {label:>12s}", end='')
    print(f"  {'OVERALL':>10s}")
    print('-' * 75)

    for config in CONFIGS:
        scores = all_scores[config]
        total = sum(len(v) for v in scores.values())
        matched = sum(sum(1 for ok in v.values() if ok) for v in scores.values())
        print(f"  {config:<13s}", end='')
        for d in DIMS:
            dim_ok = sum(1 for g_scores in scores.values() if g_scores.get(d))
            dim_total = sum(1 for g_scores in scores.values() if d in g_scores)
            print(f"  {dim_ok}/{dim_total:>2d} {dim_ok/dim_total*100:5.1f}%", end='')
        print(f"  {matched}/{total} {matched/total*100:5.1f}%")

    if per_game_deltas:
        print(f"\n{'─' * 70}")
        print(f"PER-GAME DELTAS (where configs disagree):")
        print(f"{'─' * 70}")
        for delta in per_game_deltas:
            print(f"  {delta['game']:<35s} {delta['dim']:<16s}  "
                  f"A:{delta['A']:<5s} B:{delta['B']:<5s} C:{delta['C']:<5s} D:{delta['D']:<5s}  "
                  f"{delta.get('note', '')}")


def main():
    import anthropic

    api_key = load_api_key()
    client = anthropic.Anthropic(api_key=api_key)

    gt_games_list = load_ground_truth()
    gt_by_file = {}
    for g in gt_games_list:
        key = g.get('sc_file') or g.get('file', '')
        gt_by_file[key] = g

    training_ref = build_training_examples(gt_games_list)
    system_prompt = build_system_prompt(training_ref)
    symbol_index = load_game_symbols()
    corrections_db = load_corrections()
    desc_index = load_game_descriptions()

    games = [g for g in ELIGIBLE_GAMES if g in gt_by_file]
    total_calls = len(games) * len(CONFIGS)
    print(f"Experiment: {len(games)} games × {len(CONFIGS)} configs = {total_calls} API calls")
    print(f"Estimated cost: ~${total_calls * 0.0065:.2f}")
    print(f"Model: {MODEL}\n")

    all_results = {}
    all_scores = {}

    for config in CONFIGS:
        print(f"\n{'═' * 50}")
        print(f"CONFIG: {config}")
        print(f"{'═' * 50}")
        all_results[config] = {'games': {}}
        all_scores[config] = {}

        for i, fname in enumerate(games):
            print(f"  [{i+1}/{len(games)}] {fname}", end='', flush=True)

            rules_text = ""
            description_text = ""
            if config in ('B_rules', 'D_full'):
                rules_text = load_rules_text(fname)
            if config in ('C_desc', 'D_full'):
                name_preview = fname.replace('.html', '').replace('-', ' ')
                description_text = find_description_for_game(desc_index, name_preview)

            try:
                result, fixes = classify_single(
                    client, system_prompt, fname, symbol_index, corrections_db,
                    desc_index, rules_text=rules_text, description_text=description_text,
                )
                if result is None:
                    print(f" → SKIP ({fixes})")
                    continue

                print(f" → {result['art_theme']}", end='')
                if fixes:
                    print(f" [{len(fixes)} fixes]", end='')
                print(flush=True)

                all_results[config]['games'][fname] = {
                    'art_theme': result['art_theme'],
                    'art_theme_secondary': result.get('art_theme_secondary'),
                    'art_color_tone': result.get('art_color_tone', []),
                    'art_characters': result.get('art_characters', []),
                    'art_elements': result.get('art_elements', []),
                    '_has_screenshot': result.get('_has_screenshot', False),
                    '_rules_text_len': len(rules_text),
                    '_desc_text_len': len(description_text),
                }

                gt = gt_by_file.get(fname)
                if gt:
                    all_scores[config][fname] = score_result(gt, result)

            except Exception as e:
                print(f" → ERROR: {e}")

            time.sleep(0.5)

    per_game_deltas = []
    for fname in games:
        for d in DIMS:
            values = {}
            for config in CONFIGS:
                scores = all_scores.get(config, {}).get(fname, {})
                values[config] = 'match' if scores.get(d) else 'miss'

            if len(set(values.values())) > 1:
                note = ""
                if values.get('A_baseline') == 'miss' and any(v == 'match' for v in values.values()):
                    winners = [c for c, v in values.items() if v == 'match']
                    note = f"improved by {', '.join(winners)}"
                elif values.get('A_baseline') == 'match' and any(v == 'miss' for v in values.values()):
                    losers = [c for c, v in values.items() if v == 'miss']
                    note = f"REGRESSED in {', '.join(losers)}"

                per_game_deltas.append({
                    'game': fname,
                    'dim': d,
                    'A': values['A_baseline'],
                    'B': values['B_rules'],
                    'C': values['C_desc'],
                    'D': values['D_full'],
                    'note': note,
                })

    scoring_summary = {}
    for config in CONFIGS:
        scores = all_scores[config]
        dim_sums = {}
        for d in DIMS:
            dim_ok = sum(1 for g_scores in scores.values() if g_scores.get(d))
            dim_total = sum(1 for g_scores in scores.values() if d in g_scores)
            dim_sums[d] = f"{dim_ok}/{dim_total}"
        scoring_summary[config] = dim_sums

    output = {
        'run_date': datetime.now().strftime('%Y-%m-%d'),
        'model': MODEL,
        'games_count': len(games),
        'configs': all_results,
        'scoring': scoring_summary,
        'per_game_deltas': per_game_deltas,
    }

    with open(RESULTS_OUT, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nResults saved to {RESULTS_OUT}")

    print_summary(all_scores, per_game_deltas)


if __name__ == '__main__':
    main()
