---
name: "psm-bootstrap-project"
description: "Initialize or normalize a repository to use Project Slice Method. Use when setting up a new project, bringing an existing repo under PSM, or checking that the minimum planning contract exists."
---

# Bootstrap a Project Slice Method repository

## Inputs

- the current repository state;
- the user's description of the project;
- any existing planning or delivery artifacts.

## Outputs

- a selected plan root with the minimum PSM file contract in place;
- an initial or normalized `PROJECT.md`, `ROADMAP.md`, and `INBOX.md`;
- clear unknowns recorded in durable files rather than left in chat;
- a validation result or a concise blocking finding.

## Procedure

1. Determine whether the repository is empty, partially planned, or already bootstrapped.
2. Ensure the selected plan root has the minimum planning contract: `PROJECT.md`, `ROADMAP.md`, `INBOX.md`, and `specs/`.
3. Create or refine `PROJECT.md` without inventing detailed distant requirements.
4. Shape an initial roadmap using NOW, NEXT, and LATER horizons.
5. Add a first candidate slice only when there is enough project intent to bound it.
6. Preserve unknowns explicitly instead of hiding them in vague prose.
7. Run `python3 scripts/psm/validate_psm.py validate <plan-root> --strict` after writing the artifacts.

## Escalate when

- the project intent is too unclear to define even an initial slice;
- existing planning artifacts contradict one another materially.