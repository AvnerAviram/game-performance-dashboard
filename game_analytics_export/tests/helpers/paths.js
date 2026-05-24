import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// ROOT = game_analytics_export/
const ROOT = resolve(__dirname, '..', '..');

export const DATA_DIR = resolve(ROOT, 'data');
export const MASTER_JSON = resolve(DATA_DIR, 'master', 'game_data_master.json');
export const SCREENSHOTS_DIR = resolve(DATA_DIR, 'screenshots');
export const MAPPINGS = {
    confidence: resolve(DATA_DIR, 'mappings', 'confidence_map.json'),
    theme: resolve(DATA_DIR, 'mappings', 'theme_consolidation_map.json'),
    artTheme: resolve(DATA_DIR, 'mappings', 'art_theme_consolidation_map.json'),
    franchise: resolve(DATA_DIR, 'mappings', 'franchise_mapping.json'),
};
export const MATCHING = {
    dir: resolve(DATA_DIR, 'matching'),
    rulesMatches: resolve(DATA_DIR, 'matching', 'rules_game_matches.json'),
    rulesIndex: resolve(DATA_DIR, 'matching', 'rules_index.json'),
    rulesRejections: resolve(DATA_DIR, 'matching', 'rules_match_rejections.json'),
    rulesFuzzy: resolve(DATA_DIR, 'matching', 'rules_fuzzy_candidates.json'),
    rulesText: resolve(DATA_DIR, 'matching', 'rules_text'),
};
export const STAGING = {
    art: resolve(DATA_DIR, 'staging', 'staged_art_characterization.json'),
    bestOf: resolve(DATA_DIR, 'staging', 'staged_best_of_sources.json'),
    features: resolve(DATA_DIR, 'staging', 'staged_feature_extraction.json'),
};
export const VALIDATION = {
    groundTruthAgs: resolve(DATA_DIR, 'validation', 'ground_truth_ags.json'),
    groundTruthThemes: resolve(DATA_DIR, 'validation', 'ground_truth_themes.json'),
    releaseDates: resolve(DATA_DIR, 'validation', '_release_date_matches.json'),
};
export { ROOT };
