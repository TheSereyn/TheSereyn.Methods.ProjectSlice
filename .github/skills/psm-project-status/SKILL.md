---
name: "psm-project-status"
description: "Produce a concise current-state summary for a Project Slice Method repository. Use when a user asks where the project stands, what is next, what is blocked, or what milestone is active."
---

# Report current project status

## Inputs

- the selected plan root;
- the current roadmap, milestones, Inbox, and slice state;
- machine-derived status output when available.

## Outputs

- a concise current-state summary for the user;
- the current milestone, active slice, next slice, blockers, recent completions, Inbox count, and roadmap risks.

## Procedure

Use the active plan root and report:

- the current milestone;
- the active slice;
- the next slice;
- blockers;
- recently completed slices;
- untriaged Inbox count;
- notable roadmap risks.

Use `python3 scripts/psm/validate_psm.py status <plan-root>` when a deterministic status summary is useful, then add any necessary plain-language interpretation without expanding scope or inventing hidden state.

## Response format

- `Current milestone:`
- `Active slices:`
- `Next slice:`
- `Blocked slices:`
- `Recently completed:`
- `Untriaged Inbox items:`
- `Roadmap risks:`

## Escalate when

- the planning state is structurally inconsistent and needs validation or repair before a truthful status summary can be given;
- material ambiguity prevents identifying the current milestone or next slice.