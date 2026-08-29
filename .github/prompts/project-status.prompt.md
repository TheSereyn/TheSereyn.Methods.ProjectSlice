---
agent: agent
description: "Project Slice Method status. Use this to ask the user-facing Project Manager for the current milestone, active slice, next slice, blockers, recent completions, Inbox count, and roadmap risks."
---

Use the `psm-project-manager` agent for this request.

Report the current Project Slice Method state for the active plan root using this format:

- `Current milestone:`
- `Active slices:`
- `Next slice:`
- `Blocked slices:`
- `Recently completed:`
- `Untriaged Inbox items:`
- `Roadmap risks:`

If more than one plan root exists, ask which plan root should be used before going deeper.