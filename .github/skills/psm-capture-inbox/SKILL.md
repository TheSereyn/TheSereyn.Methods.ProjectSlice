---
name: "psm-capture-inbox"
description: "Capture a useful idea or tangent that is outside the active Project Slice Method scope. Use whenever planning or implementation reveals future work that should be retained without expanding the current slice."
---

# Capture an Inbox item

## Inputs

- the idea or tangent to retain;
- the active plan root;
- the current slice or conversation context when known.

## Outputs

- one new `I-NNN` entry in the active plan root `INBOX.md`;
- no change to active slice scope, roadmap state, or task decomposition.

## Procedure

1. Read the active plan root `INBOX.md` and determine the next available `I-NNN` ID.
2. Add one concise entry with the ID, title, origin context if known, the idea itself, and status `untriaged`.
3. Do not create roadmap items, tasks, or requirements for the idea.
4. Return to the original workflow immediately.

## Escalate when

- the idea invalidates an active-slice assumption;
- the idea is actually required to satisfy the current slice rather than later work.