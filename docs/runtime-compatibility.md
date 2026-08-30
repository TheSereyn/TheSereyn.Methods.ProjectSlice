# Runtime compatibility

Project Slice Method uses a mix of repository assets, package lifecycle state, and Copilot runtime features. Some parts are fully covered by repository tests, while others still require live runtime verification.

## Topology support

The repository test suite currently covers these discovery topologies:

| Topology | Current repo support | Notes |
|---|---|---|
| same-repository host root | supported | `session-start` and CLI commands discover the active planning host directly. |
| same-repository subdirectory | supported | Session-start and CLI discovery resolve the outer planning host from a same-repository subdirectory. |
| nested implementation repository | supported | When an outer planning host has `.psm/manifest.json`, session-start and CLI discovery prefer that host over the nested implementation repository Git root. |
| multi-plan monorepo | supported | `projects` and `status --all` inspect multiple plan roots and diagnose invalid mixed layouts. |

## Surface matrix

The current package guidance distinguishes between shipped assets and live runtime verification.

| Surface | Prompt to coordinator | ask-questions tool | visible coordinator handoff | current fallback |
|---|---|---|---|---|
| VS Code local Copilot chat | manually verified: `/work-on-project` activated `psm-project-coordinator` | manually verified: structured question UI rendered and captured the selected project | manually verified as a user-visible generated-context fallback; no native persistent `psm-project-manager` mode switch was observed | generated context envelope for `psm-project-manager`; the manual spike retained project-scoped context for the next follow-up turn |
| Copilot CLI | no verified interactive transition | no verified structured question flow | no verified visible handoff | end the turn with the smallest necessary list of questions or a generated context prompt for `psm-project-manager` |
| Copilot cloud agent on GitHub.com | no verified interactive transition | no verified structured question flow | no verified visible handoff | end the turn with the smallest necessary list of questions or a generated context prompt for `psm-project-manager` |

## Diagnostics

Current coordinator guidance should make these conditions explicit to the user rather than silently changing scope:

- the current surface does not expose an appropriate ask-questions tool;
- the current surface ignores or does not support the visible coordinator-to-manager handoff;
- no persistent project-local context can be retained across turns;
- a user-visible fallback is being used instead of a real handoff.

The manual VS Code local chat spike confirmed that the fallback itself is visible and explicit. It did not confirm a true mode switch into `psm-project-manager`.

## Remaining live verification

Repository tests cover the packaged coordinator, prompt, selection skill, hook behavior, topology-aware host discovery, and read-only fallbacks.

These live runtime checks are still outstanding:

- native visible coordinator-to-manager handoff activating `psm-project-manager` in VS Code local Copilot chat instead of the generated-context fallback;
- follow-up turns retaining the resolved project context after a true native handoff, once a surface supports it;
- interactive transition and structured-question behavior in Copilot CLI;
- interactive transition and structured-question behavior in Copilot cloud agent on GitHub.com.