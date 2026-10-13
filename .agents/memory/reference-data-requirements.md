---
name: Reference data requirements
description: Product need for maintained reference tables linked to workflow form inputs.
---

The product owner requested maintained tables whose values can be linked to specific form inputs. Their example is the Branches input in staff onboarding, with approximately 56 branches.

They chose custom-column tables, and explicitly requested bulk uploads for any table, not only Branches.

**Why:** Shared choice data needs to be maintained centrally rather than entered repeatedly in individual form definitions.

**How to apply:** Treat reusable reference data as an explicit extension of the earlier form-focused scope. This request alone does not imply full AppSheet cross-table formula compatibility or system-generated columns.

When an existing free-text input needs table choices, convert it in place rather than deleting and replacing it.

**Why:** Hiding table settings for free-text fields made the feature appear absent. Replacing a field can also break existing field-key references, visibility conditions, and approval routing.

**How to apply:** Explain that table choices require a choice input, preserve its identifier and key during conversion, and warn about reviewing defaults and expressions when stored values become row references. Do not change historical submitted answers.

Use stable row references for selected values and preserve submission-time display labels for historical requests.

**Why:** Reference labels can be renamed or retired after a request is submitted. A label change must not change which record was selected or rewrite the original request's displayed answer.

**How to apply:** Refresh available labels for new forms while retaining historical labels in submitted records. Keep raw table management restricted to builders and admins; ordinary requesters need only the linked field's choices.
