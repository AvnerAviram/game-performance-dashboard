const path = require('path');
// ROOT = game_analytics_export/
const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');

module.exports = {
    ROOT,
    DATA_DIR,
    MASTER_JSON: path.join(DATA_DIR, 'master', 'game_data_master.json'),
    SCREENSHOTS_DIR: path.join(DATA_DIR, 'screenshots'),
    MAPPINGS: {
        confidence: path.join(DATA_DIR, 'mappings', 'confidence_map.json'),
        theme: path.join(DATA_DIR, 'mappings', 'theme_consolidation_map.json'),
        artTheme: path.join(DATA_DIR, 'mappings', 'art_theme_consolidation_map.json'),
        franchise: path.join(DATA_DIR, 'mappings', 'franchise_mapping.json'),
    },
    MATCHING: {
        dir: path.join(DATA_DIR, 'matching'),
        rulesMatches: path.join(DATA_DIR, 'matching', 'rules_game_matches.json'),
        rulesIndex: path.join(DATA_DIR, 'matching', 'rules_index.json'),
        rulesRejections: path.join(DATA_DIR, 'matching', 'rules_match_rejections.json'),
        rulesFuzzy: path.join(DATA_DIR, 'matching', 'rules_fuzzy_candidates.json'),
        rulesText: path.join(DATA_DIR, 'matching', 'rules_text'),
    },
    STAGING: {
        art: path.join(DATA_DIR, 'staging', 'staged_art_characterization.json'),
        bestOf: path.join(DATA_DIR, 'staging', 'staged_best_of_sources.json'),
        features: path.join(DATA_DIR, 'staging', 'staged_feature_extraction.json'),
    },
    VALIDATION: {
        groundTruthAgs: path.join(DATA_DIR, 'validation', 'ground_truth_ags.json'),
        groundTruthThemes: path.join(DATA_DIR, 'validation', 'ground_truth_themes.json'),
        releaseDates: path.join(DATA_DIR, 'validation', '_release_date_matches.json'),
    },
};
