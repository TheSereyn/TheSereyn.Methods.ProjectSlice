# Getting started

This repository supports both documentation-led adoption and installer-led adoption.

## Prerequisites

- Git repository for the project you want to manage with Project Slice Method.
- Node.js 20 or later to run the bootstrap and lifecycle CLI (`init`, `add`, `sync`, `update`, `diff`).
- Python 3 to run the structural validator, the CI validation workflow, and the session-start and agent-stop hooks. Planning files can still be authored without it, but validation and validation-dependent automation are disabled until it is installed.
- GitHub Copilot in VS Code if you want to use the bundled agents, skills, and instructions.

## Recommended adoption path

1. Read [methodology.md](methodology.md) so the project model is clear before you generate files.
2. Inspect the bundle with `node bin/psm.js inspect`.
3. Bootstrap a repository with `node bin/psm.js init /path/to/repo --name "Your Project"`.
4. If the repository already has `.github/copilot-instructions.md`, review `.psm/copilot-instructions.snippet.md` and merge the PSM block deliberately.
5. Open the target repository and fill in the active plan root `PROJECT.md`, `ROADMAP.md`, and the starter slice package.
6. Run `node bin/psm.js validate /path/to/repo --strict`.

Inside a bootstrapped target repository, you can use the installed validator directly:

```bash
python3 scripts/psm/validate_psm.py validate . --strict
python3 scripts/psm/validate_psm.py status .
python3 scripts/psm/validate_psm.py trace S-001 .
python3 scripts/psm/validate_psm.py milestone M-001 .
```

## What `init` creates

`init` installs:

- repository customizations under `.github/` for planning and execution workflows;
- repository hooks under `.github/hooks/` for optional automation guardrails;
- prompt shortcuts under `.github/prompts/` for common Project Manager entry points;
- a selected plan root under `planning/`;
- `scripts/psm/validate_psm.py` for structural checks;
- `scripts/psm/hook_runner.mjs` for repo-managed hook behavior;
- `.psm/manifest.json` and `.psm/lock.json` so the installation surface is explicit.

By default, `init` preserves an existing `.github/copilot-instructions.md` file and writes a merge snippet instead of overwriting the file.

## First-day usage

After bootstrapping a project, the initial work should usually be:

1. write the real project intent in the selected plan root `PROJECT.md`;
2. adjust the capability map only if it adds clarity;
3. replace the starter roadmap and first slice with real work;
4. keep unrelated ideas in the active plan root `INBOX.md`;
5. validate before treating the planning state as ready.

The packaged prompt shortcuts can help with common entry points once the repository is bootstrapped:

- `/project-status`
- `/capture-idea`
- `/plan-next-slice`
- `/implement-active-slice`
- `/triage-inbox`

## Multi-plan repositories

Keep plan roots visible under `planning/`.

Examples:

- `node bin/psm.js init ../repo --planning-root planning`
- `node bin/psm.js init ../repo --planning-root planning/project-one`
- `node bin/psm.js init ../repo --planning-root planning/project-two`

If you want to initialize more than one repository from the same workspace command, pass more than one target path:

```bash
node bin/psm.js init ../repo-a ../repo-b
```

If the target repository already has its own Copilot instructions file and you want PSM appended automatically, opt in explicitly:

```bash
node bin/psm.js init ../repo --instructions-mode merge
```

## Installer status

The published installer command will be:

```bash
npx @thesereyn/project-slice-method init
```

Until the package is published, this repository can be used directly:

```bash
node bin/psm.js init ../scratch-repo --name "Scratch Repo"
```

Local lifecycle commands are also available now for package-managed assets:

```bash
node bin/psm.js inspect ../local-package
node bin/psm.js add ../local-package ../scratch-repo
node bin/psm.js diff ../scratch-repo
node bin/psm.js sync ../scratch-repo
node bin/psm.js update ../scratch-repo
```

These commands currently support local installable package sources. Remote GitHub-source lifecycle is still deferred.

## Validation model

The validator currently supports:

- `validate`: repository or planning-tree structural checks;
- `status`: machine-derived project status for one plan root;
- `trace <slice-id>`: dependencies, requirement coverage, task links, and evidence for a slice;
- `milestone <milestone-id>`: milestone composition and current slice state;
- `coverage <slice-id>`: requirement-to-task coverage for a slice;
- `next-id <type>`: next available stable ID for slices, milestones, inbox items, backlog items, capabilities, and decisions.

The CLI exposes those commands directly and can scope them to a selected plan root.

The validator is deterministic. It checks repository structure and traceability rules; it does not decide project intent.

## Lifecycle surface

The CLI also exposes package lifecycle commands for managed assets:

- `inspect [source]`
- `add <source> [target]`
- `diff [target]`
- `sync [target]`
- `update [target]`

See [lifecycle.md](lifecycle.md) for scope and limitations.

## Automation surface

Bootstrapped repositories also receive optional hardening assets:

- session-start context injection;
- a narrow destructive-command guard for shell tool use;
- stop-time structural validation;
- Project Manager prompt shortcuts.

See [automation.md](automation.md) for details and limits.