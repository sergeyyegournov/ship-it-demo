#!/bin/bash
# Usage: evals/check.sh <eval.json> <claude-result.json> <worktree>
# Passes only if: claude finished without error, only may_change paths were touched,
# and every check command succeeds. Checks live in the main checkout, so the agent cannot edit them.
set -u
eval_json=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
result=$(cd "$(dirname "$2")" && pwd)/$(basename "$2"); wt=$3
ROOT=$(cd "$(dirname "$0")/.." && pwd)
name=$(jq -er .name "$eval_json") || { echo "FAIL: cannot read eval $1"; exit 1; }
from=$(jq -er .from "$eval_json") || { echo "FAIL $name: eval has no from"; exit 1; }

if [ "$(jq -r '.is_error' "$result" 2>/dev/null)" != "false" ]; then
  echo "FAIL $name: claude run errored or produced no result"; exit 1
fi

cd "$wt" || exit 1
git add -A -N .
# Files the agent touched must sit under may_change (and never evals/ or .claude/ or CLAUDE.md overlays)
bad=$(git diff --name-only "$from" -- . ':!CLAUDE.md' ':!.claude' \
  | while read -r f; do
      ok=0
      for p in $(jq -r '.may_change[]' "$eval_json"); do [[ "$f" == $p* ]] && ok=1; done
      [ $ok -eq 0 ] && echo "$f"
    done)
if [ -n "$bad" ]; then echo "FAIL $name: changed files outside may_change: $bad"; exit 1; fi

n=$(jq -e '.checks | length' "$eval_json") && [ "$n" -gt 0 ] || { echo "FAIL $name: eval defines no checks"; exit 1; }
for i in $(seq 0 $((n - 1))); do
  cname=$(jq -r ".checks[$i].name" "$eval_json")
  cmd=$(jq -r ".checks[$i].run" "$eval_json" | sed "s#evals/checks/#$ROOT/evals/checks/#g")
  if ! APP_DIR="$wt" bash -c "$cmd" >/tmp/check.out 2>&1; then
    echo "FAIL $name: check '$cname'"; sed 's/^/    /' /tmp/check.out | tail -8; exit 1
  fi
done
echo "PASS $name"
