---
name: Request correction policy
description: Who may correct submitted requests, and when changes must be reviewed again.
---

Only the original requester and workspace admins may edit a submitted request, and only after it has been sent back for correction.

**Why:** The owner explicitly selected editing only after an approver sends the request back. Developer/build access and approval access do not grant permission to change somebody else's answers.

**How to apply:** Enforce both identity and workspace boundaries on form loading and saving. Pending and final requests stay locked, including for admins. Keep returning approvers' read access without granting them edit access.

Corrections keep the request identity, reference, original requester, creation time and activity history. Resubmission restarts approval for the corrected data.

**Why:** Approvals of old answers must not be treated as approvals of changed answers. Retaining the record avoids duplicate requests and preserves accountability.

**How to apply:** Retain attachments unless explicitly removed, revalidate answers/uploads, exclude the current request from uniqueness checks, and evaluate requester-context formulas as the original requester even when an admin edits. Reevaluate conditional routing, including branches that were initially skipped. Preserve the submitted form and full routing definitions for subsequent correction rounds; older requests without a full routing snapshot use the retained workflow definition.

Read-only initial values stay as originally saved; app formulas are recalculated.

**Why:** Initial values can represent creation timestamps or generated identifiers. Correcting another answer must not silently replace those values, and submitted read-only values must not be trusted.

**How to apply:** Restore read-only initial values from the saved record, not the editing user's input; evaluate calculated formulas against corrected answers and the original requester.
