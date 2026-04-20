#!/usr/bin/env python3
"""Scrape game descriptions for name-only games from web sources.

Sources (priority order):
1. SlotCatalog.com
2. VegasSlotsOnline.com
3. Provider websites
4. Google search fallback

Usage:
    python3 data/scrape_game_descriptions.py --test 5          # test on 5 games
    python3 data/scrape_game_descriptions.py --batch 50        # scrape 50 games
    python3 data/scrape_game_descriptions.py --all             # scrape all remaining
    python3 data/scrape_game_descriptions.py --apply           # apply to master
    python3 data/scrape_game_descriptions.py --stats           # show coverage stats
"""

import argparse
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent
MASTER_PATH = DATA_DIR / "game_data_master.json"
NAME_ONLY_PATH = DATA_DIR / "_name_only_games.json"
RESULTS_PATH = DATA_DIR / "_scraped_descriptions.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def clean_text(text):
    """Clean scraped text: remove HTML, normalize whitespace."""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    if len(text) > 500:
        text = text[:500]
    return text


def _slotcatalog_slugs(game_name):
    """Generate slug variants for SlotCatalog URLs."""
    base = re.sub(r'[^a-z0-9]+', '-', game_name.lower()).strip('-')
    slugs = [base]
    # Remove common suffixes
    for suffix in ['-hold-and-win', '-jackpot-royale', '-jackpot-royale-express',
                   '-megaways', '-collect-em', '-collect-em-and-link',
                   '-cash-stacks-gold', '-thundershots', '-limited']:
        if base.endswith(suffix):
            slugs.append(base[:-len(suffix)])
    # Also try capitalized form (SlotCatalog sometimes uses this)
    cap = '-'.join(w.capitalize() for w in game_name.split())
    cap = re.sub(r'[^A-Za-z0-9-]+', '-', cap).strip('-')
    slugs.append(cap)
    return list(dict.fromkeys(slugs))  # dedupe preserving order


def _extract_slotcatalog_desc(html, game_name, url, provider=None):
    """Extract description from SlotCatalog page HTML."""
    # Review section paragraphs
    review_patterns = [
        r'<div[^>]*class="[^"]*review[^"]*"[^>]*>(.*?)</div>',
        r'<div[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)</div>',
        r'<p[^>]*class="[^"]*game-?desc[^"]*"[^>]*>(.*?)</p>',
    ]
    for pat in review_patterns:
        match = re.search(pat, html, re.DOTALL | re.IGNORECASE)
        if match:
            desc = clean_text(match.group(1))
            if len(desc.split()) >= 15:
                return {"description": desc, "source_url": url, "source": "slotcatalog"}

    # Structured data: theme + features
    theme_match = re.search(r'Theme[s]?:\s*([^<]+)', html, re.IGNORECASE)
    features_match = re.search(r'Feature[s]?:\s*([^<]+)', html, re.IGNORECASE)
    reels_match = re.search(r'Reels?[^:]*:\s*(\d+)', html, re.IGNORECASE)
    rows_match = re.search(r'Rows?[^:]*:\s*(\d+)', html, re.IGNORECASE)

    if theme_match or features_match:
        parts = [f"{game_name} is a slot game"]
        if provider:
            parts.append(f"by {provider}")
        if theme_match:
            parts.append(f"with {theme_match.group(1).strip()} theme")
        if features_match:
            parts.append(f"featuring {features_match.group(1).strip()}")
        if reels_match and rows_match:
            parts.append(f"on a {reels_match.group(1)}x{rows_match.group(1)} grid")
        desc = " ".join(parts) + "."
        if len(desc.split()) >= 10:
            return {"description": desc, "source_url": url, "source": "slotcatalog"}

    # Fallback: meta description
    og_match = re.search(
        r'<meta\s+(?:property|name)=["\'](?:og:)?description["\']\s+content=["\']([^"\']{30,})["\']',
        html, re.IGNORECASE
    )
    if og_match:
        desc = clean_text(og_match.group(1))
        if len(desc.split()) >= 10 and 'slot' in desc.lower():
            return {"description": desc, "source_url": url, "source": "slotcatalog"}
    return None


def try_slotcatalog(game_name, provider=None):
    """Search SlotCatalog for game description, trying multiple slug variants."""
    for slug in _slotcatalog_slugs(game_name):
        url = f"https://slotcatalog.com/en/slots/{slug}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=10, allow_redirects=True)
            if resp.status_code != 200:
                continue
            result = _extract_slotcatalog_desc(resp.text, game_name, url, provider)
            if result:
                return result
        except Exception:
            continue
    return None


def try_vegasslots(game_name, provider=None):
    """Search VegasSlotsOnline for game description."""
    slug = re.sub(r'[^a-z0-9]+', '-', game_name.lower()).strip('-')
    urls_to_try = [
        f"https://www.vegasslotsonline.com/slots/{slug}/",
        f"https://www.vegasslotsonline.com/free-slots/{slug}/",
    ]

    for url in urls_to_try:
        try:
            resp = requests.get(url, headers=HEADERS, timeout=10, allow_redirects=True)
            if resp.status_code != 200:
                continue
            html = resp.text

            desc_match = re.search(
                r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']{30,})["\']',
                html, re.IGNORECASE
            )
            if desc_match:
                desc = clean_text(desc_match.group(1))
                if len(desc.split()) >= 10:
                    return {"description": desc, "source_url": url, "source": "vegasslotsonline"}

        except Exception:
            continue
    return None


def try_duckduckgo(game_name, provider=None):
    """Use DuckDuckGo HTML search to find game descriptions."""
    query = f'{game_name} slot game description'
    if provider and provider not in ('Unknown',):
        query += f' {provider}'

    try:
        resp = requests.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers=HEADERS,
            timeout=15,
        )
        if resp.status_code != 200:
            return None

        snippets = re.findall(
            r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
            resp.text, re.DOTALL
        )

        links = re.findall(
            r'<a[^>]+class="result__a"[^>]+href="([^"]+)"',
            resp.text
        )

        first_word = game_name.split()[0].lower()

        for i, snippet in enumerate(snippets[:5]):
            text = clean_text(snippet)
            if len(text.split()) < 12:
                continue

            source_url = "duckduckgo"
            if i < len(links):
                raw_url = links[i]
                url_match = re.search(r'uddg=([^&]+)', raw_url)
                if url_match:
                    source_url = urllib.parse.unquote(url_match.group(1))

            if first_word in text.lower() or game_name.lower().replace(' ', '') in text.lower().replace(' ', ''):
                return {"description": text, "source_url": source_url, "source": "duckduckgo"}

        for i, snippet in enumerate(snippets[:5]):
            text = clean_text(snippet)
            if len(text.split()) >= 15 and ('slot' in text.lower() or 'game' in text.lower() or 'reel' in text.lower()):
                source_url = "duckduckgo"
                if i < len(links):
                    raw_url = links[i]
                    url_match = re.search(r'uddg=([^&]+)', raw_url)
                    if url_match:
                        source_url = urllib.parse.unquote(url_match.group(1))
                return {"description": text, "source_url": source_url, "source": "duckduckgo"}

    except Exception:
        pass
    return None


def scrape_one_game(game_name, provider=None):
    """Try all sources in priority order. Returns result dict or None."""
    for try_fn in [try_slotcatalog, try_vegasslots, try_duckduckgo]:
        result = try_fn(game_name, provider)
        if result:
            return result
        time.sleep(1)
    return None


def load_results():
    """Load existing results, create if missing."""
    if RESULTS_PATH.exists():
        with open(RESULTS_PATH) as f:
            return json.load(f)
    return {}


def save_results(results):
    """Save results with atomic write."""
    tmp = RESULTS_PATH.with_suffix('.tmp')
    with open(tmp, 'w') as f:
        json.dump(results, f, indent=2)
    tmp.rename(RESULTS_PATH)


def main():
    parser = argparse.ArgumentParser(description="Scrape game descriptions for name-only games")
    parser.add_argument("--test", type=int, help="Test on N games")
    parser.add_argument("--batch", type=int, help="Scrape N games")
    parser.add_argument("--all", action="store_true", help="Scrape all remaining")
    parser.add_argument("--apply", action="store_true", help="Apply scraped descriptions to master")
    parser.add_argument("--stats", action="store_true", help="Show coverage stats")
    args = parser.parse_args()

    with open(NAME_ONLY_PATH) as f:
        name_only = json.load(f)

    results = load_results()

    if args.stats:
        found = sum(1 for r in results.values() if r.get('description'))
        not_found = sum(1 for r in results.values() if not r.get('description'))
        remaining = len(name_only) - len(results)
        print(f"=== Scraping Coverage ===")
        print(f"Total name-only games: {len(name_only)}")
        print(f"Attempted: {len(results)}")
        print(f"  Found: {found}")
        print(f"  Not found: {not_found}")
        print(f"Remaining: {remaining}")

        if found:
            from collections import Counter
            sources = Counter(r.get('source', '?') for r in results.values() if r.get('description'))
            print(f"\nSources:")
            for s, c in sources.most_common():
                print(f"  {s}: {c}")
        return

    if args.apply:
        with open(MASTER_PATH) as f:
            master = json.load(f)
        lookup = {g['name']: g for g in master}

        applied = 0
        for name, result in results.items():
            desc = result.get('description')
            if desc and name in lookup:
                game = lookup[name]
                if not game.get('description'):
                    game['description'] = desc
                    applied += 1

        with open(MASTER_PATH, 'w') as f:
            json.dump(master, f, indent=2)
        print(f"Applied {applied} scraped descriptions to master")
        return

    remaining = [g for g in name_only if g['name'] not in results]

    if args.test:
        targets = remaining[:args.test]
    elif args.batch:
        targets = remaining[:args.batch]
    elif args.all:
        targets = remaining
    else:
        parser.print_help()
        return

    print(f"Scraping {len(targets)} games ({len(remaining)} remaining total)")
    found = 0

    for i, game in enumerate(targets):
        name = game['name']
        provider = game.get('provider')

        result = scrape_one_game(name, provider)
        if result:
            results[name] = result
            found += 1
            print(f"  [{i+1}/{len(targets)}] ✓ {name} ({result['source']})")
        else:
            results[name] = {"description": None, "source": "not_found"}
            print(f"  [{i+1}/{len(targets)}] ✗ {name}")

        if (i + 1) % 10 == 0:
            save_results(results)
            pct = found / (i + 1) * 100
            print(f"  ... saved checkpoint ({found}/{i+1} found, {pct:.0f}%)")

        time.sleep(2)

    save_results(results)
    print(f"\nDone: {found}/{len(targets)} found ({found/max(len(targets),1)*100:.0f}%)")
    print(f"Total scraped: {len(results)}/{len(name_only)}")


if __name__ == "__main__":
    main()
