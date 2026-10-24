# Plan: Archive status boards

Spec: [`spec/archive-board.md`](../spec/archive-board.md). Intent: [`intent/archive-board.md`](../intent/archive-board.md).
Status: draft, awaiting review.

This plan uses the spec's proposed defaults for all 15 requirements.

## Accepted decisions

On PR #5, sergeyyegournov (2026-10-24) accepted the spec's proposed defaults for the open Flagged concerns:

| Concern | Accepted default |
|---|---|
| 1. Unauthenticated state mutation | Archive and unarchive are as open as `POST /boards`. No authn/authz in this change. |
| 4. Oversized body status code | `400 {"error":"invalid body"}`, not `413`. |
| 5. Unknown query parameters on `GET /boards` | Rejected with `400 {"error":"invalid query"}` (R11 as written). |
| 8. Unarchive and `?archived=true` | Both kept (R4, R5, R8). |

Concerns 2, 3, 6 and 7 stay out of scope as the spec describes. `spec/archive-board.md:3` still says "draft, awaiting
code-owner review". This plan PR contains only the plan, so it doesn't edit the spec. The spec owner should update
that status line to reflect these decisions. Any later override must be written here before code changes.

## Files changed

| File | Change |
|---|---|
| `src/app.js` | Add `archived` and `archivedAt` to boards created by `POST /boards`. Add `GET /boards` query parsing and filtering. Add `POST /boards/:id/archive` and `POST /boards/:id/unarchive`. Add a bounded body reader, `readSmallBody`. |
| `test/archive.test.js` | New suite that covers R1 to R14. It runs in its own process under `node --test`, so it never shares the in-memory `boards` map with `test/app.test.js`. |
| `plans/archive-board.md` | This file. Update it if the work diverges. |

The following files are **not** changed:

- `test/app.test.js`. Existing tests are never edited. They keep passing because they don't check exact board shape
  or list contents.
- `src/server.js`.
- `package.json`. No dependencies are added (R15).
- `readBody`. `POST /boards` keeps its current behaviour, which is out of scope per spec concerns 2 and 3.
- `evals/`. See Risks.
- Protected paths: `.github/`, `.claude/hooks/`, `releases/` and `CODEOWNERS`.

## Design details (inside `src/app.js`)

1. **Board creation.** `POST /boards` builds
   `{ id, title, status: 'ok', archived: false, archivedAt: null }` (R1).
2. **List query.** Write `parseListQuery(url.searchParams)`. It returns `'active'`, `'archived'`, or `null` for an
   invalid query.
   - Count the keys with `[...searchParams.keys()]`. More than one key, or any key other than `archived`, is invalid.
   - The only valid values are the exact strings `true` and `false`. That makes empty, `TRUE`, `1` and repeated
     values all invalid (R11).
   - An empty query string (no query, or a bare `?`) means `'active'` (R7).
   - An invalid query returns `400 {"error":"invalid query"}`. Otherwise the handler filters
     `[...boards.values()]` and keeps `Map` insertion order (R7, R8).
3. **Archive and unarchive routes.** The new routes match `^\/boards\/(\d+)\/(archive|unarchive)$` and only for
   `POST`. Any other method falls through to the catch-all 404, which follows the existing convention. The id goes
   through `Number(...)`. If the result fails `Number.isSafeInteger`, it is treated as unknown.
4. **`readSmallBody(req, limit = 1024)`** returns a promise that always settles, as
   `{ ok: true, value }` or `{ ok: false }`.
   - **One rule for every rejection path: drain, then settle.** The reader never resolves early. It resolves only
     from an `end`, `error` or `close` listener, so the handler never writes the 400 while the client is still
     uploading. That avoids `ECONNRESET`/`EPIPE` on the client in place of the JSON response.
   - If the `content-length` header is greater than `limit`, it marks the read as oversized and stops buffering, but
     keeps the stream flowing (`req.resume()`). On `end` it resolves `{ ok: false }`.
   - It counts bytes as `Buffer` chunks arrive. When the total passes `limit`, it marks the read as oversized, drops
     the buffered chunks and stops buffering. The stream keeps flowing, so memory stays bounded. On `end` it resolves
     `{ ok: false }`.
   - It decodes UTF-8 only once, on `end`, so a multi-byte character split across chunks is decoded correctly.
   - On `error`, it resolves `{ ok: false }` and doesn't throw.
   - On `close`, if `!req.complete` (the client disconnected before the body finished), it resolves `{ ok: false }`.
     It doesn't rely on the deprecated `aborted` event, so the promise settles on every Node version and no pending
     promise is leaked (spec: Error cases). A response that can't be delivered is dropped (spec: "no response is
     guaranteed").
   - Settling is guarded by a `settled` flag, so a later `close` after `end` or `error` is a no-op.
   - Valid body: the raw body is empty, or `JSON.parse` returns a plain object (`typeof === 'object'`, not `null`,
     not an array) with zero own keys (R12). `JSON.parse` runs inside `try`/`catch`.
5. **Order of checks** for archive and unarchive:
   1. Read and validate the body. Any failure returns `400 {"error":"invalid body"}`.
   2. Look up the id. If the board is missing, return `404 {"error":"not found"}`.
   3. Mutate the board.

   The body comes first so it is always consumed before the server responds. The spec doesn't set an order between
   400 and 404, so tests send a valid body when checking 404 and a known id when checking 400. No state changes
   before both checks pass, and no board is ever created (R10).
6. **Mutation.**
   - Archive: if `!board.archived`, set `archived = true` and `archivedAt = new Date().toISOString()`. Otherwise
     leave the board as is (R2, R3).
   - Unarchive: if `board.archived`, set `archived = false` and `archivedAt = null`. Otherwise leave it as is
     (R4, R5).
   - `id`, `title` and `status` are never touched (R6).
7. **Never throws (R13).** All new code paths are synchronous after the body promise settles, and they guard every
   parse step. There are no `console.*` calls (R15).

## Order of work

CLAUDE.md requires tests first only for fix tasks. This plan applies the same order to the feature anyway, so the red
tests show what each requirement covers.

1. **Commit 1, `test: archive-board (failing)`.** Add `test/archive.test.js` with one or more cases per requirement:
   - R1: a new board has `archived:false, archivedAt:null` in the `POST`, `GET /boards/:id` and `GET /boards`
     responses.
   - R2 and R3: archive returns `200` and sets an ISO-8601 `archivedAt` that is close to "now". A second archive
     returns `200` with the same `archivedAt`.
   - R4 and R5: unarchive clears both fields. Unarchiving an active board returns it unchanged.
   - R6: compare the board deep-equal before archive and after unarchive. `id`, `title` and `status` stay the same
     while archived.
   - R7 and R8: create one active and one archived board. Assert which ids appear in each of `GET /boards`,
     `?archived=false` and `?archived=true`. Check by id inclusion and exclusion, not exact arrays.
   - R9: `GET /boards/:id` returns `200` for an archived board.
   - R10: archive and unarchive of `999999`, and of a 30-digit id, return `404 {"error":"not found"}`. The list
     length doesn't change afterwards.
   - R11: each of these returns `400 {"error":"invalid query"}`: `?archived=yes`, `?archived=`, `?archived=TRUE`,
     `?archived=true&archived=true`, `?foo=1`, `?archived=true&foo=1`.
   - R12 and R14: for each endpoint, send each of these bodies: `not json`, `[]`, `"x"`, `null`,
     `{"archived":true}`, and a 1025-byte body. Each returns `400 {"error":"invalid body"}`, and a follow-up
     `GET /boards/:id` shows the board unchanged. Empty bodies and `{}` are accepted.
   - Other methods: `GET /boards/:id/archive` and `GET /boards/:id/unarchive` on a board the test created return
     `404`, and the board is unchanged (design item 3).
   - R13: create a board first and use its id. Open a raw `node:net` socket. Send `POST /boards/<id>/archive` with
     `content-length: 100` and only part of the body, then destroy the socket. Afterwards `GET /health` still
     returns `200` and the board is unchanged.
   - R13/R14, chunked large body: also over a raw `node:net` socket, not `fetch`. Send
     `POST /boards/<id>/archive` with `transfer-encoding: chunked` and well over 1 KiB of chunks, then the terminating
     `0\r\n\r\n` chunk. Assert that the client reads an `HTTP/1.1 400` status line and the `{"error":"invalid body"}`
     body before the socket closes, and that the test finishes within a short timeout (no hang).

   Run `npm test` and confirm the new cases fail and the existing ones pass.
2. **Commit 2, `feat: archive-board`.** Implement design details 1 to 7 in `src/app.js`. Run `npm test` and
   `npm run lint`, and get both to pass.
3. Hand off to the `verifier` agent against this plan and the spec. Open the PR. Don't merge or approve.

## Risks

- **Build-start condition.** Spec PR #4 is merged, so "spec PR approved" is no longer a useful gate. Build starts
  once this plan PR is merged with concerns 1, 4, 5 and 8 answered (see Accepted decisions). The stale `Status:` line
  in `spec/archive-board.md` should be updated by the spec owner, but it doesn't block the build. Any override must
  be recorded here first.
- **Design mismatch in the agent eval `evals/archive-endpoint.json`.** `evals/run.sh` creates a fresh worktree at
  the eval's `from` commit, has an agent implement the eval's own prompt there, and runs `evals/checks/archive.js`
  against that agent's code. It never runs this branch's `src/app.js`, so this change doesn't make the eval fail and
  isn't a regression. However, the eval's check encodes a different design (`status: 'archived'`), while spec R6
  keeps `status` unchanged and uses a separate `archived` flag. This plan doesn't edit the eval. The eval owner may
  want to align the eval prompt and check with the spec.
- **Breaking change to `GET /boards` behaviour.**
  - Today it returns every board. After this change it hides archived boards. That part is intended.
  - Unknown query parameters now get `400` (spec concern 5), which could break clients that add cache-busting
    parameters.
- **Large bodies near the 1 KiB limit.** If the server responds before the client finishes uploading, the client can
  get `ECONNRESET` or `EPIPE` instead of a `400`. Mitigation: every rejection path in `readSmallBody` keeps draining
  (`req.resume()`) and settles only on `end`, `error` or `close` (design item 4). The 1025-byte test and the raw-socket
  chunked test catch regressions. A drip-fed huge body still holds a connection open, which is an existing
  limitation of the service. It is not made worse here because memory stays bounded.
- **Existing crash paths stay out of scope.**
  - `readBody` (`POST /boards`) can still hang, and it is unbounded (spec concerns 2 and 3).
  - `new URL(req.url, ...)` may throw on a malformed request target such as `//`. Inside the async handler, that
    throw would become an unhandled rejection. This is not verified yet. If it reproduces, propose a separate fix
    task, with the failing test first, instead of folding it into this change.
- **Timestamp tests.** Assert that `archivedAt` matches ISO-8601 and falls within a few seconds of `Date.now()`.
  Never compare exact values, so the tests aren't flaky.
- **Shared module state.** `boards` and `nextId` live at module level. Tests must look up the ids they created, and
  must never assume an empty map or fixed ids, except the deliberately unknown `999999` and the 30-digit id. The
  manual smoke test under Proof uses `/boards/1` only because it runs against a freshly started server.

## Proof

Run from the repo root on the implementation branch.

| Command | Expected result |
|---|---|
| `npm test` after commit 1 only | Exit code ≠ 0. The new `test/archive.test.js` cases fail with 404s or missing fields. The four existing `test/app.test.js` tests pass. |
| `npm test` after commit 2 | Exit 0. All tests pass, including every R1 to R14 case in `test/archive.test.js` and the four existing tests. `# fail 0`. |
| `npm run lint` | Exit 0, no output. No syntax errors and no `console.log` in `src/app.js`. |
| `grep -c "console\." src/app.js` | `0` |
| `git diff origin/main -- package.json` | Empty. No dependency changes. |
| `git diff origin/main --stat` | Only `src/app.js` and `test/archive.test.js` change, plus `plans/archive-board.md` if the plan was updated during the build. `test/app.test.js` is not touched. |
| Manual smoke test: `PORT=3999 npm start`, then `curl -s -XPOST localhost:3999/boards -d '{"title":"a"}'`, `curl -s -XPOST localhost:3999/boards/1/archive`, `curl -s localhost:3999/boards`, `curl -s localhost:3999/boards/1`, `curl -s -o /dev/null -w '%{http_code}' 'localhost:3999/boards?archived=nope'` | Responses in order: a board with `"archived":false,"archivedAt":null`. Then a board with `"archived":true` and an ISO `archivedAt`. Then `[]`. Then the archived board. Then `400`. |
