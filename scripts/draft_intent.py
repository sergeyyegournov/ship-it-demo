#!/usr/bin/env python3
"""Draft an intent.md from a detector result. Facts only; the diagnosis and open questions are left to a human or a read-only agent.

Usage: draft_intent.py <detect-result.json> <out.md>
Recent releases come from releases/*.json (newest requested_at first) so the draft names the likely suspect deploy.
"""
import glob
import json
import sys
from datetime import datetime, timezone


def recent_releases(limit=3):
    recs = []
    for path in glob.glob("releases/*.json"):
        with open(path) as f:
            recs.append(json.load(f))
    recs.sort(key=lambda r: r.get("requested_at", ""), reverse=True)
    return recs[:limit]


def draft(res, releases, now):
    suspect = releases[0]["version"] if releases else "unknown"
    lines = [
        f"# Intent: {res['metric']} {res['tier']} after release {suspect}",
        "",
        f"Author: monitoring agent ({res['metric']}, {res['tier']}). Status: draft. Opened: {now}.",
        "",
        "## Problem",
        f"`{res['metric']}` latest reading is {res['latest']} against a 30-day baseline of mean {res['mean']} "
        f"and sigma {res['sigma']}. The {res['tier']} band triggers above {res['threshold']}.",
        "",
        "## Proposed outcome",
        f"Return `{res['metric']}` to within the baseline band. Decide: fix forward, roll back, or dismiss as noise.",
        "",
        "## Affected systems",
        "- status-board HTTP service (`src/app.js`)",
        "",
        "## Constraints",
        f"- Detector action for this tier: **{res['action']}**; allowed routes: {', '.join(res['routes']) or 'none'}.",
        "- No production change without a merged release record (`releases/<version>.json`) approved by a code owner.",
        "- Rollback is only via the pre-approved runbook `runbooks/rollback.md`.",
        "",
        "## Actions already taken",
        "- None. The monitor observed the breach and drafted this document; it changed nothing.",
        "",
        "## Recent releases",
    ]
    lines += [f"- `{r['version']}` requested {r.get('requested_at', '?')} by {r.get('requested_by', '?')}: "
              f"{'; '.join(r.get('changes', []))}" for r in releases] or ["- none on record"]
    lines += ["", "## Open questions", "- Which release introduced this, and is the rate still elevated?",
              "- Fix, schedule, or dismiss?", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    with open(sys.argv[1]) as f:
        res = json.load(f)
    with open(sys.argv[2], "w") as f:
        f.write(draft(res, recent_releases(), datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")))
