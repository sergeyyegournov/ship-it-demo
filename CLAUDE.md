# ship-it-demo

Small Node (no dependencies) status-board service. Demo repo for the AI-native SDLC playbook.

## Layout
- `src/app.js` HTTP handlers, `src/server.js` entrypoint, `test/` node:test suites
- `intent/`, `spec/`, `plans/` the artifact chain: intent.md -> spec.md -> plan.md for each change
- `evals/` agent evals, `bands.yaml` + `scripts/detect.py` production control bands

## Conventions
- No runtime dependencies. No `console.log` in `src/app.js`.
- Every change starts from an accepted `plans/<name>.md`; update it if the work diverges.
- Fix tasks: commit the failing test first, then the fix. Never edit existing tests to make them pass.

## Verifying your work
Run `npm test && npm run lint` before saying a task is done. Both must pass.

## Guardrails (enforced by hooks, not just advice)
- `.github/`, `.claude/hooks/`, `releases/` and `CODEOWNERS` are protected paths: do not edit them.
- Production deploys need a merged release record in `releases/` approved by a code owner.
