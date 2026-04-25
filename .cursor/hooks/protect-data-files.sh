#!/bin/bash
# preToolUse hook (Write|StrReplace|Delete) — blocks direct writes to protected pipeline data files.
# Agents must use the pipeline CLI (classify_art_v2.py) to modify these files.

input=$(cat)

FILE_PATH=$(echo "$input" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const p = (d.tool_input && (d.tool_input.path || d.tool_input.file_path)) || '';
console.log(p);
" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  echo '{"permission": "allow"}'
  exit 0
fi

PROTECTED_PATTERNS=(
  "game_data_master.json"
  "art_pipeline/results.json"
  "art_pipeline/user_reviews.json"
  "art_pipeline/ground_truth.json"
  "art_pipeline/corrections.json"
  "art_pipeline/batch_gate.json"
)

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern" ]]; then
    cat << EOF
{
  "permission": "deny",
  "user_message": "BLOCKED: Direct write to protected file '$pattern'. Use the pipeline CLI instead.",
  "agent_message": "HOOK BLOCKED: You attempted to directly write to '$pattern'. This file is protected. Use the pipeline CLI (classify_art_v2.py) to modify pipeline data files. For game_data_master.json, you need explicit user permission. This protection exists because direct writes bypass validation logic and can corrupt data."
}
EOF
    exit 0
  fi
done

echo '{"permission": "allow"}'
exit 0
