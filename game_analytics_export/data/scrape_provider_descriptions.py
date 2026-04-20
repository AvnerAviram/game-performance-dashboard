"""
Scrape game descriptions from provider official websites.
Uses the same approach as download_all_rules.py: save HTML to rules_html/,
register in rules_index.json, then smart_match picks them up.

Supported providers:
  - Play'n GO:  playngo.com/games/{slug}
  - Evolution:  games.evolution.com/slots/{slug}/

Usage:
  python3 data/scrape_provider_descriptions.py --provider "Play'n GO" --test 3
  python3 data/scrape_provider_descriptions.py --provider Evolution --all
  python3 data/scrape_provider_descriptions.py --all-providers
"""

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).parent
HTML_DIR = DATA_DIR / "rules_html"
TEXT_DIR = DATA_DIR / "rules_text"
RULES_INDEX_PATH = DATA_DIR / "rules_index.json"
MASTER_PATH = DATA_DIR / "game_data_master.json"
MATCHES_PATH = DATA_DIR / "rules_game_matches.json"

HTML_DIR.mkdir(exist_ok=True)
TEXT_DIR.mkdir(exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
}


def slugify(name, style='dash'):
    """Convert game name to URL slug."""
    s = name.lower().strip()
    s = s.replace("'", "").replace("\u2019", "").replace(":", "").replace("&", "and")
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'\s+', '-', s.strip())
    if style == 'squash':
        s = s.replace('-', '')
    return s


def extract_text(html):
    """Strip tags, return clean text."""
    text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
    text = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&#\d+;', '', text)
    text = re.sub(r'&\w+;', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def fetch_url(url, timeout=15):
    """Fetch URL content with headers."""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='replace')


def scrape_playngo(name):
    """Scrape playngo.com for a game description."""
    slug = slugify(name)
    slugs_to_try = [slug]

    suffixes = ['megaways', 'deluxe', 'hold-and-win']
    for sfx in suffixes:
        if slug.endswith('-' + sfx):
            slugs_to_try.append(slug[:-(len(sfx) + 1)])

    for s in slugs_to_try:
        url = f"https://www.playngo.com/games/{s}"
        try:
            html = fetch_url(url)
            if 'Game Theme:' in html or 'Video Slot' in html or 'Game Type:' in html:
                return html, url, f"prov_playngo_{s.replace('-', '')}"
        except Exception:
            pass
        time.sleep(1)

    return None, None, None


def scrape_evolution(name):
    """Scrape games.evolution.com for a game description."""
    slug = slugify(name)
    slugs_to_try = [slug]

    suffixes = ['megaways', 'deluxe', 'limited', 'hold-and-win']
    for sfx in suffixes:
        if slug.endswith('-' + sfx):
            slugs_to_try.append(slug[:-(len(sfx) + 1)])

    for s in slugs_to_try:
        url = f"https://games.evolution.com/slots/{s}/"
        try:
            html = fetch_url(url)
            if 'Game Provider' in html or 'Slot summary' in html or 'Game Type' in html:
                return html, url, f"prov_evolution_{s.replace('-', '')}"
        except Exception:
            pass
        time.sleep(1)

    return None, None, None


def scrape_high5(name):
    """Scrape high5games.com for a game description."""
    slug = slugify(name)
    url = f"https://www.high5games.com/games/{slug}"
    try:
        html = fetch_url(url)
        if len(extract_text(html)) > 200:
            return html, url, f"prov_high5_{slug.replace('-', '')}"
    except Exception:
        pass
    return None, None, None


PROVIDER_SCRAPERS = {
    "Play'n GO": scrape_playngo,
    "Evolution": scrape_evolution,
    "High 5 Games": scrape_high5,
}


def get_unmatched_for_provider(provider):
    """Get name-only unmatched slots for a specific provider."""
    master = json.loads(MASTER_PATH.read_text())
    matches = json.loads(MATCHES_PATH.read_text())
    matched_names = set(matches.keys())

    return [g for g in master
            if g.get('game_category') == 'Slot'
            and g.get('provider') == provider
            and not g.get('description')
            and not g.get('symbols')
            and g['name'] not in matched_names]


def run_provider(provider, limit=None, test_mode=False):
    """Scrape descriptions for unmatched games from a provider."""
    scraper = PROVIDER_SCRAPERS.get(provider)
    if not scraper:
        print(f"No scraper for {provider}. Available: {list(PROVIDER_SCRAPERS.keys())}")
        return

    games = get_unmatched_for_provider(provider)
    if limit:
        games = games[:limit]

    print(f"\n{'='*60}")
    print(f"PROVIDER: {provider}")
    print(f"Games to scrape: {len(games)}")
    print(f"{'='*60}")

    ri = json.loads(RULES_INDEX_PATH.read_text()) if RULES_INDEX_PATH.exists() else {}
    matches = json.loads(MATCHES_PATH.read_text())

    found = 0
    missed = 0

    for i, game in enumerate(games):
        name = game['name']
        print(f"[{i+1}/{len(games)}] {name}...", end=" ", flush=True)

        html, url, file_slug = scraper(name)

        if html and file_slug:
            html_path = HTML_DIR / f"{file_slug}.html"
            html_path.write_text(html, encoding='utf-8')

            text = extract_text(html)
            if len(text) > 100:
                text_path = TEXT_DIR / f"{file_slug}.txt"
                text_path.write_text(text, encoding='utf-8')

            title_match = re.search(r'<title>(.*?)</title>', html)
            title = title_match.group(1).strip() if title_match else name

            ri[file_slug] = {
                'url': url,
                'title': name,
                'text_length': len(text),
                'status': 'ok',
                'source': 'provider_website',
            }

            matches[name] = {
                'slug': file_slug,
                'url': url,
                'page_title': name,
                'provider': provider,
                'round': 0,
                'match_method': 'provider_website',
            }

            found += 1
            print(f"FOUND ({len(text)} chars)")
        else:
            missed += 1
            print(f"NOT FOUND")

        time.sleep(1.5)

        if (i + 1) % 10 == 0:
            RULES_INDEX_PATH.write_text(json.dumps(ri, indent=2))
            MATCHES_PATH.write_text(json.dumps(matches, indent=2))
            print(f"  --- Checkpoint: found={found}, missed={missed} ---")

    RULES_INDEX_PATH.write_text(json.dumps(ri, indent=2))
    MATCHES_PATH.write_text(json.dumps(matches, indent=2))

    print(f"\n{'='*60}")
    print(f"DONE: {provider}")
    print(f"Found: {found}/{len(games)}")
    print(f"Missed: {missed}")
    print(f"{'='*60}")

    return found


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Scrape provider websites for game descriptions")
    parser.add_argument("--provider", type=str, help="Provider name")
    parser.add_argument("--test", type=int, help="Test with N games only")
    parser.add_argument("--all", action="store_true", help="Scrape all unmatched for provider")
    parser.add_argument("--all-providers", action="store_true", help="Scrape all supported providers")
    parser.add_argument("--stats", action="store_true", help="Show stats only")
    args = parser.parse_args()

    if args.stats:
        for prov in PROVIDER_SCRAPERS:
            games = get_unmatched_for_provider(prov)
            print(f"  {prov}: {len(games)} unmatched name-only slots")
        return

    if args.all_providers:
        total = 0
        for prov in PROVIDER_SCRAPERS:
            n = run_provider(prov)
            if n:
                total += n
        print(f"\nAll providers done. Total found: {total}")
        return

    if not args.provider:
        parser.print_help()
        return

    limit = args.test if args.test else (None if args.all else 5)
    run_provider(args.provider, limit=limit, test_mode=bool(args.test))


if __name__ == "__main__":
    main()
