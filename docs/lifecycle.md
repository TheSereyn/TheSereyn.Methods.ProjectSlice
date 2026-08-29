# Package Lifecycle

Project Slice Method now ships a basic package lifecycle for managed assets.

## What is supported now

The current lifecycle surface is intentionally narrow and practical:

- `inspect [source]`
- `add <source> [target]`
- `sync [target]`
- `update [target]`
- `diff [target]`

These commands currently support local installable package sources that contain `toolkit.yaml`.

## Source support

Supported now:

- the current package itself;
- a local filesystem path to another installable package repository.

Deferred for later:

- GitHub repository resolution such as `owner/repo` or tagged remote installs;
- package registry or remote release resolution beyond the current CLI package itself.

## Command behavior

### `inspect`

`inspect` shows the install surface for the current package or for a local source path.

Use it to review:

- package name and version;
- source location;
- managed asset directories;
- plan-template roots;
- instructions behavior.

### `add`

`add <source> [target]` installs a local package source into an existing repository.

By default it installs package-managed assets only. If you want the source package's plan templates as well, opt in with `--include-plan`.

This keeps `add` distinct from `init`:

- `init` is the primary bootstrap command for a first-time PSM repository;
- `add` is the lifecycle command for adding an installable package source to an existing repository.

### `sync`

`sync [target]` reapplies package-managed assets from the recorded lifecycle source.

This is intended for:

- restoring managed files that are missing or drifted;
- reapplying agents, skills, hooks, prompts, instructions, workflows, or scripts that belong to a package.

`sync` **preserves local edits by default**. Each managed file is compared against a baseline hash recorded at install time:

- files that match the recorded package version are left untouched;
- files that were changed in the source are refreshed;
- files you edited locally are **preserved** and reported as `preserve-local`.

To overwrite local edits and restore the package version, pass `--force`. To preview what would change without writing anything, pass `--dry-run`. It never silently overwrites project-owned planning files.

### `update`

`update [target]` refreshes managed assets from the recorded source and rewrites the stored package version metadata to match the currently resolved source package.

For local path sources, this means the target can follow changes made in that local package repository.

`update` uses the same local-edit preservation as `sync`, so `--force` and `--dry-run` apply here too. It additionally supports `--prune`: when the package stops shipping a managed file, `update --prune` removes the stale file from the target, but only when the local copy still matches its recorded baseline (or `--force` is also given). Stale files you modified locally are kept and reported.

### `diff`

`diff [target]` compares recorded managed files in the target repository against the currently resolved package source.

It reports:

- `MODIFIED`
- `MISSING`
- `STALE`

This is intentionally scoped to package-managed files. Project-owned plan artifacts and the main instructions file remain human-owned and are not treated as package drift by default.

## Install-state model

The `.psm/` directory now records package lifecycle metadata per installed package.

The important fields are:

- package name and version;
- `sourceType` such as `self` or `path`;
- `sourceRef` for path-based sources, stored relative to the target repository so the install stays portable when the repo is moved or cloned;
- the managed file list for that package;
- `managedFileHashes`: a baseline SHA-256 per managed file, used to tell package changes apart from local edits during `sync` and `update`;
- any plan roots associated with the package;
- instructions merge state.

This keeps lifecycle operations deterministic without moving the project plan itself into `.psm/`.

## Safety model

- package-managed assets may be refreshed by lifecycle commands, but local edits are preserved by default and only replaced with `--force`;
- `sync`/`update` distinguish local edits from upstream changes using the recorded baseline hashes, so re-running a lifecycle command does not clobber work in progress;
- `--dry-run` previews changes without writing, and `update --prune` removes stale managed files only when they still match their baseline;
- project-owned planning artifacts are not automatically overwritten;
- `.github/copilot-instructions.md` remains treated as project-owned and uses the existing preserve or merge behavior.

## Practical limitation

The current lifecycle work is enough to manage local development and packaging iteration for PSM itself.

Remote source resolution is intentionally deferred until the package contract and consumer expectations are stable enough to justify it.