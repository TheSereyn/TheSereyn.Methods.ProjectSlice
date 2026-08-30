# The Sereyn Project Slice Method

Project Slice Method is a Markdown-first, Git-native project system for planning and delivering work through small, testable vertical slices.

This repository is the canonical home for the method, its reference documentation, and the bootstrap assets used to apply it in other repositories.

## What this repository includes

- the core Project Slice Method guidance and working conventions;
- reusable GitHub Copilot customizations for PSM-managed repositories;
- a repository bootstrap CLI intended for `npx` distribution;
- a local-source package lifecycle for managed assets and install-state refresh;
- planning templates for projects, milestones, slices, tasks, and supporting artifacts;
- a deterministic validator for IDs, references, statuses, and traceability coverage;
- machine-derived status, trace, and milestone inspection commands;
- a worked example fixture that demonstrates a valid PSM project state.

## Who it is for

Project Slice Method is for teams or individuals who want:

- a clear whole-project view without a dedicated PM application;
- small, bounded vertical slices instead of large horizontal plans;
- repository files as the durable source of truth;
- AI assistance that helps without becoming the hidden source of truth;
- verification and reconciliation before work is marked complete.

## How to use this repository

There are three supported entry points.

1. Read the method through [docs/methodology.md](docs/methodology.md) and [docs/getting-started.md](docs/getting-started.md).
2. Evaluate the bundle locally with `node bin/psm.js inspect` and bootstrap a test repository with `node bin/psm.js init /path/to/repo --name "My Project"`.
3. Use the published installer path while the package is on the `alpha` dist-tag: `npx @thesereyn/psm@alpha init`. Once a stable release is promoted to `latest`, use `npx @thesereyn/psm init`.

This repository remains readable on its own. The CLI copies the packaged assets into a target repository and records managed state in `.psm/`.

## Plan and tool state

Project plans stay visible and user-owned. Tool state stays hidden and package-owned.

- Keep durable project artifacts in `planning/`.
- Use `.psm/` for installer state, lock data, and managed-package metadata.
- If one repository needs more than one plan, keep the plan roots under `planning/<plan-slug>/`.

This keeps the project model easy to review while giving the CLI a clear place to track managed state.

## Requirements

- Node.js 20 or later for the bootstrap and lifecycle CLI.
- Python 3 for the structural validator, the CI validation workflow, and the automation hooks. Without `python3`, planning files can still be authored, but validation and validation-dependent automation are disabled until it is installed.

## What a bootstrapped project receives

A bootstrapped repository receives two kinds of artifacts.

- Package-managed assets: `.github/agents/`, `.github/hooks/`, `.github/instructions/`, `.github/prompts/`, `.github/skills/`, `.github/workflows/psm-validate.yml`, `scripts/psm/hook_runner.mjs`, and `scripts/psm/validate_psm.py`.
- Project-owned artifacts: `.github/copilot-instructions.md`, the selected plan root under `planning/`, `PROJECT.md`, `CAPABILITIES.md`, `ROADMAP.md`, `INBOX.md`, `BACKLOG.md`, and the supporting `milestones/`, `specs/`, `context/`, `decisions/`, `research/`, and `system/` directories.

The CLI treats `.github/copilot-instructions.md` as project-owned. If that file already exists, `init` preserves it by default and writes a merge-ready snippet to `.psm/copilot-instructions.snippet.md` instead of overwriting the file.

Most day-to-day work stays in a small set of files:

- `planning/PROJECT.md`
- `planning/ROADMAP.md`
- the active slice under `planning/specs/`
- `planning/INBOX.md`

Additional files such as milestones, decisions, context, backlog, and system docs support those four entry points when they add information value.

## Quick start

Inspect the current bundle:

```bash
node bin/psm.js inspect
```

Inspect a local installable package source:

```bash
node bin/psm.js inspect ../my-package
```

Bootstrap another repository locally:

```bash
node bin/psm.js init ../my-repository --name "My Project"
```

Add a second project to an existing PSM repository:

```bash
node bin/psm.js add-project ../my-repository --planning-root planning/project-two --name "Project Two"
```

Add a local package source to an existing repository:

```bash
node bin/psm.js add ../my-package ../my-repository
```

Enable or disable the multi-project lifecycle state explicitly:

```bash
node bin/psm.js enable multi-project ../my-repository
node bin/psm.js disable multi-project ../my-repository
```

Once multi-project is enabled, the installed repository also receives a `/work-on-project` prompt that routes through the multi-project coordinator before project-local work begins.

Check managed-file drift and reapply package-managed assets:

```bash
node bin/psm.js diff ../my-repository
node bin/psm.js sync ../my-repository
node bin/psm.js update ../my-repository
```

`sync` and `update` preserve local edits by default. Add `--dry-run` to preview changes or `--force` to overwrite managed files. `update --prune` removes managed files the package no longer ships.

Validate the generated planning state from inside the target repository:

```bash
node bin/psm.js validate ../my-repository --strict
```

For a multi-project host, `node bin/psm.js status ../my-repository --all` prints a compact portfolio view and warns about overlapping implementation roots without writing planning state.

Inspect project state directly from the validator installed into a target repository:

```bash
python3 scripts/psm/validate_psm.py status
python3 scripts/psm/validate_psm.py trace S-001
python3 scripts/psm/validate_psm.py milestone M-001
```

Run contributor tests for this repository:

```bash
npm test
```

## Repository layout

- [docs/methodology.md](docs/methodology.md): the operating model and core concepts.
- [docs/getting-started.md](docs/getting-started.md): adoption flow, prerequisites, and first steps.
- [docs/automation.md](docs/automation.md): hook behavior, prompt shortcuts, and automation limits.
- [docs/runtime-compatibility.md](docs/runtime-compatibility.md): supported topologies, Copilot-surface matrix, and current handoff fallback behavior.
- [docs/artifact-model.md](docs/artifact-model.md): managed versus project-owned files and install state.
- [docs/implementation-status.md](docs/implementation-status.md): which parts of the technical spec are implemented today.
- [docs/lifecycle.md](docs/lifecycle.md): local-source package lifecycle behavior, safety rules, and current limitations.
- [docs/releasing.md](docs/releasing.md): npm version policy, release tags, Trusted Publisher setup, and automated publishing rules.
- [.github/agents](.github/agents): reusable agent roles for PSM repositories.
- [.github/hooks](.github/hooks): optional repository-level automation hooks for session start, command guarding, and stop-time validation.
- [.github/skills](.github/skills): reusable planning and execution procedures.
- [.github/prompts](.github/prompts): prompt shortcuts that route through the Project Manager workflow.
- [templates/project](templates/project): starter repository artifacts copied by `init`.
- [scripts/psm/validate_psm.py](scripts/psm/validate_psm.py): structural validator.
- [scripts/psm/hook_runner.mjs](scripts/psm/hook_runner.mjs): hook helper used by the repository automation files.
- [scripts/psm/release_publish.mjs](scripts/psm/release_publish.mjs): release-tag and package-metadata validator used by the publish workflow.
- [examples/local-first-documents](examples/local-first-documents): valid worked example fixture.
- [examples/orchestration-local-first-documents](examples/orchestration-local-first-documents): role-by-role workflow fixture, specialist-agent contracts, Project Manager routing contracts, and phase 4 to 6 boundary audits.

## Current implementation scope

This repository does not implement the full technical specification yet.

The current state is:

- Phase 1: implemented.
- Phase 2: implemented.
- Slice 1: implemented.
- Slice 2 lifecycle transition infrastructure: implemented.
- Phase 3: complete for the core workflow skills, with consistent skill contracts, an automated skill audit, and deterministic validator support for `status`, `trace`, `milestone`, `coverage`, and `next-id`.
- Phase 4: complete at the repository-contract level, with explicit specialist-agent write scopes, common skills, escalation rules, completion conditions, and independent fixture-backed boundary tests.
- Phase 5: complete at the repository-contract level, with an explicit Project Manager routing contract, approval gates, status response format, tangent-handling policy, and fixture-backed user-prompt scenarios.
- Phase 6: complete at the repository-contract level, with repository hook files, prompt shortcuts, a shared hook helper, and fixture-backed automation tests.

Local-source lifecycle commands such as `add`, `sync`, `update`, and `diff` are implemented. Remote GitHub-source lifecycle work remains deferred until the package contract is stable enough to support it cleanly.

See [docs/implementation-status.md](docs/implementation-status.md) for a fuller map from the technical spec to the current repository implementation.
