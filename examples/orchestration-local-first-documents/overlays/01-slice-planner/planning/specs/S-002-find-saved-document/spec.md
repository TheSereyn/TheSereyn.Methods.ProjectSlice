---
type: slice-spec
id: S-002
status: ready
capabilities: [C-001, C-002]
milestone: M-001
depends_on: [S-001]
---

# S-002 — Find saved document

## Outcome

A user can find a previously saved document by title and open it.

## Context

This slice builds on persisted documents from S-001 and focuses on title-based search rather than full-text or typo-tolerant search.

## Scope

### Included

- search persisted document titles;
- show matching documents;
- open a selected result.

### Deferred

- full-text search;
- fuzzy matching;
- filtering.

## Requirements

### S-002.R1 — Persisted search

Search operates on persisted documents.

### S-002.R2 — Partial and case-insensitive matching

Title matching supports partial titles and ignores case.

### S-002.R3 — Open selected result

Selecting a search result opens the correct document.

## Acceptance Criteria

- [ ] A document can be found by complete title.
- [ ] A document can be found by partial title.
- [ ] Selecting a result opens the correct document.

## Demonstration

1. Create two documents.
2. Restart the application.
3. Search for part of one title.
4. Open the returned result.