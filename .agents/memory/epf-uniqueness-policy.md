---
name: EPF uniqueness policy
description: Source and scope chosen for EPF duplicate prevention in Staff Onboarding.
---

EPF duplicate checks should use previous Staff Onboarding requests, not a maintained employee table.

**Why:** The owner explicitly selected Staff Onboarding requests as the source of existing EPF numbers.

**How to apply:** Check across requesters within the same workflow and workspace. Do not silently broaden this to other workflows, other workspaces or employee tables. Preserve historical requests rather than deleting or rewriting existing duplicates.

All submitted request statuses count, including rejected requests, unless the owner explicitly changes this rule.

**Why:** The default is to reserve identifiers appearing anywhere in the chosen request history, avoiding accidental reuse.

**How to apply:** Keep the final submission check authoritative even if an earlier browser check says a value is available; simultaneous submissions must not bypass uniqueness.
