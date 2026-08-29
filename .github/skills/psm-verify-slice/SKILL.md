---
name: "psm-verify-slice"
description: "Verify an implemented slice against its declared outcome, requirements, acceptance criteria, and milestone obligations. Use before any slice is marked done."
---

# Verify a slice

## Inputs

- the implemented slice specification;
- the corresponding tasks and recorded evidence;
- the milestone definition when the slice contributes to one.

## Outputs

- explicit pass or fail verification evidence;
- clear classification of failures where possible;
- no silent promotion of incomplete work to done.

## Procedure

Check:

- explicit requirements;
- acceptance criteria;
- relevant automated tests;
- the documented demonstration;
- regression checks when appropriate;
- milestone integration expectations when the slice sits on a milestone boundary.

Return pass or fail with explicit evidence. If verification fails, classify the issue as an implementation defect, specification ambiguity, or environment problem where possible.

## Escalate when

- acceptance criteria conflict with the implemented slice boundary;
- missing evidence reflects a planning ambiguity rather than a straightforward implementation defect.