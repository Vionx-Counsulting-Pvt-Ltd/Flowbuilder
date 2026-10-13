---
name: Signed-in UI verification
description: How to verify editor defects when the screenshot browser cannot authenticate.
---

A public landing-page screenshot does not verify a defect in the signed-in FlowBuilder editor. Inspect the affected component's actual rendered output before applying cosmetic fixes.

**Why:** A missing-label issue survived styling changes because the shared component discarded its content. Typechecking and screenshots of the public page did not expose that error.

**How to apply:** When a capture cannot authenticate, use a focused render assertion for labels, icons, and child content alongside the appropriate typecheck. Do not bypass authentication to obtain a screenshot.
