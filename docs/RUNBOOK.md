# Live demo runbook

About 25 minutes. Each stage shows an artifact, a guardrail, and a human checkpoint. **You** are the human: do the clicks yourself.
Never approve or merge with a script or an agent; the demo's claim is that the agent can't.

## Setup (once, before the audience arrives)
- Fresh copy of the repo (template) with `ANTHROPIC_API_KEY`, the Claude app installed, and `scripts/setup-github.sh` applied.
- Be logged in to GitHub as the code owner, and have the repo's Actions tab open.

## 0. Show the guardrails first (3 min)
- `CLAUDE.md` is under a page and says how to verify. `.claude/settings.json` lists the hooks.
- Try to make the hooks fire: ask Claude locally to edit `.github/workflows/ci.yml` -> blocked by `protect-paths.sh` (exit 2, message goes back to Claude).
- Settings -> Branches: `main` needs 1 code-owner approval + `test` + `agent-evals`, admins included.
- **Say:** the controls are code in the repo, not instructions the model may ignore.

## 1. Plan - capture intent (2 min)
- Open a PR adding `intent/<name>.md` (copy the shape from a monitor-drafted one, or write 10 lines: problem, outcome, constraints, open questions).
- **Checkpoint:** you review and merge. Author and timestamp are in git.

## 2. Design - spec (3 min)
- `artifact-chain` runs; PR `spec: <name>` appears, authored by `claude[bot]`.
- Show **Flagged concerns** in the spec (policy tension). `claude-review` comments on the PR.
- **Checkpoint:** you approve (you can, because you're not the author) and merge.

## 3. Build - plan, then code (5 min)
- PR `plan: <name>`: files, order, risks, proof. **Checkpoint:** approve and merge = plan mode's "accept".
- PR `feat: <name>`: code + tests. Show CI (`test`), the review comment (`REVIEW.md` severities), and `plans/` vs diff.
- Comment `@claude fix the blocker` on the PR to see a fix commit. **Checkpoint:** approve and merge.

## 4. Test - evals as the merge gate (3 min)
- Open a PR that weakens `CLAUDE.md` (e.g. delete the "Verifying your work" section).
- `agent-evals` runs the 5 cases from older commits with that config; pass rate falls below 0.8 -> **merge blocked**.
- **Say:** config is code, so it gets regression tests; an incident becomes a new eval.

## 5. Deploy - two gates (5 min)
- Actions -> `artifact-chain` -> Run workflow, `release=true` -> PR `release: <sha>` with evidence (checks come from the PR, not the model).
- **Checkpoint 1:** you approve and merge the release record. `deploy.yml` verifies the PR had an approval from someone other than its author.
- **Checkpoint 2:** the run pauses at environment `production`; you click **Review deployments -> Approve**.
- Try the shortcut: ask Claude to `scripts/deploy.sh production <unreleased-sha>` -> `release-gate.sh` denies it.
- **Private repo without Enterprise?** Environment reviewers aren't available: use `docs/ALTERNATIVE-RELEASE-GATE.md`.

## 6. Maintain - the loop closes (4 min)
- Actions -> `monitor` -> Run workflow, `scenario=spike`. Detector (plain Python) reports `3sigma`.
- PR `intent: status_5xx_rate 3sigma` appears from `claude[bot]`: honest diagnosis, rollback only *proposed*, runbook linked.
- `scenario=drift` -> 2sigma: read-only diagnosis, no PR. Run `spike` twice -> second run opens no duplicate.
- **Say:** this PR is an `intent.md`, so merging it restarts the chain at stage 1.

## Troubleshooting
- Chain didn't fire: only a push that *adds exactly one* file under `intent/`, `spec/` or `plans/` triggers it; names must be lowercase-kebab.
- `claude-review` silent on bot PRs: `allowed_bots: 'claude[bot]'` must stay in `claude-review.yml`.
- Required check "pending forever": both `test` and `agent-evals` always report; if one doesn't, the workflow file has a path filter.
- Deploy can't find the commit: `deploy.yml` needs `fetch-depth: 0`.
