# Artifact Model

Project Slice Method keeps durable state in ordinary repository files. This repository ships both reusable package assets and project-owned planning artifacts.

## Package-owned assets

These files are copied into a target repository as reusable tooling and behavior definitions.

- `.github/agents/`
- `.github/hooks/`
- `.github/skills/`
- `.github/instructions/`
- `.github/prompts/`
- `.github/workflows/psm-validate.yml`
- `scripts/psm/validate_psm.py`
- `scripts/psm/hook_runner.mjs`

The current CLI records these files as managed assets in `.psm/manifest.json` and `.psm/lock.json`. `sync`, `update`, and `diff` use that state to update or compare managed files without guessing.

## Project-owned artifacts

These files are created from templates during bootstrap and then become part of the user's repository state.

- `.github/copilot-instructions.md`
- the selected plan root under `planning/`
- `PROJECT.md`
- `CAPABILITIES.md`
- `ROADMAP.md`
- `INBOX.md`
- `BACKLOG.md`
- `milestones/`
- `specs/`
- `context/`
- `decisions/`
- `research/`
- `system/`

The installer should not silently overwrite these artifacts once they have been edited.

If `.github/copilot-instructions.md` already exists, the default install mode preserves it and writes a merge-ready PSM snippet to `.psm/copilot-instructions.snippet.md` instead of editing the file.

## Multi-plan layout

The common convention is to keep all user-owned plans under `planning/`.

Examples:

- `planning/` for a single-plan repository.
- `planning/site-web/` and `planning/site-content/` for a repository that carries more than one plan.

Avoid using `.psm/` as the primary location for project artifacts. Hidden directories are a better fit for tool-owned metadata than for the human-facing project model.

## Daily working set

Although the repository may contain many planning files, normal daily navigation should stay focused on:

- `planning/PROJECT.md`
- `planning/ROADMAP.md`
- the active slice package
- `planning/INBOX.md`

For multi-plan repositories, interpret that working set relative to the active plan root.

## Install state

Bootstrapped projects receive a small local state directory:

- `.psm/manifest.json`
- `.psm/lock.json`

This state is intended to be committed to source control. It records what bundle was installed and which files were managed versus templated.

It also records the configured plan roots so the CLI can validate or doctor more than one plan within the same repository.

The lifecycle state now also tracks installed packages individually, including:

- package version;
- source type;
- source reference;
- managed file lists;
- associated plan roots;
- instructions merge state.

## Repository contract

The repository contract for the first release is:

- the method remains directly readable without the CLI;
- the CLI is a convenience layer, not the source of truth;
- validation is local and CI-friendly;
- the project state remains usable when AI is unavailable.