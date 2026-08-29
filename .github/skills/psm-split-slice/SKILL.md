---
name: "psm-split-slice"
description: "Split an oversized Project Slice Method slice into smaller slices that each deliver one verifiable outcome. Use when a slice is too large to implement or verify as a single increment, or when it hides more than one user-visible result."
---

# Split a slice

## Inputs

- the slice ID and its current `ROADMAP.md` row;
- the slice specification, requirements, and `tasks.md` (when they exist);
- the reason the slice is too large or carries more than one outcome;
- existing dependencies into and out of the slice.

## Outputs

- two or more successor slices, each with a single verifiable outcome and its own spec;
- requirements and tasks distributed so every requirement is owned by exactly one successor slice;
- updated `ROADMAP.md` rows with correct `depends-on` relationships and statuses;
- a disposition for the original slice: either narrowed to one successor or marked `dropped` with successors recorded.

## Procedure

Confirm splitting is the right move. If the slice already has one outcome and simply needs a smaller boundary, use `psm-change-scope` instead.

Identify the seams:

- separate the distinct user-visible outcomes hidden inside the slice;
- group requirements by the outcome they serve;
- note which groups can ship independently and which must be sequenced.

Create the successor slices:

- allocate new slice IDs with `scripts/psm/validate_psm.py next-id slice`; never reuse a retired ID for a different outcome;
- give each successor its own specification with a single outcome and boundary;
- move each requirement to exactly one successor and keep its original requirement ID where the intent is unchanged;
- redistribute tasks from the original `tasks.md` so each task lives with the requirement it implements, and add tasks only where the split creates genuinely new work.

Preserve traceability and ordering:

- decide the disposition of the original slice — narrow it to one successor and keep its ID, or mark it `dropped` and reference the successors;
- set `depends-on` cells so successors that build on each other are sequenced correctly and external dependents point at the right successor;
- keep milestone assignments coherent, moving successors between milestones only when the outcome boundary requires it.

Validate the result:

- run `scripts/psm/validate_psm.py validate --strict` for the affected plan root;
- run `scripts/psm/validate_psm.py coverage <slice-id>` for each successor and resolve uncovered requirements;
- run `scripts/psm/validate_psm.py trace <slice-id>` to confirm dependencies and evidence resolve for each successor.

## Escalate when

- the split changes a milestone commitment or a published delivery boundary;
- successors would depend on a decision, migration, or interface contract that has not been approved;
- dependents of the original slice cannot be cleanly repointed without renegotiating scope with a stakeholder.
