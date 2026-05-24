#!/bin/bash
# beforeShellExecution hook — blocks or flags dangerous commands for ALL agents.

input=$(cat)
command=$(echo "$input" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.command || '');" 2>/dev/null)

if [ -z "$command" ]; then
  echo '{"permission": "allow"}'
  exit 0
fi

# HARD BLOCK: rm -rf on critical directories
if echo "$command" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|(-[a-zA-Z]*f[a-zA-Z]*r))\s' ; then
  if echo "$command" | grep -qE '(data/|art_pipeline/|screenshots/|dist/|game_data_master)'; then
    cat << EOF
{
  "permission": "deny",
  "user_message": "BLOCKED: Recursive delete on critical data directory.",
  "agent_message": "HOOK BLOCKED: rm -rf targeting critical directories (data/, art_pipeline/, screenshots/, dist/) is not allowed. These contain irreplaceable pipeline data. If you need to clean up, delete specific files individually."
}
EOF
    exit 0
  fi
fi

# HARD BLOCK: --force-gate (should not exist, but catch attempts)
if echo "$command" | grep -qE -- '--force[-_]gate'; then
  cat << EOF
{
  "permission": "deny",
  "user_message": "BLOCKED: --force-gate does not exist. The batch gate cannot be bypassed.",
  "agent_message": "HOOK BLOCKED: There is no --force-gate flag. The batch gate is enforced in code. To open the gate: fix issues, run --regression-full (auto-opens if theme >= 97% and fixes_applied is true). There is no bypass."
}
EOF
  exit 0
fi

# HARD BLOCK: git push --force to main/master
if echo "$command" | grep -qE 'git\s+push\s+.*(-f|--force)' ; then
  if echo "$command" | grep -qE '(main|master)'; then
    cat << EOF
{
  "permission": "deny",
  "user_message": "BLOCKED: Force push to main/master is not allowed.",
  "agent_message": "HOOK BLOCKED: Force pushing to main/master can destroy commit history. Use a regular push or create a pull request instead."
}
EOF
    exit 0
  fi
fi

# ASK: Large classification runs (cost guard)
if echo "$command" | grep -qE 'classify_art\.py' ; then
  file_count=$(echo "$command" | grep -oE '\.html' | wc -l | tr -d ' ')
  if [ "$file_count" -gt 200 ]; then
    cost=$(echo "$file_count * 0.01" | bc 2>/dev/null || echo "?")
    cat << EOF
{
  "permission": "ask",
  "user_message": "Large batch: $file_count games (~\$$cost at T3 rate). Confirm to proceed.",
  "agent_message": "Cost guard: This classification run has $file_count games. Estimated cost ~\$$cost at the T3 rate (\$0.01/game). Please confirm with the user before proceeding with batches this large."
}
EOF
    exit 0
  fi
fi

echo '{"permission": "allow"}'
exit 0
