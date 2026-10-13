---
name: Workspace layout policy
description: Product rationale for compact, full-width workspace pages with editor-specific scrolling.
---

Use the available workspace width across application pages, with compact, readable headers and controls rather than large unused gutters.

**Why:** The owner highlighted the large outer gutters and oversized editor header, then explicitly requested applying the updated resizing to all other pages as well.

**How to apply:** Keep small, consistent gutters on ordinary workspace pages, but do not impose an arbitrary shared page-width cap. Reserve bounded-height, independently scrolling panes for the workflow editor; ordinary pages must retain normal vertical scrolling. Keep dialogs, authentication forms and long prose appropriately sized. Visual refinements must not change stored forms, expressions, approval behavior or permissions.

**Editor composition:** Keep description editing within the form header, without a separate “Form introduction” card. Let the request-form sheet fill its bordered canvas.

**Why:** The owner explicitly requested removing the redundant introduction section and fitting the form to its background border.
