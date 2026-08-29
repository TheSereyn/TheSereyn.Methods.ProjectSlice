# Implementation Status

This repository is a partial implementation of the Project Slice Method technical specification, not the full end-state described in the draft spec.

## Implemented now

- Phase 1 file contract and starter templates.
- Phase 2 structural validator, test coverage, and CI.
- A practical `npx`-ready CLI surface for `inspect`, `init`, `doctor`, `validate`, `status`, `trace`, `milestone`, `coverage`, and `next-id`.
- Phase 3 core skills with consistent Inputs, Outputs, Procedure, and Escalate sections, plus an automated audit of the required skill set, including scope-management skills for changing and splitting slices.
- Phase 4 specialist agents with explicit write scopes, common skills, escalation rules, completion conditions, and independent fixture-backed audits.
- Phase 5 Project Manager orchestration contract with explicit routing rules, approval gates, status response format, tangent-handling policy, and fixture-backed prompt scenarios.
- Phase 6 repository automation with hook files, prompt shortcuts, a shared hook helper, and fixture-backed automation tests.
- Local-source lifecycle commands for `inspect`, `add`, `sync`, `update`, and `diff`, backed by package-aware install-state tracking, baseline-hash local-edit preservation, and `--force`, `--dry-run`, and `--prune` controls.
- Repo-local agents, skills, and instructions that express the intended roles and workflows.
- Safe handling for existing `.github/copilot-instructions.md` files.
- Support for more than one plan root by keeping plans under `planning/<plan-slug>/`.
- End-to-end workflow fixtures that model the project-manager, planner, implementer, verifier, and reconciler progression for a sample repo.
- Independent specialist-agent fixture contracts and overlays for project-shaper, slice-planner, implementer, verifier, and reconciler scenarios.
- An explicit Project Manager fixture contract and tangent-capture overlay for user-facing orchestration behavior.
- An explicit Phase 6 automation contract for hook files, prompt shortcuts, and runtime-hardening scenarios.

## Not implemented yet

- remote GitHub-source package installation;
- MCP integrations or external projections such as GitHub Issues synchronization.

## Why plans remain in `planning/`

This repository now makes an explicit distinction:

- `planning/` contains durable, user-owned project state;
- `.psm/` contains tool-owned installation metadata and lock state.

That split matches the common convention for Git-native planning systems. Hidden directories are a good place for machine-owned metadata. They are a poor place for the visible project source of truth.

## Multi-plan convention

When one repository needs more than one PSM plan, use visible nested plan roots:

- `planning/site-web/`
- `planning/site-content/`
- `planning/project-slice/`

The CLI and validator now support that convention. The bundle intentionally avoids arbitrary hidden plan locations so Copilot instructions, repository review, and direct navigation remain straightforward.

## Phase 4 note

Phase 4 is complete at the repository-contract level. Each specialist agent now has:

- explicit writable artifact scope;
- a defined list of common skills;
- clear escalation rules;
- a clear completion condition;
- an independent fixture scenario whose overlay stays within the declared boundary and still validates.

What remains unproven is live runtime enforcement inside an actual Copilot execution surface. That is a later hardening concern, not a gap in the repository-level Phase 4 contract.

## Phase 5 note

Phase 5 is complete at the repository-contract level. The Project Manager now has:

- an explicit user-facing routing contract;
- defined approval gates for scope, roadmap, and milestone decisions;
- a stable status response format;
- explicit tangent-handling rules;
- fixture-backed prompt scenarios that prove the route and resulting project state for orientation, planning, activation, implementation, verification, reconciliation, and tangent capture.

What remains unproven is live runtime inference and delegation behavior inside an actual Copilot execution surface. That is a later hardening concern, not a gap in the repository-level Phase 5 contract.

## Phase 6 note

Phase 6 is complete at the repository-contract level. The package now has:

- repository hook files for session-start context, destructive-command guarding, and stop-time validation;
- convenience prompt shortcuts for the main Project Manager entry points;
- a shared hook helper script packaged with the repository assets;
- fixture-backed automation tests that validate hook config shape, prompt metadata, command-guard behavior, session-start context injection, and stop-time validation behavior.

## Safety and hardening note

Recent hardening made the package safe to re-run and safe to operate without a full toolchain:

- `sync` and `update` preserve local edits by default, using recorded baseline hashes to tell package changes apart from user edits; `--force` overwrites, `--dry-run` previews, and `update --prune` removes stale managed files only when they still match their baseline;
- managed-file writes and prunes are path-contained to the target repository, plan roots reject `..` traversal, and recorded source refs are stored relative to the target for portability;
- the agent-stop hook fails open when `python3` or the validator is unavailable and only blocks on reproducible validation findings; session-start degrades gracefully;
- the pre-tool-use command guard is best-effort only and is documented as such, covering common destructive shapes across all managed directories rather than acting as a security boundary;
- the structural validator tolerates malformed frontmatter by reporting an issue instead of crashing, ignores links inside fenced or inline code, handles escaped table pipes, and supports `validate --all` across multiple plan roots for CI.

What remains deferred is semantic status-transition enforcement — for example, rejecting an invalid `planned -> done` jump. Status values are validated against the allowed set, but the legal transitions between them are not yet enforced. That is a later hardening concern, not a gap in the current file contract.

What remains unproven is the exact live firing behavior across every Copilot surface. CLI and cloud agent differ in some hook semantics, so surface-specific runtime confirmation remains a later hardening concern, not a gap in the repository-level Phase 6 contract.