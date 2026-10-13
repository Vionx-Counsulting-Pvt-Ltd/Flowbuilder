---
name: FlowBuilder form scope
description: Durable access and compatibility boundaries for the workflow form builder.
---

Flow builders are available to Admins and users with the Developer role. AppSheet compatibility should cover user-entered form fields and form-scoped expressions; do not assume cross-table formulas, virtual columns, or system-generated change columns are in scope.

**Why:** The product owner selected Admins + Developer access and explicitly chose form-focused compatibility rather than the broader AppSheet data model.

**How to apply:** Keep formulas based on the current form, its submitted values, and the signed-in user. Revisit relationship and system-column support only if the product scope changes.

The owner subsequently explicitly requested Branch-to-Region automation through AppSheet expressions. Single-row dereferences from a form input linked to a maintained table are therefore in scope.

**Why:** A mapping-only approach did not meet the owner's requested formula-based setup.

**How to apply:** Support direct linked-row expressions such as `[Branch].[Region]` without treating this as approval for the full AppSheet data model, arbitrary cross-table queries, or multi-hop relationships.
