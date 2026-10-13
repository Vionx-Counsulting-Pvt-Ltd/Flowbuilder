---
name: Workflow deletion policy
description: Admin deletion removes availability without erasing request history or disrupting approvals.
---

Deleting a workflow means removing it from the catalog and blocking new submissions, not erasing its existing requests. Only workspace Admin permission grants deletion; Developer build access alone does not.

**Why:** Existing requests still depend on the workflow for historical context. Physically removing or renaming the retained definition would damage that context. Existing approvals must continue after deletion.

**How to apply:** Require explicit confirmation, retain the underlying historical definition, and reject new submissions and edits after deletion. Allow reuse of a deleted workflow's name without changing the names shown on older requests.
