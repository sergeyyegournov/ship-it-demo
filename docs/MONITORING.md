# Monitoring

Two layers, deliberately separate.

| Layer | Question | Mechanism | Who acts |
|---|---|---|---|
| Alerting | Is something broken right now? | CloudWatch alarms -> SNS -> email | A human, immediately |
| Detection for the SDLC loop | Did a release move a metric outside its normal band? | `monitor.yml` -> `bands.yaml` + `detect.py` -> drafted `intent/` PR | A human, via the normal chain |

Alarms page; the bands feed the playbook's Maintain stage. A model never decides whether a band is breached.

## Where things live
- **Terraform** (`ship-it-demo-infra`, `aws/monitoring.tf`): alarms (ALB 5xx rate, p95 latency, no healthy host, CloudFront 5xx rate), the SNS topic and email subscription, the dashboard `status-board`, and log metric filters. The alarm address is the `ALARM_EMAIL` secret of the infra repo, not in the code.
- **API** (`src/app.js`): one JSON line per request (`method`, `route` with ids collapsed, `status`, `ms`, `version`). No bodies, no query strings, no health checks.
- **Detection**: `scripts/cloudwatch_readings.py` builds the hourly 5xx-rate series from ALB metrics; `monitor.yml` (`scenario=live`, also the scheduled default) runs it through the bands.

## Behaviour worth knowing
- An hour (or minute, for the alarm) with fewer than 20 requests reads as 0% errors. With little traffic a ratio is noise.
- The first email needs the subscription confirmed: AWS sends a link once.
- The scheduled monitor is still opt-in (`MONITOR_ENABLED=true`); on-demand runs always work.
- CloudWatch ALB metrics have roughly a minute of delay.
- `scripts/load.sh <url> [n]` produces light traffic for the dashboard. A real breach needs a real regression: see the release-and-rollback part of the runbook.
- The synthetic scenarios (`spike`, `drift`, `none`) remain for demos that must not touch production.

<!-- live clock test -->
