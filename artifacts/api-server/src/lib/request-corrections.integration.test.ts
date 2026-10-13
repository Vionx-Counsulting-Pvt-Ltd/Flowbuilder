import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { GetRequestResponse } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { db, pool, tenantsTable, rolesTable, usersTable, workflowsTable, requestsTable, auditEventsTable, notificationsTable, type WorkflowField, type WorkflowStage } from "@workspace/db";
import { createFlowbuilderRouter } from "../routes/flowbuilder";

test("stale corrections cannot overwrite returned requests; final requests remain locked", async () => {
  const id = `correction-test-${randomUUID()}`;
  const fields: WorkflowField[] = [
    { id: "name", label: "Name", type: "text", required: true },
    { id: "creation_code", label: "Creation code", type: "text", required: false,
      readOnly: true, initialValueExpression: '"new default"' },
  ];
  const stages: WorkflowStage[] = [{ id: "review", name: "Review", order: 1,
    assigneeType: "user", assigneeId: id, assigneeLabel: "Synthetic reviewer", slaHours: 24 }];
  const app = express();
  app.use(express.json());
  app.use(createFlowbuilderRouter((_req, res, next) => {
    res.locals.member = { id, tenantId: id, tenantName: "Isolated correction test",
      name: "Synthetic requester", email: "correction-test@example.invalid",
      roleId: id, roleName: "Requester", permissions: ["view", "create"], clerkUserId: id };
    next();
  }));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await db.transaction(async tx => {
      await tx.insert(tenantsTable).values({ id, name: "Isolated correction test" });
      await tx.insert(rolesTable).values({ id, tenantId: id, name: "Requester" });
      await tx.insert(usersTable).values({ id, tenantId: id, roleId: id,
        name: "Synthetic requester", email: "correction-test@example.invalid" });
      await tx.insert(workflowsTable).values({ id, tenantId: id, name: "Isolated correction test",
        ownerUserId: id, status: "active", fields, stages });
    });
    const [original] = await db.insert(requestsTable).values({
      tenantId: id, requestCode: id, workflowId: id, requesterId: id,
      status: "needs_clarification", assignedUserId: id, fieldsSnapshot: fields,
      stagesSnapshot: stages, routingSnapshot: stages, formData: { name: "Before", creation_code: "original" },
    }).returning();
    await db.insert(usersTable).values({ id: `${id}-teammate`, tenantId: id, roleId: id,
      name: "Synthetic teammate", email: "teammate@example.invalid" });
    await db.insert(workflowsTable).values({ id: `${id}-other-workflow`, tenantId: id,
      name: "Other synthetic workflow", ownerUserId: id, status: "active", fields, stages });
    await db.insert(requestsTable).values([
      { tenantId: id, requestCode: `${id}-teammate`, workflowId: id, requesterId: `${id}-teammate`,
        status: "approved", fieldsSnapshot: fields, stagesSnapshot: stages },
      { tenantId: id, requestCode: `${id}-other-workflow`, workflowId: `${id}-other-workflow`,
        requesterId: id, status: "approved", fieldsSnapshot: fields, stagesSnapshot: stages },
    ]);
    const mine = await fetch(`${baseUrl}/requests?workflowId=${encodeURIComponent(id)}&scope=mine&requesterId=${id}-teammate`);
    assert.equal(mine.status, 200);
    const mineRows = await mine.json() as Array<{ id: number }>;
    assert.deepEqual(mineRows.map(row => row.id), [original.id]);
    const visible = await fetch(`${baseUrl}/requests?workflowId=${encodeURIComponent(id)}&scope=visible`);
    const visibleRows = await visible.json() as Array<{ id: number }>;
    assert.equal(visibleRows.length, 2);
    assert.deepEqual(await (await fetch(`${baseUrl}/requests?workflowId=outside-workspace&scope=mine`)).json(), []);
    assert.equal((await fetch(`${baseUrl}/requests?scope=invalid`)).status, 400);
    const post = (expectedUpdatedAt: string, name: string) => fetch(
      `${baseUrl}/requests/${original.id}/corrections`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ formData: { name, creation_code: "tampered" }, comment: "Corrected name", expectedUpdatedAt }),
      });
    const stale = await post(new Date(original.updatedAt.getTime() - 1000).toISOString(), "Must not save");
    assert.equal(stale.status, 409);
    const fresh = await post(original.updatedAt.toISOString(), "After");
    assert.equal(fresh.status, 200, await fresh.text());
    await db.update(requestsTable).set({ status: "needs_clarification", updatedAt: new Date() })
      .where(eq(requestsTable.id, original.id));
    const staleAfterNewReturn = await post(original.updatedAt.toISOString(), "Must not overwrite");
    assert.equal(staleAfterNewReturn.status, 409);
    const [unchanged] = await db.select().from(requestsTable).where(eq(requestsTable.id, original.id));
    assert.equal(unchanged.formData.name, "After");
    assert.equal(unchanged.formData.creation_code, "original");
    assert.equal(unchanged.status, "needs_clarification");
    assert.equal(unchanged.requestCode, original.requestCode);
    assert.equal(unchanged.requesterId, original.requesterId);
    assert.equal(unchanged.createdAt.getTime(), original.createdAt.getTime());
    await db.update(requestsTable).set({ status: "approved", currentStage: 1 }).where(eq(requestsTable.id, original.id));
    const final = await fetch(`${baseUrl}/requests/${original.id}`);
    assert.equal(final.status, 200);
    const detail = GetRequestResponse.parse(await final.json());
    assert.equal(detail.currentStage, 1);
    assert.equal(detail.totalStages, 1);
    assert.equal(detail.canEdit, false);
    assert.equal((await post(unchanged.updatedAt.toISOString(), "Blocked final edit")).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.transaction(async tx => {
      await tx.delete(notificationsTable).where(eq(notificationsTable.tenantId, id));
      await tx.delete(auditEventsTable).where(eq(auditEventsTable.tenantId, id));
      await tx.delete(requestsTable).where(eq(requestsTable.tenantId, id));
      await tx.delete(workflowsTable).where(eq(workflowsTable.tenantId, id));
      await tx.delete(usersTable).where(eq(usersTable.tenantId, id));
      await tx.delete(rolesTable).where(eq(rolesTable.tenantId, id));
      await tx.delete(tenantsTable).where(eq(tenantsTable.id, id));
    });
    await pool.end();
  }
});
