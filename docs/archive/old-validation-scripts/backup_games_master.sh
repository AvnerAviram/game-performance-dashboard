#!/bin/bash
# Backup games_master.json before Phase 1 (or any validation run)
# Creates: game_analytics_export/data/games_master.backup-YYYY-MM-DDTHH-MM-SS.json

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../game_analytics_export/data"
MASTER="$DATA_DIR/games_master.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%S")
BACKUP="$DATA_DIR/games_master.backup-$TIMESTAMP.json"

if [ ! -f "$MASTER" ]; then
  echo "Error: games_master.json not found at $MASTER"
  exit 1
fi

cp "$MASTER" "$BACKUP"
echo "Backup created: $BACKUP"
