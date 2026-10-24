# intent/

One `intent.md` per change (Stage 1: Plan), named `<kebab-name>.md`. Sections: Problem, Proposed outcome, Affected systems,
Constraints, Actions already taken, Open questions. Humans write them in claude.ai; the monitor drafts them from breached bands
(`scripts/draft_intent.py`).

Merging a new intent starts the chain (`.github/workflows/artifact-chain.yml`): a spec PR, then a plan PR, then a feature PR,
each opened by the Claude app and each needing a code owner's approval.
