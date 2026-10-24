#!/bin/bash
# Simulated deploy so the demo has no cloud dependency. Usage: scripts/deploy.sh <staging|production> <version>
# Replace the body with a real deploy call; keep the arguments and the release-gate hook contract.
set -eu
env=${1:?environment}; version=${2:?version}
[[ "$env" == staging || "$env" == production ]] || { echo "unknown environment: $env" >&2; exit 1; }
mkdir -p .deploy
printf '{"environment":"%s","version":"%s","deployed_at":"%s"}\n' "$env" "$version" "$(date -u +%FT%TZ)" | tee ".deploy/$env.json"
