# Plan: Archive status boards

Spec: [`spec/archive-board.md`](../spec/archive-board.md). Intent: [`intent/archive-board.md`](../intent/archive-board.md).
Status: draft, awaiting review.

This plan uses the spec's proposed defaults for all 15 requirements. The spec is still a draft, and its Flagged concerns
are still open. If review overrides a default, update this plan before writing code. For example, review could allow
`413` (concern 4), ignore unknown query parameters (concern 5), or drop unarchive or `?archived=true` (concern 8).

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
   - If the `content-length` header is greater than `limit`, it resolves `{ ok: false }` right away.
   - It counts bytes as `Buffer` chunks arrive. When the total passes `limit`, it stops buffering and resolves
     `{ ok: false }`. It keeps calling `req.resume()` so the client can finish sending and receive the 400. Memory
     stays bounded.
   - It decodes UTF-8 only once, on `end`, so a multi-byte character split across chunks is decoded correctly.
   - On `error` or `aborted`, it resolves `{ ok: false }` and doesn't throw. A response that can't be delivered is
     dropped (spec: "no response is guaranteed").
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
   - R13: open a raw `node:net` socket. Send `POST /boards/1/archive` with `content-length: 100` and only part of the
     body, then destroy the socket. Afterwards `GET /health` still returns `200`. Also confirm that a very large body
     sent without `content-length` (chunked) gets a `400` and doesn't hang.

   Run `npm test` and confirm the new cases fail and the existing ones pass.
2. **Commit 2, `feat: archive-board`.** Implement design details 1 to 7 in `src/app.js`. Run `npm test` and
   `npm run lint`, and get both to pass.
3. Run `node evals/checks/archive.js` and record the expected mismatch (see Risks). Hand off to the `verifier` agent
   against this plan and the spec. Open the PR. Don't merge or approve.

## Risks

- **The spec is not accepted yet.** Open concerns 1, 4, 5 and 8 could change the requirements. Mitigation: don't
  start building until the spec PR is approved, and record any overrides here first.
- **Conflict with the agent eval `evals/archive-endpoint.json`.** Its check (`evals/checks/archive.js`) expects
  archiving to set `status: 'archived'`. Spec R6 says `status` is unchanged and archiving uses the separate `archived`
  flag. After this change that eval's "archive works" check **will fail** on `status not archived`. Its 404 check
  will still pass. This plan follows the spec and does not edit the eval. The eval owner should decide whether to
  update the check to `archived === true` or retire the eval.
- **Breaking change to `GET /boards` behaviour.**
  - Today it returns every board. After this change it hides archived boards. That part is intended.
  - Unknown query parameters now get `400` (spec concern 5), which could break clients that add cache-busting
    parameters.
- **Large bodies near the 1 KiB limit.** If the server responds before the client finishes uploading, the client can
  get `ECONNRESET` or `EPIPE` instead of a `400`. Mitigation: keep draining (`req.resume()`) and respond on `end`.
  The 1025-byte test catches regressions. A drip-fed huge body still holds a connection open, which is an existing
  limitation of the service. It is not made worse here because memory stays bounded.
- **Existing crash paths stay out of scope.**
  - `readBody` (`POST /boards`) can still hang, and it is unbounded (spec concerns 2 and 3).
  - `new URL(req.url, ...)` may throw on a malformed request target such as `//`. Inside the async handler, that
    throw would become an unhandled rejection. This is not verified yet. If it reproduces, propose a separate fix
    task, with the failing test first, instead of folding it into this change.
- **Timestamp tests.** Assert that `archivedAt` matches ISO-8601 and falls within a few seconds of `Date.now()`.
  Never compare exact values, so the tests aren't flaky.
- **Shared module state.** `boards` and `nextId` live at module level. Tests must look up the ids they created, and
  must never assume an empty map or fixed ids, except the deliberately unknown `999999`.

## Proof

Run from the repo root on the implementation branch.

| Command | Expected result |
|---|---|
| `npm test` after commit 1 only | Exit code ≠ 0. The new `test/archive.test.js` cases fail with 404s or missing fields. The four existing `test/app.test.js` tests pass. |
| `npm test` after commit 2 | Exit 0. All tests pass, including every R1 to R14 case in `test/archive.test.js` and the four existing tests. `# fail 0`. |
| `npm run lint` | Exit 0, no output. No syntax errors and no `console.log` in `src/app.js`. |
| `grep -c "console\." src/app.js` | `0` |
| `git diff main -- package.json` | Empty. No dependency changes. |
| `git diff main --stat` | Only `src/app.js`, `test/archive.test.js` and `plans/archive-board.md` change. `test/app.test.js` is not touched. |
| `node evals/checks/archive.js` | Exit 1 with `FAIL: status not archived`. This is expected and is the documented eval conflict under Risks. Report it in the PR. Don't hide it. |
| Manual smoke test: `PORT=3999 npm start`, then `curl -s -XPOST localhost:3999/boards -d '{"title":"a"}'`, `curl -s -XPOST localhost:3999/boards/1/archive`, `curl -s localhost:3999/boards`, `curl -s localhost:3999/boards/1`, `curl -s -o /dev/null -w '%{http_code}' 'localhost:3999/boards?archived=nope'` | Responses in order: a board with `"archived":false,"archivedAt":null`. Then a board with `"archived":true` and an ISO `archivedAt`. Then `[]`. Then the archived board. Then `400`. |
