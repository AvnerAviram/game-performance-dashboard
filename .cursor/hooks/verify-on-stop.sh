#!/bin/bash
# stop hook — forces one verification loop when files were edited.
# Keeps messages SHORT to minimize token waste.

input=$(cat)
STATE_FILE=".cursor/hooks/state/edits-pending.json"

LOOP_COUNT=$(echo "$input" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.loop_count || 0);" 2>/dev/null)
STATUS=$(echo "$input" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.status || '');" 2>/dev/null)

if [ "$LOOP_COUNT" != "0" ] || [ "$STATUS" != "completed" ]; then
  [ -f "$STATE_FILE" ] && rm -f "$STATE_FILE"
  echo '{}'
  exit 0
fi

if [ ! -f "$STATE_FILE" ]; then
  echo '{}'
  exit 0
fi

FOLLOWUP=$(node -e "
const fs = require('fs');
const sf = '$STATE_FILE';
try {
  const state = JSON.parse(fs.readFileSync(sf, 'utf8'));
  const cat = state.categories || {};
  const parts = [];

  if (cat.dev_code) {
    parts.push('Run npm test + npm run build. State results.');
  }
  if (cat.config_rules) {
    parts.push('Verify edited config/rule files have valid syntax.');
  }

  if (parts.length === 0) {
    console.log(JSON.stringify({}));
  } else {
    const msg = 'VERIFY: ' + parts.join(' ');
    console.log(JSON.stringify({ followup_message: msg }));
  }

  fs.unlinkSync(sf);
} catch(e) {
  console.log(JSON.stringify({}));
}
" 2>/dev/null)

if [ -z "$FOLLOWUP" ]; then
  echo '{}'
else
  echo "$FOLLOWUP"
fi

exit 0
