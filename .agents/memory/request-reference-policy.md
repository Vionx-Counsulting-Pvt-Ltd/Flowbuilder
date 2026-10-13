---
name: Request reference policy
description: Owner-approved reference format, historical stability and numbering decisions.
---

New request references use the first letter of each workflow-name word, uppercase, then `-YY-MM-DD-000001` with a six-digit counter. Existing request references must remain unchanged.

**Why:** The owner requested workflow initials and date, accepted a uniqueness counter, and specifically required six digits (`000001`). Historic references may already be used outside the application.

**How to apply:** Preserve the format wherever requests are created or seeded; do not silently reformat historical requests after a workflow rename.

Submission dates use Sri Lanka time. Numbers reset per date-and-initials prefix; matching initials share a counter across workflows/workspaces rather than producing duplicate references.

**Why:** VionX's local context is Sri Lanka, and daily numbering needs one consistent midnight boundary. References are globally unique, even when multiple workflows have the same initials.

**How to apply:** Keep date interpretation consistent across servers. Any future workspace-specific numbering must explicitly address cross-workspace reference uniqueness.
