---
name: "psm-design-slice"
description: "Produce only the technical design needed for one Project Slice Method slice. Use when implementation would benefit from a recorded approach, affected components, interfaces, risks, or testing strategy."
---

# Design a slice

## Inputs

- the approved slice specification;
- the relevant project context and existing system state;
- any significant technical constraints or decisions already known.

## Outputs

- `design.md` when a separate design adds value, or an explicit statement that no separate design is needed;
- the minimum technical approach needed to implement the slice safely.

## Procedure

Create or refine `design.md` only when it adds real clarity.

Cover the relevant concerns:

- approach;
- affected components;
- data or interfaces;
- architectural constraints;
- edge cases or failure modes;
- testing strategy;
- significant decisions.

If the slice is simple enough that a separate design document adds no information, state that explicitly instead of generating filler prose.

## Escalate when

- the slice design reveals a project-wide architectural trade-off that needs approval;
- a safe implementation path depends on a missing decision, migration plan, or compatibility constraint.