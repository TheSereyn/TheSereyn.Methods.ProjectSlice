---
applyTo: "planning/**/*.md"
---

When editing Project Slice Method planning artifacts:

- preserve existing stable IDs;
- keep frontmatter minimal and valid;
- distinguish active scope from backlog or Inbox ideas;
- keep included and deferred scope explicit;
- do not mark verification as passed without evidence;
- do not mark a slice done until reconciliation is reflected in durable files;
- run `python3 scripts/psm/validate_psm.py validate --strict` after material planning changes.