# Implementation status

This repository is a partial implementation of the Project Slice Method technical specification, not the full end state described in the draft spec.

## Implemented today

- Phase 1 file contract and starter templates.
- Phase 2 structural validator, test coverage, and CI.
- An `npx`-ready CLI surface for `inspect`, `init`, `doctor`, `validate`, `status`, `trace`, `milestone`, `coverage`, and `next-id`.
- Phase 3 core skills with consistent Inputs, Outputs, Procedure, and Escalate sections, plus an automated audit of the required skill set, including scope-management skills for changing and splitting slices.
- Phase 4 specialist agents with explicit write scopes, common skills, escalation rules, completion conditions, and independent fixture-backed audits.
- Phase 5 Project Manager orchestration contract with explicit routing rules, approval gates, status response format, tangent-handling policy, and fixture-backed prompt scenarios.
- Phase 6 repository automation with hook files, prompt shortcuts, a shared hook helper, and fixture-backed automation tests.
- Local-source lifecycle commands for `inspect`, `add`, `sync`, `update`, and `diff`, backed by package-aware install-state tracking, baseline-hash local-edit preservation, and `--force`, `--dry-run`, and `--prune` controls.
- Slice 1 project descriptor discovery through `psm projects`, including `project_key`, `implementation_roots`, recursive multi-root discovery, and cross-root validation.
- Slice 2 multi-project lifecycle transition infrastructure, including `add-project`, explicit `enable` and `disable` flows for `multi-project`, manifest-owned capability state, automatic migration from `planning/` to `planning/<project-key>/`, and capability-aware lifecycle refresh when a package source defines optional multi-project assets.
- Repo-local agents, skills, and instructions that express the intended roles and workflows.
- Safe handling for existing `.github/copilot-instructions.md` files.
- Support for more than one plan root by keeping plans under `planning/<plan-slug>/`.
- End-to-end workflow fixtures that model the project-manager, planner, implementer, verifier, and reconciler progression for a sample repository.
- Independent specialist-agent fixture contracts and overlays for project-shaper, slice-planner, implementer, verifier, and reconciler scenarios.
- An explicit Project Manager fixture contract and tangent-capture overlay for user-facing orchestration behavior.
- An explicit Phase 6 automation contract for hook files, prompt shortcuts, and runtime-hardening scenarios.

## Not implemented yet

- remote GitHub-source package installation;
- MCP integrations or external projections such as GitHub Issues synchronization.
- interactive coordinator, handoff, and project-context runtime surfaces from later multi-project slices.

## Plan and metadata locations

Project plans live under `planning/`. Installer metadata and lock state live under `.psm/`.

That keeps the project state visible in the repository while leaving package-owned state in the package-owned directory.

For lifecycle decisions, `.psm/manifest.json` is authoritative for plan-root and capability state. `.psm/lock.json` mirrors resolved package source and version data for refresh operations.

## Multi-plan layout

When a repository needs more than one PSM plan, keep the plan roots visible:

- `planning/project-one/`
- `planning/project-two/`
- `planning/project-three/`

The CLI and validator support this layout directly.

## Phase 4 status

Phase 4 is complete at the repository-contract level. Each specialist agent now has:

- explicit writable artifact scope;
- a defined list of common skills;
- clear escalation rules;
- a clear completion condition;
- an independent fixture scenario whose overlay stays within the declared boundary and still validates.

Live runtime enforcement inside Copilot surfaces is still to be validated.

## Phase 5 status

Phase 5 is complete at the repository-contract level. The Project Manager now has:

- an explicit user-facing routing contract;
- defined approval gates for scope, roadmap, and milestone decisions;
- a stable status response format;
- explicit tangent-handling rules;
- fixture-backed prompt scenarios that prove the route and resulting project state for orientation, planning, activation, implementation, verification, reconciliation, and tangent capture.

Live runtime inference and delegation behavior inside Copilot surfaces is still to be validated.

## Phase 6 status

Phase 6 is complete at the repository-contract level. The package now has:

- repository hook files for session-start context, destructive-command guarding, and stop-time validation;
- convenience prompt shortcuts for the main Project Manager entry points;
- a shared hook helper script packaged with the repository assets;
- fixture-backed automation tests that validate hook config shape, prompt metadata, command-guard behavior, session-start context injection, and stop-time validation behavior.

## Current hardening

Recent hardening made the package safer to re-run and easier to use without a full toolchain:

- `sync` and `update` preserve local edits by default, using recorded baseline hashes to tell package changes apart from user edits. `--force` overwrites, `--dry-run` previews, and `update --prune` removes stale managed files only when they still match their baseline.
- Managed-file writes and prunes are path-contained to the target repository, plan roots reject `..` traversal, and recorded source references are stored relative to the target for portability.
- The agent-stop hook fails open when `python3` or the validator is unavailable and only blocks on reproducible validation findings. Session-start degrades gracefully.
- The pre-tool-use command guard is best-effort only. It covers common destructive shapes across the managed directories, but it is not a security boundary.
- The structural validator tolerates malformed frontmatter by reporting an issue instead of crashing, ignores links inside fenced or inline code, handles escaped table pipes, and supports `validate --all` across multiple plan roots for CI.

## Current limits

- Semantic status-transition enforcement is not implemented yet. For example, the validator accepts allowed status values but does not yet reject an invalid `planned -> done` jump.
- Exact live hook behavior still needs confirmation across each Copilot surface because runtime semantics differ between environments.