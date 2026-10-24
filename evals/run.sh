#!/bin/bash
# Usage: evals/run.sh [eval.json ...]   (default: all evals/*.json)
# For each eval: fresh worktree at `from`, overlay the CLAUDE.md/.claude under test, run claude -p, check.
# Env: EVAL_MODEL (default sonnet), EVAL_MAX_USD (default 0.75 per eval), PASS_THRESHOLD (default 0.8)
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 1
evals=("$@"); [ ${#evals[@]} -eq 0 ] && evals=(evals/*.json)
pass=0; total=0

for e in "${evals[@]}"; do
  total=$((total + 1))
  name=$(jq -r .name "$e")
  wt=$(mktemp -d)/run
  git worktree add -q --detach "$wt" "$(jq -r .from "$e")"
  rm -rf "$wt/.claude"; cp -R .claude "$wt/.claude"; cp CLAUDE.md "$wt/CLAUDE.md"   # config under test
  ( cd "$wt" && claude -p "$(jq -r .prompt "$ROOT/$e")" \
      --output-format json --permission-mode acceptEdits --model "${EVAL_MODEL:-sonnet}" \
      --max-budget-usd "${EVAL_MAX_USD:-0.75}" \
      --allowedTools "Read" "Edit" "Write" "Bash(npm test)" "Bash(npm run lint)" "Bash(node *)" \
      > "$wt/../result.json" 2> "$wt/../stderr.txt" )
  if "$ROOT/evals/check.sh" "$ROOT/$e" "$wt/../result.json" "$wt"; then pass=$((pass + 1)); fi
  git worktree remove --force "$wt"
done

rate=$(awk "BEGIN{printf \"%.2f\", $pass/$total}")
echo "pass rate: $pass/$total ($rate)"
awk "BEGIN{exit !($rate >= ${PASS_THRESHOLD:-0.8})}"
