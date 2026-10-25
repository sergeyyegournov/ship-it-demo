#!/usr/bin/env python3
"""Real telemetry for the control bands: hourly 5xx rate (percent) from the ALB metrics in CloudWatch.

Usage: cloudwatch_readings.py [hours=720]    -> JSON list on stdout, oldest first, same shape as metrics/*.json
Needs AWS credentials and ALB_ARN_SUFFIX / TG_ARN_SUFFIX (written to repo variables by ship-it-demo-infra).
An hour with fewer than `min_requests` requests reads 0: a ratio over a handful of requests is noise, and the
CloudWatch alarm applies the same rule. Hours with no datapoints (no traffic) are filled with 0.
"""
import datetime as dt
import json
import os
import subprocess
import sys

import yaml

HOUR = 3600


def to_readings(errors, requests, hours, end, min_requests):
    """errors/requests: {epoch_seconds_of_hour_start: sum}. Returns `hours` readings ending before `end`."""
    out = []
    first = end - hours * HOUR
    for t in range(first, end, HOUR):
        req = requests.get(t, 0)
        err = errors.get(t, 0)
        out.append(round(100 * err / req, 3) if req >= min_requests else 0.0)
    return out


def _series(results, query_id):
    for r in results:
        if r["Id"] == query_id:
            return {int(dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()): v
                    for ts, v in zip(r["Timestamps"], r["Values"])}
    return {}


def fetch(hours, end):
    dims = [{"Name": "LoadBalancer", "Value": os.environ["ALB_ARN_SUFFIX"]},
            {"Name": "TargetGroup", "Value": os.environ["TG_ARN_SUFFIX"]}]
    def q(qid, metric):
        return {"Id": qid, "ReturnData": True, "MetricStat": {
            "Metric": {"Namespace": "AWS/ApplicationELB", "MetricName": metric, "Dimensions": dims},
            "Period": HOUR, "Stat": "Sum"}}
    cmd = ["aws", "cloudwatch", "get-metric-data", "--scan-by", "TimestampAscending", "--output", "json",
           "--start-time", dt.datetime.fromtimestamp(end - hours * HOUR, dt.timezone.utc).isoformat(),
           "--end-time", dt.datetime.fromtimestamp(end, dt.timezone.utc).isoformat(),
           "--metric-data-queries", json.dumps([q("errors", "HTTPCode_Target_5XX_Count"), q("requests", "RequestCount")])]
    results = json.loads(subprocess.run(cmd, check=True, capture_output=True, text=True).stdout)["MetricDataResults"]
    return _series(results, "errors"), _series(results, "requests")


if __name__ == "__main__":
    hours = int(sys.argv[1]) if len(sys.argv) > 1 else 720
    bands = yaml.safe_load(open(os.path.join(os.path.dirname(__file__), "..", "bands.yaml")))
    min_requests = bands.get("cloudwatch", {}).get("min_requests", 20)
    end = int(dt.datetime.now(dt.timezone.utc).timestamp()) // HOUR * HOUR   # top of the current hour: complete hours only
    errors, requests = fetch(hours, end)
    print(json.dumps(to_readings(errors, requests, hours, end, min_requests)))
