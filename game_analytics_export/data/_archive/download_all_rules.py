"""
Download ALL Borgata + Ontario BetMGM help pages to local archive.

Fetches the full index of game slugs, then downloads every page.
Saves raw HTML to data/rules_html/ and clean article text to data/rules_text/.
Builds data/rules_index.json mapping slug -> title, URL, text length.

Usage: python3 data/download_all_rules.py [--resume]
"""

import json
import os
import re
import sys
import time
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent
HTML_DIR = DATA_DIR / "rules_html"
TEXT_DIR = DATA_DIR / "rules_text"
INDEX_PATH = DATA_DIR / "help_page_index.json"
RULES_INDEX_PATH = DATA_DIR / "rules_index.json"

BASES = [
    ("Borgata", "https://help.borgataonline.com"),
    ("Ontario", "https://help.on.betmgm.ca"),
]

CATEGORIES = [
    "slots", "jackpot-slots", "instantwin", "moregames", "more-games",
    "table-games", "tablecasino", "video-poker", "tap", "scratchgame",
    "roulette", "moneywheel", "keno", "crash", "blackjack",
]


def fetch_help_index():
    """Scrape Borgata + Ontario index pages across ALL categories for game slugs."""
    slug_map = {}

    for label, base_url in BASES:
        site_total = 0
        for cat in CATEGORIES:
            index_url = f"{base_url}/en/casino-help/{cat}"
            try:
                resp = requests.get(index_url, timeout=15)
                if resp.status_code != 200:
                    continue
                links = re.findall(
                    r'href="(/en/casino-help/[^"]+/[^"]+)"', resp.text
                )
                added = 0
                for link in set(links):
                    parts = link.strip("/").split("/")
                    if len(parts) < 4:
                        continue
                    slug = parts[-1]
                    link_cat = parts[-2]
                    if slug in CATEGORIES or link_cat == slug:
                        continue
                    if slug not in slug_map:
                        slug_map[slug] = base_url + link
                        added += 1
                if added > 0:
                    print(f"  {label}/{cat}: {added} new slugs")
                    site_total += added
            except Exception as e:
                print(f"  {label}/{cat}: FAILED - {e}")
        print(f"  {label} total new: {site_total}")

    print(f"  Total unique slugs: {len(slug_map)}")
    return slug_map


def extract_title(html):
    """Extract game name from <title> tag."""
    m = re.search(r"<title>(.*?)</title>", html)
    if not m:
        return ""
    title = m.group(1).strip()
    title = re.sub(r"^Help\s*-\s*Casino\s*-\s*", "", title).strip()
    return title


def extract_article_text(html):
    """Extract and clean text from <article> tag."""
    article = re.search(r"<article>(.*?)</article>", html, re.DOTALL)
    text = article.group(1) if article else html

    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&#\d+;", "", text)
    text = re.sub(r"&\w+;", " ", text)
    return text


def main():
    resume = "--resume" in sys.argv

    HTML_DIR.mkdir(exist_ok=True)
    TEXT_DIR.mkdir(exist_ok=True)

    # Step 1: Fetch index (always re-fetch to discover new categories, merge with existing)
    existing_slugs = {}
    if INDEX_PATH.exists():
        existing_slugs = json.loads(INDEX_PATH.read_text())
        print(f"Existing index: {len(existing_slugs)} slugs")

    print("Fetching help page index (all categories)...")
    fresh_slugs = fetch_help_index()
    slug_map = {**existing_slugs, **fresh_slugs}
    INDEX_PATH.write_text(json.dumps(slug_map, indent=2))
    new_count = len(slug_map) - len(existing_slugs)
    print(f"Saved index: {len(slug_map)} total ({new_count} new)")

    # Step 2: Download all pages using thread pool
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading

    rules_index = {}
    if RULES_INDEX_PATH.exists() and resume:
        rules_index = json.loads(RULES_INDEX_PATH.read_text())
        print(f"Resuming: {len(rules_index)} already processed")

    slugs_to_fetch = [(s, slug_map[s]) for s in sorted(slug_map.keys())
                      if not (resume and s in rules_index)]
    total = len(slug_map)
    already = len(rules_index) if resume else 0
    print(f"To download: {len(slugs_to_fetch)} (skipping {already} already done)")

    lock = threading.Lock()
    counter = {"fetched": 0, "errors": 0, "empty": 0}

    def download_one(slug, url):
        html_path = HTML_DIR / f"{slug}.html"
        text_path = TEXT_DIR / f"{slug}.txt"
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            html = resp.text
            html_path.write_text(html, encoding="utf-8")
            title = extract_title(html)
            text = extract_article_text(html)
            is_error_page = (
                len(text) < 100
                or "page you requested was not found" in text.lower()
                or "page not found" in text.lower()
            )
            if is_error_page:
                with lock:
                    counter["empty"] += 1
                return slug, {"url": url, "title": title, "text_length": len(text), "status": "error_page"}
            else:
                text_path.write_text(text, encoding="utf-8")
                with lock:
                    counter["fetched"] += 1
                return slug, {"url": url, "title": title, "text_length": len(text), "status": "ok"}
        except Exception as e:
            with lock:
                counter["errors"] += 1
            return slug, {"url": url, "title": "", "text_length": 0, "status": f"error: {str(e)[:100]}"}

    batch_done = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(download_one, s, u): s for s, u in slugs_to_fetch}
        for future in as_completed(futures):
            slug, result = future.result()
            with lock:
                rules_index[slug] = result
                batch_done += 1
                if batch_done % 200 == 0 or batch_done == len(slugs_to_fetch):
                    RULES_INDEX_PATH.write_text(json.dumps(rules_index, indent=2))
                    elapsed = time.time() - start_time
                    rate = batch_done / elapsed if elapsed > 0 else 0
                    remaining = (len(slugs_to_fetch) - batch_done) / rate if rate > 0 else 0
                    print(
                        f"  [{already + batch_done}/{total}] fetched={counter['fetched']} "
                        f"errors={counter['errors']} empty={counter['empty']} "
                        f"({elapsed:.0f}s elapsed, ~{remaining:.0f}s remaining)",
                        flush=True,
                    )

    # Final save
    RULES_INDEX_PATH.write_text(json.dumps(rules_index, indent=2))

    # Summary
    ok_count = sum(1 for v in rules_index.values() if v["status"] == "ok")
    err_count = sum(1 for v in rules_index.values() if "error" in v["status"])
    print(f"\n{'='*60}")
    print(f"DOWNLOAD COMPLETE")
    print(f"{'='*60}")
    print(f"Total slugs: {total}")
    print(f"Successfully saved: {ok_count}")
    print(f"Error/empty pages: {err_count + counter['empty']}")
    print(f"Text files in {TEXT_DIR}: {sum(1 for _ in TEXT_DIR.glob('*.txt'))}")


start_time = time.time()

if __name__ == "__main__":
    main()
