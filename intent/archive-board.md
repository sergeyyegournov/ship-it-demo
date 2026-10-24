# Intent: Archive status boards

Author: drafted by Claude for the product owner. Status: draft.

## Problem

Ops keeps asking to hide old status boards without losing their history. Today `GET /boards` returns every board ever
created, and there is no way to hide one.

## Proposed outcome

A board can be archived. An archived board no longer appears in the default board list, but can still be fetched by id.
Nothing is deleted.

## Affected systems

- `src/app.js`: the `GET /boards` list handler and the `GET /boards/:id` handler; a new way to mark a board archived.
- `test/`: suites covering list and fetch-by-id behaviour.

## Constraints

- Nothing is deleted: archiving must keep the board and its data.
- Archived boards remain fetchable by id.
- No runtime dependencies (repo convention).

## Actions already taken

None.

## Open questions

- How is a board archived: a new endpoint, a field on an update request, or something else? Who is allowed to do it?
- Can a board be unarchived?
- Is there a way to list archived boards (e.g. a query parameter on `GET /boards`), or are they reachable only by id?
- What does "history" mean here? Boards currently hold only `id`, `title` and `status`, and storage is in-memory, so
  nothing survives a restart. Is the ask only that archiving keeps the board, or is persistence or a status history expected?
- Should the fetch-by-id response show that a board is archived (e.g. an `archived` flag or timestamp)?
- Can an archived board still be modified, e.g. have its status changed?
- Is there any automatic archiving (e.g. by age), or is it manual only?
