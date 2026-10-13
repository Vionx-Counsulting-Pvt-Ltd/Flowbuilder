---
name: Drizzle index predicate verification
description: Schema push can miss a changed WHERE predicate on an existing named index.
---

Do not treat a successful schema push reporting “No changes detected” as proof that a changed index predicate reached PostgreSQL.

**Why:** In this workspace, changing a named unique index from full uniqueness to a partial index was ignored by the installed schema-push tool. The live PostgreSQL index retained its old definition until an explicit development-schema change was applied.

**How to apply:** When changing an existing index's predicate, inspect its live definition in `pg_indexes`. If it differs, apply a reviewed transactional index replacement in development without removing data, then verify the definition. Do not add custom production migration scripts; use the managed Publish schema flow.
