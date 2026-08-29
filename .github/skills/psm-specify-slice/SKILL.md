---
name: "psm-specify-slice"
description: "Create or refine one slice specification. Use when a roadmap slice needs a clear outcome, scope boundary, requirements, acceptance criteria, and demonstration before implementation."
---

# Specify a slice

## Inputs

- the selected roadmap slice;
- relevant project, context, milestone, decision, and current-system files;
- any approved boundary or sequencing constraints.

## Outputs

- `specs/S-NNN-*/spec.md` inside the selected plan root;
- explicit included and deferred scope;
- testable requirements, acceptance criteria, and demonstration steps.

## Procedure

Create or refine `specs/S-NNN-*/spec.md` inside the selected plan root with these sections:

- Outcome
- Context
- Scope
- Included
- Deferred
- Requirements when explicit requirement IDs add value
- Acceptance Criteria
- Demonstration

Apply these rules:

- keep the slice boundary explicit;
- state what is deferred, not only what is included;
- prefer testable requirements;

## Escalate when

- the slice depends on unresolved project-level intent;
- a coherent specification would materially expand the approved slice boundary;
- dependencies or assumptions make the selected slice order invalid.