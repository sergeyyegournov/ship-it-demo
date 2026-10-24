# Review guide

Used by the automated PR reviewer. Humans (code owners) make the approval decision; the reviewer only reports.

## Inputs
Read the PR diff against `plans/<name>.md` and `spec/<name>.md` for the change (find them from the PR description).
Flag diff hunks that no plan item explains, and plan items with no diff or test.

## Passes (in order)
1. **Correctness** - logic errors, unhandled input, wrong status codes, state bugs.
2. **Security** - follow `.claude/skills/security-policy/SKILL.md`: input validation, no body/PII logging, no new dependencies.
3. **Tests** - every new behavior has a test, including the rejection path. Fix tasks include a test that failed before the fix.
4. **Scope** - changes outside the plan, edits to protected paths (`.github/`, `.claude/hooks/`, `releases/`, `CODEOWNERS`).

## Severity
- **blocker** - wrong behavior, security issue, missing test for a state-changing endpoint. Must be fixed before merge.
- **warning** - likely problem or scope drift. Author should respond.
- **nit** - style only. At most 3 per review; skip nits entirely if there is any blocker.

## Output
One summary comment: verdict line (`no blockers` or `N blockers`), then findings grouped by severity, each with `file:line` and a one-sentence fix.
Do not approve the PR. Do not repeat what the diff already shows.
