---
name: "psm-check-readiness"
description: "Assess whether a slice is genuinely ready to implement. Use when a slice has a spec and tasks, or when implementation has stalled because the planning quality is uncertain."
---

# Check slice readiness

## Inputs

- the slice specification;
- the slice design when present;
- `tasks.md` and any linked decisions or context files.

## Outputs

- a pass or fail readiness result;
- concise blocking findings when readiness fails;
- no silent status promotion when blockers remain.

## Procedure

Confirm all of the following before marking a slice ready:

- the outcome is clear;
- included and deferred scope are explicit;
- dependencies are understood;
- acceptance criteria are testable;
- major uncertainty is resolved or isolated;
- the design is sufficient for implementation;
- tasks are executable;
- explicit requirements are covered;
- slice size is still reasonable.

Output a pass or fail result with concise blocking findings. Do not work around a failed readiness check by relabeling the slice as ready anyway.

## Escalate when

- unresolved blockers require roadmap changes or project-level decisions;
- the slice needs to be split before work can begin safely.