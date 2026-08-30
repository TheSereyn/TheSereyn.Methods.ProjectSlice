# Package lifecycle

Project Slice Method ships a basic package lifecycle for managed assets.

## Supported commands

The current lifecycle surface is small:

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

Planned later:

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

Use it to:

- restore managed files that are missing or drifted;
- reapply agents, skills, hooks, prompts, instructions, workflows, or scripts that belong to a package.

`sync` preserves local edits by default. Each managed file is compared against a baseline hash recorded at install time:

- files that match the recorded package version are left untouched;
- files that changed in the source are refreshed;
- files you edited locally are preserved and reported as `preserve-local`.

To overwrite local edits and restore the package version, pass `--force`. To preview what would change without writing anything, pass `--dry-run`. It never silently overwrites project-owned planning files.

### `update`

`update [target]` refreshes managed assets from the recorded source and rewrites the stored package version metadata to match the currently resolved source package.

For local path sources, this means the target can follow changes made in that local package repository.

`update` uses the same local-edit preservation as `sync`, so `--force` and `--dry-run` apply here too. It also supports `--prune`: when the package stops shipping a managed file, `update --prune` removes the stale file from the target, but only when the local copy still matches its recorded baseline, or when `--force` is also given. Stale files you modified locally are kept and reported.

### `diff`

`diff [target]` compares recorded managed files in the target repository against the currently resolved package source.

It reports:

- `MODIFIED`
- `MISSING`
- `STALE`

This is scoped to package-managed files. Project-owned plan artifacts and the main instructions file remain user-owned and are not treated as package drift by default.

## Install-state model

The `.psm/` directory records package lifecycle metadata per installed package.

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
- `sync` and `update` distinguish local edits from upstream changes using the recorded baseline hashes, so re-running a lifecycle command does not clobber work in progress;
- `--dry-run` previews changes without writing, and `update --prune` removes stale managed files only when they still match their baseline;
- project-owned planning artifacts are not automatically overwritten;
- `.github/copilot-instructions.md` remains treated as project-owned and uses the existing preserve or merge behavior.

## Current limitation

The current lifecycle surface is enough for local development and packaging iteration.

Remote source resolution remains deferred until the package contract and consumer expectations are stable enough to support it cleanly.