#!/bin/bash
# Pre-approved rollback: redeploy a previously released version. Usage: scripts/rollback.sh <good-version>
set -eu
good=${1:?good version}
git fetch -q origin main 2>/dev/null || true
git cat-file -e "origin/main:releases/$good.json" 2>/dev/null || { echo "refusing: $good has no release record on main" >&2; exit 1; }
exec "$(dirname "$0")/deploy.sh" production "$good"
