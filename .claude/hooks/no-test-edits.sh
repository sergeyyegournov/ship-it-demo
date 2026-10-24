#!/bin/bash
# PreToolUse (Edit|Write): when CLAUDE_TASK=fix, existing test files are read-only.
# New test files are allowed (fix tasks commit a failing test first).
input=$(cat)
[[ "$CLAUDE_TASK" != "fix" ]] && exit 0
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")

if [[ "$file" == */test/* && -e "$file" ]]; then
  echo "Blocked: fix tasks must not edit existing tests ($file). Fix the code, or add a new failing test." >&2
  exit 2
fi
exit 0
