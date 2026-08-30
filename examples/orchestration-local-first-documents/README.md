# Orchestration fixture for local-first documents

This fixture exercises the Project Slice Method workflow across several role-specific stages without requiring an interactive Copilot session.

## Structure

- `base/`: the project state the Project Manager inspects to decide what is next.
- `specialist-agents.json`: the explicit Phase 4 contract for each specialist agent, including tool set, write scope, common skills, escalation phrases, and fixture overlays.
- `project-manager.json`: the explicit Phase 5 contract for the user-facing Project Manager, including routing rules, approval gates, status labels, tangent policy, and prompt scenarios.
- `phase6-automation.json`: the explicit Phase 6 contract for hook files, prompt shortcuts, and automation expectations.
- `overlays/01-slice-planner/`: the Slice Planner readies `S-002` and captures a tangent in the Inbox.
- `overlays/02-project-manager-active/`: the Project Manager activates the ready slice.
- `overlays/03-implementer/`: the Implementer completes the planned task work.
- `overlays/04-verifier/`: the Verifier records acceptance evidence.
- `overlays/05-reconciler/`: the Reconciler marks the slice done and updates the current-system view.
- `overlays/06-project-manager-tangent/`: the Project Manager captures a useful tangent without changing the active roadmap state.

## Intent

The fixture covers three areas:

1. the CLI and validator can inspect realistic plan states;
2. each workflow stage changes only the artifact categories it should own;
3. the orchestration and automation layers behave as expected, including stable routing, tangent capture, hook files, prompt shortcuts, session-start context, destructive-command guarding, and stop-time validation.