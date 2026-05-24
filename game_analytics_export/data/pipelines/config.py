"""
Shared path configuration for all Python pipeline scripts.
Import this module to get consistent paths regardless of which script is running.
"""

from pathlib import Path

# data/pipelines/ directory
PIPELINE_ROOT = Path(__file__).resolve().parent
# game_analytics_export/data/ directory
DATA_DIR = PIPELINE_ROOT.parent
# game_analytics_export/ directory
APP_ROOT = DATA_DIR.parent

# Core data paths
MASTER_JSON = DATA_DIR / 'master' / 'game_data_master.json'
SCREENSHOTS_DIR = DATA_DIR / 'screenshots'

# SlotCatalog HTML cache (legacy)
SC_CACHE_DIR = DATA_DIR / '_legacy' / 'sc_cache'

# Pipeline-specific
ART_PIPELINE_DIR = PIPELINE_ROOT / 'art_pipeline'
ART_STATE_DIR = ART_PIPELINE_DIR / 'state'
ART_RESULTS = ART_STATE_DIR / 'results.json'
ART_CONFIG = ART_PIPELINE_DIR / 'config.json'
ART_GROUND_TRUTH = ART_PIPELINE_DIR / 'ground_truth.json'

# Staging (pipeline outputs before merge)
STAGING_DIR = DATA_DIR / 'staging'
STAGED_ART = STAGING_DIR / 'staged_art_characterization.json'
STAGED_FEATURES = STAGING_DIR / 'staged_feature_extraction.json'

# Mappings
MAPPINGS_DIR = DATA_DIR / 'mappings'
THEME_MAP = MAPPINGS_DIR / 'theme_consolidation_map.json'
ART_THEME_MAP = MAPPINGS_DIR / 'art_theme_consolidation_map.json'

# Matching
MATCHING_DIR = DATA_DIR / 'matching'
RULES_TEXT_DIR = MATCHING_DIR / 'rules_text'
RULES_HTML_DIR = MATCHING_DIR / 'rules_html'

# Validation
VALIDATION_DIR = DATA_DIR / 'validation'

# Environment
ENV_FILE = PIPELINE_ROOT / '.env'
if not ENV_FILE.exists():
    ENV_FILE = DATA_DIR / '.env'  # fallback
