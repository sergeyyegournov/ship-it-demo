#!/bin/bash
# PreToolUse (Bash): production deploys need a merged release record in releases/<version>.json.
# Mirrors the playbook's change-ticket gate: deny with a message that tells Claude how to get approval.
# Exit 2 = deny (stderr goes to Claude). Exit 0 = no objection (normal permission flow continues).
input=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")

# Only gate: scripts/deploy.sh production <version>
if [[ ! "$cmd" =~ scripts/deploy\.sh[[:space:]]+production[[:space:]]+([^[:space:]]+) ]]; then exit 0; fi
version="${BASH_REMATCH[1]}"

route="Open a PR adding releases/$version.json (see docs/ALTERNATIVE-RELEASE-GATE.md for the format); a code owner approves it, then deploy.yml ships it. Do not deploy production from a session."

if [[ ! "$version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Blocked: '$version' is not a commit hash. $route" >&2; exit 2
fi

git fetch -q origin main 2>/dev/null
# The record must exist in main's current tree (a deleted/revoked record no longer authorizes the release).
if git cat-file -e "origin/main:releases/$version.json" 2>/dev/null; then
  exit 0
fi
echo "Blocked: production deploy of $version has no merged release record. $route" >&2
exit 2
