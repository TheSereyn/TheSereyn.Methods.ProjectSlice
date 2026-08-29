# S-001 — Tasks

## S-001.T1 — Persist a created document

**Outcome:** A newly created document is stored durably.

**Implements:** S-001.R1

**Depends on:** —

**Verify:** Storage tests confirm the document is persisted and can be loaded again.

- [x] Add local document persistence.
- [x] Add tests for create and load.

## S-001.T2 — Reopen a saved document after restart

**Outcome:** A persisted document is available after application restart and can be reopened.

**Implements:** S-001.R2

**Depends on:** S-001.T1

**Verify:** Restart flow tests prove a saved document reopens correctly.

- [x] Load persisted documents on startup.
- [x] Add restart regression coverage.

## Verification Evidence

- `dotnet test --filter CreateAndReopenDocument`
- Manual demonstration: create a document, restart the application, reopen the saved document.

## Reconciliation Notes

- Updated `planning/system/documents.md` to describe the persisted create and reopen workflow.