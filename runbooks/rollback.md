# Runbook: rollback-deploy (pre-approved)

Referenced by `bands.yaml` (`runbook:rollback-deploy`). A model may *propose* this runbook; a human runs it.

## When
`status_5xx_rate` is in the 3sigma band and the newest release in `releases/` is the likely cause.

## Steps
1. Find the previous good version: the second-newest file in `releases/` by `requested_at`.
2. Confirm it is still released: `git cat-file -e origin/main:releases/<good>.json`.
3. Roll back: `scripts/rollback.sh <good>`. This redeploys that exact version through `scripts/deploy.sh production <good>`,
   which the release-gate hook allows only because a merged release record already exists for it.
   On AWS that means: reuse the image already in ECR for `<good>` (nothing is rebuilt), register a task definition revision for it,
   roll the ECS service, wait for stability and for `https://<cloudfront>/api/version` to report `<good>`, then republish `web/` as it was at `<good>`.
4. Re-run the detector after an hour of fresh readings; the band must clear.
5. Open a follow-up `intent/` PR describing the cause; do not re-release the bad version without a new release record.

`deploy.sh` also rolls the service back on its own if a new release never becomes healthy.
The ECR repository keeps the last 20 images, so only the last 20 releases are rollback targets.

## Not covered
Data migrations, schema changes, or anything not present in `releases/`. Boards are in memory, so a rollback (like any redeploy) resets them. Escalate to the service owner.
