---
name: PostgreSQL timestamp precision
description: Precision differences and monotonic versions for optimistic request updates.
---

Optimistic updates must account for PostgreSQL timestamps carrying finer precision than JavaScript dates.

**Why:** Default database timestamps can contain microseconds. Once read into JavaScript, that precision is lost; comparing the shortened value to the exact persisted timestamp can reject an unchanged record indefinitely.

**How to apply:** Compare timestamps at consistent precision and make update versions strictly monotonic, including updates in the same millisecond. Keep an atomic guard or row lock so a stale approval or correction cannot overwrite newer state.
