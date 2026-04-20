#!/bin/bash
# Atlas working memory validation gate
# Runs at session start — checks memory file against real data,
# injects summary into agent context so Atlas never starts blind.

MEMORY_FILE=".cursor/rules/atlas-working-memory.mdc"
DATA_DIR="game_analytics_export/data"

if [ ! -f "$MEMORY_FILE" ]; then
  echo '{"additional_context": "⚠️ ATLAS MEMORY FILE MISSING at .cursor/rules/atlas-working-memory.mdc — create it immediately before doing any work."}'
  exit 0
fi

LAST_UPDATED=$(grep "Last updated:" "$MEMORY_FILE" | head -1 | sed 's/.*Last updated: //')

LIVE_STATS=$(node -e "
const fs = require('fs');
const p = '$DATA_DIR';
try {
  const master = JSON.parse(fs.readFileSync(p + '/game_data_master.json','utf8'));
  const ss = fs.readdirSync(p + '/screenshots').filter(f => /\.(jpg|png|webp|jpeg)$/i.test(f)).length;
  const results = JSON.parse(fs.readFileSync(p + '/art_pipeline/results.json','utf8'));
  const v2 = Object.values(results.games).filter(g => g._is_v2).length;
  const reviews = JSON.parse(fs.readFileSync(p + '/art_pipeline/user_reviews.json','utf8'));
  const autoR = new Set(['auto_v11_5','auto_text_v11_5']);
  let human = 0;
  for (const [g,d] of Object.entries(reviews.games)) { if (!autoR.has(d.review_round)) human++; }
  const gt = JSON.parse(fs.readFileSync(p + '/art_pipeline/ground_truth.json','utf8'));
  const corr = JSON.parse(fs.readFileSync(p + '/art_pipeline/corrections.json','utf8'));
  console.log(JSON.stringify({
    master: master.length,
    slots: master.filter(g => g.game_category === 'Slot').length,
    screenshots: ss,
    results: Object.keys(results.games).length,
    v2: v2,
    gt: Object.keys(gt.games).length,
    human_reviews: human,
    corrections: Object.keys(corr.corrections || corr).length,
  }));
} catch(e) { console.log(JSON.stringify({error: e.message})); }
" 2>/dev/null)

if echo "$LIVE_STATS" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); if(d.error) process.exit(1);" 2>/dev/null; then
  SUMMARY=$(echo "$LIVE_STATS" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const lines = [
      'ATLAS MEMORY GATE — Session Start',
      'Memory last updated: $LAST_UPDATED',
      'Live data: ' + d.master + ' master games, ' + d.slots + ' slots, ' + d.screenshots + ' screenshots, ' + d.results + ' results (' + d.v2 + ' v2), ' + d.gt + ' GT games, ' + d.human_reviews + ' human reviews, ' + d.corrections + ' corrections',
      'Read .cursor/rules/atlas-working-memory.mdc for full state before answering.',
    ];
    console.log(lines.join(' | '));
  " 2>/dev/null)

  echo "{\"additional_context\": \"$SUMMARY\"}"
else
  echo '{"additional_context": "ATLAS MEMORY GATE: Could not validate live stats. Read .cursor/rules/atlas-working-memory.mdc manually before answering."}'
fi

exit 0
