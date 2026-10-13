---
name: Signed-in UI verification
description: How to verify editor defects when the screenshot browser cannot authenticate.
---

A public landing-page screenshot does not verify a defect in the signed-in FlowBuilder editor. Inspect the affected component's actual rendered output before applying cosmetic fixes.

**Why:** A missing-label issue survived styling changes because the shared component discarded its content. Typechecking and screenshots of the public page did not expose that error.

**How to apply:** When a capture cannot authenticate, use a focused render assertion for labels, icons, and child content alongside the appropriate typecheck. Do not bypass authentication to obtain a screenshot.

Before a browser test mutates data, verify that the app's current member matches the synthetic identity supplied to programmatic sign-in and belongs to an isolated test tenant.

**Why:** Fresh accounts receive realistic starter workflows and requests, so a populated dashboard is not evidence that login reached somebody else's workspace. Testing guidance about overriding claims can also be mistaken for a requirement to pass unsupported arbitrary JWT fields; use the helper's documented identity parameters instead.

**How to apply:** Confirm identity and tenant through the signed-in current-member response, not the dashboard title alone. If the requested identity was ignored, stop before changing data.
