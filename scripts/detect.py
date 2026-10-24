#!/usr/bin/env python3
"""Control-band detector.

Usage: detect.py [bands.yaml] < readings.json
Reads a JSON list of readings (oldest first) on stdin. The baseline is every reading except the newest `n`
of the widest tier, so a spike cannot inflate its own baseline. Prints one JSON object:
  {"metric", "tier", "action", "routes", "mean", "sigma", "latest", "threshold"}
`tier` is the worst tier breached, or "none". Deterministic: same input, same output.
"""
import json
import statistics
import sys

import yaml

MIN_BASELINE = 24  # hours of history needed before alerting at all


def above(readings, threshold, k, n):
    """True if at least k of the last n readings exceed threshold."""
    return sum(1 for r in readings[-n:] if r > threshold) >= k


def detect(readings, bands):
    tiers = bands["tiers"]
    widest = max(t["n"] for t in tiers.values())
    baseline = readings[:-widest]
    if len(baseline) < MIN_BASELINE:
        raise ValueError(f"need at least {MIN_BASELINE + widest} readings, got {len(readings)}")
    mean = statistics.fmean(baseline)
    sigma = max(statistics.pstdev(baseline), bands.get("min_sigma", 0.0))

    result = {"metric": bands["metric"], "tier": "none", "action": "none", "routes": [],
              "mean": round(mean, 4), "sigma": round(sigma, 4), "latest": readings[-1], "threshold": None}
    for name, t in sorted(tiers.items(), key=lambda kv: -kv[1]["sigmas"]):  # worst first
        threshold = mean + t["sigmas"] * sigma
        if above(readings, threshold, t["k"], t["n"]):
            result.update(tier=name, action=t["action"], routes=t.get("routes", []), threshold=round(threshold, 4))
            break
    return result


if __name__ == "__main__":
    bands = yaml.safe_load(open(sys.argv[1] if len(sys.argv) > 1 else "bands.yaml"))
    print(json.dumps(detect(json.load(sys.stdin), bands)))
