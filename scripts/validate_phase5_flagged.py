#!/usr/bin/env python3
"""
Phase 5: FLAGGED & Cleanup
Lists games with FLAGGED confidence, flagged_for_manual_review, and invalid/duplicate status.
"""

import json
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAMES_MASTER_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'games_master.json')
CORRECTIONS_LOG_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'CSV_CORRECTIONS_LOG.json')
PHASE5_REPORT_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'VALIDATION_PHASE5_REPORT.json')


def load_games():
    with open(GAMES_MASTER_PATH, 'r') as f:
        data = json.load(f)
        return data['games']


def load_corrections():
    with open(CORRECTIONS_LOG_PATH, 'r') as f:
        return json.load(f)


def main():
    games = load_games()
    corrections = load_corrections()

    confidence_flagged = []
    invalid_games = []
    duplicate_games = []
    flagged_for_review = corrections.get('flagged_for_manual_review', [])

    for g in games:
        name = g['name']
        validity = g.get('data_validity', 'valid')
        confidence = (g.get('classification', {}) or {}).get('confidence', '') or ''
        theo = g.get('performance', {}).get('theo_win', 0)
        provider = g.get('provider', {}).get('studio', '')

        item = {'name': name, 'theo_win': theo, 'provider': provider, 'id': g.get('id')}

        if 'FLAGGED' in confidence or '70%' in confidence:
            confidence_flagged.append({**item, 'confidence': confidence, 'data_validity': validity})

        if validity == 'invalid':
            invalid_games.append({**item, 'reason': g.get('data_validity_reason', '')})
        elif validity == 'duplicate':
            duplicate_games.append({**item, 'reason': g.get('data_validity_reason', '')})

    report = {
        'phase': 5,
        'description': 'FLAGGED & Cleanup',
        'generated': datetime.utcnow().isoformat() + 'Z',
        'summary': {
            'confidence_flagged': len(confidence_flagged),
            'invalid': len(invalid_games),
            'duplicate': len(duplicate_games),
            'flagged_for_manual_review': len(flagged_for_review),
        },
        'confidence_flagged': confidence_flagged,
        'invalid_games': invalid_games,
        'duplicate_games': duplicate_games,
        'flagged_for_manual_review': flagged_for_review,
    }

    with open(PHASE5_REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"Phase 5 report: {PHASE5_REPORT_PATH}")
    print(f"  Confidence FLAGGED: {len(confidence_flagged)}")
    print(f"  Invalid: {len(invalid_games)}")
    print(f"  Duplicate: {len(duplicate_games)}")
    print(f"  Flagged for manual review: {len(flagged_for_review)}")


if __name__ == '__main__':
    main()
