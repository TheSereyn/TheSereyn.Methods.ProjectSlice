---
type: slice-spec
id: S-001
status: done
capabilities: [C-001]
milestone: M-001
depends_on: []
---

# S-001 — Create and reopen document

## Outcome

A user can create a document, close the application, restart it, and reopen the saved document.

## Context

This is the first walking skeleton slice. It proves the local-first persistence loop before search, export, or editing exist.

## Scope

### Included

- create one document with title and body;
- persist it locally;
- reopen it after application restart.

### Deferred

- document editing;
- search;
- synchronization.

## Requirements

### S-001.R1 — Persist a created document

Creating a document stores it durably.

### S-001.R2 — Reopen after restart

After restart, the saved document can be reopened without recreating it.

## Acceptance Criteria

- [x] A created document is persisted locally.
- [x] A saved document can be reopened after restart.

## Demonstration

1. Create a document.
2. Close the application.
3. Restart the application.
4. Open the saved document.