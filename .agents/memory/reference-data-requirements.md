---
name: Reference data requirements
description: Product need for maintained reference tables linked to workflow form inputs.
---

The product owner requested maintained tables whose values can be linked to specific form inputs. Their example is the Branches input in staff onboarding, with approximately 56 branches.

They chose custom-column tables, and explicitly requested bulk uploads for any table, not only Branches.

Staff onboarding must automatically fill the Region input from the selected Branch's maintained table row.

**Why:** The product owner explicitly requested Branch-to-Region automation, rather than requiring users to enter the region separately.

**How to apply:** The owner specifically requested AppSheet expressions for this connection, rather than a mapping-only setup. Use a table-linked Branch and a Region app formula such as `[Branch].[Region]`. Changing or clearing Branch must update or clear Region; do not infer it from the displayed branch name.

For expression-based table references, give requesters only the columns explicitly referenced by the form, not the complete underlying table. Recalculate derived values on the server and preserve only the selected record's referenced values in historical snapshots.

**Why:** A maintained table can contain unrelated private columns. Client-side formulas need scoped data, while submitted computed values and client-supplied lookup data cannot be trusted. Historical requests must not change when reference rows are edited.

**How to apply:** Keep future relationship expressions within the published form's tenant-scoped sources and referenced columns. Broader table-query functions must preserve this boundary rather than exposing raw table management data.

**Why:** Shared choice data needs to be maintained centrally rather than entered repeatedly in individual form definitions.

**How to apply:** Treat reusable reference data as an explicit extension of the earlier form-focused scope. This request alone does not imply full AppSheet cross-table formula compatibility or system-generated columns.

When an existing free-text input needs table choices, convert it in place rather than deleting and replacing it.

**Why:** Hiding table settings for free-text fields made the feature appear absent. Replacing a field can also break existing field-key references, visibility conditions, and approval routing.

**How to apply:** Explain that table choices require a choice input, preserve its identifier and key during conversion, and warn about reviewing defaults and expressions when stored values become row references. Do not change historical submitted answers.

Use stable row references for selected values and preserve submission-time display labels for historical requests.

**Why:** Reference labels can be renamed or retired after a request is submitted. A label change must not change which record was selected or rewrite the original request's displayed answer.

**How to apply:** Refresh available labels for new forms while retaining historical labels in submitted records. Keep raw table management restricted to builders and admins; ordinary requesters need only the linked field's choices.

Changing or clearing a reference selection must replace or clear its copied suggestions, even if the requester edited them. Explain this alongside the mappings rather than silently preserving edits.

**Why:** Preserving an edited branch code or region after switching branches risks submitting internally inconsistent answers. Suggestions remain editable only for the current selection; locked copies must reflect the authoritative row at submission.

**How to apply:** Keep this behavior consistent when extending related-field filling. Historical submitted answers remain snapshots, not live references.
