#!/usr/bin/env python3
"""
Phase 1: Provider Verification Infrastructure
Prioritizes games for provider verification, supports batching, checkpointing, rate limits.
Use with web search (SlotCatalog, provider sites) to verify. Apply corrections via --apply.
"""

import json
import os
import sys
import argparse
import time
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAMES_MASTER_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'games_master.json')
CORRECTIONS_LOG_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'CSV_CORRECTIONS_LOG.json')
VALIDATION_CACHE_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'validation_cache.json')
PHASE1_REPORT_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'VALIDATION_PHASE1_REPORT.json')

# Load Phase 0 report for CSV provider baseline
PHASE0_REPORT_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'VALIDATION_PHASE0_REPORT.json')

BATCH_SIZE = 18
BATCH_DELAY_SEC = 4
SEARCH_DELAY_SEC = 2.5


def load_games():
    with open(GAMES_MASTER_PATH, 'r') as f:
        data = json.load(f)
        return data['games']


def load_corrections_log():
    with open(CORRECTIONS_LOG_PATH, 'r') as f:
        return json.load(f)


def load_phase0_report():
    if os.path.exists(PHASE0_REPORT_PATH):
        with open(PHASE0_REPORT_PATH, 'r') as f:
            return json.load(f)
    return {'provider_mismatch': []}


def load_validation_cache():
    if os.path.exists(VALIDATION_CACHE_PATH):
        with open(VALIDATION_CACHE_PATH, 'r') as f:
            return json.load(f)
    return {'version': '1.0', 'entries': {}, 'checkpoint': {}}


def save_validation_cache(cache):
    cache['last_updated'] = datetime.utcnow().isoformat() + 'Z'
    with open(VALIDATION_CACHE_PATH, 'w') as f:
        json.dump(cache, f, indent=2)


def get_csv_provider_map():
    """Build map of game name -> CSV provider from Phase 0 provider_mismatch."""
    report = load_phase0_report()
    mm = report.get('provider_mismatch', [])
    return {(r['db_name'].lower(), r['db_theo']): r['csv_provider'] for r in mm}


def prioritize_games(games, corrections_log, cache):
    """Priority: 1) provider.verified false, 2) flagged, 3) provider mismatch, 4) by theo_win."""
    csv_map = get_csv_provider_map()
    flagged_names = {f['game_name'].lower() for f in corrections_log.get('flagged_for_manual_review', [])}
    already_corrected = {c['game_name'].lower() for c in corrections_log.get('provider_corrections', [])}
    cached = set(cache.get('entries', {}).keys())

    tier1 = []  # provider.verified false or not in CSV
    tier2 = []  # flagged_for_manual_review
    tier3 = []  # provider mismatch vs CSV
    tier4 = []  # rest by theo_win

    for g in games:
        name = g['name']
        name_lower = name.lower()
        theo = g.get('performance', {}).get('theo_win', 0)
        provider = g.get('provider', {})
        studio = provider.get('studio', '')
        verified = provider.get('verified', True)

        if name_lower in already_corrected or g.get('id') in cached:
            continue

        csv_provider = csv_map.get((name_lower, theo))
        db_provider_lower = studio.lower()

        if not verified or (csv_provider and csv_provider.lower() not in db_provider_lower and db_provider_lower not in csv_provider.lower()):
            if name_lower in flagged_names:
                tier2.append((g, csv_provider, 'flagged'))
            elif not verified:
                tier1.append((g, csv_provider, 'unverified'))
            else:
                tier3.append((g, csv_provider, 'mismatch'))
        elif name_lower in flagged_names:
            tier2.append((g, csv_provider, 'flagged'))
        else:
            tier4.append((g, None, 'routine'))

    # Sort tier4 by theo_win desc
    tier4.sort(key=lambda x: x[0].get('performance', {}).get('theo_win', 0), reverse=True)

    ordered = tier1 + tier2 + tier3 + tier4
    return ordered


def generate_phase1_report(games_priority, output_path, batch_size=BATCH_SIZE):
    """Generate report of games to verify with batch assignments."""
    batches = []
    for i in range(0, len(games_priority), batch_size):
        batch = games_priority[i:i + BATCH_SIZE]
        batch_games = []
        for g, csv_prov, reason in batch:
            batch_games.append({
                'id': g.get('id'),
                'name': g['name'],
                'current_provider': g.get('provider', {}).get('studio', ''),
                'csv_provider': csv_prov,
                'theo_win': g.get('performance', {}).get('theo_win'),
                'priority_reason': reason,
            })
        batches.append({
            'batch_index': len(batches),
            'games': batch_games,
            'batch_size': len(batch_games),
        })

    report = {
        'phase': 1,
        'description': 'Provider Verification',
        'generated': datetime.utcnow().isoformat() + 'Z',
        'config': {
            'batch_size': batch_size,
            'batch_delay_sec': BATCH_DELAY_SEC,
            'search_delay_sec': SEARCH_DELAY_SEC,
        },
        'summary': {
            'total_to_verify': len(games_priority),
            'batches': len(batches),
        },
        'batches': batches,
    }

    with open(output_path, 'w') as f:
        json.dump(report, f, indent=2)

    return report


def apply_provider_correction(data, game_id, game_name, corrected_provider, sources=None):
    """Apply a provider correction to games_master and append to CSV_CORRECTIONS_LOG."""
    for g in data['games']:
        if g.get('id') == game_id or g['name'] == game_name:
            old = g.get('provider', {}).get('studio', '')
            g['provider']['studio'] = corrected_provider
            g['provider']['parent'] = corrected_provider
            g['provider']['display_name'] = corrected_provider
            g['provider']['verified'] = True
            if 'audit' in g:
                g['audit']['updated'] = datetime.utcnow().isoformat() + 'Z'
                g['audit']['notes'] = (g['audit'].get('notes', '') + f' Provider corrected to {corrected_provider}.').strip()
            return old
    return None


def main():
    parser = argparse.ArgumentParser(description='Phase 1: Provider Verification')
    parser.add_argument('--list', action='store_true', help='List games to verify (prioritized)')
    parser.add_argument('--report', action='store_true', help='Generate VALIDATION_PHASE1_REPORT.json')
    parser.add_argument('--batch-size', type=int, default=BATCH_SIZE)
    parser.add_argument('--apply', type=str, help='JSON file with corrections to apply')
    parser.add_argument('--dry-run', action='store_true', help='Do not write files when applying')
    args = parser.parse_args()

    batch_size = args.batch_size

    games = load_games()
    corrections = load_corrections_log()
    cache = load_validation_cache()

    prioritized = prioritize_games(games, corrections, cache)

    if args.list:
        print(f"Games to verify (priority order): {len(prioritized)}")
        for i, (g, csv_prov, reason) in enumerate(prioritized[:50]):
            print(f"  {i+1}. {g['name']} | {g.get('provider',{}).get('studio','')} | CSV: {csv_prov or 'N/A'} | {reason}")
        if len(prioritized) > 50:
            print(f"  ... and {len(prioritized)-50} more")
        return

    if args.report:
        report = generate_phase1_report(prioritized, PHASE1_REPORT_PATH, batch_size)
        print(f"Phase 1 report saved: {PHASE1_REPORT_PATH}")
        print(f"  Total to verify: {report['summary']['total_to_verify']}")
        print(f"  Batches: {report['summary']['batches']}")
        return

    if args.apply:
        with open(args.apply, 'r') as f:
            corrections_input = json.load(f)
        corrections_list = corrections_input.get('provider_corrections', corrections_input) if isinstance(corrections_input.get('provider_corrections'), list) else [corrections_input]
        if not isinstance(corrections_list, list):
            corrections_list = [corrections_list]

        with open(GAMES_MASTER_PATH, 'r') as f:
            data = json.load(f)

        applied = []
        for c in corrections_list:
            game_id = c.get('game_id')
            game_name = c.get('game_name')
            corrected = c.get('corrected_provider')
            sources = c.get('verification_sources', [])
            if not game_name or not corrected:
                continue
            old = apply_provider_correction(data, game_id, game_name, corrected, sources)
            if old:
                applied.append({'game_name': game_name, 'old': old, 'new': corrected})

        if applied and not args.dry_run:
            with open(GAMES_MASTER_PATH, 'w') as f:
                json.dump(data, f, indent=2)
            for a in applied:
                corrections['provider_corrections'].append({
                    'game_name': a['game_name'],
                    'csv_provider': a['old'],
                    'corrected_provider': a['new'],
                    'verified_date': datetime.utcnow().strftime('%Y-%m-%d'),
                })
            with open(CORRECTIONS_LOG_PATH, 'w') as f:
                json.dump(corrections, f, indent=2)
            print(f"Applied {len(applied)} corrections")
        else:
            print(f"Would apply {len(applied)} corrections (dry-run)" if args.dry_run else "No changes")

    if not (args.list or args.report or args.apply):
        # Default: generate report
        generate_phase1_report(prioritized, PHASE1_REPORT_PATH, batch_size)
        print(f"Phase 1 report: {PHASE1_REPORT_PATH}")
        print(f"  Run with --list to see priority order, --apply <file> to apply corrections")


if __name__ == '__main__':
    main()
