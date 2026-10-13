import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db, pool, requestsTable, rolesTable, tenantsTable, usersTable, workflowsTable, type WorkflowField } from "@workspace/db";
import { lockRequestUniqueness, requestUniquenessChecks } from "./request-uniqueness";

test("request uniqueness respects history, stable keys, workflow/tenant boundaries and concurrent submissions", async () => {
  const id = `unique-test-${randomUUID()}`;
  const otherWorkflowId = `${id}-other`;
  const fields: WorkflowField[] = [{ id: "epf", key: "staff_epf", label: "EPF", type: "text", required: true, validIf: "ISUNIQUE([_THIS])" }];
  const workflow = { id, fields };
  const base = { tenantId: id, workflowId: id, requesterId: id, fieldsSnapshot: fields };
  try {
    await db.transaction(async tx => {
      await tx.insert(tenantsTable).values({ id, name: "Isolated uniqueness test" });
      await tx.insert(rolesTable).values({ id, tenantId: id, name: "Test role" });
      await tx.insert(usersTable).values({ id, tenantId: id, roleId: id, name: "Test requester", email: "unique-test@example.invalid" });
      await tx.insert(workflowsTable).values([
        { id, tenantId: id, name: "Unique test", ownerUserId: id, fields },
        { id: otherWorkflowId, tenantId: id, name: "Other unique test", ownerUserId: id, fields },
      ]);
      await tx.insert(requestsTable).values([
        { ...base, requestCode: `${id}-historic`, status: "rejected", formData: { "old-epf": 1003 }, fieldsSnapshot: [{ ...fields[0], id: "old-epf" }] },
        { ...base, requestCode: `${id}-case`, formData: { epf: " Staff-ABC " } },
        { ...base, requestCode: `${id}-legacy`, formData: { epf: "1004" }, fieldsSnapshot: [] },
        { ...base, workflowId: otherWorkflowId, requestCode: `${id}-other`, formData: { epf: "2000" } },
      ]);
    });
    assert.deepEqual(await requestUniquenessChecks(db, id, workflow, { epf: " 1003 " }), { epf: false });
    assert.deepEqual(await requestUniquenessChecks(db, id, workflow, { epf: "staff-abc" }), { epf: false });
    assert.deepEqual(await requestUniquenessChecks(db, id, workflow, { epf: "1004" }), { epf: false });
    assert.deepEqual(await requestUniquenessChecks(db, id, workflow, { epf: "2000" }), { epf: true });
    assert.deepEqual(await requestUniquenessChecks(db, `${id}-other-tenant`, workflow, { epf: 1003 }), { epf: true });
    assert.deepEqual(await requestUniquenessChecks(db, id, workflow, { epf: "" }), { epf: true });
    const attempts = await Promise.all(Array.from({ length: 4 }, (_, index) => db.transaction(async tx => {
      await lockRequestUniqueness(tx, id, id);
      const checks = await requestUniquenessChecks(tx, id, workflow, { epf: "7777" });
      if (!checks.epf) return false;
      await tx.insert(requestsTable).values({ ...base, requestCode: `${id}-race-${index}`, formData: { epf: "7777" } });
      return true;
    })));
    assert.equal(attempts.filter(Boolean).length, 1);
  } finally {
    await db.transaction(async tx => {
      await tx.delete(requestsTable).where(eq(requestsTable.tenantId, id));
      await tx.delete(workflowsTable).where(eq(workflowsTable.tenantId, id));
      await tx.delete(usersTable).where(eq(usersTable.tenantId, id));
      await tx.delete(rolesTable).where(eq(rolesTable.tenantId, id));
      await tx.delete(tenantsTable).where(eq(tenantsTable.id, id));
    });
    await pool.end();
  }
});
