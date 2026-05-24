#!/usr/bin/env python3
"""
Phase 0: CSV Baseline Reconciliation
Aligns games_master with CSV as source of truth. No web searches.
Output: VALIDATION_PHASE0_REPORT.json
"""

import json
import csv
import os
import re
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAMES_MASTER_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'games_master.json')
CSV_PATH = '/Users/avner/Downloads/Data Download Theme (4).csv'
REPORT_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'VALIDATION_PHASE0_REPORT.json')

# Table game keywords (exclude from slots)
TABLE_KEYWORDS = [
    'blackjack', 'baccarat', 'roulette', 'poker', 'craps',
    'sic bo', 'live dealer', 'live vip', 'premium'
]


def normalize_name(s):
    """Normalize for fuzzy matching: lowercase, collapse spaces, remove punctuation."""
    if not s:
        return ''
    s = s.lower().strip()
    s = re.sub(r'[^\w\s]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s


def parse_market_share(s):
    """Parse CSV market share like '2.15%' to float 2.15."""
    if not s:
        return 0.0
    s = str(s).strip().replace('%', '').replace(',', '')
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_release_year(s):
    """Parse 'August, 2021' or 'October, 2025' to year int."""
    if not s:
        return None
    m = re.search(r'(\d{4})', str(s))
    return int(m.group(1)) if m else None


def load_csv_slots():
    """Load and filter CSV to slots only, sorted by theo_win desc."""
    csv_games = []
    with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                theo_win = float(row.get('Theo Win Index', 0) or 0)
                game_name = row.get('Game Name', '').strip()
                provider = row.get('Parent Supplier', '').strip()
                category = row.get('Game Category', '').strip().lower()

                is_table = any(kw in game_name.lower() for kw in TABLE_KEYWORDS)
                if theo_win > 0 and game_name and not is_table:
                    csv_games.append({
                        'name': game_name,
                        'provider': provider,
                        'theo_win': theo_win,
                        'market_share_pct': parse_market_share(row.get('% of Total GGR', '')),
                        'release_date': row.get('Month, Year of OGPD Release Date', '').strip(),
                        'release_year': parse_release_year(row.get('Month, Year of OGPD Release Date', '')),
                        'category': category
                    })
            except Exception:
                continue
    csv_games.sort(key=lambda x: x['theo_win'], reverse=True)
    return csv_games


def load_db_games():
    """Load games_master, sort by theo_win desc."""
    with open(GAMES_MASTER_PATH, 'r') as f:
        data = json.load(f)
        games = data['games']
    games_sorted = sorted(
        games,
        key=lambda g: g.get('performance', {}).get('theo_win', 0),
        reverse=True
    )
    return games_sorted


def find_csv_match(db_game, csv_games, used_csv_indices):
    """Find best CSV match for a db game by name + theo_win."""
    db_name = db_game['name']
    db_theo = db_game.get('performance', {}).get('theo_win', 0)
    db_norm = normalize_name(db_name)

    best_idx = None
    best_score = -1

    for i, csv_row in enumerate(csv_games):
        if i in used_csv_indices:
            continue
        csv_norm = normalize_name(csv_row['name'])
        theo_diff = abs(db_theo - csv_row['theo_win'])

        # Exact name match
        if db_norm == csv_norm:
            score = 100 - theo_diff
            if score > best_score:
                best_score = score
                best_idx = i
            continue

        # Name contains or is contained
        if csv_norm in db_norm or db_norm in csv_norm:
            score = 80 - theo_diff
            if score > best_score:
                best_score = score
                best_idx = i
            continue

        # Fuzzy: words overlap
        db_words = set(db_norm.split())
        csv_words = set(csv_norm.split())
        overlap = len(db_words & csv_words) / max(len(db_words), 1)
        if overlap >= 0.6 and theo_diff < 1.0:
            score = 50 + overlap * 30 - theo_diff
            if score > best_score:
                best_score = score
                best_idx = i

    return best_idx, best_score


def main():
    csv_games = load_csv_slots()
    db_games = load_db_games()

    print("=" * 80)
    print("Phase 0: CSV Baseline Reconciliation")
    print("=" * 80)
    print(f"\nDatabase games: {len(db_games)}")
    print(f"CSV slot games: {len(csv_games)}")

    # Match db -> csv
    used_csv = set()
    perfect_match = []
    name_mismatch = []
    provider_mismatch = []
    theo_win_mismatch = []
    release_mismatch = []
    critical_error = []
    acceptable_variant = []

    # Also track holes
    csv_names = {normalize_name(r['name']) for r in csv_games}
    db_names = {normalize_name(g['name']) for g in db_games}
    in_csv_not_db = []
    in_db_not_csv = []

    for idx, db_game in enumerate(db_games):
        csv_idx, score = find_csv_match(db_game, csv_games, used_csv)

        if csv_idx is None:
            in_db_not_csv.append({
                'name': db_game['name'],
                'theo_win': db_game.get('performance', {}).get('theo_win'),
                'provider': db_game.get('provider', {}).get('studio', '')
            })
            continue

        used_csv.add(csv_idx)
        csv_row = csv_games[csv_idx]

        db_name = db_game['name']
        db_theo = db_game.get('performance', {}).get('theo_win', 0)
        db_provider = db_game.get('provider', {}).get('studio', '')
        db_market = db_game.get('performance', {}).get('market_share_percent') or 0
        db_year = db_game.get('release', {}).get('year')

        csv_name = csv_row['name']
        csv_theo = csv_row['theo_win']
        csv_provider = csv_row['provider']
        csv_market = csv_row['market_share_pct']
        csv_year = csv_row['release_year']

        name_ok = normalize_name(db_name) == normalize_name(csv_name)
        name_similar = csv_name.lower() in db_name.lower() or db_name.lower() in csv_name.lower()
        provider_ok = csv_provider.lower() in db_provider.lower() or db_provider.lower() in csv_provider.lower()
        theo_ok = abs(db_theo - csv_theo) < 0.1
        market_ok = abs((db_market or 0) - csv_market) < 0.1
        release_ok = (db_year == csv_year) if (db_year and csv_year) else True

        issue = {
            'db_name': db_name,
            'csv_name': csv_name,
            'db_provider': db_provider,
            'csv_provider': csv_provider,
            'db_theo': db_theo,
            'csv_theo': csv_theo,
            'db_market_share': db_market,
            'csv_market_share': csv_market,
            'db_release_year': db_year,
            'csv_release_year': csv_year,
        }

        if not name_ok and not name_similar:
            critical_error.append(issue)
        elif not name_ok and name_similar:
            acceptable_variant.append(issue)
        elif not provider_ok:
            provider_mismatch.append(issue)
        elif not theo_ok:
            theo_win_mismatch.append(issue)
        elif not release_ok:
            release_mismatch.append(issue)
        else:
            perfect_match.append(issue)

    # Games in CSV but not matched (holes in db)
    for csv_row in csv_games:
        if normalize_name(csv_row['name']) not in db_names:
            # Check if any db game matched it
            matched = any(
                normalize_name(g['name']) == normalize_name(csv_row['name']) or
                csv_row['name'].lower() in g['name'].lower()
                for g in db_games
            )
            if not matched:
                in_csv_not_db.append({
                    'name': csv_row['name'],
                    'theo_win': csv_row['theo_win'],
                    'provider': csv_row['provider'],
                    'release_date': csv_row['release_date']
                })

    # Build report
    report = {
        'phase': 0,
        'description': 'CSV Baseline Reconciliation',
        'generated': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'summary': {
            'db_total': len(db_games),
            'csv_slots_total': len(csv_games),
            'perfect_match': len(perfect_match),
            'acceptable_variant': len(acceptable_variant),
            'provider_mismatch': len(provider_mismatch),
            'theo_win_mismatch': len(theo_win_mismatch),
            'release_mismatch': len(release_mismatch),
            'critical_error': len(critical_error),
            'in_csv_not_db': len(in_csv_not_db),
            'in_db_not_csv': len(in_db_not_csv),
        },
        'perfect_match': perfect_match[:50],
        'acceptable_variant': acceptable_variant[:50],
        'provider_mismatch': provider_mismatch,
        'theo_win_mismatch': theo_win_mismatch,
        'release_mismatch': release_mismatch,
        'critical_error': critical_error,
        'holes_in_db': in_csv_not_db[:100],
        'db_only': in_db_not_csv[:100],
    }

    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)

    # Print summary
    total_compared = len(perfect_match) + len(acceptable_variant) + len(provider_mismatch) + len(theo_win_mismatch) + len(release_mismatch) + len(critical_error)
    print(f"\nPerfect matches: {len(perfect_match)}")
    print(f"Acceptable variants: {len(acceptable_variant)}")
    print(f"Provider mismatches: {len(provider_mismatch)}")
    print(f"Theo win mismatches: {len(theo_win_mismatch)}")
    print(f"Release mismatches: {len(release_mismatch)}")
    print(f"Critical errors: {len(critical_error)}")
    print(f"In CSV not in DB (holes): {len(in_csv_not_db)}")
    print(f"In DB not in CSV: {len(in_db_not_csv)}")
    print(f"\nReport saved to: {REPORT_PATH}")
    print("=" * 80)


if __name__ == '__main__':
    main()
