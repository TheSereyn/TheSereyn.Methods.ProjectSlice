# Automation

Phase 6 of the Project Slice Method package adds optional repository-level automation on top of the file contract, validator, skills, agents, and orchestration fixtures.

## What ships

The package now includes two automation surfaces:

- repository hook files under `.github/hooks/`;
- prompt shortcuts under `.github/prompts/`.

These are package-managed assets. They are copied into bootstrapped repositories alongside the agents, skills, instructions, and validator.

## Included hooks

### Session start context

`.github/hooks/10-psm-session-start.json` runs `scripts/psm/hook_runner.mjs session-start`.

Its job is to inject lightweight Project Slice Method context at session start when a plan root exists. The injected context summarizes discovered plan roots and their current status so the agent starts from repository truth.

If `python3` is not on `PATH`, session-start still lists the discovered plan roots but skips the per-root status blocks and notes that validation is disabled until `python3` is installed.

### Pre-tool-use command guard

`.github/hooks/20-psm-pre-tool-use.json` runs `scripts/psm/hook_runner.mjs pre-tool-use`.

Its job is to deny common destructive shell commands before they run, including `git reset --hard`, `git checkout -- <path>`, `git checkout .`, `git restore`, `git clean` with a force flag (in any flag order), and `rm` deletions targeting PSM-managed directories (`planning/`, `.psm/`, `.github/` managed subtrees, and `scripts/psm/`).

This guard is **best-effort only**. It is not a security boundary: it recognizes common destructive command shapes, but determined, quoted, or obfuscated commands can bypass it. Treat it as a guardrail that catches easy mistakes, not as a substitute for review or agent judgment.

### Agent-stop validation

`.github/hooks/30-psm-agent-stop.json` runs `scripts/psm/hook_runner.mjs agent-stop`.

Its job is to rerun strict planning validation before the turn ends. If structural PSM validation genuinely fails, the hook blocks the stop and asks for repair before the workflow is treated as complete.

The hook **fails open**. It never blocks a turn merely because the toolchain is unavailable: if `python3` is missing, or the validator cannot be executed for any reason, the hook allows the stop. Only a reproducible, non-zero validation result blocks the turn.

## Included prompt shortcuts

The package ships these shortcuts:

- `.github/prompts/project-status.prompt.md`
- `.github/prompts/capture-idea.prompt.md`
- `.github/prompts/plan-next-slice.prompt.md`
- `.github/prompts/implement-active-slice.prompt.md`
- `.github/prompts/triage-inbox.prompt.md`

Each prompt routes through the human-facing Project Manager contract rather than bypassing the orchestration layer.

## Runtime note

The repository tests prove the hook files, prompt files, helper script behavior, and fixture contracts.

The validator and the session-start and agent-stop hooks require `python3` on `PATH`. When it is absent, validation-dependent automation degrades gracefully instead of failing: session-start drops status blocks and the agent-stop hook allows the turn. Install `python3` to re-enable structural validation.

Actual hook firing still depends on the Copilot surface in use. Session-start prompt behavior, policy hooks, and some interactive permission flows differ between Copilot CLI and cloud agent.

## Disable or relax hooks

If a consumer needs to pause automation temporarily, the main options are:

- set `disableAllHooks` inside an individual `.github/hooks/*.json` file to pause only that file;
- disable hooks at the repository settings level when the Copilot surface supports it;
- remove or customize the repo-managed hook files in a forked or locally adapted installation.

The validator and repository files remain the source of truth even when hooks are disabled.