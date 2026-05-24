#!/usr/bin/env python3
"""
CSV RECONCILIATION VALIDATOR
Compares all CSV fields with our database to find mismatches.
Uses theo_win ordering (games_master has no rank field).
"""

import json
import csv
import os
from datetime import datetime
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAMES_MASTER_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'games_master.json')

# Load our database
with open(GAMES_MASTER_PATH, 'r') as f:
    db_data = json.load(f)
    db_games_raw = db_data['games']

# Sort by theo_win descending (no rank field)
db_games = sorted(
    db_games_raw,
    key=lambda g: g.get('performance', {}).get('theo_win', 0),
    reverse=True
)

# Load CSV
csv_path = '/Users/avner/Downloads/Data Download Theme (4).csv'
csv_games = []

with open(csv_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        try:
            theo_win = float(row.get('Theo Win Index', 0) or 0)
            game_name = row.get('Game Name', '').strip()
            provider = row.get('Parent Supplier', '').strip()
            category = row.get('Game Category', '').strip().lower()
            
            # Filter for slots only (exclude table games)
            is_table = any(x in game_name.lower() for x in [
                'blackjack', 'baccarat', 'roulette', 'poker', 'craps', 
                'sic bo', 'live dealer', 'live vip', 'premium'
            ])
            
            if theo_win > 0 and game_name and not is_table:
                csv_games.append({
                    'name': game_name,
                    'provider': provider,
                    'theo_win': theo_win,
                    'market_share': row.get('% of Total GGR', '').strip(),
                    'release_date': row.get('Month, Year of OGPD Release Date', '').strip(),
                    'category': category
                })
        except:
            continue

# Sort CSV games by theo win (descending)
csv_games.sort(key=lambda x: x['theo_win'], reverse=True)

print("="*100)
print("🔍 CSV RECONCILIATION VALIDATOR - COMPREHENSIVE")
print("="*100)
print(f"\nDatabase Games: {len(db_games)}")
print(f"CSV Slot Games: {len(csv_games)}")
print(f"Expected to compare: min({len(db_games)}, {len(csv_games)}) games\n")

# Results
results = {
    'perfect_match': [],
    'name_mismatch': [],
    'provider_mismatch': [],
    'theo_win_mismatch': [],
    'release_mismatch': [],
    'critical_error': [],
    'acceptable_variant': []
}

# Compare game by game (by position: both sorted by theo_win desc)
compare_count = min(len(db_games), len(csv_games))
denom = max(compare_count, 1)

for idx in range(compare_count):
    rank = idx + 1  # 1-based for display
    db_game = db_games[idx]
    csv_game = csv_games[idx]

    if not db_game or not csv_game:
        continue
    
    # Extract data
    db_name = db_game['name'].lower().strip()
    csv_name = csv_game['name'].lower().strip()
    
    db_provider = db_game.get('provider', {}).get('studio', '').lower().strip()
    csv_provider = csv_game['provider'].lower().strip()
    
    db_theo = db_game.get('performance', {}).get('theo_win', 0)
    csv_theo = csv_game['theo_win']
    
    # Check matches
    name_match = db_name == csv_name
    name_similar = csv_name in db_name or db_name in csv_name
    provider_match = db_provider == csv_provider or csv_provider in db_provider
    theo_match = abs(db_theo - csv_theo) < 0.1
    
    # Categorize
    if name_match and provider_match and theo_match:
        results['perfect_match'].append(rank)
    else:
        issue = {
            'rank': rank,
            'csv_name': csv_game['name'],
            'db_name': db_game['name'],
            'csv_provider': csv_game['provider'],
            'db_provider': db_game.get('provider', {}).get('studio', ''),
            'csv_theo': csv_theo,
            'db_theo': db_theo,
            'csv_release': csv_game['release_date'],
            'db_release': f"{db_game.get('release', {}).get('year', 'N/A')}"
        }
        
        # Critical: Completely different game
        if not name_match and not name_similar:
            results['critical_error'].append(issue)
        # Name mismatch but similar (variant)
        elif not name_match and name_similar:
            results['acceptable_variant'].append(issue)
        # Provider mismatch
        elif not provider_match:
            results['provider_mismatch'].append(issue)
        # Theo win mismatch
        elif not theo_match:
            results['theo_win_mismatch'].append(issue)

# Generate report
print("="*100)
print("📊 VALIDATION RESULTS")
print("="*100)

print(f"\n✅ PERFECT MATCHES: {len(results['perfect_match'])} games ({len(results['perfect_match'])/max(compare_count,1)*100:.1f}%)")

print(f"\n🚩 CRITICAL ERRORS: {len(results['critical_error'])} games")
if results['critical_error']:
    print("\n" + "-"*100)
    for issue in results['critical_error'][:20]:
        print(f"\nRank {issue['rank']:3d}:")
        print(f"  CSV:  '{issue['csv_name']}' ({issue['csv_provider']})")
        print(f"  DB:   '{issue['db_name']}' ({issue['db_provider']})")
        print(f"  Theo: CSV={issue['csv_theo']:.2f} vs DB={issue['db_theo']:.2f}")
        print(f"  🚨 COMPLETELY DIFFERENT GAME!")
    if len(results['critical_error']) > 20:
        print(f"\n... and {len(results['critical_error']) - 20} more critical errors")

print(f"\n⚠️ PROVIDER MISMATCHES: {len(results['provider_mismatch'])} games")
if results['provider_mismatch']:
    print("\n" + "-"*100)
    for issue in results['provider_mismatch'][:10]:
        print(f"\nRank {issue['rank']:3d}: {issue['db_name']}")
        print(f"  CSV Provider: {issue['csv_provider']}")
        print(f"  DB Provider:  {issue['db_provider']}")
    if len(results['provider_mismatch']) > 10:
        print(f"\n... and {len(results['provider_mismatch']) - 10} more")

print(f"\n⚠️ THEO WIN MISMATCHES: {len(results['theo_win_mismatch'])} games")
if results['theo_win_mismatch']:
    print("\n" + "-"*100)
    for issue in results['theo_win_mismatch'][:10]:
        print(f"\nRank {issue['rank']:3d}: {issue['db_name']}")
        print(f"  CSV Theo: {issue['csv_theo']:.2f}")
        print(f"  DB Theo:  {issue['db_theo']:.2f}")
        print(f"  Diff: {abs(issue['csv_theo'] - issue['db_theo']):.2f}")
    if len(results['theo_win_mismatch']) > 10:
        print(f"\n... and {len(results['theo_win_mismatch']) - 10} more")

print(f"\n✅ ACCEPTABLE VARIANTS: {len(results['acceptable_variant'])} games")
if results['acceptable_variant']:
    print("\n" + "-"*100)
    for issue in results['acceptable_variant'][:10]:
        print(f"\nRank {issue['rank']:3d}:")
        print(f"  CSV:  '{issue['csv_name']}'")
        print(f"  DB:   '{issue['db_name']}'")
        print(f"  ℹ️  Same game, different variant name (acceptable)")
    if len(results['acceptable_variant']) > 10:
        print(f"\n... and {len(results['acceptable_variant']) - 10} more")

# Summary
total_issues = (len(results['critical_error']) + len(results['provider_mismatch']) + 
                len(results['theo_win_mismatch']))

print("\n" + "="*100)
print("📊 SUMMARY")
print("="*100)
print(f"\n✅ Perfect Matches: {len(results['perfect_match'])}/{denom} ({len(results['perfect_match'])/denom*100:.1f}%)")
print(f"✅ Acceptable Variants: {len(results['acceptable_variant'])}/{denom} ({len(results['acceptable_variant'])/denom*100:.1f}%)")
print(f"⚠️ Total Issues: {total_issues}/{denom} ({total_issues/denom*100:.1f}%)")
print(f"   - Critical (wrong game): {len(results['critical_error'])}")
print(f"   - Provider mismatch: {len(results['provider_mismatch'])}")
print(f"   - Theo win mismatch: {len(results['theo_win_mismatch'])}")

accuracy = (len(results['perfect_match']) + len(results['acceptable_variant'])) / denom * 100
print(f"\n🎯 OVERALL CSV ALIGNMENT: {accuracy:.1f}%")

if len(results['critical_error']) > 0:
    print(f"\n🚨 ACTION REQUIRED: {len(results['critical_error'])} critical errors must be fixed!")
else:
    print(f"\n✅ NO CRITICAL ERRORS FOUND!")

print("="*100)

# Save detailed report
with open(os.path.join(SCRIPT_DIR, 'CSV_RECONCILIATION_REPORT.json'), 'w') as f:
    json.dump(results, f, indent=2)

print("\n💾 Detailed report saved to: CSV_RECONCILIATION_REPORT.json")
print("="*100)
