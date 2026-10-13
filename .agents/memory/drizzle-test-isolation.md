---
name: Drizzle test isolation
description: Why outer-database mocks are not sufficient to isolate transaction-based route tests.
---

Mocking a Drizzle database's query methods does not isolate transactions: a real transaction creates a separate connection whose methods can bypass the outer mocks.

**Why:** Route tests with synthetic records attempted real inserts against the shared workspace database after transactional request creation was added.

**How to apply:** Fake transaction-scoped operations explicitly in unit tests. Reserve real database operations for clearly isolated integration fixtures with unique identities and guaranteed cleanup.
