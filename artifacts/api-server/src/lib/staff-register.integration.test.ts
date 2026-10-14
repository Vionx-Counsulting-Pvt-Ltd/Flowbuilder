import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool, tenantsTable, rolesTable, usersTable, workflowsTable, requestsTable, staffTable, staffManagersTable, notificationsTable, auditEventsTable, type WorkflowField } from "@workspace/db";
import { createStaffRouter } from "../routes/staff";
import { createFlowbuilderRouter } from "../routes/flowbuilder";
import { syncApprovedStaff, validateStaffValues } from "./staff-register";
import type { requireMember } from "./flowbuilder-auth";
import { ListWorkflowStaffResponse, UpdateStaffMemberResponse } from "@workspace/api-zod";

test("staff approval, historical backfill, independent edits, tenant isolation and manager revocation", async () => {
  const id = `staff-test-${randomUUID()}`, other = `${id}-foreign`, manager = `${id}-manager`;
  const fields: WorkflowField[] = [
    { id: "name", label: "Full Name", type: "text", required: true },
    { id: "branch", label: "Branch", type: "select", options: ["North", "South"], required: true },
    { id: "secret", label: "Private", type: "text", hidden: true, required: false },
    { id: "file", label: "File", type: "file", required: false },
  ];
  const middleware: typeof requireMember = async (req, res, next) => {
    const which = req.headers["x-test-member"];
    const foreign = which === "foreign", ordinary = which === "manager";
    res.locals.member = { id: foreign ? other : ordinary ? manager : id, tenantId: foreign ? other : id,
      tenantName: "Synthetic staff test", name: "Synthetic staff tester", email: "staff-test@example.invalid",
      clerkUserId: id, roleId: foreign ? other : id, roleName: ordinary ? "Requester" : "Company Admin",
      permissions: ordinary ? ["view", "create"] : ["admin", "view", "create", "approve"], managerId: null };
    next();
  };
  const app = express(); app.use(express.json()); app.use(createStaffRouter(middleware)); app.use(createFlowbuilderRouter(middleware));
  const server = app.listen(0); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (path: string, method = "GET", body?: unknown, member = "admin") => fetch(`${base}${path}`, {
    method, headers: { "content-type": "application/json", "x-test-member": member }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const asRegister = async (response: globalThis.Response) => ListWorkflowStaffResponse.parse(await response.json());
  const asStaff = async (response: globalThis.Response) => UpdateStaffMemberResponse.parse(await response.json());
  try {
    for (const tenantId of [id, other]) {
      await db.insert(tenantsTable).values({ id: tenantId, name: "Synthetic staff test" });
      await db.insert(rolesTable).values({ id: tenantId, tenantId, name: "Synthetic test role" });
      await db.insert(usersTable).values({ id: tenantId, tenantId, roleId: tenantId, email: `${tenantId}@example.invalid`, name: "Synthetic admin" });
      await db.insert(workflowsTable).values({ id: tenantId, tenantId, ownerUserId: tenantId, name: "Staff Onboarding", status: "active", fields });
    }
    await db.insert(usersTable).values({ id: manager, tenantId: id, roleId: id, email: `${manager}@example.invalid`, name: "Synthetic member" });
    const [pending] = await db.insert(requestsTable).values({
      tenantId: id, workflowId: id, requesterId: id, requestCode: id, status: "pending_approval",
      assignedUserId: id, fieldsSnapshot: fields, formData: { name: "Before", branch: "North", secret: "preserve", file: ["fixture-only"] },
      stagesSnapshot: [{ id: "review", name: "Review", order: 1, assigneeType: "user", assigneeId: id, assigneeLabel: "Synthetic admin", slaHours: 24 }],
    }).returning();
    assert.equal((await call(`/workflows/${id}/staff`)).status, 200);
    assert.equal((await asRegister(await call(`/workflows/${id}/staff`))).staff.length, 0);
    const approval = await call(`/requests/${pending.id}/actions`, "POST", { action: "approve" });
    assert.equal(approval.status, 200, await approval.text());
    const [approvedStaff] = await db.select().from(staffTable).where(eq(staffTable.requestId, pending.id));
    assert.ok(approvedStaff, "final approval creates staff before any register read");
    await syncApprovedStaff(id, id);
    assert.equal((await db.select().from(staffTable).where(eq(staffTable.requestId, pending.id))).length, 1);
    const publicList = await asRegister(await call(`/workflows/${id}/staff`, "GET", undefined, "manager"));
    assert.equal(publicList.canManage, false); assert.deepEqual(publicList.staff[0].values, {}); assert.deepEqual(publicList.staff[0].fields, []);
    const edit = { status: "inactive", values: { name: "Edited employee", branch: "South" }, expectedUpdatedAt: approvedStaff.updatedAt.toISOString() };
    assert.equal((await call(`/workflows/${id}/staff/${approvedStaff.id}`, "PATCH", edit, "manager")).status, 403);
    assert.equal((await call(`/workflows/${id}/staff`, "GET", undefined, "foreign")).status, 404);
    assert.equal((await call(`/workflows/${id}/staff/managers`, "PUT", { userIds: [other] })).status, 400);
    assert.equal((await call(`/workflows/${id}/staff/managers`, "PUT", { userIds: [manager] }, "manager")).status, 403);
    assert.equal((await call(`/workflows/${id}/staff/managers`, "PUT", { userIds: [manager] })).status, 200);
    assert.equal((await asRegister(await call(`/workflows/${id}/staff`, "GET", undefined, "manager"))).canManage, true);
    const update = await call(`/workflows/${id}/staff/${approvedStaff.id}`, "PATCH", edit, "manager");
    assert.equal(update.status, 200, await update.clone().text());
    const changed = await asStaff(update); assert.equal(changed.status, "inactive"); assert.equal(changed.name, "Edited employee");
    assert.equal(changed.values.secret, "preserve"); assert.deepEqual(changed.values.file, ["fixture-only"]);
    assert.equal((await call(`/workflows/${id}/staff/${approvedStaff.id}`, "PATCH", edit)).status, 409);
    await syncApprovedStaff(id, id);
    const [persisted] = await db.select().from(staffTable).where(eq(staffTable.id, approvedStaff.id));
    assert.equal(persisted.status, "inactive"); assert.equal(persisted.values.name, "Edited employee");
    const [original] = await db.select().from(requestsTable).where(eq(requestsTable.id, pending.id));
    assert.equal(original.formData.name, "Before"); assert.equal(original.status, "approved");
    const reactivate = await call(`/workflows/${id}/staff/${approvedStaff.id}`, "PATCH", { ...edit, status: "active", expectedUpdatedAt: changed.updatedAt });
    assert.equal(reactivate.status, 200);
    assert.equal((await call(`/workflows/${id}/staff/managers`, "PUT", { userIds: [] })).status, 200);
    assert.equal((await call(`/workflows/${id}/staff/${approvedStaff.id}`, "PATCH", { ...edit, expectedUpdatedAt: (await asStaff(reactivate)).updatedAt }, "manager")).status, 403);
    await db.insert(requestsTable).values({ tenantId: id, workflowId: id, requesterId: id, requestCode: `${id}-old`, status: "approved", fieldsSnapshot: fields, formData: { name: "Historical", branch: "North" } });
    await db.insert(requestsTable).values({ tenantId: id, workflowId: id, requesterId: id, requestCode: `${id}-rejected`, status: "rejected", fieldsSnapshot: fields, formData: { name: "Rejected", branch: "North" } });
    const historical = await asRegister(await call(`/workflows/${id}/staff`));
    assert.equal(historical.staff.length, 2); assert.ok(historical.staff.some((s: { name: string }) => s.name === "Historical"));
    assert.throws(() => validateStaffValues(fields, original.formData, { file: [] }), /cannot be changed/);
    assert.throws(() => validateStaffValues(fields, original.formData, { branch: "Invalid" }), /invalid choice/);
  } finally {
    server.closeAllConnections(); await new Promise<void>(r => server.close(() => r()));
    for (const tenantId of [id, other]) {
      await db.delete(staffManagersTable).where(eq(staffManagersTable.workflowId, tenantId));
      await db.delete(staffTable).where(eq(staffTable.tenantId, tenantId));
      await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
      await db.delete(auditEventsTable).where(eq(auditEventsTable.tenantId, tenantId));
      await db.delete(requestsTable).where(eq(requestsTable.tenantId, tenantId));
      await db.delete(workflowsTable).where(eq(workflowsTable.tenantId, tenantId));
      await db.delete(usersTable).where(eq(usersTable.tenantId, tenantId));
      await db.delete(rolesTable).where(eq(rolesTable.tenantId, tenantId));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
    }
    await pool.end();
  }
});
