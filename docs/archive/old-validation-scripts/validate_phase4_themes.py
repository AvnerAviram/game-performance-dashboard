#!/usr/bin/env python3
"""
Phase 4: Themes & Mechanics Validation
Flags games with generic/placeholder themes (UNKNOWN, FLAGGED, Video Slots) or generic mechanics.
"""

import json
import os
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAMES_MASTER_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'games_master.json')
PHASE4_REPORT_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'VALIDATION_PHASE4_REPORT.json')

GENERIC_THEMES = ('unknown', 'flagged', 'video slots', 'general')
GENERIC_MECHANICS = ('video slots', 'generic', 'unknown')


def load_games():
    with open(GAMES_MASTER_PATH, 'r') as f:
        data = json.load(f)
        return data['games']


def main():
    games = load_games()
    games_sorted = sorted(games, key=lambda g: g.get('performance', {}).get('theo_win', 0), reverse=True)

    theme_issues = []
    mechanic_issues = []
    confidence_flagged = []

    for g in games_sorted:
        name = g['name']
        theo = g.get('performance', {}).get('theo_win', 0)
        provider = g.get('provider', {}).get('studio', '')
        item = {'name': name, 'theo_win': theo, 'provider': provider}

        theme = g.get('theme', {})
        primary = (theme.get('primary') or '').lower().strip()
        consolidated = (theme.get('consolidated') or '').lower().strip()
        if any(x in primary or x in consolidated for x in GENERIC_THEMES):
            theme_issues.append({**item, 'theme_primary': theme.get('primary'), 'theme_consolidated': theme.get('consolidated')})

        mechanic = g.get('mechanic', {})
        mech_primary = (mechanic.get('primary') or '').lower().strip()
        if mech_primary in GENERIC_MECHANICS or not mech_primary:
            mechanic_issues.append({**item, 'mechanic_primary': mechanic.get('primary')})

        confidence = (g.get('classification', {}) or {}).get('confidence', '') or ''
        if 'FLAGGED' in confidence or '70%' in confidence:
            confidence_flagged.append({**item, 'confidence': confidence})

    report = {
        'phase': 4,
        'description': 'Themes & Mechanics Validation',
        'generated': datetime.utcnow().isoformat() + 'Z',
        'summary': {
            'theme_issues': len(theme_issues),
            'mechanic_issues': len(mechanic_issues),
            'confidence_flagged': len(confidence_flagged),
        },
        'theme_issues': theme_issues[:80],
        'mechanic_issues': mechanic_issues[:80],
        'confidence_flagged': confidence_flagged,
    }

    with open(PHASE4_REPORT_PATH, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"Phase 4 report: {PHASE4_REPORT_PATH}")
    print(f"  Theme issues: {len(theme_issues)}")
    print(f"  Mechanic issues: {len(mechanic_issues)}")
    print(f"  Confidence FLAGGED: {len(confidence_flagged)}")


if __name__ == '__main__':
    main()
