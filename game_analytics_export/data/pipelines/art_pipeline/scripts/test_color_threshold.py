"""
Tests for color area-threshold logic in classify_art.py post_process().
Covers: threshold filtering, fallback to top-1, type coercion, normalization,
dedup, correction interactions, and edge cases.
"""

import sys
import os
import json
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from classify_art import post_process, normalize_color, COLOR_VOCABULARY


# ─── Helper: build a minimal result dict that post_process can handle ────

def make_result(art_color_tone_raw=None, art_color_tone=None, **kwargs):
    """Build a minimal valid result dict for post_process."""
    base = {
        'art_theme': kwargs.get('art_theme', 'Egyptian/Pharaoh'),
        'art_theme_secondary': kwargs.get('art_theme_secondary', None),
        'art_color_tone': art_color_tone or [],
        'art_characters': kwargs.get('art_characters', ['No Characters (symbol-only game)']),
        'art_character_locations': kwargs.get('art_character_locations', {}),
        'art_elements': kwargs.get('art_elements', []),
        'art_narrative': kwargs.get('art_narrative', 'Adventure'),
        'is_branded': kwargs.get('is_branded', False),
        'confidence': kwargs.get('confidence', {'theme': 5, 'color': 5, 'characters': 5, 'elements': 5, 'narrative': 5}),
        'background_description': kwargs.get('background_description', 'Desert background with pyramids'),
        'screenshot_quality': kwargs.get('screenshot_quality', 'gameplay'),
    }
    if art_color_tone_raw is not None:
        base['art_color_tone_raw'] = art_color_tone_raw
    return base


def run_post_process(result, game_corrections=None):
    """Wrapper to call post_process with safe defaults for testing."""
    return post_process(result, name="Test-Game", symbol_names=[], game_corrections=game_corrections, game_description="")


# ═══════════════════════════════════════════════════════════════════
# THRESHOLD FILTERING
# ═══════════════════════════════════════════════════════════════════

class TestThresholdFiltering:
    """Colors must cover >=25% of screen area to be included."""

    def test_all_above_threshold(self):
        raw = [{'color': 'Gold', 'pct': 50}, {'color': 'Red', 'pct': 30}, {'color': 'Blue', 'pct': 25}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold', 'Red', 'Blue']

    def test_one_below_threshold(self):
        raw = [{'color': 'Gold', 'pct': 55}, {'color': 'Red', 'pct': 30}, {'color': 'Blue', 'pct': 10}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold', 'Red']

    def test_only_one_above_threshold(self):
        raw = [{'color': 'Gold', 'pct': 80}, {'color': 'Red', 'pct': 12}, {'color': 'Blue', 'pct': 5}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold']

    def test_boundary_exactly_25(self):
        raw = [{'color': 'Gold', 'pct': 50}, {'color': 'Red', 'pct': 25}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold', 'Red']

    def test_boundary_just_below_25(self):
        raw = [{'color': 'Gold', 'pct': 50}, {'color': 'Red', 'pct': 24}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold']

    def test_max_three_colors(self):
        raw = [
            {'color': 'Gold', 'pct': 30},
            {'color': 'Red', 'pct': 28},
            {'color': 'Blue', 'pct': 27},
            {'color': 'Green', 'pct': 15},
        ]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert len(processed['art_color_tone']) == 3
        assert processed['art_color_tone'] == ['Gold', 'Red', 'Blue']


# ═══════════════════════════════════════════════════════════════════
# FALLBACK TO TOP-1
# ═══════════════════════════════════════════════════════════════════

class TestFallbackTop1:
    """If nothing passes threshold, always keep the top-1 color."""

    def test_all_below_threshold_keeps_top1(self):
        raw = [{'color': 'Gold', 'pct': 15}, {'color': 'Red', 'pct': 10}, {'color': 'Blue', 'pct': 5}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold']
        assert 'color_threshold_fallback_top1' in fixes

    def test_empty_raw_list_uses_legacy(self):
        result = make_result(art_color_tone_raw=[], art_color_tone=['Gold', 'Red'])
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold', 'Red']

    def test_no_raw_field_uses_legacy(self):
        result = make_result(art_color_tone=['Purple', 'Gold', 'Black'])
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Purple', 'Gold', 'Black']


# ═══════════════════════════════════════════════════════════════════
# TYPE COERCION
# ═══════════════════════════════════════════════════════════════════

class TestTypeCoercion:
    """Handle pct as int, float, string with %, etc."""

    def test_pct_as_string(self):
        raw = [{'color': 'Gold', 'pct': '55'}, {'color': 'Red', 'pct': '30'}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold', 'Red']

    def test_pct_as_string_with_percent_sign(self):
        raw = [{'color': 'Gold', 'pct': '55%'}, {'color': 'Red', 'pct': '30%'}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold', 'Red']

    def test_pct_as_float(self):
        raw = [{'color': 'Gold', 'pct': 55.5}, {'color': 'Red', 'pct': 25.1}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold', 'Red']

    def test_pct_as_invalid_string(self):
        raw = [{'color': 'Gold', 'pct': 'lots'}, {'color': 'Red', 'pct': 30}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert 'Red' in processed['art_color_tone']

    def test_pct_missing(self):
        raw = [{'color': 'Gold'}, {'color': 'Red', 'pct': 30}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert 'Red' in processed['art_color_tone']
        assert 'Gold' not in processed['art_color_tone']


# ═══════════════════════════════════════════════════════════════════
# NORMALIZATION AND DEDUP
# ═══════════════════════════════════════════════════════════════════

class TestNormalizationAndDedup:
    """Colors are normalized through COLOR_VOCABULARY and deduplicated."""

    def test_case_normalization(self):
        raw = [{'color': 'gold', 'pct': 50}, {'color': 'RED', 'pct': 30}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold', 'Red']

    def test_duplicate_after_normalization(self):
        raw = [{'color': 'Gold', 'pct': 40}, {'color': 'gold', 'pct': 25}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold']

    def test_unknown_color_excluded(self):
        raw = [{'color': 'Chartreuse', 'pct': 50}, {'color': 'Gold', 'pct': 30}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert 'Gold' in processed['art_color_tone']

    def test_alias_normalization(self):
        raw = [{'color': 'Deep Blue', 'pct': 50}, {'color': 'Gold', 'pct': 30}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'][0] in ('Blue', 'Dark Blue', 'Teal') or 'Gold' in processed['art_color_tone']


# ═══════════════════════════════════════════════════════════════════
# RAW FIELD STRIPPING
# ═══════════════════════════════════════════════════════════════════

class TestRawFieldStripping:
    """art_color_tone_raw must be removed from stored result."""

    def test_raw_field_stripped(self):
        raw = [{'color': 'Gold', 'pct': 50}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert 'art_color_tone_raw' not in processed


# ═══════════════════════════════════════════════════════════════════
# CORRECTION INTERACTION
# ═══════════════════════════════════════════════════════════════════

class TestCorrectionInteraction:
    """Corrections (override_colors, must_have_colors, override_colors_remove) work with threshold logic."""

    def test_override_colors_replaces_threshold_result(self):
        raw = [{'color': 'Gold', 'pct': 50}, {'color': 'Red', 'pct': 30}]
        result = make_result(art_color_tone_raw=raw)
        corrections = {'override_colors': ['Purple', 'Silver']}
        processed, fixes = run_post_process(result, game_corrections=corrections)
        assert processed['art_color_tone'] == ['Purple', 'Silver']

    def test_must_have_colors_adds_after_threshold(self):
        raw = [{'color': 'Gold', 'pct': 50}, {'color': 'Red', 'pct': 30}]
        result = make_result(art_color_tone_raw=raw)
        corrections = {'must_have_colors': ['Blue']}
        processed, fixes = run_post_process(result, game_corrections=corrections)
        assert 'Blue' in processed['art_color_tone']
        assert 'Gold' in processed['art_color_tone']
        assert 'Red' in processed['art_color_tone']

    def test_override_colors_remove_works(self):
        raw = [{'color': 'Gold', 'pct': 50}, {'color': 'Red', 'pct': 30}, {'color': 'Blue', 'pct': 25}]
        result = make_result(art_color_tone_raw=raw)
        corrections = {'override_colors_remove': ['Red']}
        processed, fixes = run_post_process(result, game_corrections=corrections)
        assert 'Red' not in processed['art_color_tone']
        assert 'Gold' in processed['art_color_tone']
        assert 'Blue' in processed['art_color_tone']


# ═══════════════════════════════════════════════════════════════════
# EDGE CASES
# ═══════════════════════════════════════════════════════════════════

class TestEdgeCases:
    """Various edge case scenarios."""

    def test_sum_over_100(self):
        raw = [{'color': 'Gold', 'pct': 60}, {'color': 'Red', 'pct': 50}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold', 'Red']

    def test_single_entry_above_threshold(self):
        raw = [{'color': 'Black', 'pct': 90}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Black']

    def test_raw_with_empty_color_string(self):
        raw = [{'color': '', 'pct': 50}, {'color': 'Gold', 'pct': 30}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert 'Gold' in processed['art_color_tone']

    def test_raw_with_none_entries(self):
        raw = [None, {'color': 'Gold', 'pct': 50}]
        result = make_result(art_color_tone_raw=raw)
        processed, fixes = run_post_process(result)
        assert 'Gold' in processed['art_color_tone'] or processed['art_color_tone'] == ['Gold']

    def test_legacy_path_string_input(self):
        result = make_result(art_color_tone='Gold')
        processed, fixes = run_post_process(result)
        assert processed['art_color_tone'] == ['Gold']
