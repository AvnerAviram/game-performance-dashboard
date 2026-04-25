#!/bin/bash
# stop hook — forces one context-aware verification loop when files were edited.
# Reads the edit-tracking flag file to determine WHAT was changed,
# then tailors the verification message accordingly.

input=$(cat)
STATE_FILE=".cursor/hooks/state/edits-pending.json"

LOOP_COUNT=$(echo "$input" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.loop_count || 0);" 2>/dev/null)
STATUS=$(echo "$input" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.status || '');" 2>/dev/null)

# Only trigger on first completed stop
if [ "$LOOP_COUNT" != "0" ] || [ "$STATUS" != "completed" ]; then
  echo '{}'
  exit 0
fi

# No flag file = read-only session, skip verification
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

  if (cat.art_pipeline) {
    parts.push('ART PIPELINE files edited (' + state.files.filter(f => f.includes('classify') || f.includes('art_pipeline')).join(', ') + '). Run: python3 game_analytics_export/data/classify_art_v2.py --regression-full — confirm theme >= 97% adjusted and overall >= 95%. Check batch gate status. State the numbers.');
  }
  if (cat.dev_code) {
    parts.push('CODE files edited (' + state.files.filter(f => f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.html')).join(', ') + '). Run: npm test — confirm all tests pass. Run: npm run build — confirm exit 0. State test count and build result.');
  }
  if (cat.config_rules) {
    parts.push('CONFIG/RULE files edited (' + state.files.filter(f => f.includes('.mdc') || f.includes('package.json') || f.includes('vite')).join(', ') + '). Verify syntax is valid and changes are consistent with existing rules.');
  }

  if (parts.length === 0) {
    console.log(JSON.stringify({}));
  } else {
    const msg = 'VERIFICATION REQUIRED before finishing: ' + parts.join(' | ');
    console.log(JSON.stringify({ followup_message: msg }));
  }

  // Clean up flag file
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
