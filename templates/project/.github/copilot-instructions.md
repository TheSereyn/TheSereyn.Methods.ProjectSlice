This repository uses Project Slice Method (PSM).

- Treat PSM planning files under `planning/` as authoritative project-management state.
- The active slice defines the current implementation scope.
- Do not silently expand scope. Capture useful unrelated ideas in the active plan root `INBOX.md`.
- Preserve stable PSM IDs once referenced.
- Prefer vertical slices that produce observable end-to-end behaviour.
- Durable decisions and requirements must be written to repository artifacts rather than left only in chat history.
- Do not mark a slice done until verification and reconciliation both pass.
- Run `python3 scripts/psm/validate_psm.py validate . --strict` after material planning changes.