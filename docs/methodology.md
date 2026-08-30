# Project Slice Method

Project Slice Method is a file-based approach to planning and delivering work through small vertical slices while preserving a clear view of the whole project.

## Core idea

Describe the whole project once, then deliver it through independently specified slices.

The method avoids two common failure modes:

- one large project specification that becomes vague and hard to execute;
- disconnected feature notes that lose the whole-project shape.

Instead, PSM separates project state into a small set of views that answer different questions.

## User-facing model

Most people should only need four entry points:

- `PROJECT.md`: what the project is and why it exists;
- `ROADMAP.md`: which slices exist, what is next, and what is done;
- the active slice package: what the team is trying to make true now;
- `INBOX.md`: useful ideas that are not current scope.

Everything else supports those four views.

## Primary concepts

### Project

The project defines purpose, outcomes, scope, non-goals, constraints, and success conditions.

### Capability map

Capabilities describe the stable functional shape of the completed system. They are not the same thing as delivery order.

### Roadmap

The roadmap is the spec of specs. It defines bounded slices, their outcomes, boundaries, dependencies, milestones, and status.

### Slice

A slice is the primary unit of delivery. It should be:

- bounded;
- testable;
- demonstrable;
- independently understandable;
- small enough to finish clearly;
- large enough to produce a meaningful result.

### Task

A task is an executable unit of work inside a slice. It should state the outcome, dependencies, requirement mapping, and verification method.

### Inbox

The inbox captures tangents and future ideas without silently expanding the active slice.

## Slice lifecycle

The normal loop is:

1. shape the project and roadmap;
2. pick a bounded slice;
3. specify the slice outcome and scope;
4. design only what is needed;
5. decompose into executable tasks;
6. run a readiness check;
7. implement;
8. verify;
9. reconcile the project state back into durable files.

## Design rules

- Prefer vertical slices over horizontal technical layers.
- Keep project state in repository files, not only in tool conversations.
- Preserve stable IDs after publication.
- Do not silently expand the active slice.
- Keep distant roadmap work lightweight.
- Separate implementation from verification and reconciliation.

## Why the repository model matters

PSM is designed to stay usable with or without AI. Durable project state should remain readable and editable as plain repository files. AI can help with bookkeeping, traceability, decomposition, and validation, but it should not be the only place where the plan exists.

## What this repository adds

This repository packages the method into a reusable system:

- GitHub Copilot custom agents and skills;
- planning templates;
- a deterministic validator;
- a starter bootstrap CLI;
- a worked example project state.

The method stays readable in plain files while giving AI tools enough structure to help reliably.