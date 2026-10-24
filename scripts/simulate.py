#!/usr/bin/env python3
"""Synthetic telemetry for the demo (no cloud needed).

  simulate.py baseline            30 days of hourly 5xx-rate readings (seeded, reproducible)
  simulate.py spike  <file>       the same file with a post-release 5xx spike appended (prints to stdout)
  simulate.py drift  <file>       a slow regression: sustained creep that reaches the 2-sigma band
"""
import json
import random
import sys

HOURS = 720


def baseline():
    rng = random.Random(42)
    return [round(max(0.0, rng.gauss(0.40, 0.08)), 3) for _ in range(HOURS)]


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "baseline"
    if mode == "baseline":
        print(json.dumps(baseline()))
    else:
        r = json.load(open(sys.argv[2]))
        if mode == "spike":
            r = r[1:] + [3.2]
        elif mode == "drift":
            r = r[:-6] + [0.52, 0.55, 0.53, 0.56, 0.54, 0.57]
        else:
            sys.exit(f"unknown mode {mode}")
        print(json.dumps(r))
