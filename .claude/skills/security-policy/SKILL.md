---
name: security-policy
description: Use when adding or changing HTTP endpoints, input handling, logging, or anything touching user data in this service.
---

# Security policy (owned by the security lead)

- Validate and bound all request input; reject unknown shapes with 400, never throw.
- Never log request bodies, tokens or user identifiers.
- New endpoints that mutate state must have a test for the rejection path.
- No new runtime dependencies without an approved exception in the PR description.
- Flag any deviation in `spec.md` under "Flagged concerns" for the policy owner.
