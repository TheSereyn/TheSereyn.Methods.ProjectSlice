---
description: "Use when implementing code or tests in a repository that uses Project Slice Method. Read the active slice and relevant planning context before changing code, and do not silently expand scope."
---

When implementing work in a Project Slice Method repository:

- read the relevant chain of context before editing code: `PROJECT.md`, relevant shared context, the roadmap entry, the slice spec, design, tasks, and linked decisions;
- treat the active slice as the implementation boundary;
- capture useful unrelated ideas in the active plan root `INBOX.md` instead of silently broadening the change;
- update task execution notes and verification evidence as the slice progresses;
- run the narrowest validation that can falsify the change;
- escalate scope conflicts rather than rewriting the slice intent during implementation.