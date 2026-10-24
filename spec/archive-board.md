# Spec: Archive status boards

Intent: [`intent/archive-board.md`](../intent/archive-board.md). Status: draft, awaiting code-owner review.

This spec answers the intent's open questions with a proposed default. Each default can be overridden in review. The
answers that depend on policy or product decisions are listed under Flagged concerns.

## Requirements

Each requirement must be covered by at least one `node:test` case in `test/`.

1. **Board shape.** Every board returned by any endpoint includes `archived` (boolean) and `archivedAt` (ISO-8601 UTC
   string, or `null` when not archived). A newly created board has `archived: false, archivedAt: null`.
2. **Archive.** `POST /boards/:id/archive` on an existing, non-archived board returns `200` with the board, where
   `archived` is `true` and `archivedAt` is set to the current time.
3. **Archive is idempotent.** `POST /boards/:id/archive` on a board that is already archived returns `200` with the
   board unchanged. `archivedAt` keeps its original value.
4. **Unarchive.** `POST /boards/:id/unarchive` on an archived board returns `200` with the board, where
   `archived` is `false` and `archivedAt` is `null`.
5. **Unarchive is idempotent.** `POST /boards/:id/unarchive` on a board that is not archived returns `200` with the
   board unchanged.
6. **Nothing is deleted.** After archiving, the board keeps the same `id`, `title` and `status`. After unarchiving, the
   board equals its pre-archive state (with `archived: false, archivedAt: null`).
7. **Default list hides archived.** `GET /boards` with no query string returns only boards with `archived: false`.
8. **Listing archived boards.** `GET /boards?archived=true` returns only archived boards.
   `GET /boards?archived=false` behaves the same as requirement 7.
9. **Fetch by id is unaffected.** `GET /boards/:id` returns `200` with the board whether or not it is archived.
10. **Unknown board.** `POST /boards/:id/archive` and `POST /boards/:id/unarchive` return `404 {"error":"not found"}`
    for an id that does not exist. Neither call creates a board.
11. **Invalid list query.** `GET /boards` returns `400` when `archived` has any value other than `true` or `false`,
    when `archived` appears more than once, or when the query string has any parameter other than `archived`.
12. **Invalid archive/unarchive body.** The archive and unarchive endpoints accept an empty body or the JSON object
    `{}`. They return `400` without changing state when the body:
    - is not valid JSON,
    - is valid JSON but not an empty object (e.g. `[]`, `"x"`, `null`, `{"archived":true}`), or
    - is larger than 1 KiB.
13. **Never throws.** No input to the new endpoints or the changed list handler crashes the process or leaves a request
    hanging. Every request gets a JSON response.
14. **Rejection-path tests.** Per the security policy, both new mutating endpoints have tests for 404 (requirement 10)
    and for each 400 case in requirement 12. Each test also checks that the board's state did not change.
15. **No logging, no dependencies.** The change adds no `console.*` calls in `src/app.js` and no entries to
    `dependencies` in `package.json`. `npm test && npm run lint` pass.

## Design

### Data

The in-memory `boards` map stays as is. Each board record gains two fields:

```js
{ id: 1, title: 'Prod', status: 'ok', archived: false, archivedAt: null }
```

`POST /boards` sets both fields at creation. No other existing fields change. Archiving only sets these two fields, so
the record is never removed from the map.

### Endpoints

| Method & path | Success | Errors |
|---|---|---|
| `GET /boards` | `200` array of non-archived boards | `400` invalid query (R11) |
| `GET /boards?archived=true` | `200` array of archived boards | `400` invalid query (R11) |
| `GET /boards?archived=false` | `200` same as `GET /boards` | `400` invalid query (R11) |
| `GET /boards/:id` | `200` board, archived or not | `404` unknown id (unchanged) |
| `POST /boards/:id/archive` | `200` board | `400` bad body (R12), `404` unknown id |
| `POST /boards/:id/unarchive` | `200` board | `400` bad body (R12), `404` unknown id |
| `POST /boards` | `201` board, now with `archived:false, archivedAt:null` | unchanged |

- The id segment keeps the existing `^\d+$` pattern. An id that is not a safe integer (`Number.isSafeInteger` fails)
  is treated as unknown and returns `404`.
- Other methods on `/boards/:id/archive` and `/boards/:id/unarchive` fall through to the existing catch-all
  `404 {"error":"not found"}`. That is the service's current convention; it has no `405` handling.
- Error bodies use the existing `{ "error": "<message>" }` shape. Proposed messages: `invalid query`, `invalid body`,
  `not found`.
- The list keeps insertion order (the order of the `Map`), as it does today.

### Why separate archive/unarchive endpoints

The service has no update endpoint for boards (status cannot be changed over HTTP today). Adding a general `PATCH`
would create a much larger input surface to validate. Two narrow verb endpoints that take no fields keep validation
trivial and make the rejection paths easy to test.

### Body handling

The new endpoints need a bounded body reader. When the size limit is exceeded or the stream errors, it must resolve to
a rejection, not hang or throw. It stops reading after 1 KiB and responds `400`. The existing `readBody` has no limit
and never resolves on a stream error, so the plan should either add a bounded variant or bound `readBody` for the new
routes only. Changing `POST /boards` behaviour is out of scope; see Flagged concerns.

### Error cases (summary)

- Malformed JSON, non-object JSON, non-empty object, or oversized body on archive/unarchive: `400`, no state change.
- Unknown or non-safe-integer id on archive/unarchive: `404`, no state change.
- Bad `archived` value, repeated `archived`, or unknown query parameter on `GET /boards`: `400`.
- Client aborts mid-body: no response is guaranteed, but the server must not throw or leak a pending promise that
  blocks shutdown.

## Flagged concerns

Addressed to the security policy owner (security lead), unless marked **[product]**.

1. **Unauthenticated state mutation.** The intent asks who is allowed to archive. The service has no authentication or
   authorization at all; `POST /boards` is already open to any caller. This spec makes archive/unarchive equally open.
   Please confirm this is acceptable for this change. If it isn't, authn/authz is a separate, larger change that should
   have its own intent. This spec does not invent a token scheme.
2. **Existing unbounded input in `readBody`.** The policy says to bound all request input. `readBody` (used by
   `POST /boards`) buffers the whole body with no size limit, and `title` has no length limit. This is a deviation that
   already exists, not one this change introduces. This spec bounds input only on the new endpoints (R12). Should
   fixing `POST /boards` be its own fix task?
3. **`readBody` can hang.** It never listens for `error` or `aborted`, so the promise can stay pending forever. This
   conflicts with the policy's "never throw" in spirit (the request never completes cleanly). R13 covers it for the
   new endpoints only.
4. **Oversized body status code.** The policy says to reject unknown shapes with `400`. HTTP convention for an oversized
   body is `413`. This spec uses `400` to follow the policy literally. Please confirm, or allow `413`.
5. **Rejecting unknown query parameters on `GET /boards` changes existing behaviour.** Today, `GET /boards?foo=1`
   returns `200`. Under R11 it returns `400`. This follows "reject unknown shapes", but it could break any client that
   sends cache-busting or tracking parameters. Alternative: validate only `archived` and ignore other parameters.
6. **No audit trail.** Archive/unarchive events are not logged. If an audit log is wanted, it must record only the
   board id, action and timestamp, never request bodies or caller identifiers, per the policy. Not in scope unless
   requested.
7. **[product] Meaning of "history".** Storage is in memory, and boards have no status history. This spec reads
   "without losing their history" as "archiving keeps the board record intact and retrievable", and nothing more.
   Archived boards, like all boards, are lost on restart. If persistence or status history is expected, that needs a
   separate intent.
8. **[product] Unarchive and listing.** This spec adds unarchive (R4) and `?archived=true` (R8). Neither was explicitly
   requested, but the intent lists both as open questions. Each can be dropped in review without affecting the other
   requirements.

## Out of scope

- Authentication or authorization for any endpoint (see concern 1).
- Persistence across restarts and any status-change history (see concern 7).
- Automatic archiving (by age or otherwise). Archiving is manual only.
- Deleting boards.
- Modifying archived boards. There is no board-update endpoint today, so nothing new needs blocking. A future update
  endpoint must decide whether archived boards are read-only.
- Changing `POST /boards` input bounds or `readBody` for existing routes (see concerns 2 and 3).
- Pagination, sorting or filtering of `GET /boards` beyond the `archived` parameter.
- `405 Method Not Allowed` handling.
