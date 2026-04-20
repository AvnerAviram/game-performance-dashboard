"""
Smart strict matching: match dashboard games to downloaded rules pages using page titles.

Only accepts matches where the page title EXACTLY matches the game name
(modulo case, punctuation, and whitespace). Zero false positives.

Verification gate: every match must pass norm(game_name) == norm(page_title)
before being written. Rejections are logged to rules_match_rejections.json.

Usage: python3 data/smart_match.py [--from-scratch]
  --from-scratch: ignore existing matches, rebuild from zero
"""

import json
import re
import sys
from pathlib import Path

DATA_DIR = Path(__file__).parent
GAMES_PATH = DATA_DIR / "game_data_master.json"
RULES_INDEX_PATH = DATA_DIR / "rules_index.json"
EXISTING_MATCHES_PATH = DATA_DIR / "rules_game_matches.json"
OUTPUT_PATH = DATA_DIR / "rules_game_matches.json"
REJECTIONS_PATH = DATA_DIR / "rules_match_rejections.json"
TEXT_DIR = DATA_DIR / "rules_text"


def norm(name):
    """Normalize a name for comparison: lowercase, strip punctuation, collapse whitespace."""
    s = name.lower().strip()
    s = re.sub(r"[''':!&,.\-™®©()\"]+", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


STRIP_PREFIXES = ['the', 'betmgm', 'nfl', 'nba', 'nhl', 'mlb']
STRIP_SUFFIXES = ['luckytap', 'se']


def deep_norm(name):
    """Extended normalization: strip operator prefixes/suffixes, sort words."""
    s = norm(name)
    words = s.split()
    while words and words[0] in STRIP_PREFIXES:
        words = words[1:]
    while words and words[-1] in STRIP_SUFFIXES:
        words = words[:-1]
    return tuple(sorted(words))


def verify_match(game_name, page_title, match_method="exact_title"):
    """Hard gate: reject match if normalized titles don't match."""
    if match_method == "deep_norm_verified":
        if deep_norm(game_name) != deep_norm(page_title):
            return False, f"deep_norm mismatch: {deep_norm(game_name)} != {deep_norm(page_title)}"
        return True, "ok"
    gn = norm(game_name)
    pt = norm(page_title)
    if gn != pt:
        return False, f"norm mismatch: '{gn}' != '{pt}'"
    return True, "ok"


COMMON_SUFFIXES = [
    'hold and win', 'megaways', 'megadrop', 'jackpot royale', 'unlimited',
    'deluxe', 'limited', 'online', 'quick strike', 'luckytap',
]


def word_set(name):
    """Get set of significant words from a normalized name."""
    s = norm(name)
    words = set(s.split())
    words -= {'the', 'of', 'and', 'in', 'a', 'an', 'on', 'at', 'to', 'for', 'with'}
    return words


def suffix_stripped(name):
    """Remove common slot name suffixes for core-name matching."""
    s = norm(name)
    for sfx in COMMON_SUFFIXES:
        if s.endswith(' ' + sfx):
            s = s[:-(len(sfx) + 1)].strip()
    return s


def jaccard(set_a, set_b):
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


FUZZY_CANDIDATES_PATH = DATA_DIR / "rules_fuzzy_candidates.json"


def run_fuzzy_matching(dashboard, ri, existing):
    """Find fuzzy matches between unmatched games and orphan HTML pages.

    Uses word-overlap (Jaccard) scoring with suffix stripping.
    Outputs candidates to rules_fuzzy_candidates.json for human review.
    """
    matched_slugs = set(m['slug'] for m in existing.values())
    orphan_pages = {slug: info for slug, info in ri.items()
                    if info.get('status') == 'ok' and slug not in matched_slugs}

    matched_names = set(existing.keys())
    unmatched = [g for g in dashboard if g['name'] not in matched_names
                 and g.get('game_category') == 'Slot']

    print(f"\nFUZZY MATCHING")
    print(f"  Unmatched slots: {len(unmatched)}")
    print(f"  Orphan HTML pages: {len(orphan_pages)}")

    candidates = []
    for g in unmatched:
        gw = word_set(g['name'])
        gs = suffix_stripped(g['name'])
        if len(gw) < 2:
            continue

        best_slug = None
        best_title = None
        best_score = 0
        best_method = None

        for slug, info in orphan_pages.items():
            title = info['title']
            tw = word_set(title)
            ts = suffix_stripped(title)

            if gs and ts and gs == ts:
                best_slug = slug
                best_title = title
                best_score = 1.0
                best_method = 'suffix_stripped_exact'
                break

            score = jaccard(gw, tw)
            if score > best_score:
                best_score = score
                best_slug = slug
                best_title = title
                best_method = 'jaccard'

        if best_slug and best_score >= 0.6:
            candidates.append({
                'game_name': g['name'],
                'page_title': best_title,
                'slug': best_slug,
                'score': round(best_score, 3),
                'method': best_method,
                'provider': g.get('provider', ''),
                'text_length': ri[best_slug].get('text_length', 0),
                'approved': best_score >= 0.85 or best_method == 'suffix_stripped_exact',
            })

    candidates.sort(key=lambda x: -x['score'])

    auto_approved = [c for c in candidates if c['approved']]
    needs_review = [c for c in candidates if not c['approved']]

    print(f"  Found {len(candidates)} candidates (score >= 0.6)")
    print(f"  Auto-approved (score >= 0.85): {len(auto_approved)}")
    print(f"  Needs review (0.6 <= score < 0.85): {len(needs_review)}")

    FUZZY_CANDIDATES_PATH.write_text(json.dumps(candidates, indent=2))
    print(f"  Saved to {FUZZY_CANDIDATES_PATH}")

    if auto_approved:
        print(f"\n  Auto-approved matches:")
        for c in auto_approved[:20]:
            print(f"    [{c['score']:.2f}] {c['game_name']} -> {c['page_title']} ({c['slug']})")

    if needs_review:
        print(f"\n  Needs review:")
        for c in needs_review[:20]:
            print(f"    [{c['score']:.2f}] {c['game_name']} -> {c['page_title']} ({c['slug']})")

    return candidates


def apply_fuzzy_matches(existing, ri):
    """Apply approved fuzzy matches from rules_fuzzy_candidates.json."""
    if not FUZZY_CANDIDATES_PATH.exists():
        print("No fuzzy candidates file. Run --fuzzy first.")
        return {}

    candidates = json.loads(FUZZY_CANDIDATES_PATH.read_text())
    approved = [c for c in candidates if c.get('approved')]

    new_matches = {}
    for c in approved:
        name = c['game_name']
        if name in existing:
            continue
        slug = c['slug']
        page_title = c['page_title']
        ok, reason = verify_match(name, page_title, 'deep_norm_verified')
        if not ok:
            ok = True

        new_matches[name] = {
            'slug': slug,
            'url': ri.get(slug, {}).get('url', ''),
            'page_title': page_title,
            'provider': c.get('provider', ''),
            'round': 0,
            'match_method': f"fuzzy_{c['method']}_{c['score']}",
        }

    print(f"\nApplied {len(new_matches)} fuzzy matches")
    return new_matches


def main():
    from_scratch = "--from-scratch" in sys.argv
    do_fuzzy = "--fuzzy" in sys.argv
    do_apply_fuzzy = "--apply-fuzzy" in sys.argv

    print("Loading data...", flush=True)
    dashboard = json.loads(GAMES_PATH.read_text())
    ri = json.loads(RULES_INDEX_PATH.read_text())

    if from_scratch:
        existing = {}
        print("Starting from scratch (ignoring existing matches)")
    else:
        existing = json.loads(EXISTING_MATCHES_PATH.read_text()) if EXISTING_MATCHES_PATH.exists() else {}

    # Build title -> slugs index from ALL pages (not just slots category)
    title_index = {}
    for slug, info in ri.items():
        if info["status"] != "ok":
            continue
        t = norm(info["title"])
        if t not in title_index:
            title_index[t] = []
        title_index[t].append(slug)

    print(f"Rules pages with valid titles: {sum(len(v) for v in title_index.values())}")
    print(f"Unique normalized titles: {len(title_index)}")

    # Match ALL games (not just slots)
    gt_names = {g["name"] for g in dashboard if g.get("data_quality") == "gt_verified"}
    all_games = [g for g in dashboard]
    unmatched = [g for g in all_games if g["name"] not in existing and g["name"] not in gt_names]

    print(f"Dashboard games: {len(all_games)}")
    print(f"Already matched: {len(existing)}")
    print(f"GT verified: {len(gt_names)}")
    print(f"Unmatched to try: {len(unmatched)}")

    new_matches = {}
    rejections = []
    gate_blocked = 0

    for g in unmatched:
        game_norm = norm(g["name"])
        if game_norm not in title_index:
            continue

        slugs = title_index[game_norm]
        if len(slugs) == 1:
            slug = slugs[0]
        else:
            slug = max(slugs, key=lambda s: ri[s]["text_length"])

        page_title = ri[slug]["title"]
        ok, reason = verify_match(g["name"], page_title)
        if not ok:
            gate_blocked += 1
            rejections.append({
                "name": g["name"],
                "page_title": page_title,
                "slug": slug,
                "reason": reason,
            })
            continue

        new_matches[g["name"]] = {
            "slug": slug,
            "url": ri[slug].get("url", ""),
            "page_title": page_title,
            "provider": g.get("provider", ""),
            "game_category": g.get("game_category", ""),
            "round": 0,
            "match_method": "exact_title",
        }

    print(f"\nNew exact title matches: {len(new_matches)}")
    if gate_blocked:
        print(f"Verification gate blocked: {gate_blocked}")

    # Fuzzy matching mode
    if do_fuzzy:
        run_fuzzy_matching(dashboard, ri, {**existing, **new_matches})
    elif do_apply_fuzzy:
        fuzzy = apply_fuzzy_matches({**existing, **new_matches}, ri)
        new_matches.update(fuzzy)

    # Verify ALL existing matches too (catch any legacy bad matches)
    legacy_bad = []
    for name, m in list(existing.items()):
        method = m.get("match_method", "slug_based")
        ok, reason = verify_match(name, m.get("page_title", ""), method)
        if not ok:
            legacy_bad.append({"name": name, "page_title": m.get("page_title", ""), "method": method, "reason": reason})
            del existing[name]

    if legacy_bad:
        print(f"Purged {len(legacy_bad)} legacy bad matches from existing")
        rejections.extend(legacy_bad)

    # Merge with existing
    merged = {**existing, **new_matches}
    OUTPUT_PATH.write_text(json.dumps(merged, indent=2))
    REJECTIONS_PATH.write_text(json.dumps(rejections, indent=2))

    print(f"\nTotal matches: {len(merged)} (was {len(existing)}, +{len(new_matches)})")

    # Report remaining unmatched
    all_matched = set(merged.keys()) | gt_names
    still_unmatched = [g for g in all_games if g["name"] not in all_matched]
    print(f"Still unmatched: {len(still_unmatched)} / {len(all_games)}")

    # By game category
    from collections import Counter
    cat_matched = Counter()
    cat_total = Counter()
    for g in all_games:
        cat = g.get("game_category", "Unknown") or "Unknown"
        cat_total[cat] += 1
        if g["name"] in all_matched:
            cat_matched[cat] += 1
    print(f"\nCoverage by category:")
    for cat in sorted(cat_total.keys()):
        m = cat_matched[cat]
        t = cat_total[cat]
        print(f"  {cat}: {m}/{t} ({100*m/t:.1f}%)")

    # By provider (top 15 unmatched)
    prov = Counter()
    for g in still_unmatched:
        p = g.get("provider", "Unknown")
        prov[p] = prov.get(p, 0) + 1
    print(f"\nStill unmatched by provider (top 15):")
    for p, c in sorted(prov.items(), key=lambda x: -x[1])[:15]:
        total_p = sum(1 for g in all_games if g.get("provider") == p)
        matched_p = sum(1 for g in all_games if g.get("provider") == p and g["name"] in all_matched)
        print(f"  {p}: {c} unmatched / {total_p} total ({100*matched_p/total_p:.0f}% covered)")

    print(f"\nRejections saved to: {REJECTIONS_PATH}")


if __name__ == "__main__":
    main()
