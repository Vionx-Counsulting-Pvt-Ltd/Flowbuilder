import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db, pool, requestsTable, rolesTable, tenantsTable, usersTable, workflowsTable } from "@workspace/db";
import { allocateRequestReference } from "./request-reference";

test("allocation is concurrency-safe, resets daily, rolls back and preserves historical codes", async () => {
  const id = `reference-test-${randomUUID()}`;
  const workflowName = `𝔄 Reference Test ${randomUUID().replaceAll("-", "").split("").join(" ")}`;
  const createdAt = new Date("2026-10-13T06:00:00Z");
  const requestValues = { tenantId: id, workflowId: id, requesterId: id, createdAt };
  try {
    await db.transaction(async tx => {
      await tx.insert(tenantsTable).values({ id, name: "Isolated reference test" });
      await tx.insert(rolesTable).values({ id, tenantId: id, name: "Test role" });
      await tx.insert(usersTable).values({ id, tenantId: id, roleId: id, name: "Test user", email: "reference-test@example.invalid" });
      await tx.insert(workflowsTable).values({ id, tenantId: id, name: workflowName, ownerUserId: id });
      await tx.insert(requestsTable).values({ ...requestValues, requestCode: `FB-historical-${id}` });
    });
    const codes = await Promise.all(Array.from({ length: 8 }, () => db.transaction(async tx => {
      const requestCode = await allocateRequestReference(tx, workflowName, createdAt);
      await tx.insert(requestsTable).values({ ...requestValues, requestCode });
      return requestCode;
    })));
    assert.equal(new Set(codes).size, 8);
    assert.deepEqual(codes.map(code => code.slice(-6)).sort(), ["000001", "000002", "000003", "000004", "000005", "000006", "000007", "000008"]);

    await assert.rejects(db.transaction(async tx => {
      await allocateRequestReference(tx, workflowName, createdAt);
      throw new Error("Simulated submission failure");
    }), /Simulated submission failure/);
    await db.transaction(async tx => {
      const nextCode = await allocateRequestReference(tx, workflowName, createdAt);
      assert.ok(nextCode.endsWith("-000009"));
      await tx.insert(requestsTable).values({ ...requestValues, requestCode: nextCode });
    });
    await db.transaction(async tx => {
      const nextDay = new Date("2026-10-14T06:00:00Z");
      const nextCode = await allocateRequestReference(tx, workflowName, nextDay);
      assert.ok(nextCode.endsWith("-26-10-14-000001"));
      await tx.insert(requestsTable).values({ ...requestValues, createdAt: nextDay, requestCode: nextCode });
    });
    const stored = await db.select().from(requestsTable).where(eq(requestsTable.tenantId, id));
    assert.ok(stored.some(request => request.requestCode === `FB-historical-${id}`));
    assert.equal(stored.length, 11);
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
