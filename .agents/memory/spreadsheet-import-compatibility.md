---
name: Spreadsheet import compatibility
description: Preserve the distinction between a workbook and a worksheet grid when extending bulk imports.
---

Use the installed spreadsheet reader's actual return types, and select a worksheet explicitly before mapping its headers and rows.

**Why:** The reader's default entry point can return worksheet objects for the entire workbook rather than a bare grid. Older usage examples imply a grid, and an unchecked cast can conceal the difference until a real XLSX upload fails.

**How to apply:** Check installed type definitions when changing import behavior. If multiple worksheets are supported later, expose an explicit worksheet choice rather than silently treating sheets as rows.
