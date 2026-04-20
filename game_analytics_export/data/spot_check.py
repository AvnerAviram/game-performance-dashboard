#!/usr/bin/env python3
"""
Pick N random games from the 500 batch and show classification vs review.
Usage: python3 data/spot_check.py [N]  (default: 5)
"""
import json, os, re, random, sys
from bs4 import BeautifulSoup

N = int(sys.argv[1]) if len(sys.argv) > 1 else 5
sc_dir = os.path.join(os.path.dirname(__file__), '_legacy', 'sc_cache')

with open('/tmp/v4_batch_500_results.json') as f:
    results = json.load(f)

picks = random.sample(results, min(N, len(results)))

for i, r in enumerate(picks):
    path = os.path.join(sc_dir, r['file'])
    with open(path, encoding='utf-8', errors='replace') as f:
        html = f.read()
    soup = BeautifulSoup(html, 'html.parser')
    review_h2 = soup.find('h2', string=re.compile(r'Review', re.IGNORECASE))
    review_text = ''
    if review_h2:
        current = review_h2.find_next_sibling()
        while current:
            if current.name == 'h2': break
            t = current.get_text(strip=True) if current.name else ''
            if t and len(t) > 20: review_text += t + ' '
            current = current.find_next_sibling()
    
    sec = f" + {r['art_theme_secondary']}" if r.get('art_theme_secondary') else ""
    branded = " [BRANDED]" if r.get('is_branded') else ""
    
    print(f"\n{'='*70}")
    print(f"GAME {i+1}/{N}: {r['name'][:60]}")
    print(f"FILE: {r['file']}")
    print(f"THEME: {r['art_theme']}{sec}{branded}")
    print(f"MOOD:  {r.get('art_mood','')}")
    print(f"CHARS: {', '.join(r.get('art_characters', [])[:2])}")
    print(f"\nREVIEW:")
    print(f"  {review_text[:500]}")
    print(f"\n→ Does this theme match the review? (y/n/debatable)")
