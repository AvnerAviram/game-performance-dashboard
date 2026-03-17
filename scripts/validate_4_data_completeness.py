#!/usr/bin/env python3
"""
DATA COMPLETENESS VALIDATOR
Checks if all required fields are present and complete
"""

import json

import os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAMES_MASTER_PATH = os.path.join(SCRIPT_DIR, '..', 'game_analytics_export', 'data', 'games_master.json')

# Load database
with open(GAMES_MASTER_PATH, 'r') as f:
    data = json.load(f)
    games = data['games']

# Sort by theo_win (no rank field)
games = sorted(games, key=lambda g: g.get('performance', {}).get('theo_win', 0), reverse=True)

print("="*100)
print("📊 DATA COMPLETENESS VALIDATOR - Field Quality Check")
print("="*100)

# Define required fields and quality standards
FIELD_REQUIREMENTS = {
    'name': {'required': True, 'min_length': 3},
    'provider.studio': {'required': True, 'min_length': 2},
    'specs.rtp': {'required': True, 'min_value': 80, 'max_value': 99},
    'specs.volatility': {'required': True, 'allowed': ['low', 'medium', 'high', 'very high', 'medium-high', 'medium-low', 'unknown']},
    'specs.reels': {'required': True, 'min_value': 1, 'max_value': 10},
    'specs.rows': {'required': False, 'min_value': 1, 'max_value': 10},
    'release.year': {'required': True, 'min_value': 1990, 'max_value': 2026},
    'theme.primary': {'required': True, 'min_length': 3},
    'theme.details': {'required': True, 'min_length': 100, 'target_length': 200},
    'mechanic.primary': {'required': True, 'min_length': 3},
    'mechanic.features': {'required': True, 'min_items': 1, 'target_items': 3},
    'performance.theo_win': {'required': True, 'min_value': 0.1},
}

results = {
    'perfect': [],  # All fields perfect
    'excellent': [],  # Minor issues only
    'good': [],  # Some quality issues
    'needs_work': [],  # Missing required or quality issues
    'critical': [],  # Missing critical fields
    'field_stats': {}
}

print(f"\n🔍 Analyzing {len(games)} games...\n")

# Field statistics
field_stats = {field: {'present': 0, 'missing': 0, 'quality_issues': 0} for field in FIELD_REQUIREMENTS.keys()}

# Analyze each game
for idx, game in enumerate(games):
    ordinal = idx + 1
    name = game['name']
    confidence = game.get('classification', {}).get('confidence', '')
    
    issues = []
    quality_issues = []
    critical_missing = []
    score = 100  # Start at 100, deduct points
    
    # Check each required field
    for field_path, requirements in FIELD_REQUIREMENTS.items():
        # Navigate nested path
        keys = field_path.split('.')
        value = game
        for key in keys:
            value = value.get(key) if isinstance(value, dict) else None
            if value is None:
                break
        
        # Check presence
        if value is None or value == '' or value == []:
            if requirements['required']:
                critical_missing.append(field_path)
                field_stats[field_path]['missing'] += 1
                score -= 20
            else:
                quality_issues.append(f"Optional field '{field_path}' missing")
                field_stats[field_path]['missing'] += 1
                score -= 5
            continue
        
        field_stats[field_path]['present'] += 1
        
        # Check quality
        if 'min_length' in requirements:
            if isinstance(value, str) and len(value) < requirements['min_length']:
                issues.append(f"{field_path} too short ({len(value)} < {requirements['min_length']})")
                field_stats[field_path]['quality_issues'] += 1
                score -= 10
        
        if 'min_value' in requirements:
            if isinstance(value, (int, float)) and value < requirements['min_value']:
                issues.append(f"{field_path} too low ({value} < {requirements['min_value']})")
                field_stats[field_path]['quality_issues'] += 1
                score -= 10
        
        if 'max_value' in requirements:
            if isinstance(value, (int, float)) and value > requirements['max_value']:
                issues.append(f"{field_path} too high ({value} > {requirements['max_value']})")
                field_stats[field_path]['quality_issues'] += 1
                score -= 10
        
        if 'allowed' in requirements:
            if isinstance(value, str) and value.lower() not in requirements['allowed']:
                issues.append(f"{field_path} invalid value: {value}")
                field_stats[field_path]['quality_issues'] += 1
                score -= 10
        
        if 'min_items' in requirements:
            if isinstance(value, list) and len(value) < requirements['min_items']:
                issues.append(f"{field_path} needs {requirements['min_items']} items (has {len(value)})")
                field_stats[field_path]['quality_issues'] += 1
                score -= 10
        
        # Target quality checks (deduct fewer points)
        if 'target_length' in requirements:
            if isinstance(value, str) and len(value) < requirements['target_length']:
                quality_issues.append(f"{field_path} below target length ({len(value)} < {requirements['target_length']})")
                score -= 2
        
        if 'target_items' in requirements:
            if isinstance(value, list) and len(value) < requirements['target_items']:
                quality_issues.append(f"{field_path} below target items ({len(value)} < {requirements['target_items']})")
                score -= 2
    
    issue_summary = {
        'ordinal': ordinal,
        'name': name,
        'confidence': confidence,
        'score': max(0, score),
        'critical_missing': critical_missing,
        'issues': issues,
        'quality_issues': quality_issues
    }
    
    # Categorize
    if score >= 98 and not issues and len(quality_issues) <= 1:
        results['perfect'].append(issue_summary)
    elif score >= 90 and not critical_missing:
        results['excellent'].append(issue_summary)
    elif score >= 75 and not critical_missing:
        results['good'].append(issue_summary)
    elif score >= 50:
        results['needs_work'].append(issue_summary)
    else:
        results['critical'].append(issue_summary)

# Store field stats
results['field_stats'] = field_stats

# Print results
print("="*100)
print("📊 VALIDATION RESULTS")
print("="*100)

print(f"\n✅ PERFECT (≥98%, no issues): {len(results['perfect'])} games ({len(results['perfect'])/515*100:.1f}%)")

print(f"\n✅ EXCELLENT (≥90%, minor issues): {len(results['excellent'])} games ({len(results['excellent'])/515*100:.1f}%)")
if results['excellent'][:5]:
    for issue in results['excellent'][:5]:
        print(f"  • Ordinal {issue['ordinal']:3d}: {issue['name'][:50]} (Score: {issue['score']:.0f}%)")

print(f"\n⚠️ GOOD (≥75%, some issues): {len(results['good'])} games ({len(results['good'])/515*100:.1f}%)")
if results['good'][:5]:
    for issue in results['good'][:5]:
        print(f"  • Ordinal {issue['ordinal']:3d}: {issue['name'][:50]} (Score: {issue['score']:.0f}%)")
        if issue['quality_issues']:
            print(f"    Issues: {', '.join(issue['quality_issues'][:2])}")

print(f"\n🚩 NEEDS WORK (≥50%, quality issues): {len(results['needs_work'])} games ({len(results['needs_work'])/515*100:.1f}%)")
if results['needs_work']:
    print("\n" + "-"*100)
    for issue in results['needs_work'][:10]:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']} (Score: {issue['score']:.0f}%)")
        if issue['issues']:
            for i in issue['issues'][:3]:
                print(f"  🚩 {i}")
        if len(issue['issues']) > 3:
            print(f"  ... and {len(issue['issues']) - 3} more issues")
    if len(results['needs_work']) > 10:
        print(f"\n... and {len(results['needs_work']) - 10} more games")

print(f"\n❌ CRITICAL (<50%, missing required fields): {len(results['critical'])} games ({len(results['critical'])/515*100:.1f}%)")
if results['critical']:
    print("\n" + "-"*100)
    for issue in results['critical']:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']} (Score: {issue['score']:.0f}%)")
        print(f"  ❌ Missing critical fields: {', '.join(issue['critical_missing'])}")
        if issue['issues']:
            for i in issue['issues'][:3]:
                print(f"  ❌ {i}")

# Field statistics
print("\n" + "="*100)
print("📊 FIELD STATISTICS")
print("="*100)

print("\nField Completeness:")
for field, stats in field_stats.items():
    total = stats['present'] + stats['missing']
    pct = stats['present'] / total * 100 if total > 0 else 0
    quality_pct = (stats['present'] - stats['quality_issues']) / total * 100 if total > 0 else 0
    
    status = "✅" if pct >= 95 else "⚠️" if pct >= 85 else "🚩"
    print(f"{status} {field:<25} Present: {stats['present']:3d}/515 ({pct:5.1f}%) | Quality: {quality_pct:5.1f}%")

# Summary
high_quality = len(results['perfect']) + len(results['excellent'])
acceptable = len(results['good'])
needs_improvement = len(results['needs_work']) + len(results['critical'])

print("\n" + "="*100)
print("📊 SUMMARY")
print("="*100)
print(f"\n✅ High Quality (≥90% complete): {high_quality}/515 ({high_quality/515*100:.1f}%)")
print(f"⚠️ Acceptable (75-89% complete): {acceptable}/515 ({acceptable/515*100:.1f}%)")
print(f"🚩 Needs Improvement (<75% complete): {needs_improvement}/515 ({needs_improvement/515*100:.1f}%)")

avg_score = sum(g['score'] for g in results['perfect'] + results['excellent'] + results['good'] + results['needs_work'] + results['critical']) / 500
print(f"\n🎯 AVERAGE COMPLETENESS SCORE: {avg_score:.1f}%")

if avg_score >= 90:
    print(f"\n✅ EXCELLENT! Database is highly complete!")
elif avg_score >= 80:
    print(f"\n✅ GOOD! Minor improvements needed")
else:
    print(f"\n⚠️ Needs work to reach 90%+ completeness target")

print("="*100)

# Save report
with open(os.path.join(SCRIPT_DIR, 'DATA_COMPLETENESS_REPORT.json'), 'w') as f:
    json.dump(results, f, indent=2)

print("\n💾 Detailed report saved to: DATA_COMPLETENESS_REPORT.json")
print("="*100)
