#!/bin/bash
# afterFileEdit hook — categorizes edited files for the stop hook.

input=$(cat)
STATE_FILE=".cursor/hooks/state/edits-pending.json"

FILE_PATH=$(echo "$input" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.file_path || '');" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

mkdir -p .cursor/hooks/state

node -e "
const fs = require('fs');
const fp = '$FILE_PATH';
const sf = '$STATE_FILE';

let state = { files: [], categories: { dev_code: false, config_rules: false }, timestamp: '' };
try { state = JSON.parse(fs.readFileSync(sf, 'utf8')); } catch(e) {}

const basename = fp.split('/').pop();
if (!state.files.includes(basename)) state.files.push(basename);

const fpLower = fp.toLowerCase();
if (fpLower.includes('/src/') || fpLower.includes('/server/') || fpLower.includes('/tests/') || fpLower.endsWith('.js') || fpLower.endsWith('.cjs') || fpLower.endsWith('.html'))
  state.categories.dev_code = true;
if (fpLower.includes('.cursor/rules/') || fpLower.includes('package.json') || fpLower.includes('vite.config'))
  state.categories.config_rules = true;

state.timestamp = new Date().toISOString();
fs.writeFileSync(sf, JSON.stringify(state, null, 2));
" 2>/dev/null

exit 0
