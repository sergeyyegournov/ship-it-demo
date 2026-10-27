# Spec: API keys for board integrations

Status: draft, awaiting code-owner review.

Partner tools want to read and create boards without a person logged in. This spec adds API keys for them.

## Requirements

1. **Issue a key.** `POST /api-keys` with `{ "name": string }` returns `201` with `{ "id", "name", "key" }`. The `key` is a random
   secret shown once; the service stores only a hash of it.
2. **Authenticate with a key.** Requests to `/boards` may send `Authorization: Bearer <key>`. A valid key is accepted
   and a missing or unknown key returns `401 {"error":"unauthorized"}`.
3. **Revoke a key.** `DELETE /api-keys/:id` revokes the key at once. A revoked key returns `401`.
4. **Scopes.** A key is either `read` or `write`. A `read` key cannot create or archive boards (`403`).
5. **Rotation.** Keys expire after 90 days. `POST /api-keys/:id/rotate` returns a new secret and revokes the old one.

## Flagged concerns

- The key secret and its hash must never be written to logs.
- Who may issue keys is not decided yet: any logged-in user, or admins only.

## Out of scope

- Per-key rate limits.
