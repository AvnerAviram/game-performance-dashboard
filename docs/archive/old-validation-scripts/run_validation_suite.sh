#!/bin/bash
# Run full validation suite (Phases 0-5)
# Usage: ./run_validation_suite.sh [--backup]

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ "$1" = "--backup" ]; then
  echo "Creating backup..."
  bash backup_games_master.sh
fi

echo "Phase 0: CSV Baseline Reconciliation"
python3 validate_phase0_csv_baseline.py

echo ""
echo "Phase 1: Provider Verification (report)"
python3 validate_phase1_provider.py --report

echo ""
echo "Phase 2: Names & Performance"
python3 validate_phase2_names_performance.py

echo ""
echo "Phase 3: RTP & Specs"
python3 validate_phase3_specs.py

echo ""
echo "Phase 4: Themes & Mechanics"
python3 validate_phase4_themes.py

echo ""
echo "Phase 5: FLAGGED & Cleanup"
python3 validate_phase5_flagged.py

echo ""
echo "Validation suite complete. Reports in game_analytics_export/data/"
