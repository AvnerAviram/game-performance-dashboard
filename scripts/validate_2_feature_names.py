#!/usr/bin/env python3
"""
FEATURE NAME VALIDATOR
Checks if any game names are actually feature/mechanic names.
Also validates mechanic.features list completeness.
"""

import json
import os

# Resolve paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAMES_MASTER_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'games_master.json')

# Load database
with open(GAMES_MASTER_PATH, 'r') as f:
    data = json.load(f)
    games = data['games']

# Sort by theo_win descending (games_master has no rank field)
games_sorted = sorted(games, key=lambda g: g.get('performance', {}).get('theo_win', 0), reverse=True)

print("="*100)
print("🚩 FEATURE NAME VALIDATOR - Finding 'Money Charge' Type Errors")
print("="*100)

# Known feature/mechanic names that could be confused as games
FEATURE_DICTIONARY = {
    # Branded features (provider-specific)
    'lightning link': {'type': 'Aristocrat feature', 'severity': 'CRITICAL'},
    'dragon link': {'type': 'Aristocrat feature', 'severity': 'CRITICAL'},
    'fire link': {'type': 'Light & Wonder feature', 'severity': 'CRITICAL'},
    'money charge': {'type': 'AGS feature', 'severity': 'CRITICAL'},
    'cash charge': {'type': 'AGS feature', 'severity': 'CRITICAL'},
    'wicked wheel': {'type': 'Everi feature', 'severity': 'CRITICAL'},
    'wonder wheel': {'type': 'Everi feature', 'severity': 'CRITICAL'},
    'buffalo link': {'type': 'Aristocrat feature', 'severity': 'CRITICAL'},
    'reel king': {'type': 'Inspired feature', 'severity': 'HIGH'},
    'jackpot king': {'type': 'Blueprint feature', 'severity': 'HIGH'},
    'lock it link': {'type': 'Light & Wonder feature', 'severity': 'HIGH'},
    'prosperity link': {'type': 'Link feature', 'severity': 'HIGH'},
    'cash vault': {'type': 'AGS feature', 'severity': 'MEDIUM'},
    'mighty cash': {'type': 'Aristocrat feature', 'severity': 'MEDIUM'},
    
    # Generic mechanics (not game names)
    'hold & spin': {'type': 'Generic mechanic', 'severity': 'CRITICAL'},
    'hold and spin': {'type': 'Generic mechanic', 'severity': 'CRITICAL'},
    'link & win': {'type': 'Generic mechanic', 'severity': 'CRITICAL'},
    'link and win': {'type': 'Generic mechanic', 'severity': 'CRITICAL'},
    'respins': {'type': 'Generic mechanic', 'severity': 'HIGH'},
    'free spins': {'type': 'Generic feature', 'severity': 'HIGH'},
    
    # Known exceptions (these ARE actual games)
    'cash eruption': {'type': 'EXCEPTION - Real IGT game', 'severity': 'OK'},
    'lightning': {'type': 'EXCEPTION - Could be game', 'severity': 'OK'},
}

# Results
results = {
    'critical': [],  # Definitely feature names
    'high_risk': [],  # Likely feature names
    'medium_risk': [],  # Could be either
    'flagged_mechanics': [],  # Mechanic field has feature name
    'ok': [],  # Known exceptions
    'features_list_issues': []  # mechanic.features missing or generic
}

print(f"\n🔍 Scanning {len(games_sorted)} games...\n")

# Check each game (use 1-based ordinal for display)
for idx, game in enumerate(games_sorted):
    ordinal = idx + 1  # 1-based for display
    name = game['name'].lower().strip()
    provider = game.get('provider', {}).get('studio', 'Unknown')
    confidence = game.get('classification', {}).get('confidence', '')
    mechanic = game.get('mechanic', {}).get('primary', '').lower()
    features = game.get('mechanic', {}).get('features', [])

    # Check mechanic.features list
    if not features or len(features) == 0:
        results['features_list_issues'].append({
            'ordinal': ordinal,
            'name': game['name'],
            'provider': provider,
            'issue': 'mechanic.features is empty'
        })
    elif len(features) == 1 and features[0].lower() in ('video slots', 'generic', 'unknown'):
        results['features_list_issues'].append({
            'ordinal': ordinal,
            'name': game['name'],
            'provider': provider,
            'features': features,
            'issue': 'mechanic.features too generic (only 1 generic item)'
        })

    # Check game name against feature dictionary
    for feature, info in FEATURE_DICTIONARY.items():
        # Exact match
        if name == feature:
            issue = {
                'ordinal': ordinal,
                'name': game['name'],
                'provider': provider,
                'confidence': confidence,
                'feature_type': info['type'],
                'severity': info['severity'],
                'issue': f"Game name exactly matches '{feature}' ({info['type']})"
            }
            
            if info['severity'] == 'CRITICAL':
                results['critical'].append(issue)
            elif info['severity'] == 'HIGH':
                results['high_risk'].append(issue)
            elif info['severity'] == 'MEDIUM':
                results['medium_risk'].append(issue)
            elif info['severity'] == 'OK':
                results['ok'].append(issue)
        
        # Short name containing feature (2-3 words)
        elif feature in name and len(name.split()) <= 3:
            issue = {
                'ordinal': ordinal,
                'name': game['name'],
                'provider': provider,
                'confidence': confidence,
                'feature_type': info['type'],
                'severity': 'REVIEW',
                'issue': f"Short name contains '{feature}' - verify if standalone game"
            }
            results['high_risk'].append(issue)
    
    # Check if mechanic field contains a feature name
    for feature, info in FEATURE_DICTIONARY.items():
        if feature in mechanic and info['severity'] in ['CRITICAL', 'HIGH']:
            issue = {
                'ordinal': ordinal,
                'name': game['name'],
                'provider': provider,
                'mechanic': mechanic,
                'feature_type': info['type'],
                'issue': f"Mechanic field contains feature name '{feature}'"
            }
            results['flagged_mechanics'].append(issue)

# Print results
print("="*100)
print("📊 VALIDATION RESULTS")
print("="*100)

print(f"\n🚨 CRITICAL ERRORS: {len(results['critical'])} games")
if results['critical']:
    print("\n" + "-"*100)
    for issue in results['critical']:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']}")
        print(f"  Provider: {issue['provider']}")
        print(f"  Confidence: {issue['confidence']}")
        print(f"  🚨 {issue['issue']}")
        print(f"  ❌ ACTION: This is a FEATURE NAME, not a game! Find correct game from CSV.")

print(f"\n⚠️ HIGH RISK: {len(results['high_risk'])} games")
if results['high_risk']:
    print("\n" + "-"*100)
    for issue in results['high_risk'][:15]:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']}")
        print(f"  Provider: {issue['provider']}")
        print(f"  ⚠️ {issue['issue']}")
        print(f"  ⚠️ ACTION: Verify this is a standalone game, not just a feature.")
    if len(results['high_risk']) > 15:
        print(f"\n... and {len(results['high_risk']) - 15} more high-risk games")

print(f"\n📊 MEDIUM RISK: {len(results['medium_risk'])} games")
if results['medium_risk']:
    print("\n" + "-"*100)
    for issue in results['medium_risk'][:10]:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']}")
        print(f"  ℹ️ {issue['issue']}")
    if len(results['medium_risk']) > 10:
        print(f"\n... and {len(results['medium_risk']) - 10} more")

print(f"\n⚠️ MECHANIC FIELD ISSUES: {len(results['flagged_mechanics'])} games")
if results['flagged_mechanics']:
    print("\n" + "-"*100)
    for issue in results['flagged_mechanics'][:10]:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']}")
        print(f"  Mechanic: {issue['mechanic']}")
        print(f"  ⚠️ {issue['issue']}")
        print(f"  ⚠️ ACTION: Mechanic should be generic (Hold & Win, Free Spins, etc.), not branded feature")
    if len(results['flagged_mechanics']) > 10:
        print(f"\n... and {len(results['flagged_mechanics']) - 10} more")

print(f"\n🚩 MECHANIC.FEATURES ISSUES: {len(results['features_list_issues'])} games")
if results['features_list_issues']:
    for issue in results['features_list_issues'][:15]:
        print(f"  • Ordinal {issue['ordinal']:3d}: {issue['name']} - {issue['issue']}")
    if len(results['features_list_issues']) > 15:
        print(f"  ... and {len(results['features_list_issues']) - 15} more")

print(f"\n✅ KNOWN EXCEPTIONS: {len(results['ok'])} games")
if results['ok']:
    for issue in results['ok']:
        print(f"  • Ordinal {issue['ordinal']:3d}: {issue['name']} - {issue['feature_type']}")

# Summary
total_issues = len(results['critical']) + len(results['high_risk']) + len(results['medium_risk'])

print("\n" + "="*100)
print("📊 SUMMARY")
print("="*100)
print(f"\n🚨 Critical Errors (Feature names as games): {len(results['critical'])}")
print(f"⚠️ High Risk (Needs verification): {len(results['high_risk'])}")
print(f"📊 Medium Risk (Review recommended): {len(results['medium_risk'])}")
print(f"⚠️ Mechanic Field Issues: {len(results['flagged_mechanics'])}")
print(f"⚠️ mechanic.features Issues: {len(results['features_list_issues'])}")
print(f"\n⚠️ TOTAL ISSUES TO REVIEW: {total_issues + len(results['flagged_mechanics']) + len(results['features_list_issues'])}")

if len(results['critical']) > 0:
    print(f"\n🚨 ACTION REQUIRED: {len(results['critical'])} feature names must be replaced with actual games!")
else:
    print(f"\n✅ NO CRITICAL FEATURE-AS-GAME ERRORS FOUND!")

print("="*100)

# Save report
with open(os.path.join(SCRIPT_DIR, 'FEATURE_NAME_REPORT.json'), 'w') as f:
    json.dump(results, f, indent=2)

print("\n💾 Detailed report saved to: FEATURE_NAME_REPORT.json")
print("="*100)
