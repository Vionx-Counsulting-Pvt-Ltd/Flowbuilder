---
name: Attachment preview safety
description: Security rationale for viewing requester-supplied documents from the authenticated portal.
---

Requester-supplied attachments must never execute active content on the authenticated application's origin. HTML and SVG must remain downloads unless a future preview solution uses a genuinely isolated origin or safe conversion.

**Why:** Approvers open documents supplied by other users. Treating arbitrary uploads as ordinary inline web pages could give a malicious requester access to an approver's authenticated browser context.

**How to apply:** Enforce preview safety on the server, not merely by hiding View buttons. Preserve private workspace access when adding thumbnail, document or embedded preview features.
