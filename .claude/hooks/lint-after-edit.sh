#!/bin/bash
# PostToolUse (Edit|Write): run lint after JS edits. Exit 2 feeds lint errors back to Claude.
input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[[ "$file" != *.js ]] && exit 0

if ! out=$(cd "${CLAUDE_PROJECT_DIR:-.}" && npm run --silent lint 2>&1); then
  echo "$out" >&2
  exit 2
fi
exit 0
