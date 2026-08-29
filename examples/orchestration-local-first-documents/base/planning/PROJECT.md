---
type: project
id: PROJECT
method: psm
method_version: 0.2
---

# Local-First Documents

## Purpose

Build a local-first application in which a user can create, reopen, find, and export personal documents.

## Outcomes

- A user can create and keep personal documents without a hosted service.
- The core workflows remain understandable and testable through small vertical slices.

## Scope

- document creation and persistence;
- document search;
- export;
- later organization and synchronization work.

## Non-Goals

- cloud synchronization in the initial milestone;
- PDF export in the walking skeleton;
- multi-user collaboration.

## Principles

- validate the smallest useful end-to-end workflow first;
- keep durable state in repository files;
- separate implementation from verification and reconciliation.

## Constraints

- the first milestone is local-first and offline-friendly;
- future synchronization must not distort the early slice boundaries.

## Success

- the walking skeleton milestone proves create, reopen, find, and export as a coherent end-to-end flow.