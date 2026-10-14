---
name: Invitation link policy
description: App-hosted invitation signup and recovery of previously emailed broken links.
---

Invitation signup must use the reachable FlowBuilder origin used by the inviter, not a relative route resolved on Clerk's hosted accounts domain.

**Why:** Invitations sent from workspace preview reached a Clerk accounts-domain sign-up URL that returned 404. FlowBuilder already hosts its own embedded sign-up screen. The same invitation logic serves workspace teammates and first company admins.

**How to apply:** Preserve the caller's actual app domain across proxies and keep preview and production authentication separate. Do not substitute a branding-only company domain or rotate managed Clerk keys to address invitation redirects.

Previously sent email links are immutable. Recovery requires a fresh invitation without changing the pending member's workspace, role or reporting manager.

**Why:** Correcting the redirect for future invitations does not repair links already in recipients' inboxes.

**How to apply:** Resend only pending workspace invitations under admin authority. Preserve the existing invitation if fresh delivery fails, and revoke the superseded invitation only after the replacement is saved.

Clerk's invitation URL may legitimately begin on its accounts domain at the ticket-acceptance endpoint, even when an absolute FlowBuilder redirect is configured.

**Why:** A real synthetic invitation returned a redirect from Clerk's acceptance endpoint to FlowBuilder's sign-up route with the signup ticket. Checking the invitation object's initial hostname alone would incorrectly classify a working link as broken.

**How to apply:** Verify the acceptance response's redirect destination and ticket presence, not just the first URL's hostname. Keep invitation tickets transient and never print them in logs or save them in project files.
