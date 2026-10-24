# intent/

One `intent.md` per change (Stage 1: Plan). Sections: Problem, Proposed outcome, Affected systems, Constraints,
Actions already taken, Open questions. Humans write them in claude.ai; the monitor drafts them from breached bands
(`scripts/draft_intent.py`). Merging an intent triggers drafting the matching `spec/` PR.
