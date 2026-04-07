"""
Match SlotReport release dates to game_data_master.json games.

Strategy:
1. Normalize names (lowercase, strip punctuation, collapse whitespace)
2. Normalize providers (port PROVIDER_NORMALIZATION_MAP from shared-config.js)
3. Match by normalized name + provider cross-check
4. Validate against known dates and staged data
5. Output match file + unmatched gap list

Usage: python3 data/match_release_dates.py
"""

import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent

SLOT_REPORT_PATH = DATA_DIR / '_slot_report_data.json'
MASTER_PATH = DATA_DIR / 'game_data_master.json'
STAGED_PATH = DATA_DIR / 'staged_best_of_sources.json'
OUTPUT_MATCHES = DATA_DIR / '_release_date_matches.json'
OUTPUT_UNMATCHED = DATA_DIR / '_release_date_unmatched.json'
OUTPUT_REPORT = DATA_DIR / '_release_date_match_report.json'

PROVIDER_NORMALIZATION_MAP = {
    'igt': 'IGT',
    'international gaming technology': 'IGT',
    'inspired': 'Inspired Gaming',
    'inspired ga': 'Inspired Gaming',
    'inspired entertainment': 'Inspired Gaming',
    'play n go': "Play'n GO",
    'playn go': "Play'n GO",
    "play'n go": "Play'n GO",
    'light and wonder': 'Light & Wonder',
    'light & wonder': 'Light & Wonder',
    'blueprint': 'Blueprint Gaming',
    'blueprint gaming': 'Blueprint Gaming',
    'white hat studios': 'Blueprint Gaming',
    'lucksome': 'Blueprint Gaming',
    'atomic slot lab': 'Blueprint Gaming',
    'red tiger': 'Red Tiger Gaming',
    'red tiger gaming': 'Red Tiger Gaming',
    'bragg': 'Bragg Gaming Group',
    'bragg gaming group': 'Bragg Gaming Group',
    '4theplayer': '4theplayer',
    'pear fiction studios': 'PearFiction',
    'pearfiction': 'PearFiction',
    'bally': 'Light & Wonder',
    'wms': 'Light & Wonder',
    'nyx': 'Light & Wonder',
    'nextgen gaming': 'Light & Wonder',
    'slingshot studios': 'Light & Wonder',
    'circular arrow': 'Light & Wonder',
    'fortune factory studios': 'Light & Wonder',
    'dsg': 'Design Works Gaming',
    'design works gaming': 'Design Works Gaming',
}

KNOWN_DATES = {
    'starburst': ('2012-01-23', 'NetEnt'),
    "gonzo's quest": ('2010-03-15', 'NetEnt'),
    'book of dead': ('2016-01-01', "Play'n GO"),
    'jimi hendrix': ('2016-04-21', 'NetEnt'),
    'cleopatra': ('2012-01-01', 'IGT'),
    'rainbow riches': ('2009-01-01', 'Light & Wonder'),
    'bonanza': ('2016-12-07', 'BTG'),
    'dead or alive': ('2009-04-01', 'NetEnt'),
    'reactoonz': ('2017-10-01', "Play'n GO"),
    'wolf gold': ('2017-03-01', 'Pragmatic Play'),
    'jammin jars': ('2018-09-01', 'Push Gaming'),
    'immortal romance': ('2011-12-01', 'Microgaming'),
    'mega moolah': ('2006-11-01', 'Microgaming'),
    'thunderstruck ii': ('2010-05-01', 'Microgaming'),
    'gates of olympus': ('2021-02-01', 'Pragmatic Play'),
    'sweet bonanza': ('2019-06-27', 'Pragmatic Play'),
    'the dog house': ('2019-05-16', 'Pragmatic Play'),
    'fire joker': ('2016-09-01', "Play'n GO"),
    'buffalo king': ('2020-03-01', 'Pragmatic Play'),
    'extra chilli': ('2018-04-01', 'BTG'),
}


def norm(name):
    """Normalize a name for comparison: lowercase, strip punctuation, collapse whitespace."""
    s = name.lower().strip()
    s = re.sub(r"[''':!&,.\-™®©()\"]+", '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def norm_provider(provider):
    """Normalize a provider name using the shared normalization map."""
    if not provider:
        return ''
    low = provider.strip().lower()
    result = PROVIDER_NORMALIZATION_MAP.get(low)
    if result:
        return result.lower()
    return re.sub(r"[''':!&,.\-™®©()\"]+", '', low).replace(' ', '')


def parse_release_date(date_str):
    """Parse release date string into (year, month, normalized_iso) tuple.
    Handles: YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM, YYYY, ISO with T suffix.
    """
    if not date_str:
        return None, None, None
    try:
        date_str = str(date_str).strip()
        if 'T' in date_str:
            date_str = date_str.split('T')[0]

        # Year-only: "2024"
        if re.match(r'^\d{4}$', date_str):
            year = int(date_str)
            return year, 1, f'{year:04d}-01-01'

        # Year-month: "2024-06"
        ym_match = re.match(r'^(\d{4})-(\d{1,2})$', date_str)
        if ym_match:
            year, month = int(ym_match.group(1)), int(ym_match.group(2))
            return year, month, f'{year:04d}-{month:02d}-01'

        # DD.MM.YYYY
        dot_match = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})$', date_str)
        if dot_match:
            day, month, year = int(dot_match.group(1)), int(dot_match.group(2)), int(dot_match.group(3))
            return year, month, f'{year:04d}-{month:02d}-{day:02d}'

        parts = date_str.split('-')
        if len(parts) == 3:
            a, b, c = int(parts[0]), int(parts[1]), int(parts[2])
            if a >= 1900:
                return a, b, f'{a:04d}-{b:02d}-{c:02d}'
            if c >= 1900:
                return c, b, f'{c:04d}-{b:02d}-{a:02d}'

        return None, None, None
    except (ValueError, IndexError):
        return None, None, None


def main():
    print('=== Release Date Matching Script ===\n')

    sr_data = json.loads(SLOT_REPORT_PATH.read_text())
    sr_games = sr_data['results']
    print(f'SlotReport: {len(sr_games)} entries')

    master = json.loads(MASTER_PATH.read_text())
    print(f'Master: {len(master)} games')

    staged = {}
    if STAGED_PATH.exists():
        staged = json.loads(STAGED_PATH.read_text())
        staged_with_dates = {k: v for k, v in staged.items()
                            if v.get('original_release_date')}
        print(f'Staged: {len(staged_with_dates)} games with original_release_date')

    # --- Build SlotReport index by normalized name ---
    sr_by_norm = defaultdict(list)
    sr_with_dates = 0
    for sr in sr_games:
        if sr.get('release_date'):
            sr_with_dates += 1
        key = norm(sr['name'])
        sr_by_norm[key].append(sr)
    print(f'SlotReport with dates: {sr_with_dates}')
    print(f'SlotReport unique normalized names: {len(sr_by_norm)}\n')

    # --- Build secondary index: SR by slug-derived norm ---
    # Also index by suffix matching: "Rich Wilde and the Book of Dead" -> "book of dead"
    sr_by_slug = {}
    for sr in sr_games:
        slug = sr.get('slug', '')
        if slug:
            sr_by_slug[slug] = sr

    # Roman numeral normalization for matching
    ROMAN_MAP = {'ii': '2', 'iii': '3', 'iv': '4', 'v': '5', 'vi': '6', 'vii': '7'}

    def norm_roman(s):
        """Also normalize roman numerals to arabic."""
        words = s.split()
        return ' '.join(ROMAN_MAP.get(w, w) for w in words)

    # Build SR index with roman-numeral-aware normalization
    sr_by_norm_roman = defaultdict(list)
    for sr in sr_games:
        key = norm_roman(norm(sr['name']))
        sr_by_norm_roman[key].append(sr)

    # --- Match ---
    matches = {}
    unmatched = []
    match_methods = defaultdict(int)
    flagged = []

    for game in master:
        game_norm = norm(game['name'])
        game_prov_norm = norm_provider(game.get('provider', ''))

        candidates = sr_by_norm.get(game_norm, [])

        # Fallback 1: Roman numeral normalization ("Thunderstruck Ii" -> "Thunderstruck 2")
        if not candidates:
            game_norm_roman = norm_roman(game_norm)
            candidates = sr_by_norm_roman.get(game_norm_roman, [])

        # Fallback 2: Check if any SR name ends with the master name (handles prefix additions)
        # Require provider match for suffix matching to avoid false positives
        if not candidates:
            suffix_candidates = []
            for sr_norm_key, sr_list in sr_by_norm.items():
                if sr_norm_key.endswith(game_norm) and len(game_norm) >= 8 and sr_norm_key != game_norm:
                    for c in sr_list:
                        if norm_provider(c.get('provider', '')) == game_prov_norm:
                            suffix_candidates.append(c)
            if suffix_candidates:
                candidates = list({id(c): c for c in suffix_candidates}.values())

        if not candidates:
            unmatched.append({
                'id': game['id'],
                'name': game['name'],
                'provider': game.get('provider', ''),
                'game_category': game.get('game_category', ''),
                'reason': 'no_name_match',
            })
            continue

        best = None
        method = 'name_only'

        if len(candidates) == 1:
            best = candidates[0]
            method = 'unique_name'
        else:
            prov_matches = [c for c in candidates
                           if norm_provider(c.get('provider', '')) == game_prov_norm]
            if len(prov_matches) == 1:
                best = prov_matches[0]
                method = 'name_plus_provider'
            elif len(prov_matches) > 1:
                with_date = [c for c in prov_matches if c.get('release_date')]
                best = with_date[0] if with_date else prov_matches[0]
                method = 'name_plus_provider_multi'
            else:
                with_date = [c for c in candidates if c.get('release_date')]
                best = with_date[0] if with_date else candidates[0]
                method = 'name_only_multi'

        if not best.get('release_date'):
            unmatched.append({
                'id': game['id'],
                'name': game['name'],
                'provider': game.get('provider', ''),
                'game_category': game.get('game_category', ''),
                'reason': 'matched_but_no_date',
                'sr_name': best['name'],
            })
            continue

        year, month, iso_date = parse_release_date(best['release_date'])
        if year is None:
            unmatched.append({
                'id': game['id'],
                'name': game['name'],
                'provider': game.get('provider', ''),
                'game_category': game.get('game_category', ''),
                'reason': 'unparseable_date',
                'sr_date': best['release_date'],
            })
            continue

        # Validation flags
        flags = []
        now = datetime.now()
        if year > now.year + 1:
            flags.append(f'future_date:{iso_date}')
        if year < 2000:
            flags.append(f'pre_2000:{iso_date}')

        # Cross-check against staged data
        staged_entry = staged.get(game['name'], {})
        staged_date = staged_entry.get('original_release_date')
        if staged_date:
            staged_year, _, _ = parse_release_date(staged_date)
            if staged_year and abs(staged_year - year) > 1:
                flags.append(f'staged_disagrees:sr={year},staged={staged_year}')

        if flags:
            flagged.append({
                'id': game['id'],
                'name': game['name'],
                'flags': flags,
                'sr_date': best['release_date'],
                'iso_date': iso_date,
            })

        matches[game['id']] = {
            'release_date': iso_date,
            'release_year': year,
            'release_month': month,
            'source': 'slotreport',
            'sr_name': best['name'],
            'sr_slug': best.get('slug', ''),
            'match_method': method,
        }
        match_methods[method] += 1

    # --- Merge staged dates for gap games ---
    name_to_id = {g['name']: g['id'] for g in master}
    staged_added = 0
    for name, entry in staged.items():
        staged_date = entry.get('original_release_date')
        if not staged_date:
            continue
        game_id = name_to_id.get(name)
        if not game_id or game_id in matches:
            continue
        year, month, iso_date = parse_release_date(staged_date)
        if year is None:
            continue
        matches[game_id] = {
            'release_date': iso_date,
            'release_year': year,
            'release_month': month,
            'source': entry.get('original_release_date_source', 'staged'),
            'sr_name': name,
            'sr_slug': '',
            'match_method': 'staged_best_of_sources',
        }
        staged_added += 1
        # Remove from unmatched
        unmatched = [u for u in unmatched if u['id'] != game_id]
    print(f'\nStaged dates merged: {staged_added} additional games')

    # --- Known-date cross-validation ---
    print('=== Known-Date Cross-Validation ===')
    known_checks = 0
    known_pass = 0
    known_failures = []
    for game in master:
        known_key = norm(game['name'])
        if known_key in KNOWN_DATES:
            expected_date, expected_prov = KNOWN_DATES[known_key]
            expected_year = int(expected_date.split('-')[0])
            match = matches.get(game['id'])
            known_checks += 1
            if match:
                if abs(match['release_year'] - expected_year) <= 1:
                    known_pass += 1
                    print(f'  PASS: {game["name"]} -> {match["release_year"]} (expected ~{expected_year})')
                else:
                    known_failures.append({
                        'name': game['name'],
                        'matched_year': match['release_year'],
                        'expected_year': expected_year,
                        'sr_date': match['release_date'],
                    })
                    print(f'  FAIL: {game["name"]} -> {match["release_year"]} (expected ~{expected_year})')
            else:
                print(f'  MISS: {game["name"]} not matched in SlotReport')

    print(f'\nKnown-date checks: {known_pass}/{known_checks} passed')
    if known_failures:
        print(f'  Failures: {json.dumps(known_failures, indent=2)}')

    # --- Statistics ---
    total_slots = sum(1 for g in master if g.get('game_category') == 'Slot')
    matched_slots = sum(1 for g in master
                        if g.get('game_category') == 'Slot' and g['id'] in matches)

    year_dist = defaultdict(int)
    for m in matches.values():
        year_dist[m['release_year']] += 1

    report = {
        'timestamp': datetime.now().isoformat(),
        'total_master': len(master),
        'total_slots': total_slots,
        'total_matched': len(matches),
        'matched_slots': matched_slots,
        'total_unmatched': len(unmatched),
        'unmatched_by_reason': {},
        'match_methods': dict(match_methods),
        'flagged_count': len(flagged),
        'flagged_entries': flagged[:20],
        'known_date_checks': known_checks,
        'known_date_pass': known_pass,
        'known_date_failures': known_failures,
        'year_distribution': dict(sorted(year_dist.items())),
    }

    reason_counts = defaultdict(int)
    for u in unmatched:
        reason_counts[u['reason']] += 1
    report['unmatched_by_reason'] = dict(reason_counts)

    # --- Write outputs ---
    OUTPUT_MATCHES.write_text(json.dumps(matches, indent=2))
    OUTPUT_UNMATCHED.write_text(json.dumps(unmatched, indent=2))
    OUTPUT_REPORT.write_text(json.dumps(report, indent=2))

    print(f'\n=== Match Results ===')
    print(f'Total matched:   {len(matches)} / {len(master)} ({100*len(matches)/len(master):.1f}%)')
    print(f'Matched slots:   {matched_slots} / {total_slots} ({100*matched_slots/total_slots:.1f}%)')
    print(f'Unmatched:       {len(unmatched)}')
    for reason, count in sorted(reason_counts.items()):
        print(f'  {reason}: {count}')
    print(f'Flagged:         {len(flagged)}')
    print(f'\nMatch methods:')
    for method, count in sorted(match_methods.items(), key=lambda x: -x[1]):
        print(f'  {method}: {count}')
    print(f'\nYear distribution:')
    for year in sorted(year_dist.keys()):
        print(f'  {year}: {year_dist[year]}')
    print(f'\nOutputs:')
    print(f'  {OUTPUT_MATCHES}')
    print(f'  {OUTPUT_UNMATCHED}')
    print(f'  {OUTPUT_REPORT}')


if __name__ == '__main__':
    main()
