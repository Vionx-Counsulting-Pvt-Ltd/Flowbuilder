---
name: FlowBuilder form scope
description: Durable access and compatibility boundaries for the workflow form builder.
---

Flow builders are available to Admins and users with the Developer role. AppSheet compatibility should cover user-entered form fields and form-scoped expressions; do not assume cross-table formulas, virtual columns, or system-generated change columns are in scope.

**Why:** The product owner selected Admins + Developer access and explicitly chose form-focused compatibility rather than the broader AppSheet data model.

**How to apply:** Keep formulas based on the current form, its submitted values, and the signed-in user. Revisit relationship and system-column support only if the product scope changes.
