# 0004. Immutable revision snapshots are the only store of playlist items

- Status: accepted
- Date: 2026-11-08
- Draws from: architecture 5.2, 6.3, 7.2, 9.1 (`baseRevision`), 12 row 3; PRD 7.4, 11

## Context

PRD 1.0 listed both a `PlaylistItem` table and a `PlaylistRevision` table. Two stores of the current list can disagree. The product also needs one-step undo of any AI change, a visible diff, and a record of exactly which list each handoff sent.

## Decision

`playlist_revision` rows are immutable, keyed by `(draft_id, number)`, and each holds the complete ordered list as `items` (jsonb), an array of `{performance_id, pinned, source}`, plus `removed_ids`, the brief, the trigger and the curator run that produced it. There is no item table. `playlist_draft.current_revision` points at the latest.

Every write, whether an edit, a refinement, a regeneration or an undo, creates a new revision. Undo writes a copy of revision n−1 as revision n+1. Every write carries `baseRevision`. If it isn't current, the server returns `409` with the current revision.

`removed_ids` lives in the revision, so undoing a removal also restores the item.

## Consequences

- History is never lost, and undo depth is a UI choice (PRD 18.2), not a data-model one.
- The diff view compares two snapshots, and `handoff_event` records which revision was sent.
- Two tabs or two phones editing the same draft get a `409` instead of a silent overwrite, with no locking.
- A two-hour list is 15 to 40 items, so a snapshot is a few kilobytes. Storage is no concern at this scale.
- Queries across items, such as "which drafts contain this performance", go through jsonb. Nothing in P0 needs them.
