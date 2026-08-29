---
name: "psm-traceability-audit"
description: "Run deterministic structural and traceability checks for a Project Slice Method repository. Use after material planning changes, before readiness, and before completion."
---

# Run the PSM traceability audit

## Inputs

- the selected plan root;
- the validator script under `scripts/psm/validate_psm.py`;
- the current planning state to inspect.

## Outputs

- deterministic validation results for structure, references, status, and coverage;
- machine-derived inspection output for project status, slice trace, and milestone composition.

## Procedure

Use the validator commands in `scripts/psm/validate_psm.py`.

## Primary commands

- `python3 scripts/psm/validate_psm.py validate`
- `python3 scripts/psm/validate_psm.py validate --strict`
- `python3 scripts/psm/validate_psm.py status`
- `python3 scripts/psm/validate_psm.py trace S-001`
- `python3 scripts/psm/validate_psm.py milestone M-001`
- `python3 scripts/psm/validate_psm.py coverage S-001`
- `python3 scripts/psm/validate_psm.py next-id slice`

## Structural checks

- duplicate IDs;
- broken file links;
- invalid statuses;
- dependency cycles;
- missing required sections;
- missing or invalid requirement references;
- requirements with no task coverage;
- milestone references to unknown slices.

The validator is structural. Use agent judgment separately for semantic questions such as slice quality, scope boundaries, or whether work is truly vertical.

## Escalate when

- structural validation fails in a way that implies planning divergence rather than routine metadata repair;
- a maintainer decision is required to resolve contradictory roadmap or slice intent.