# Alternative production gate: release-record PR

This demo gates production deploys with a GitHub **Environment required reviewer** (`production`).
That feature is unavailable on **private repos below GitHub Enterprise** (Free/Pro/Team): the API rejects
required reviewers and wait timers with "billing plan does not support the protection rule".
Plain environments, environment secrets and deployment branch restrictions still work.

If you run this on a private Pro/Team repo, use a **release-record PR** instead. It maps to the playbook's
"release record" artifact and change-ticket idea: a named human authorizes a specific version, with a timestamp in git.

## How it works
1. The agent (or a human) prepares a release by opening a PR that adds `releases/<version>.json`:
   ```json
   {
     "version": "4f2c9e1",
     "requested_by": "claude-code-action",
     "requested_at": "2026-10-24T14:00:00Z",
     "changes": ["#12 add /boards/:id/archive"],
     "evidence": { "tests": "pass", "evals": "pass", "review": "#12" },
     "rollback": "runbooks/rollback.md"
   }
   ```
2. `releases/` is covered by `CODEOWNERS` (e.g. `/releases/ @release-managers`), and `main` has branch protection:
   one approving review, code-owner review required, `enforce_admins` on. The author cannot approve their own PR.
3. `deploy.yml` triggers only on pushes to `main` that touch `releases/*.json`, and deploys the `version` in the
   newest file. The merged PR (approver, timestamp, evidence) is the release record.
4. The `production-gate.sh` PreToolUse hook is unchanged: it denies agent-initiated production deploys unless
   the version has a merged release record, i.e. `git log origin/main -- releases/<version>.json` is non-empty.

## Workflow trigger
```yaml
on:
  push:
    branches: [main]
    paths: ['releases/*.json']
```

## Branch protection
```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["test", "agent-evals"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "require_code_owner_reviews": true },
  "restrictions": null
}
JSON
```

## Trade-offs vs. environment reviewers
| | Environment reviewer | Release-record PR |
|---|---|---|
| Plan needed | Public repo, or Enterprise for private | Any plan with branch protection (Pro+) |
| Approval UI | Approve button on the deployment run | PR review |
| Audit trail | Deployment history | Git history plus PR record |
| Bypass risk | Admins can bypass unless restricted | Admins can bypass unless `enforce_admins` is on |
| Extra friction | None | One extra PR per release |
