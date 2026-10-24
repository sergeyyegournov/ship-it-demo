#!/bin/bash
# Free, no-API sanity check: on each eval's `from` commit the FIRST check must FAIL
# (otherwise the eval would pass without the agent doing anything).
ROOT=$(cd "$(dirname "$0")/.." && pwd); cd "$ROOT" || exit 1
rc=0
for e in evals/*.json; do
  name=$(jq -r .name "$e")
  wt=$(mktemp -d)/run; git worktree add -q --detach "$wt" "$(jq -r .from "$e")"
  cmd=$(jq -r '.checks[0].run' "$e" | sed "s#evals/checks/#$ROOT/evals/checks/#g")
  if APP_DIR="$wt" bash -c "cd $wt && $cmd" >/dev/null 2>&1; then echo "BAD  $name: check passes without any change"; rc=1
  else echo "ok   $name: fails at base as expected"; fi
  git worktree remove --force "$wt"
done
exit $rc
