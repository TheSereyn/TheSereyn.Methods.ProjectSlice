# S-002 — Tasks

## S-002.T1 — Query persisted document titles

**Outcome:** Persisted documents can be queried by title using partial and case-insensitive matching.

**Implements:** S-002.R1, S-002.R2

**Depends on:** —

**Verify:** Query tests cover exact, partial, and case-insensitive title matches.

- [x] Add title-query support to the document store.
- [x] Add matching tests.

## S-002.T2 — Open the selected search result

**Outcome:** Selecting a search result opens the correct document.

**Implements:** S-002.R3

**Depends on:** S-002.T1

**Verify:** End-to-end search demonstration opens the expected document.

- [x] Return document references from search.
- [x] Connect result selection to the existing open flow.

## Verification Evidence

- Pending.

## Reconciliation Notes

- Pending.