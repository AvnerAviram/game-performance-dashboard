#!/usr/bin/env python3
"""
Phase 3: RTP & Specs Validation
Flags games with missing or questionable specs (rtp, reels, rows, paylines, volatility).
"""

import json
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAMES_MASTER_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'games_master.json')
PHASE3_REPORT_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'VALIDATION_PHASE3_REPORT.json')


def load_games():
    with open(GAMES_MASTER_PATH, 'r') as f:
        data = json.load(f)
        return data['games']


def main():
    games = load_games()
    games_sorted = sorted(games, key=lambda g: g.get('performance', {}).get('theo_win', 0), reverse=True)

    rtp_missing = []
    reels_missing = []
    rows_missing = []
    valid_with_limitations = []
    rtp_out_of_range = []

    for g in games_sorted:
        specs = g.get('specs', {})
        rtp = specs.get('rtp')
        reels = specs.get('reels')
        rows = specs.get('rows')
        validity = g.get('data_validity', '')
        name = g['name']
        theo = g.get('performance', {}).get('theo_win', 0)

        item = {'name': name, 'theo_win': theo, 'provider': g.get('provider', {}).get('studio', '')}

        if rtp is None or rtp == 0:
            rtp_missing.append(item)
        elif rtp < 80 or rtp > 99:
            rtp_out_of_range.append({**item, 'rtp': rtp})

        if reels is None:
            reels_missing.append(item)
        if rows is None:
            rows_missing.append(item)

        if validity == 'valid_with_limitations':
            valid_with_limitations.append(item)

    report = {
        'phase': 3,
        'description': 'RTP & Specs Validation',
        'generated': datetime.utcnow().isoformat() + 'Z',
        'summary': {
            'rtp_missing': len(rtp_missing),
            'reels_missing': len(reels_missing),
            'rows_missing': len(rows_missing),
            'valid_with_limitations': len(valid_with_limitations),
            'rtp_out_of_range': len(rtp_out_of_range),
        },
        'rtp_missing': rtp_missing[:50],
        'reels_missing': reels_missing[:50],
        'rows_missing': rows_missing[:50],
        'rtp_out_of_range': rtp_out_of_range[:20],
        'valid_with_limitations_sample': valid_with_limitations[:30],
    }

    with open(PHASE3_REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"Phase 3 report: {PHASE3_REPORT_PATH}")
    print(f"  RTP missing: {len(rtp_missing)}")
    print(f"  Reels missing: {len(reels_missing)}")
    print(f"  Rows missing: {len(rows_missing)}")
    print(f"  valid_with_limitations: {len(valid_with_limitations)}")
    print(f"  RTP out of range: {len(rtp_out_of_range)}")


if __name__ == '__main__':
    main()
