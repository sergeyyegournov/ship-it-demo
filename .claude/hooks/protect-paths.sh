#!/bin/bash
# PreToolUse (Edit|Write): block edits to protected paths. Exit 2 = block, stderr goes to Claude.
input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[[ -z "$file" ]] && exit 0

case "$file" in
  */.github/*|*/.claude/hooks/*|*/releases/*|*/CODEOWNERS)
    echo "Blocked: $file is a protected path. Open a PR describing the change for a code owner instead." >&2
    exit 2 ;;
esac
exit 0
