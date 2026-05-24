#!/usr/bin/env python3
"""
Phase 2: Game Names & Performance Data
Validates game names vs CSV and performance (theo_win, market_share_percent).
Uses CSV as authoritative source. Outputs report for corrections.
"""

import json
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAMES_MASTER_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'games_master.json')
PHASE0_REPORT_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'VALIDATION_PHASE0_REPORT.json')
PHASE2_REPORT_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'VALIDATION_PHASE2_REPORT.json')


def load_games():
    with open(GAMES_MASTER_PATH, 'r') as f:
        data = json.load(f)
        return data['games']


def load_phase0():
    if os.path.exists(PHASE0_REPORT_PATH):
        with open(PHASE0_REPORT_PATH, 'r') as f:
            return json.load(f)
    return {}


def main():
    games = load_games()
    phase0 = load_phase0()

    # Build CSV baseline from Phase 0 acceptable_variant + perfect_match + provider_mismatch
    csv_baseline = {}
    for key in ['perfect_match', 'acceptable_variant', 'provider_mismatch', 'theo_win_mismatch', 'release_mismatch']:
        for item in phase0.get(key, []):
            db_name = item.get('db_name', '')
            csv_name = item.get('csv_name', '')
            csv_theo = item.get('csv_theo')
            csv_market = item.get('csv_market_share')
            if db_name and csv_theo is not None:
                csv_baseline[db_name.lower()] = {
                    'csv_name': csv_name,
                    'theo_win': csv_theo,
                    'market_share': csv_market or 0,
                }

    name_issues = []
    performance_issues = []

    for g in games:
        name = g['name']
        name_lower = name.lower()
        perf = g.get('performance', {})
        db_theo = perf.get('theo_win')
        db_market = perf.get('market_share_percent') or 0

        baseline = csv_baseline.get(name_lower)
        if not baseline:
            continue

        csv_name = baseline['csv_name']
        csv_theo = baseline['theo_win']
        csv_market = baseline.get('market_share') or 0

        # Name mismatch (variant)
        if name != csv_name:
            name_issues.append({
                'game_id': g.get('id'),
                'db_name': name,
                'csv_name': csv_name,
                'provider': g.get('provider', {}).get('studio', ''),
                'note': 'Name variant - verify official title'
            })

        # Performance mismatch
        if db_theo is not None and abs(db_theo - csv_theo) >= 0.01:
            performance_issues.append({
                'game_id': g.get('id'),
                'name': name,
                'db_theo_win': db_theo,
                'csv_theo_win': csv_theo,
                'db_market_share': db_market,
                'csv_market_share': csv_market,
            })
        if abs((db_market or 0) - csv_market) >= 0.01:
            performance_issues.append({
                'game_id': g.get('id'),
                'name': name,
                'field': 'market_share',
                'db_value': db_market,
                'csv_value': csv_market,
            })

    report = {
        'phase': 2,
        'description': 'Game Names & Performance Data',
        'generated': datetime.utcnow().isoformat() + 'Z',
        'summary': {
            'name_issues': len(name_issues),
            'performance_issues': len(performance_issues),
        },
        'name_issues': name_issues,
        'performance_issues': performance_issues,
    }

    with open(PHASE2_REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"Phase 2 report: {PHASE2_REPORT_PATH}")
    print(f"  Name issues: {len(name_issues)}")
    print(f"  Performance issues: {len(performance_issues)}")


if __name__ == '__main__':
    main()
