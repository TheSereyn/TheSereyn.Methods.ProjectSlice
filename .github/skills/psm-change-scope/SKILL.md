---
name: "psm-change-scope"
description: "Change the scope of an existing Project Slice Method slice without breaking traceability. Use when new information adds, removes, or reshapes a slice's outcome, requirements, or tasks after it has been specified or started."
---

# Change the scope of a slice

## Inputs

- the slice ID and its current `ROADMAP.md` row;
- the slice specification, requirements, and `tasks.md` (when they exist);
- the concrete scope change and the reason it is needed;
- the current slice status and any in-flight work or evidence.

## Outputs

- an updated slice specification whose outcome and boundary match the new scope;
- requirements and tasks that stay internally consistent and fully covered;
- a `ROADMAP.md` row (outcome, boundary, depends-on, status) that reflects the change;
- a recorded rationale for the scope change on the slice or in the relevant decision record.

## Procedure

Confirm the change is a scope change, not a new slice. If the new work has a different user-visible outcome, stop and use `psm-split-slice` or `psm-shape-roadmap` instead.

Assess the size of the change before editing:

- if the change makes the slice too large to verify as one increment, hand off to `psm-split-slice`;
- if the change removes the last remaining reason for the slice, mark it `dropped` in `ROADMAP.md` and reconcile dependents rather than emptying the spec.

Apply the change consistently across artifacts:

- update the slice specification outcome and boundary first, then reconcile requirements to match;
- add, revise, or retire requirements so each remaining requirement is still covered by at least one task;
- update `tasks.md` so tasks implement only the current requirements and remove tasks that no longer apply;
- adjust the `ROADMAP.md` outcome, boundary, and `depends-on` cells, and reset status to `planned` or `ready` if readiness assumptions changed.

Preserve identity and history:

- keep the existing slice ID; never renumber a slice to signal a scope change;
- reuse existing requirement and task IDs where the intent is unchanged, and allocate new IDs with `scripts/psm/validate_psm.py next-id` for genuinely new items;
- record why the scope changed so later reconciliation can trust the roadmap.

Re-check readiness and traceability:

- run `scripts/psm/validate_psm.py validate --strict` for the affected plan root;
- run `scripts/psm/validate_psm.py coverage <slice-id>` and resolve any uncovered requirements before returning the slice to an active status.

## Escalate when

- the scope change alters a milestone boundary, a published commitment, or another slice's contract;
- the change depends on a decision, migration, or compatibility constraint that has not been approved;
- honoring the change would silently invalidate evidence already recorded for the slice.
