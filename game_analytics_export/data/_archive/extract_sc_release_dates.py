"""
Extract release dates from cached SlotCatalog HTML pages.
Matches extracted dates to game_data_master.json games not already covered by Phase 1.

Usage: python3 data/extract_sc_release_dates.py
"""

import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent
SC_CACHE = DATA_DIR / '_legacy' / 'sc_cache'
MASTER_PATH = DATA_DIR / 'game_data_master.json'
PHASE1_MATCHES = DATA_DIR / '_release_date_matches.json'
OUTPUT_SC_DATES = DATA_DIR / '_sc_release_dates.json'
OUTPUT_MERGED = DATA_DIR / '_release_date_matches.json'


def norm(name):
    """Normalize a name for comparison."""
    s = name.lower().strip()
    s = re.sub(r"[''':!&,.\-™®©()\"]+", '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def extract_release_date_from_html(html):
    """Extract release date from SC HTML page."""
    # Pattern 1: propLeft/propRight table
    m = re.search(
        r'Release\s*Date.*?<td[^>]*class="propRight"[^>]*>([^<]+)</td>',
        html, re.DOTALL | re.IGNORECASE
    )
    if not m:
        # Pattern 2: simpler table row
        m = re.search(
            r'Release\s*Date.*?<td[^>]*>([^<]+)</td>',
            html, re.DOTALL | re.IGNORECASE
        )
    if not m:
        return None

    raw = m.group(1).strip()
    if not raw or raw == '-' or raw == 'N/A':
        return None

    # ISO format: YYYY-MM-DD
    if re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        return raw

    # Some pages have just a year
    if re.match(r'^\d{4}$', raw):
        year = int(raw)
        if 2000 <= year <= 2027:
            return f'{year}-01-01'

    # Numeric Excel serial (garbage)
    if re.match(r'^\d{3,5}$', raw):
        return None

    return None


def slug_to_norm(slug):
    """Convert SC filename slug to normalized name."""
    name = slug.replace('.html', '')
    name = name.replace('-', ' ')
    return norm(name)


def main():
    print('=== SC Release Date Extraction ===\n')

    master = json.loads(MASTER_PATH.read_text())
    phase1 = json.loads(PHASE1_MATCHES.read_text())

    already_matched = set(phase1.keys())
    print(f'Phase 1 matches: {len(already_matched)}')

    unmatched_games = [g for g in master if g['id'] not in already_matched]
    print(f'Games needing dates: {len(unmatched_games)}')

    # Build norm -> game mapping for unmatched games
    unmatched_by_norm = defaultdict(list)
    for g in unmatched_games:
        unmatched_by_norm[norm(g['name'])].append(g)

    # Extract dates from SC cache
    sc_files = list(SC_CACHE.glob('*.html'))
    print(f'SC cache files: {len(sc_files)}')

    sc_dates = {}
    sc_extracted = 0
    sc_no_date = 0
    sc_garbage = 0

    for f in sc_files:
        html = f.read_text(errors='replace')
        date = extract_release_date_from_html(html)
        sc_slug = f.name
        sc_norm = slug_to_norm(sc_slug)

        if date:
            sc_extracted += 1
            sc_dates[sc_norm] = {
                'release_date': date,
                'sc_file': sc_slug,
            }
        else:
            sc_no_date += 1

    print(f'SC dates extracted: {sc_extracted}')
    print(f'SC no date / garbage: {sc_no_date}')

    # Match SC dates to unmatched master games
    new_matches = 0
    for sc_norm_key, sc_entry in sc_dates.items():
        games = unmatched_by_norm.get(sc_norm_key)
        if not games:
            continue

        date_str = sc_entry['release_date']
        parts = date_str.split('-')
        year = int(parts[0])
        month = int(parts[1]) if len(parts) > 1 else 1

        if year < 2000 or year > 2027:
            continue

        for game in games:
            if game['id'] in phase1:
                continue
            phase1[game['id']] = {
                'release_date': date_str,
                'release_year': year,
                'release_month': month,
                'source': 'slotcatalog',
                'sr_name': game['name'],
                'sr_slug': sc_entry['sc_file'],
                'match_method': 'sc_cache_extract',
            }
            new_matches += 1

    print(f'\nNew SC matches added: {new_matches}')
    print(f'Total matches after SC: {len(phase1)}')

    total_slots = sum(1 for g in master if g.get('game_category') == 'Slot')
    matched_slots = sum(1 for g in master
                        if g.get('game_category') == 'Slot' and g['id'] in phase1)
    print(f'Slot coverage: {matched_slots}/{total_slots} ({100*matched_slots/total_slots:.1f}%)')

    # Year distribution for new matches
    year_dist = defaultdict(int)
    for gid, m in phase1.items():
        if m.get('source') == 'slotcatalog':
            year_dist[m['release_year']] += 1
    if year_dist:
        print(f'\nSC year distribution:')
        for y in sorted(year_dist.keys()):
            print(f'  {y}: {year_dist[y]}')

    # Save
    OUTPUT_SC_DATES.write_text(json.dumps(sc_dates, indent=2))
    OUTPUT_MERGED.write_text(json.dumps(phase1, indent=2))
    print(f'\nSaved SC dates: {OUTPUT_SC_DATES}')
    print(f'Updated merged matches: {OUTPUT_MERGED}')


if __name__ == '__main__':
    main()
