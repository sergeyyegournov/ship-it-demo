# ship-it-demo

End-to-end demo of Anthropic's [AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) on a tiny Node service ("status-board").
Everything is real GitHub: workflows, branch protection, environments, and a Claude GitHub App that authors the PRs.

**The point:** each stage produces a version-controlled artifact that the next agent reads, humans approve at named checkpoints,
and the agent that wrote something can never approve it.

```
intent.md -> spec.md -> plan.md -> feature PR -> release record -> deploy -> telemetry -> new intent.md
 (Plan)      (Design)    (Build)    (Test/Review)   (Deploy gate)  (env approval)  (Maintain)
```

**New here? Start with [`docs/GUIDE.md`](docs/GUIDE.md)**: every stage, how it is implemented, and how it connects, with diagrams.

| Browse the finished run | Replay it live |
|---|---|
| `gh pr list --state merged` and the `intent/ spec/ plans/ releases/` folders | [`docs/RUNBOOK.md`](docs/RUNBOOK.md) |

## Which file implements which play
| Stage | Play | Where |
|---|---|---|
| Plan | Capture as intent.md | `intent/`, `scripts/draft_intent.py` |
| Design | Requirements and design | `spec/`, `.github/workflows/artifact-chain.yml`, `.claude/skills/security-policy/` |
| Build | Plan mode as default | `plans/`, `CLAUDE.md` |
| Build | CLAUDE.md, skills, subagents | `CLAUDE.md`, `.claude/skills/`, `.claude/agents/verifier.md` |
| Build | Hooks as build-time guardrails | `.claude/hooks/protect-paths.sh`, `lint-after-edit.sh`, `no-test-edits.sh` |
| Test | Feedback loop | "Verifying your work" in `CLAUDE.md`, `npm test && npm run lint` |
| Test | Continuous evals in CI | `evals/`, `.github/workflows/agent-evals.yml` |
| Deploy | AI in the PR review loop | `REVIEW.md`, `.github/workflows/claude-review.yml`, `.github/CODEOWNERS` |
| Deploy | Hooks as approval gates | `.claude/hooks/release-gate.sh`, `releases/` |
| Deploy | CI/CD integration | `.github/workflows/deploy.yml` (environment `production`), `docs/ALTERNATIVE-RELEASE-GATE.md` |
| Maintain | Closing the loop | `bands.yaml`, `scripts/detect.py`, `.github/workflows/monitor.yml`, `runbooks/rollback.md` |

Not demonstrated (beta/Enterprise or external): Claude Security scans, Claude Tag in Slack, Claude Design, managed settings via MDM.

## Set up your own copy
1. Use this repo as a template (or clone it).
2. `gh secret set ANTHROPIC_API_KEY -R <owner>/<repo>`
3. Install the [Claude GitHub App](https://github.com/apps/claude) on the repo.
4. GitHub controls (branch protection, the `production` environment, Actions permissions) and the AWS stack come from [`ship-it-demo-infra`](https://github.com/sergeyyegournov/ship-it-demo-infra) (Terraform, applied from Actions behind an approval). `scripts/setup-github.sh` is the no-Terraform fallback for the GitHub half.
   Note: required reviewers on environments need a public repo, or Enterprise. See `docs/ALTERNATIVE-RELEASE-GATE.md` for private repos.
5. Optional, off by default because they spend credits: repo variables `NIGHTLY_EVALS=true`, `MONITOR_ENABLED=true`.

## Honest limits
- Vendor framework; this shows the mechanics, not measured productivity gains.
- Production is real but small: ECS Fargate behind an ALB for the API, S3 + CloudFront for the SPA (`web/`), deployed by `deploy.yml` / `scripts/deploy.sh`. Telemetry in `metrics/` is still synthetic, and boards live in memory (a redeploy resets them).
- Eval set is 5 cases; the playbook recommends 20-50.
