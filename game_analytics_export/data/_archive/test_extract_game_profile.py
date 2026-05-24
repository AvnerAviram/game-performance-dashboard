"""
Pytest suite for extract_game_profile.py.
Uses real GT games and HTML files as test fixtures -- no mocks.
Run: pytest data/test_extract_game_profile.py -v
"""

import json
import time
import pytest
from pathlib import Path

DATA_DIR = Path(__file__).parent

import sys
sys.path.insert(0, str(DATA_DIR))
from extract_game_profile import (
    clean_html_for_claude,
    post_process,
    compare_with_gt,
    apply_result_to_master,
    apply_verification_to_master,
    load_training_examples,
    build_system_prompt,
    build_user_prompt,
    CANONICAL_FEATURE_NAMES,
    NON_FEATURES,
    XLSX_PROTECTED_FIELDS,
    THEME_TAXONOMY,
    PROVIDER_HINTS,
    TRAINING_GAMES,
    build_art_system_prompt,
    build_art_user_prompt,
    post_process_art,
    apply_art_to_master,
    ART_THEME_VALUES,
    ART_CHARACTER_VALUES,
    ART_ELEMENT_VALUES,
    ART_MOOD_VALUES,
    ART_NARRATIVE_VALUES,
    ART_STYLE_VALUES,
    ART_COLOR_TONE_VALUES,
    NAME_CHARACTER_HINTS,
    STRONG_NARRATIVE_HINTS,
    WEAK_NARRATIVE_HINTS,
    NAME_THEME_HINTS,
    NAME_ELEMENT_HINTS,
    HTML_CHARACTER_PATTERNS,
    compare_art_with_gt,
    print_art_gt_summary,
    load_art_training_examples,
    ART_TRAINING_GAMES,
    ART_GT_PATH,
)


# ─── Fixtures ────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def gt():
    with open(DATA_DIR / "ground_truth_ags.json") as f:
        return json.load(f)

@pytest.fixture(scope="session")
def matches():
    with open(DATA_DIR / "rules_game_matches.json") as f:
        return json.load(f)

@pytest.fixture(scope="session")
def master():
    with open(DATA_DIR / "game_data_master.json") as f:
        return json.load(f)

@pytest.fixture(scope="session")
def master_lookup(master):
    return {g['name']: g for g in master}


# ─── HTML Cleaning ───────────────────────────────────────────────

class TestCleanHtml:
    def test_preserves_headers(self):
        html = '<html><body><h1>Title</h1><h2>Section</h2><p>Content here</p></body></html>'
        result = clean_html_for_claude(html)
        assert '[H1] Title' in result
        assert '[H2] Section' in result
        assert 'Content here' in result

    def test_removes_script_and_style(self):
        html = '<html><script>alert(1)</script><style>.x{}</style><p>Keep this</p></html>'
        result = clean_html_for_claude(html)
        assert 'alert' not in result
        assert '.x' not in result
        assert 'Keep this' in result

    def test_deduplicates_lines(self):
        html = '<html><body><p>Same line</p><p>Same line</p><p>Different</p></body></html>'
        result = clean_html_for_claude(html)
        assert result.count('Same line') == 1

    def test_skips_short_text(self):
        html = '<html><body><p>AB</p><p>Long enough text</p></body></html>'
        result = clean_html_for_claude(html)
        assert 'AB' not in result
        assert 'Long enough text' in result

    def test_empty_html_returns_empty(self):
        result = clean_html_for_claude('<html><body></body></html>')
        assert result == '' or len(result) < 10

    def test_real_game_html_produces_content(self, matches):
        """At least one real HTML file should produce substantial content."""
        tested = 0
        for name, data in list(matches.items())[:20]:
            slug = data.get('slug', '')
            html_path = DATA_DIR / "rules_html" / f"{slug}.html"
            if html_path.exists():
                with open(html_path) as f:
                    result = clean_html_for_claude(f.read())
                if len(result) > 100:
                    tested += 1
                    break
        assert tested > 0, "No real HTML files produced substantial content"


# ─── Post-Processing ─────────────────────────────────────────────

class TestPostProcess:
    def test_canonicalizes_feature_names(self):
        extraction = {'features': [
            {'name': 'free spins', 'confidence': 5},
            {'name': 'hold and spin', 'confidence': 5},
        ]}
        result = post_process(extraction)
        names = [f['name'] for f in result['features']]
        assert 'Free Spins' in names
        assert 'Hold and Spin' in names

    def test_keeps_multiplier(self):
        extraction = {'features': [
            {'name': 'Multiplier', 'confidence': 5},
            {'name': 'Free Spins', 'confidence': 5},
        ]}
        result = post_process(extraction)
        names = [f['name'] for f in result['features']]
        assert 'Multiplier' in names
        assert 'Free Spins' in names

    def test_removes_low_confidence(self):
        extraction = {'features': [
            {'name': 'Free Spins', 'confidence': 5},
            {'name': 'Wheel', 'confidence': 2},
        ]}
        result = post_process(extraction)
        names = [f['name'] for f in result['features']]
        assert 'Free Spins' in names
        assert 'Wheel' not in names

    def test_slingo_suppression(self):
        extraction = {'features': [
            {'name': 'Buy Bonus', 'confidence': 5},
            {'name': 'Free Spins', 'confidence': 5},
            {'name': 'Cascading Reels', 'confidence': 5},
        ]}
        result = post_process(extraction, game_name="Lucky Larrys Lobstermania Slingo")
        names = [f['name'] for f in result['features']]
        assert 'Buy Bonus' not in names
        assert 'Cascading Reels' not in names
        assert 'Free Spins' in names

    def test_handles_features_null(self):
        extraction = {'features': None}
        result = post_process(extraction)
        assert result['features'] == []

    def test_handles_features_with_missing_name(self):
        extraction = {'features': [
            {'name': 'Free Spins', 'confidence': 5},
            {'operator_name': 'SomeBonus'},
            42,
            None,
        ]}
        result = post_process(extraction)
        names = [f['name'] for f in result['features']]
        assert names == ['Free Spins']

    def test_theme_normalization(self):
        extraction = {
            'features': [],
            'themes_all': ['Chinese', 'Halloween', 'Mythology', 'Ocean', 'Viking', 'Christmas']
        }
        result = post_process(extraction)
        assert 'Asian' in result['themes_all']
        assert 'Horror' in result['themes_all']
        assert 'Mythical' in result['themes_all']
        assert 'Underwater' in result['themes_all']
        assert 'Norse' in result['themes_all']
        assert 'Seasonal/Holiday' in result['themes_all']

    def test_theme_deduplication(self):
        extraction = {
            'features': [],
            'themes_all': ['Chinese', 'Asian', 'Asian']
        }
        result = post_process(extraction)
        assert result['themes_all'].count('Asian') == 1

    def test_expanding_reels_in_free_spins_removed(self):
        extraction = {'features': [
            {'name': 'Free Spins', 'confidence': 5, 'context': '', 'description': ''},
            {'name': 'Expanding Reels', 'confidence': 5,
             'context': 'Free Spins section', 'description': 'During free spins'},
        ]}
        result = post_process(extraction)
        names = [f['name'] for f in result['features']]
        assert 'Expanding Reels' not in names

    def test_returns_none_extraction_unchanged(self):
        assert post_process(None) is None
        assert post_process({}) == {}


# ─── F1 / GT Comparison ──────────────────────────────────────────

class TestCompareWithGt:
    def test_perfect_match(self):
        extraction = {'features': [
            {'name': 'Free Spins'}, {'name': 'Wheel'}, {'name': 'Static Jackpot'}
        ], 'themes_all': ['Asian', 'Gold']}
        r = compare_with_gt(extraction, ['Free Spins', 'Wheel', 'Static Jackpot'], ['Asian', 'Gold'])
        assert r['f1'] == 1.0
        assert r['theme_f1'] == 1.0

    def test_false_positive(self):
        extraction = {'features': [
            {'name': 'Free Spins'}, {'name': 'Wheel'}, {'name': 'Respin'}
        ]}
        r = compare_with_gt(extraction, ['Free Spins', 'Wheel'], [])
        assert r['precision'] < 1.0
        assert r['recall'] == 1.0
        assert 'Respin' in r['fp']

    def test_false_negative(self):
        extraction = {'features': [{'name': 'Free Spins'}]}
        r = compare_with_gt(extraction, ['Free Spins', 'Wheel'], [])
        assert r['precision'] == 1.0
        assert r['recall'] < 1.0
        assert 'Wheel' in r['fn']

    def test_empty_vs_empty_is_perfect(self):
        extraction = {'features': []}
        r = compare_with_gt(extraction, [], [])
        assert r['f1'] == 1.0

    def test_multiplier_counted_in_eval(self):
        extraction = {'features': [
            {'name': 'Free Spins'}, {'name': 'Multiplier'}
        ]}
        r = compare_with_gt(extraction, ['Free Spins', 'Multiplier Wild'], [])
        assert r['f1'] < 1.0, "Multiplier vs Multiplier Wild should count as mismatch"

    def test_theme_f1_not_present_without_gt_themes(self):
        extraction = {'features': [], 'themes_all': ['Asian']}
        r = compare_with_gt(extraction, [], [])
        assert 'theme_f1' not in r

    def test_theme_fp_and_fn(self):
        extraction = {'features': [], 'themes_all': ['Asian', 'Money']}
        r = compare_with_gt(extraction, [], ['Asian', 'Gold'])
        assert 'Money' in r['theme_fp']
        assert 'Gold' in r['theme_fn']


# ─── Apply Result to Master ───────────────────────────────────────

class TestApplyResultToMaster:
    def _make_game(self):
        return {
            'id': 'test-123', 'name': 'Test Game', 'provider': 'TestCo',
            'theo_win': 100.5, 'game_category': 'Slot',
            'release_year': 2023, 'features': [], 'themes_all': []
        }

    def _make_result(self, features=None):
        return {
            'features': features or [
                {'name': 'Free Spins', 'confidence': 5},
                {'name': 'Static Jackpot', 'confidence': 5},
            ],
            'theme_primary': 'Asian', 'themes_all': ['Asian', 'Gold'],
            'specs': {'rtp': 95.5, 'volatility': 'High', 'reels': 5, 'rows': 3},
            'functional_symbols': [{'name': 'Wild', 'type': 'wild'}],
        }

    def test_populates_all_fields(self):
        game = self._make_game()
        apply_result_to_master(game, self._make_result())
        assert game['features'] == ['Free Spins', 'Static Jackpot']
        assert game['theme_primary'] == 'Asian'
        assert game['themes_all'] == ['Asian', 'Gold']
        assert game['rtp'] == 95.5
        assert game['reels'] == 5
        assert game['symbols'] == [{'name': 'Wild', 'type': 'wild'}]
        assert 'extraction_date' in game

    def test_xlsx_fields_never_overwritten(self):
        game = self._make_game()
        apply_result_to_master(game, self._make_result())
        assert game['id'] == 'test-123'
        assert game['name'] == 'Test Game'
        assert game['provider'] == 'TestCo'
        assert game['theo_win'] == 100.5
        assert game['game_category'] == 'Slot'
        assert game['release_year'] == 2023

    def test_xlsx_guard_raises_on_corruption(self):
        game = self._make_game()
        result = self._make_result()
        result['specs']['name'] = 'CORRUPTED'
        apply_result_to_master(game, result)
        assert game['name'] == 'Test Game'

    def test_deduplicates_features(self):
        game = self._make_game()
        result = self._make_result(features=[
            {'name': 'Free Spins', 'confidence': 5},
            {'name': 'Free Spins', 'confidence': 5},
        ])
        apply_result_to_master(game, result)
        assert game['features'] == ['Free Spins']

    def test_handles_features_null(self):
        game = self._make_game()
        result = {
            'features': None,
            'theme_primary': 'Asian', 'themes_all': ['Asian'],
            'specs': {}, 'functional_symbols': [],
        }
        apply_result_to_master(game, result)
        assert game['features'] == []

    def test_handles_missing_name_in_feature(self):
        game = self._make_game()
        result = self._make_result(features=[
            {'name': 'Free Spins', 'confidence': 5},
            {'operator_name': 'BrokenFeature'},
        ])
        apply_result_to_master(game, result)
        assert game['features'] == ['Free Spins']

    def test_data_confidence_set(self):
        game = self._make_game()
        apply_result_to_master(game, self._make_result())
        assert game['data_confidence'] in ('high', 'medium', 'low', 'gt_verified')

    def test_specs_none_values_not_applied(self):
        game = self._make_game()
        result = self._make_result()
        result['specs'] = {'rtp': None, 'volatility': None, 'reels': None}
        apply_result_to_master(game, result)
        assert 'rtp' not in game


# ─── Verification Flow ────────────────────────────────────────────

class TestVerification:
    def test_add_only_no_removal(self):
        game = {'features': ['Free Spins'], 'data_confidence': 'low'}
        verification = {
            'changes_made': True,
            'verified_features': [
                {'name': 'Free Spins', 'status': 'correct', 'confidence': 5},
                {'name': 'Static Jackpot', 'status': 'added', 'confidence': 5},
                {'name': 'Free Spins', 'status': 'removed', 'confidence': 5},
            ],
        }
        changed = apply_verification_to_master(game, verification)
        assert changed
        assert 'Free Spins' in game['features']
        assert 'Static Jackpot' in game['features']

    def test_blocks_non_features(self):
        game = {'features': ['Free Spins'], 'data_confidence': 'low'}
        verification = {
            'changes_made': True,
            'verified_features': [
                {'name': 'Autoplay', 'status': 'added', 'confidence': 5},
                {'name': 'Wild', 'status': 'added', 'confidence': 5},
                {'name': 'Scatter', 'status': 'added', 'confidence': 5},
            ],
        }
        changed = apply_verification_to_master(game, verification)
        assert not changed
        assert game['features'] == ['Free Spins']

    def test_blocks_low_confidence(self):
        game = {'features': ['Free Spins'], 'data_confidence': 'low'}
        verification = {
            'changes_made': True,
            'verified_features': [
                {'name': 'Wheel', 'status': 'added', 'confidence': 2},
            ],
        }
        changed = apply_verification_to_master(game, verification)
        assert not changed

    def test_blocks_games_with_3plus_features(self):
        game = {'features': ['Free Spins', 'Wheel', 'Static Jackpot'], 'data_confidence': 'medium'}
        verification = {
            'changes_made': True,
            'verified_features': [
                {'name': 'Buy Bonus', 'status': 'added', 'confidence': 5},
            ],
        }
        changed = apply_verification_to_master(game, verification)
        assert not changed
        assert 'Buy Bonus' not in game['features']

    def test_upgrades_confidence(self):
        game = {'features': ['Free Spins'], 'data_confidence': 'low'}
        verification = {
            'changes_made': True,
            'verified_features': [
                {'name': 'Wheel', 'status': 'added', 'confidence': 5},
            ],
        }
        apply_verification_to_master(game, verification)
        assert game['data_confidence'] == 'medium'

    def test_no_changes_made_returns_false(self):
        game = {'features': ['Free Spins'], 'data_confidence': 'low'}
        verification = {'changes_made': False}
        assert not apply_verification_to_master(game, verification)


# ─── Canonical Feature Names ─────────────────────────────────────

class TestCanonicalNames:
    def test_all_entries_lowercase_key(self):
        for key, val in CANONICAL_FEATURE_NAMES.items():
            assert key == key.lower(), f"Key '{key}' is not lowercase"
            assert val == val.strip(), f"Value '{val}' has whitespace"

    def test_no_duplicate_values(self):
        values = list(CANONICAL_FEATURE_NAMES.values())
        assert len(values) == len(set(values)), "Duplicate canonical names found"

    def test_known_features_present(self):
        required = [
            'Free Spins', 'Hold and Spin', 'Static Jackpot', 'Cash On Reels',
            'Wheel', 'Respin', 'Buy Bonus', 'Pick Bonus', '3 Pot',
            'Cascading Reels', 'Megaways', 'Persistence',
        ]
        for feat in required:
            assert feat.lower() in CANONICAL_FEATURE_NAMES, f"Missing: {feat}"


# ─── XLSX Protection ──────────────────────────────────────────────

class TestXlsxProtection:
    def test_protected_fields_include_critical(self):
        critical = ['id', 'name', 'provider', 'theo_win', 'game_category']
        for field in critical:
            assert field in XLSX_PROTECTED_FIELDS, f"Missing from protection: {field}"

    def test_extraction_fields_not_protected(self):
        extraction_fields = ['features', 'themes_all', 'rtp', 'volatility',
                             'description', 'symbols', 'extraction_date']
        for field in extraction_fields:
            assert field not in XLSX_PROTECTED_FIELDS, f"Should not be protected: {field}"


# ─── GT Data Integrity ───────────────────────────────────────────

class TestGtIntegrity:
    def test_gt_features_are_canonical(self, gt, master_lookup):
        canonical_values = set(CANONICAL_FEATURE_NAMES.values())
        NON_SLOT = {'Lottery', 'Instant Win', 'Table Game', 'Live Casino', 'Video Poker'}
        non_canonical = []
        for name, data in gt.items():
            m = master_lookup.get(name)
            if not m:
                continue
            if m.get('game_category', '') in NON_SLOT:
                continue
            for feat in data.get('features', []):
                if feat not in canonical_values:
                    non_canonical.append((name, feat))
        assert not non_canonical, f"Non-canonical features in GT: {non_canonical}"

    def test_gt_themes_in_taxonomy(self, gt, master_lookup):
        taxonomy_text = THEME_TAXONOMY.split("THEME CLASSIFICATION RULES:")[0]
        theme_names = set()
        for line in taxonomy_text.split('\n'):
            for name in line.split(','):
                name = name.strip()
                if name and name != 'Available themes (use ONLY these canonical names):':
                    theme_names.add(name)

        NON_SLOT = {'Lottery', 'Instant Win', 'Table Game', 'Live Casino', 'Video Poker'}
        bad = []
        for name, data in gt.items():
            m = master_lookup.get(name)
            if m and m.get('game_category', '') in NON_SLOT:
                continue
            if data.get('eval_skip'):
                continue
            for theme in data.get('themes', []):
                if theme not in theme_names:
                    bad.append((name, theme))
        assert not bad, f"GT themes not in taxonomy: {bad}"

    def test_no_duplicate_features_in_gt(self, gt):
        dupes = []
        for name, data in gt.items():
            feats = data.get('features', [])
            if len(feats) != len(set(feats)):
                dupes.append(name)
        assert not dupes, f"GT entries with duplicate features: {dupes}"


# ─── Master Data Integrity ────────────────────────────────────────

class TestMasterIntegrity:
    def test_no_duplicate_names(self, master):
        names = [g['name'] for g in master]
        assert len(names) == len(set(names)), "Duplicate game names in master"

    def test_all_games_have_required_fields(self, master):
        required = ['name', 'game_category']
        for game in master[:100]:
            for field in required:
                assert field in game, f"Game '{game.get('name', '?')}' missing '{field}'"

    def test_extracted_games_have_features(self, master):
        skip_confidence = {'low', 'medium', 'sparse_html', 'non_slot', 'gt_verified'}
        broken = []
        for game in master:
            if (game.get('extraction_date') and not game.get('features')
                    and game.get('data_confidence') not in skip_confidence):
                broken.append(game['name'])
        assert not broken, f"Games with extraction_date but no features: {broken}"

    def test_xlsx_fields_consistent(self, master):
        for game in master[:50]:
            if 'theo_win' in game:
                val = game['theo_win']
                assert isinstance(val, (int, float)), \
                    f"{game['name']}: theo_win is {type(val).__name__}"


# ─── Training Examples ────────────────────────────────────────────

class TestTrainingExamples:
    def test_training_games_in_gt(self, gt, matches):
        missing_gt = [g for g in TRAINING_GAMES if g not in gt]
        missing_html = [g for g in TRAINING_GAMES if g not in matches]
        assert not missing_gt, f"Training games not in GT: {missing_gt}"
        assert not missing_html, f"Training games not in matches: {missing_html}"

    def test_load_training_examples_returns_data(self):
        examples = load_training_examples()
        assert len(examples) > 10, f"Only {len(examples)} training examples loaded"
        for ex in examples:
            assert 'name' in ex
            assert 'clean_html' in ex
            assert 'expected' in ex
            assert len(ex['clean_html']) > 0

    def test_system_prompt_contains_key_sections(self):
        prompt = build_system_prompt()
        assert 'FEATURE CLASSIFICATION RULES' in prompt
        assert 'THEME TAXONOMY' in prompt
        assert 'OUTPUT FORMAT' in prompt
        assert 'CRITICAL CLASSIFICATION RULES' in prompt


# ─── Provider Hints ───────────────────────────────────────────────

class TestProviderHints:
    def test_hints_reference_real_providers(self, master):
        providers_in_master = {g.get('provider') for g in master}
        for prov in PROVIDER_HINTS:
            assert prov in providers_in_master, \
                f"PROVIDER_HINTS has '{prov}' but not in master data"


# ─── Art Characterization ────────────────────────────────────────

class TestArtTaxonomy:
    def test_setting_values_non_empty(self):
        assert len(ART_THEME_VALUES) >= 20
        for v in ART_THEME_VALUES:
            assert isinstance(v, str) and len(v) > 0

    def test_character_values_non_empty(self):
        assert len(ART_CHARACTER_VALUES) >= 15
        for v in ART_CHARACTER_VALUES:
            assert isinstance(v, str) and len(v) > 0

    def test_element_values_non_empty(self):
        assert len(ART_ELEMENT_VALUES) >= 10
        for v in ART_ELEMENT_VALUES:
            assert isinstance(v, str) and len(v) > 0

    def test_mood_values_non_empty(self):
        assert len(ART_MOOD_VALUES) >= 8

    def test_narrative_values_non_empty(self):
        assert len(ART_NARRATIVE_VALUES) >= 8

    def test_style_values_non_empty(self):
        assert len(ART_STYLE_VALUES) >= 5

    def test_color_tone_values_non_empty(self):
        assert len(ART_COLOR_TONE_VALUES) >= 5

    def test_no_duplicate_values(self):
        for name, values in [
            ("settings", ART_THEME_VALUES),
            ("characters", ART_CHARACTER_VALUES),
            ("elements", ART_ELEMENT_VALUES),
            ("moods", ART_MOOD_VALUES),
            ("narratives", ART_NARRATIVE_VALUES),
            ("styles", ART_STYLE_VALUES),
            ("colors", ART_COLOR_TONE_VALUES),
        ]:
            lower = [v.lower() for v in values]
            assert len(lower) == len(set(lower)), f"Duplicate in {name}: {[v for v in lower if lower.count(v) > 1]}"


class TestArtSystemPrompt:
    def test_prompt_contains_all_dimensions(self):
        prompt = build_art_system_prompt()
        assert "THEME" in prompt
        assert "CHARACTERS" in prompt
        assert "VISUAL ELEMENTS" in prompt or "ELEMENTS" in prompt
        assert "MOOD" in prompt
        assert "NARRATIVE" in prompt
        assert "ART STYLE" in prompt
        assert "COLOR TONE" in prompt

    def test_prompt_contains_vocabulary_values(self):
        prompt = build_art_system_prompt()
        assert "Ancient Temple/Ruins" in prompt
        assert "Explorer/Adventurer" in prompt
        assert "Dark/Mysterious" in prompt
        assert "Treasure Hunt/Gold Rush" in prompt
        assert "Realistic 3D" in prompt

    def test_prompt_requests_json_output(self):
        prompt = build_art_system_prompt()
        assert "art_theme" in prompt
        assert "art_characters" in prompt
        assert "art_elements" in prompt
        assert "art_mood" in prompt
        assert "art_narrative" in prompt
        assert "Return ONLY valid JSON" in prompt


class TestArtUserPrompt:
    def test_includes_game_name(self):
        prompt = build_art_user_prompt("Cash Eruption", "A fire themed slot", [], ["Fire"])
        assert "Cash Eruption" in prompt

    def test_includes_description(self):
        prompt = build_art_user_prompt("Test Game", "A volcanic themed slot with fire symbols", [], [])
        assert "volcanic themed slot" in prompt

    def test_includes_symbols(self):
        symbols = [{"name": "Wild", "type": "wild", "description": "Substitutes for all"}]
        prompt = build_art_user_prompt("Test", "desc", symbols, [])
        assert "Wild" in prompt
        assert "wild" in prompt

    def test_includes_themes(self):
        prompt = build_art_user_prompt("Test", "desc", [], ["Fire", "Gold"])
        assert "Fire" in prompt
        assert "Gold" in prompt

    def test_includes_provider(self):
        prompt = build_art_user_prompt("Test", "desc", [], [], provider="NetEnt")
        assert "NetEnt" in prompt

    def test_handles_string_symbols(self):
        symbols = ["Wild", "Scatter", "Bonus"]
        prompt = build_art_user_prompt("Test", "desc", symbols, [])
        assert "Wild" in prompt

    def test_handles_empty_inputs(self):
        prompt = build_art_user_prompt("Test", None, None, None)
        assert "Test" in prompt


class TestPostProcessArt:
    def test_normalizes_exact_match(self):
        result = {
            "art_theme": "Ancient Temple/Ruins",
            "art_characters": ["Dragon"],
            "art_elements": ["Fire/Flames/Lava"],
            "art_mood": "Dark/Mysterious",
            "art_narrative": "Quest/Adventure/Journey",
            "art_style": "Realistic 3D",
            "art_color_tone": "Warm (golds, reds, ambers)",
        }
        processed = post_process_art(result)
        assert processed['art_theme'] == "Ancient Temple/Ruins"
        assert processed['art_mood'] == "Dark/Mysterious"

    def test_normalizes_case_insensitive(self):
        result = {
            "art_theme": "ancient temple/ruins",
            "art_characters": ["dragon"],
            "art_elements": ["fire/flames/lava"],
            "art_mood": "dark/mysterious",
            "art_narrative": "quest/adventure/journey",
            "art_style": "realistic 3d",
            "art_color_tone": "warm (golds, reds, ambers)",
        }
        processed = post_process_art(result)
        assert processed['art_theme'] == "Ancient Temple/Ruins"
        assert processed['art_characters'] == ["Dragon"]
        assert processed['art_mood'] == "Dark/Mysterious"
        assert processed['art_style'] == "Realistic 3D"

    def test_defaults_empty_characters_to_no_characters(self):
        result = {
            "art_theme": "Classic Slots",
            "art_characters": [],
            "art_elements": ["Gems/Jewels/Crystals"],
            "art_mood": "Bright/Fun/Cheerful",
            "art_narrative": "No Narrative (classic/abstract)",
            "art_style": None,
            "art_color_tone": None,
        }
        processed = post_process_art(result)
        assert processed['art_characters'] == ["No Characters (symbol-only game)"]

    def test_deduplicates_lists(self):
        result = {
            "art_theme": "Jungle/Rainforest",
            "art_characters": ["Dragon", "dragon", "Dragon"],
            "art_elements": ["Fire/Flames/Lava", "fire/flames/lava"],
            "art_mood": "Epic/Grand/Heroic",
            "art_narrative": "Battle/Combat/War",
            "art_style": None,
            "art_color_tone": None,
        }
        processed = post_process_art(result)
        assert len(processed['art_characters']) == 1
        assert len(processed['art_elements']) == 1

    def test_handles_none_input(self):
        assert post_process_art(None) is None
        assert post_process_art({}) == {}

    def test_unknown_values_get_fallback(self):
        result = {
            "art_theme": "Completely Made Up Place",
            "art_characters": ["Imaginary Being XYZ"],
            "art_elements": ["Nonexistent Object"],
            "art_mood": "Unknown Mood",
            "art_narrative": "Random Story",
            "art_style": "Unknown Style",
            "art_color_tone": "Unknown Color",
        }
        processed = post_process_art(result)
        assert processed['art_theme'] == "Classic Slots"
        assert processed['art_mood'] == "Bright/Fun/Cheerful"
        assert processed['art_narrative'] == "No Narrative (classic/abstract)"
        assert processed['art_style'] is None
        assert processed['art_color_tone'] is None


class TestPostProcessArtRules:
    """Tests for deterministic name-based and HTML-based post-processing rules."""

    def _base_result(self, **overrides):
        base = {
            "art_theme": "Classic Slots",
            "art_characters": [],
            "art_elements": ["Gems/Jewels/Crystals"],
            "art_mood": "Bright/Fun/Cheerful",
            "art_narrative": "No Narrative (classic/abstract)",
            "art_style": None,
            "art_color_tone": None,
        }
        base.update(overrides)
        return base

    def test_huff_n_puff_gets_wolf_and_pig(self):
        result = self._base_result(art_characters=["Cartoon/Mascot Character"])
        processed = post_process_art(result, "Huff N Even More Puff")
        chars = processed['art_characters']
        assert "Wild Animals (lion, wolf, eagle, bear, moose, raccoon)" in chars
        assert "Domestic Animals (cat, dog, horse, pig)" in chars
        assert processed['art_narrative'] == "Fairy Tale/Storybook"

    def test_wolf_name_adds_wild_animals(self):
        result = self._base_result()
        processed = post_process_art(result, "Wolf It Up Again")
        assert "Wild Animals (lion, wolf, eagle, bear, moose, raccoon)" in processed['art_characters']

    def test_dragon_name_adds_dragon(self):
        result = self._base_result()
        processed = post_process_art(result, "Dragon's Fire")
        assert "Dragon" in processed['art_characters']

    def test_bacon_name_adds_domestic_animals(self):
        result = self._base_result()
        processed = post_process_art(result, "Rakin Bacon Jackpots")
        assert "Domestic Animals (cat, dog, horse, pig)" in processed['art_characters']

    def test_piggy_name_adds_money_element(self):
        result = self._base_result()
        processed = post_process_art(result, "Bigger Piggy Bank")
        assert "Money/Cash/Bills" in processed['art_elements']

    def test_piggy_name_gets_wealth_narrative(self):
        result = self._base_result()
        processed = post_process_art(result, "Bigger Piggy Bank")
        assert processed['art_narrative'] == "Wealth/Fortune/Prosperity"

    def test_no_characters_removed_when_real_chars_exist(self):
        result = self._base_result(art_characters=[
            "Domestic Animals (cat, dog, horse, pig)",
            "No Characters (symbol-only game)",
        ])
        processed = post_process_art(result, "Rakin Bacon")
        assert "No Characters (symbol-only game)" not in processed['art_characters']
        assert "Domestic Animals (cat, dog, horse, pig)" in processed['art_characters']

    def test_no_characters_kept_when_only_option(self):
        result = self._base_result(art_characters=[])
        processed = post_process_art(result, "Classic Sevens")
        assert processed['art_characters'] == ["No Characters (symbol-only game)"]

    def test_html_detects_wolf_character(self):
        result = self._base_result()
        html = "The WOLF symbol is wild and appears on reels 2-4."
        processed = post_process_art(result, "Some Game", html)
        assert "Wild Animals (lion, wolf, eagle, bear, moose, raccoon)" in processed['art_characters']

    def test_html_detects_piggy_symbol(self):
        result = self._base_result()
        html = "PIGGY1, PIGGY2, PIGGY3 symbols award prizes."
        processed = post_process_art(result, "Some Game", html)
        assert "Domestic Animals (cat, dog, horse, pig)" in processed['art_characters']

    def test_egypt_name_overrides_generic_setting(self):
        result = self._base_result()
        processed = post_process_art(result, "Egyptian Riches")
        assert processed['art_theme'] == "Ancient Temple/Ruins"

    def test_setting_not_overridden_when_specific(self):
        result = self._base_result(art_theme="Fantasy/Fairy Tale")
        processed = post_process_art(result, "Egyptian something")
        assert processed['art_theme'] == "Fantasy/Fairy Tale"

    def test_buffalo_gets_bull_character(self):
        result = self._base_result()
        processed = post_process_art(result, "Buffalo King Megaways")
        assert "Bull/Buffalo" in processed['art_characters']

    def test_goldilocks_gets_fairy_tale(self):
        result = self._base_result()
        processed = post_process_art(result, "Goldilocks and the Wild Bears")
        assert processed['art_narrative'] == "Fairy Tale/Storybook"

    def test_vampire_name_adds_character(self):
        result = self._base_result()
        processed = post_process_art(result, "Blood Suckers Vampire")
        assert "Vampire/Werewolf" in processed['art_characters']

    def test_fish_name_adds_sea_creatures(self):
        result = self._base_result()
        processed = post_process_art(result, "4 Fantastic Fish")
        assert "Sea Creatures (fish, octopus, shark)" in processed['art_characters']

    def test_chicken_name_adds_bird(self):
        result = self._base_result()
        processed = post_process_art(result, "Chicken Fox Jr")
        assert "Bird (peacock, parrot, owl)" in processed['art_characters']
        assert "Wild Animals (lion, wolf, eagle, bear, moose, raccoon)" in processed['art_characters']

    def test_elephant_name_adds_wild_animals(self):
        result = self._base_result()
        processed = post_process_art(result, "Diamond Cash Mighty Elephant")
        assert "Wild Animals (lion, wolf, eagle, bear, moose, raccoon)" in processed['art_characters']

    def test_genie_name_adds_wizard(self):
        result = self._base_result()
        processed = post_process_art(result, "Dreamy Genie")
        assert "Wizard/Sorcerer" in processed['art_characters']

    def test_santa_name_adds_mascot(self):
        result = self._base_result()
        processed = post_process_art(result, "Big Santa Fortune")
        assert "Cartoon/Mascot Character" in processed['art_characters']

    def test_halloween_setting(self):
        result = self._base_result()
        processed = post_process_art(result, "Halloween Fortune")
        assert processed['art_theme'] == "Haunted Manor/Graveyard"

    def test_vegas_setting(self):
        result = self._base_result()
        processed = post_process_art(result, "Chicks In Vegas")
        assert processed['art_theme'] == "Neon/Cyber City"

    def test_china_setting(self):
        result = self._base_result()
        processed = post_process_art(result, "China Shores")
        assert processed['art_theme'] == "Asian Temple/Garden"

    def test_robin_hood_fairy_tale(self):
        result = self._base_result()
        processed = post_process_art(result, "Robin Hoods Heroes")
        assert processed['art_narrative'] == "Fairy Tale/Storybook"

    def test_heist_narrative(self):
        result = self._base_result()
        processed = post_process_art(result, "Hot Dog Heist")
        assert processed['art_narrative'] == "Heist/Robbery/Escape"

    def test_fire_element_from_name(self):
        result = self._base_result()
        processed = post_process_art(result, "Blazing 7s")
        assert "Fire/Flames/Lava" in processed['art_elements']
        assert "Sevens/Bars/Bells (classic)" in processed['art_elements']

    def test_html_detects_elephant(self):
        result = self._base_result()
        html = "The ELEPHANT symbol is a high pay symbol appearing on all reels."
        processed = post_process_art(result, "Some Game", html)
        assert "Wild Animals (lion, wolf, eagle, bear, moose, raccoon)" in processed['art_characters']

    def test_html_detects_princess(self):
        result = self._base_result()
        html = "PRINCESS symbol appears on reels 2 and 4."
        processed = post_process_art(result, "Some Game", html)
        assert "King/Queen/Royalty" in processed['art_characters']

    # --- New industry-validated taxonomy tests ---

    def test_viking_gets_norse_setting_not_arctic(self):
        result = self._base_result()
        processed = post_process_art(result, "Viking Runecraft")
        assert processed['art_theme'] == "Norse/Viking Realm"
        assert processed['art_theme'] != "Arctic/Snow"

    def test_irish_gets_celtic_setting_not_forest(self):
        result = self._base_result()
        processed = post_process_art(result, "Book Of The Irish")
        assert processed['art_theme'] == "Irish/Celtic Highlands"
        assert processed['art_theme'] != "Fantasy/Fairy Tale"

    def test_christmas_gets_festive_setting(self):
        result = self._base_result()
        processed = post_process_art(result, "Christmas Bonanza")
        assert processed['art_theme'] == "Festive/Holiday"
        assert processed['art_mood'] == "Festive/Holiday/Celebratory"

    def test_dinosaur_gets_prehistoric_setting_and_character(self):
        result = self._base_result()
        processed = post_process_art(result, "Jurassic Kingdom")
        assert processed['art_theme'] == "Prehistoric/Primordial"
        assert "Dinosaur/Prehistoric Beast" in processed['art_characters']

    def test_fishing_gets_lakeside_and_narrative(self):
        result = self._base_result()
        processed = post_process_art(result, "Big Catch Bass Fishing")
        assert processed['art_theme'] == "Lakeside/River/Fishing Dock"
        assert processed['art_narrative'] == "Fishing/Angling"
        assert "Fishing/Tackle/Bait (rods, hooks, nets)" in processed['art_elements']

    def test_steampunk_setting(self):
        result = self._base_result()
        processed = post_process_art(result, "Steampunk Fury")
        assert processed['art_theme'] == "Steampunk/Victorian"

    def test_leprechaun_gets_irish_setting(self):
        result = self._base_result()
        processed = post_process_art(result, "Lucky Leprechaun")
        assert processed['art_theme'] == "Irish/Celtic Highlands"
        assert "Leprechaun" in processed['art_characters']

    def test_crime_narrative_from_name(self):
        result = self._base_result(art_narrative="No Narrative (classic/abstract)")
        processed = post_process_art(result, "Mafia Madness")
        assert processed['art_narrative'] == "Crime/Mystery/Detective"

    def test_new_taxonomy_values_exist(self):
        assert "Norse/Viking Realm" in ART_THEME_VALUES
        assert "Irish/Celtic Highlands" in ART_THEME_VALUES
        assert "Festive/Holiday" in ART_THEME_VALUES
        assert "Prehistoric/Primordial" in ART_THEME_VALUES
        assert "Steampunk/Victorian" in ART_THEME_VALUES
        assert "Lakeside/River/Fishing Dock" in ART_THEME_VALUES
        assert "Dinosaur/Prehistoric Beast" in ART_CHARACTER_VALUES
        assert "Superhero/Heroine" in ART_CHARACTER_VALUES
        assert "Fishing/Tackle/Bait (rods, hooks, nets)" in ART_ELEMENT_VALUES
        assert "Fishing/Angling" in ART_NARRATIVE_VALUES
        assert "Music/Performance/Concert" in ART_NARRATIVE_VALUES
        assert "Crime/Mystery/Detective" in ART_NARRATIVE_VALUES
        assert "Branded/Licensed Story (TV, movie, celebrity)" in ART_NARRATIVE_VALUES
        assert "Festive/Holiday/Celebratory" in ART_MOOD_VALUES

    def test_weak_narrative_does_not_override_good_one(self):
        result = self._base_result(art_narrative="Battle/Combat/War")
        processed = post_process_art(result, "Cash Battle")
        assert processed['art_narrative'] == "Battle/Combat/War"

    def test_weak_narrative_overrides_collection(self):
        result = self._base_result(art_narrative="Collection/Harvest/Gathering")
        processed = post_process_art(result, "Cash Eruption")
        assert processed['art_narrative'] == "Wealth/Fortune/Prosperity"

    def test_strong_narrative_overrides_anything(self):
        result = self._base_result(art_narrative="Treasure Hunt/Gold Rush")
        processed = post_process_art(result, "Goldilocks Wild Bears")
        assert processed['art_narrative'] == "Fairy Tale/Storybook"

    def test_name_hints_tables_are_populated(self):
        assert len(NAME_CHARACTER_HINTS) >= 80
        assert len(STRONG_NARRATIVE_HINTS) >= 10
        assert len(WEAK_NARRATIVE_HINTS) >= 5
        assert len(NAME_THEME_HINTS) >= 30
        assert len(NAME_ELEMENT_HINTS) >= 5
        assert len(HTML_CHARACTER_PATTERNS) >= 20


class TestApplyArtToMaster:
    def test_applies_all_fields(self):
        game = {"name": "Test Game", "features": ["Free Spins"]}
        art = {
            "art_theme": "Ancient Temple/Ruins",
            "art_characters": ["Pharaoh/Egyptian Ruler"],
            "art_elements": ["Ancient Artifacts (scrolls, amulets, masks)", "Gold Coins/Treasure"],
            "art_mood": "Epic/Grand/Heroic",
            "art_narrative": "Treasure Hunt/Gold Rush",
            "art_style": "Realistic 3D",
            "art_color_tone": "Warm (golds, reds, ambers)",
            "art_confidence": "text_inferred",
        }
        apply_art_to_master(game, art)
        assert game['art_theme'] == "Ancient Temple/Ruins"
        assert game['art_characters'] == ["Pharaoh/Egyptian Ruler"]
        assert game['art_mood'] == "Epic/Grand/Heroic"
        assert game['art_confidence'] == "text_inferred"

    def test_does_not_touch_existing_fields(self):
        game = {"name": "Test", "features": ["Free Spins"], "theme_primary": "Egyptian"}
        art = {"art_theme": "Ancient Temple/Ruins", "art_confidence": "text_inferred"}
        apply_art_to_master(game, art)
        assert game['theme_primary'] == "Egyptian"
        assert game['features'] == ["Free Spins"]


class TestCompareArtWithGt:
    def test_perfect_match_single_values(self):
        extraction = {
            'art_theme': 'Ancient Temple/Ruins',
            'art_characters': ['Pharaoh/Egyptian Ruler'],
            'art_elements': ['Gold Coins/Treasure'],
            'art_mood': 'Epic/Grand/Heroic',
            'art_narrative': 'Treasure Hunt/Gold Rush',
        }
        gt = dict(extraction)
        result = compare_art_with_gt(extraction, gt)
        assert result['art_theme']['match'] is True
        assert result['art_mood']['match'] is True
        assert result['art_narrative']['match'] is True
        assert result['art_characters']['f1'] == 1.0
        assert result['art_elements']['f1'] == 1.0
        assert result['aggregate_score'] == 1.0

    def test_wrong_setting(self):
        extraction = {
            'art_theme': 'Generic/Abstract',
            'art_characters': ['Pharaoh/Egyptian Ruler'],
            'art_elements': ['Gold Coins/Treasure'],
            'art_mood': 'Epic/Grand/Heroic',
            'art_narrative': 'Treasure Hunt/Gold Rush',
        }
        gt = dict(extraction)
        gt['art_theme'] = 'Ancient Temple/Ruins'
        result = compare_art_with_gt(extraction, gt)
        assert result['art_theme']['match'] is False
        assert result['aggregate_score'] < 1.0

    def test_partial_character_match(self):
        extraction = {
            'art_theme': 'Pirate Ship/Port',
            'art_characters': ['Pirate/Captain', 'Dragon'],
            'art_elements': [],
            'art_mood': 'Adventurous/Exciting',
            'art_narrative': 'Treasure Hunt/Gold Rush',
        }
        gt = {
            'art_theme': 'Pirate Ship/Port',
            'art_characters': ['Pirate/Captain', 'Monkey/Ape'],
            'art_elements': [],
            'art_mood': 'Adventurous/Exciting',
            'art_narrative': 'Treasure Hunt/Gold Rush',
        }
        result = compare_art_with_gt(extraction, gt)
        assert result['art_characters']['tp'] == ['Pirate/Captain']
        assert result['art_characters']['fp'] == ['Dragon']
        assert result['art_characters']['fn'] == ['Monkey/Ape']
        assert result['art_characters']['precision'] == 0.5
        assert result['art_characters']['recall'] == 0.5

    def test_empty_extraction_returns_error(self):
        result = compare_art_with_gt(None, {'art_theme': 'X'})
        assert 'error' in result

    def test_empty_lists_match(self):
        extraction = {
            'art_theme': 'X',
            'art_characters': [],
            'art_elements': [],
            'art_mood': 'Y',
            'art_narrative': 'Z',
        }
        gt = dict(extraction)
        result = compare_art_with_gt(extraction, gt)
        assert result['art_characters']['f1'] == 1.0
        assert result['art_elements']['f1'] == 1.0


class TestArtTrainingAndGt:
    def test_training_games_list_is_populated(self):
        assert len(ART_TRAINING_GAMES) >= 5

    def test_gt_file_exists(self):
        assert ART_GT_PATH.exists(), f"Art GT file not found at {ART_GT_PATH}"

    def test_gt_has_required_fields(self):
        with open(ART_GT_PATH) as f:
            art_gt = json.load(f)
        required = ['art_theme', 'art_characters', 'art_elements', 'art_mood', 'art_narrative']
        for name, data in art_gt.items():
            for field in required:
                assert field in data, f"Game {name} missing {field} in art GT"

    def test_gt_values_in_taxonomy(self):
        with open(ART_GT_PATH) as f:
            art_gt = json.load(f)
        bad = []
        for name, data in art_gt.items():
            if data['art_theme'] not in ART_THEME_VALUES:
                bad.append((name, 'art_theme', data['art_theme']))
            if data['art_mood'] not in ART_MOOD_VALUES:
                bad.append((name, 'art_mood', data['art_mood']))
            if data['art_narrative'] not in ART_NARRATIVE_VALUES:
                bad.append((name, 'art_narrative', data['art_narrative']))
            for c in data.get('art_characters', []):
                if c not in ART_CHARACTER_VALUES:
                    bad.append((name, 'art_characters', c))
            for e in data.get('art_elements', []):
                if e not in ART_ELEMENT_VALUES:
                    bad.append((name, 'art_elements', e))
        assert not bad, f"GT values not in taxonomy: {bad}"

    def test_training_games_in_gt(self):
        with open(ART_GT_PATH) as f:
            art_gt = json.load(f)
        missing = [g for g in ART_TRAINING_GAMES if g not in art_gt]
        assert not missing, f"Training games not in art GT: {missing}"

    def test_load_art_training_examples(self):
        examples = load_art_training_examples()
        assert len(examples) >= 5
        for ex in examples:
            assert 'name' in ex
            assert 'expected' in ex
            assert 'art_theme' in ex['expected']

    def test_few_shot_in_art_prompt(self):
        examples = load_art_training_examples()
        prompt = build_art_user_prompt(
            "Test Game", "A test", [], ["Gold"], examples=examples
        )
        assert "EXAMPLE:" in prompt
        assert "Double Diamond" in prompt or "Cleopatra" in prompt
