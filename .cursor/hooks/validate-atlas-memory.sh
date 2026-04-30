#!/bin/bash
# Project session start hook — agent-neutral.
# Injects live project state (data counts, gate status, drift detection)
# into ANY agent's context. Also cleans up stale edit-tracking flags.

MEMORY_FILE=".cursor/rules/atlas-working-memory.mdc"
DATA_DIR="game_analytics_export/data"
STATE_DIR=".cursor/hooks/state"

# Clean up stale flag files from crashed sessions
rm -f "$STATE_DIR/edits-pending.json" 2>/dev/null

if [ ! -f "$MEMORY_FILE" ]; then
  echo '{"additional_context": "PROJECT MEMORY FILE MISSING at .cursor/rules/atlas-working-memory.mdc — read it or create it before doing any work."}'
  exit 0
fi

LAST_UPDATED=$(grep "Last updated:" "$MEMORY_FILE" | head -1 | sed 's/.*Last updated: //')

CONTEXT=$(node -e "
const fs = require('fs');
const p = '$DATA_DIR';
const mem = fs.readFileSync('$MEMORY_FILE', 'utf8');
try {
  const master = JSON.parse(fs.readFileSync(p + '/game_data_master.json','utf8'));
  const ss = fs.readdirSync(p + '/screenshots').filter(f => /\.(jpg|png|webp|jpeg)$/i.test(f)).length;
  const results = JSON.parse(fs.readFileSync(p + '/art_pipeline/results.json','utf8'));
  const resCount = Object.keys(results.games).length;
  const v2 = Object.values(results.games).filter(g => g._is_v2).length;
  const reviews = JSON.parse(fs.readFileSync(p + '/art_pipeline/user_reviews.json','utf8'));
  const autoR = new Set(['auto_v11_5','auto_text_v11_5']);
  let human = 0;
  for (const [g,d] of Object.entries(reviews.games)) { if (!autoR.has(d.review_round)) human++; }
  const corr = JSON.parse(fs.readFileSync(p + '/art_pipeline/corrections.json','utf8'));
  const corrCount = Object.keys(corr.corrections || corr).length;

  let gateStatus = 'unknown';
  try {
    const gate = JSON.parse(fs.readFileSync(p + '/art_pipeline/batch_gate.json','utf8'));
    gateStatus = gate.gate_open ? 'OPEN' : 'CLOSED: ' + (gate.reason || 'spot-check issues pending').slice(0, 80);
  } catch(e) { gateStatus = 'MISSING (fail-safe = closed)'; }

  const drifts = [];
  const memResults = mem.match(/\\*\\*(\\d[\\d,]+) games classified\\*\\*/);
  if (memResults) {
    const memCount = parseInt(memResults[1].replace(/,/g, ''));
    if (Math.abs(memCount - resCount) > 5) drifts.push('results: memory=' + memCount + ' live=' + resCount);
  }
  const memHuman = mem.match(/Human-reviewed: (\\d+) games/);
  if (memHuman) {
    const mh = parseInt(memHuman[1]);
    if (Math.abs(mh - human) > 3) drifts.push('human_reviews: memory=' + mh + ' live=' + human);
  }

  const lines = [];
  lines.push('SESSION START | Memory updated: ' + '$LAST_UPDATED');
  lines.push('Live data: ' + master.length + ' master, ' + resCount + ' classified (' + v2 + ' v2), ' + ss + ' screenshots, ' + human + ' human reviews, ' + corrCount + ' corrections');
  lines.push('Batch gate: ' + gateStatus);
  if (drifts.length > 0) lines.push('DRIFT DETECTED: ' + drifts.join('; ') + '. Update working memory before answering.');
  lines.push('Start: Read AGENTS.md for project overview. Agent roles in agents/. Rules in .cursor/rules/. Run npm test after code changes.');

  // Parse MASTER_PLAN.md if it exists
  try {
    const plan = fs.readFileSync('MASTER_PLAN.md', 'utf8');
    const bl = (plan.match(/^- \\[ \\]/gm) || []).length;
    const ip = (plan.match(/^- \\[~\\]/gm) || []).length;
    const dn = (plan.match(/^- \\[x\\]/gm) || []).length;
    const bk = (plan.match(/^- \\[!\\]/gm) || []).length;
    const phaseMatch = plan.match(/^## (.+?)\\(CURRENT/m);
    const phase = phaseMatch ? phaseMatch[1].trim() : 'unknown';
    lines.push('Master plan: ' + ip + ' in-progress, ' + bl + ' backlog, ' + dn + ' done, ' + bk + ' blocked. Current phase: ' + phase);
  } catch(e) {}

  console.log(JSON.stringify({ summary: lines.join(' | ') }));
} catch(e) {
  console.log(JSON.stringify({ summary: 'SESSION START: Validation failed (' + e.message + '). Read .cursor/rules/atlas-working-memory.mdc manually.' }));
}
" 2>/dev/null)

SUMMARY=$(echo "$CONTEXT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.summary);" 2>/dev/null)

if [ -z "$SUMMARY" ]; then
  echo '{"additional_context": "SESSION START: Hook validation failed. Read .cursor/rules/atlas-working-memory.mdc manually."}'
else
  echo "{\"additional_context\": \"$SUMMARY\"}"
fi

exit 0
