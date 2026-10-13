---
name: Draft validation policy
description: Why unfinished draft saves and changes to live workflows require different validation.
---

Draft saves should preserve work before the builder has finished adding fields, expressions, choices, and approval names. Publishing requires a usable request form and approval route. Keep basic structural requirements explicit rather than silently disabling Save Draft.

**Why:** Applying publication checks to unfinished drafts prevented builders from saving their progress, while errors hidden in the properties panel made Publish appear unresponsive.

**How to apply:** Show blocking issues near the action toolbar and preserve edits when the server rejects a save. Live-form changes must retain publication validation even when an update omits a status. Do not describe edits to a live form as a separate unpublished draft unless a separate draft-version capability is introduced.
