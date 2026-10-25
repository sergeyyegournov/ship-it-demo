#!/bin/bash
# Generate light, harmless traffic against the deployed site so the dashboard and alarms have data.
# Usage: scripts/load.sh <url> [requests=200]   (e.g. scripts/load.sh https://dx5bkaca7v71i.cloudfront.net 300)
set -eu
url=${1:?base url}; n=${2:-200}
for i in $(seq 1 "$n"); do
  case $((i % 4)) in
    0) curl -s -o /dev/null -X POST "$url/api/boards" -d "{\"title\":\"load $i\"}" ;;
    1) curl -s -o /dev/null "$url/api/boards" ;;
    2) curl -s -o /dev/null "$url/api/boards?archived=true" ;;
    3) curl -s -o /dev/null "$url/" ;;
  esac
  sleep 0.2
done
echo "sent $n requests to $url"
