---
type: decision
id: D-001
status: accepted
---

# D-001 — Use local persistence before synchronization

## Decision

The first milestone uses local persistence only.

## Reason

This keeps the initial slices small and avoids coupling the walking skeleton to account systems, network failures, or synchronization conflicts.

## Consequences

- early slices do not depend on cloud services;
- synchronization remains future backlog work.