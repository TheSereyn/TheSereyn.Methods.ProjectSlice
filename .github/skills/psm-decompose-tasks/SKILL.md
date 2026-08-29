---
name: "psm-decompose-tasks"
description: "Convert an approved slice specification and design into coherent executable tasks. Use when `tasks.md` must become implementation-ready without reopening project-level design."
---

# Decompose a slice into tasks

## Inputs

- the approved slice specification;
- the slice design when one exists;
- any linked decisions or validation constraints.

## Outputs

- `tasks.md` with coherent executable tasks;
- requirement-to-task links when the slice uses explicit requirements;
- verification methods for each task.

## Procedure

Each task should state:

- the outcome;
- the requirement mapping;
- dependencies;
- the verification method;
- optional checklist steps when that aids execution.

Apply these rules:

- keep tasks outcome-oriented;
- split tasks that require reopening project design or contain several independent outcomes;
- ensure explicit requirements are covered by at least one task;

## Escalate when

- the task list becomes vague because the slice is too large or underspecified;
- a necessary task has no supporting requirement, decision, or accepted enabler rationale.