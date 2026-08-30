---
name: "psm-reconcile-slice"
description: "Reconcile successful implementation back into durable Project Slice Method state. Use after verification passes and before a slice is treated as complete."
---

# Reconcile a slice

## Inputs

- a slice that has already passed verification;
- the updated slice tasks and evidence;
- the roadmap, milestone, Inbox or Backlog, and current-system files affected by the change.

## Outputs

- truthful roadmap and slice status updates;
- updated milestone or current-system documentation when relevant;
- captured follow-up work and a final structural validation result.

## Procedure

After verification passes:

1. update the slice and roadmap statuses;
2. update any affected milestone state;
3. add durable decisions if later work will need the rationale;
4. update `planning/system/` so the current system is understandable without prior conversation context;
5. capture follow-up work in the Inbox or Backlog;
6. rerun `python3 scripts/psm/validate_psm.py validate --strict`.

Do not mark the slice done before reconciliation succeeds.

## Escalate when

- verification has not actually passed;
- truthful reconciliation would require changing production behavior rather than project state.