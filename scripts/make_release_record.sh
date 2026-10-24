#!/bin/bash
# Deterministically write releases/<version>.json (no model involved). Usage: scripts/make_release_record.sh [version]
# version defaults to the short sha of HEAD. Evidence comes from that commit's check-runs, not from anyone's say-so.
set -eu
version=${1:-$(git rev-parse --short=7 HEAD)}
full=$(git rev-parse "$version^{commit}")
[ ! -e "releases/$version.json" ] || { echo "release record for $version already exists" >&2; exit 1; }

prev=$(ls -t releases/*.json 2>/dev/null | head -1 || true)
range="${prev:+$(jq -r .version "$prev")..}$full"
changes=$(git log --no-merges --format='%s' "$range" 2>/dev/null | head -10 | jq -R . | jq -s .)

repo=${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}
# Checks and review run on the PR head, not on the squash-merge commit, so look the PR up first.
pr=$(gh api "repos/$repo/commits/$full/pulls" --jq '.[0].number // empty' 2>/dev/null || true)
head=$full
[ -z "$pr" ] || head=$(gh api "repos/$repo/pulls/$pr" --jq .head.sha)
check() { gh api "repos/$repo/commits/$head/check-runs" \
  --jq "[.check_runs[]|select(.name==\"$1\")][0].conclusion // \"missing\"" 2>/dev/null || echo unknown; }

mkdir -p releases
jq -n --arg v "$version" --arg by "${REQUESTED_BY:-claude[bot]}" --arg at "$(date -u +%FT%TZ)" \
  --argjson changes "$changes" --arg t "$(check test)" --arg e "$(check agent-evals)" --arg pr "${pr:-none}" \
  '{version:$v, requested_by:$by, requested_at:$at, changes:$changes, evidence:{pr:$pr, tests:$t, evals:$e}, rollback:"runbooks/rollback.md"}' \
  > "releases/$version.json"
cat "releases/$version.json"
