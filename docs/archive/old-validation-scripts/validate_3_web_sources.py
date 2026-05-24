#!/usr/bin/env python3
"""
WEB SOURCE VALIDATOR
Checks if games have sufficient verification sources (3+)
"""

import json
from collections import defaultdict

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
print("🌐 WEB SOURCE VALIDATOR - Source Quality Check")
print("="*100)

# Source reliability scoring
SOURCE_RELIABILITY = {
    # Official sources (100%)
    'official': 100,
    'provider': 100,
    'ags official': 100,
    'igt official': 100,
    'aristocrat': 100,
    'evolution': 100,
    
    # Industry standard (95%)
    'slotcatalog': 95,
    'slotcatalog.com': 95,
    'slot catalog': 95,
    
    # Casino operators (90%)
    'casino': 90,
    'borgata': 90,
    'caesars': 90,
    'mgm': 90,
    'draftkings': 90,
    'fanduel': 90,
    
    # Industry press (85%)
    'press release': 85,
    'g2e': 85,
    'ice': 85,
    'slotbeats': 85,
    
    # Aggregators (70%)
    'askgamblers': 70,
    'casinomeister': 70,
    
    # Generic (60%)
    'web research': 60,
    'manual research': 60,
}

results = {
    'excellent': [],  # 4+ high-quality sources
    'good': [],  # 3 sources
    'adequate': [],  # 2 sources
    'insufficient': [],  # 1 source
    'poor': [],  # Generic only
    'missing_sources': []  # No sources documented
}

print(f"\n🔍 Analyzing {len(games)} games...\n")

# Analyze each game
for idx, game in enumerate(games):
    ordinal = idx + 1
    name = game['name']
    confidence = game.get('classification', {}).get('confidence', '')
    
    # Get sources
    audit = game.get('audit', {})
    data_sources = audit.get('data_sources', [])
    notes = audit.get('notes', '').lower()
    
    # Count sources
    source_count = len(data_sources)
    
    # Calculate source quality score
    source_scores = []
    for source in data_sources:
        source_lower = source.lower()
        score = 60  # Default
        for key, value in SOURCE_RELIABILITY.items():
            if key in source_lower:
                score = max(score, value)
        source_scores.append(score)
    
    avg_score = sum(source_scores) / len(source_scores) if source_scores else 0
    
    # Check for source quality mentions in notes
    has_official = any(x in notes for x in ['official', 'provider site', 'verified via'])
    has_multiple = 'multiple sources' in notes or 'cross-referenced' in notes
    
    issue = {
        'ordinal': ordinal,
        'name': name,
        'confidence': confidence,
        'source_count': source_count,
        'sources': data_sources,
        'avg_quality': avg_score,
        'has_official': has_official,
        'notes': notes[:100]
    }
    
    # Categorize
    if source_count >= 4 and avg_score >= 85:
        results['excellent'].append(issue)
    elif source_count >= 3:
        results['good'].append(issue)
    elif source_count == 2:
        results['adequate'].append(issue)
    elif source_count == 1:
        results['insufficient'].append(issue)
    elif source_count == 0:
        results['missing_sources'].append(issue)
    elif avg_score < 70:
        results['poor'].append(issue)

# Print results
print("="*100)
print("📊 VALIDATION RESULTS")
print("="*100)

print(f"\n✅ EXCELLENT (4+ quality sources): {len(results['excellent'])} games ({len(results['excellent'])/515*100:.1f}%)")
if results['excellent'][:5]:
    for issue in results['excellent'][:5]:
        print(f"  • Ordinal {issue['ordinal']:3d}: {issue['name'][:45]} - {issue['source_count']} sources, avg quality {issue['avg_quality']:.0f}%")

print(f"\n✅ GOOD (3 sources): {len(results['good'])} games ({len(results['good'])/515*100:.1f}%)")
if results['good'][:5]:
    for issue in results['good'][:5]:
        print(f"  • Ordinal {issue['ordinal']:3d}: {issue['name'][:45]} - {issue['source_count']} sources")

print(f"\n⚠️ ADEQUATE (2 sources): {len(results['adequate'])} games ({len(results['adequate'])/515*100:.1f}%)")
if results['adequate'][:10]:
    print("\n" + "-"*100)
    for issue in results['adequate'][:10]:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']}")
        print(f"  Sources: {', '.join(issue['sources'])}")
        print(f"  ⚠️ ACTION: Find 1 more source to reach 3+ standard")
    if len(results['adequate']) > 10:
        print(f"\n... and {len(results['adequate']) - 10} more")

print(f"\n🚩 INSUFFICIENT (1 source only): {len(results['insufficient'])} games ({len(results['insufficient'])/515*100:.1f}%)")
if results['insufficient']:
    print("\n" + "-"*100)
    for issue in results['insufficient'][:15]:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']}")
        print(f"  Only Source: {issue['sources'][0] if issue['sources'] else 'Unknown'}")
        print(f"  🚩 ACTION: Need 2 more sources (minimum 3 required)")
    if len(results['insufficient']) > 15:
        print(f"\n... and {len(results['insufficient']) - 15} more")

print(f"\n❌ POOR QUALITY (Low reliability): {len(results['poor'])} games ({len(results['poor'])/515*100:.1f}%)")
if results['poor']:
    print("\n" + "-"*100)
    for issue in results['poor'][:10]:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']}")
        print(f"  Sources: {', '.join(issue['sources'])}")
        print(f"  Quality: {issue['avg_quality']:.0f}% (too low)")
        print(f"  ❌ ACTION: Find higher quality sources (official/SlotCatalog)")
    if len(results['poor']) > 10:
        print(f"\n... and {len(results['poor']) - 10} more")

print(f"\n❌ MISSING SOURCES: {len(results['missing_sources'])} games ({len(results['missing_sources'])/515*100:.1f}%)")
if results['missing_sources']:
    print("\n" + "-"*100)
    for issue in results['missing_sources'][:10]:
        print(f"\nOrdinal {issue['ordinal']:3d}: {issue['name']}")
        print(f"  ❌ No sources documented in audit trail!")
        print(f"  ❌ ACTION: Add source documentation")
    if len(results['missing_sources']) > 10:
        print(f"\n... and {len(results['missing_sources']) - 10} more")

# Summary
well_verified = len(results['excellent']) + len(results['good'])
needs_work = len(results['insufficient']) + len(results['poor']) + len(results['missing_sources'])

print("\n" + "="*100)
print("📊 SUMMARY")
print("="*100)
print(f"\n✅ Well Verified (3+ sources): {well_verified}/515 ({well_verified/515*100:.1f}%)")
print(f"⚠️ Adequate (2 sources): {len(results['adequate'])}/515 ({len(results['adequate'])/515*100:.1f}%)")
print(f"🚩 Needs More Sources: {needs_work}/515 ({needs_work/515*100:.1f}%)")

print(f"\n🎯 TARGET: 90%+ games with 3+ sources")
print(f"📊 CURRENT: {well_verified/515*100:.1f}% with 3+ sources")

if well_verified / 500 >= 0.90:
    print(f"\n✅ TARGET MET! Excellent source verification!")
else:
    gap = int((0.90 * 500) - well_verified)
    print(f"\n⚠️ Need to add sources to {gap} more games to reach 90% target")

print("="*100)

# Save report
with open(os.path.join(SCRIPT_DIR, 'WEB_SOURCE_REPORT.json'), 'w') as f:
    json.dump(results, f, indent=2)

print("\n💾 Detailed report saved to: WEB_SOURCE_REPORT.json")
print("="*100)
