---
name: "psm-select-project-context"
description: "Resolve one Project Slice Method project context in a multi-project host and prepare a visible handoff to the Project Manager. Use when project selection, workflow selection, or multi-project routing is required."
---

# Resolve project context

## Inputs

- host-level project descriptors from `psm projects`;
- the current request text, attached paths, and active workflow clues;
- shallow per-project status when that helps resolve ambiguity;
- the appropriate ask-questions tool for the current surface, such as `vscode/askQuestions` in VS Code, when available.

## Outputs

- a resolved context envelope with `project_key`, `plan_root`, `implementation_roots`, `workflow`, and optional `slice_id`;
- a compact confirmation for the user;
- either a visible handoff to `psm-project-manager` or a user-visible fallback when handoff is unavailable or ignored.

## Procedure

1. Discover projects before asking questions.
2. Resolve project selection using this precedence:
   - An explicit project key or plan-root path in the request.
   - A project context already established earlier in the current workflow.
   - An unambiguous project-local file or directory attached to the request.
   - The only discovered project, when exactly one exists.
   - Use the appropriate ask-questions tool for the current surface when available for the smallest unresolved choice; if no such tool is available, explicitly say so and end the turn with the smallest necessary list of questions for the user to answer on the next turn.
3. Infer workflow and slice from the request and the project status before asking the user to repeat known information.
4. Use qualified cross-project IDs such as `product-a:S-002` and `product-b:S-002` when local IDs collide.
5. Create the resolved context envelope.
6. Present a compact confirmation for the resolved context envelope.
7. Offer a visible handoff to `psm-project-manager`.
8. If the current surface ignores or cannot perform the visible handoff, explicitly say so, use the documented user-visible fallback, and make the loss of persistent project-local context explicit.

## Escalate when

- explicit project-local work remains ambiguous after discovery and the smallest truthful question;
- contradictory descriptors prevent a truthful resolved context envelope;
- the current surface ignores structured questions or handoffs and explicit user-visible diagnostics plus the fallback question list or generated context prompt still cannot preserve correct scope.