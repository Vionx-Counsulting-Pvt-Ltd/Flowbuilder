import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import pino from "pino";
import { clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, pool, tenantsTable, rolesTable, usersTable, auditEventsTable } from "@workspace/db";
import { CreateUserResponse } from "@workspace/api-zod";
import { createFlowbuilderRouter } from "../routes/flowbuilder";

test("create and resend invitations target the app and preserve tenant, role and manager assignments", async t => {
  const id = `invite-test-${randomUUID()}`;
  const calls: Array<Parameters<typeof clerkClient.invitations.createInvitation>[0]> = [];
  const revoked: string[] = [];
  let failDelivery = false;
  t.mock.method(clerkClient.invitations, "createInvitation", async (input: Parameters<typeof clerkClient.invitations.createInvitation>[0]) => {
    if (failDelivery) throw new Error("Synthetic delivery failure");
    calls.push(input);
    return { id: `synthetic-invite-${calls.length}` };
  });
  t.mock.method(clerkClient.invitations, "revokeInvitation", async (inviteId: string) => {
    revoked.push(inviteId); return { id: inviteId };
  });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.log = pino({ enabled: false }); next(); });
  app.use(createFlowbuilderRouter(async (req, res, next) => {
    res.locals.member = { id, tenantId: req.headers["x-test-role"] === "foreign" ? `${id}-other` : id,
      tenantName: "Synthetic invitations", name: "Synthetic admin", email: "admin@example.invalid",
      clerkUserId: id, roleId: id, roleName: "Company Admin",
      permissions: req.headers["x-test-role"] === "requester" ? ["view"] : ["admin"] };
    next();
  }));
  const server = app.listen(0); await new Promise<void>(r => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body?: unknown, role = "admin") => fetch(`${base}${path}`, {
    method: "POST", headers: { "content-type": "application/json", "x-test-role": role,
      "x-forwarded-host": "workspace.replit.dev", origin: "https://workspace.replit.dev" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    await db.insert(tenantsTable).values({ id, name: "Synthetic invitations" });
    await db.insert(rolesTable).values({ id, tenantId: id, name: "Synthetic role" });
    await db.insert(usersTable).values({ id, tenantId: id, roleId: id, name: "Synthetic admin", email: `${id}@example.invalid` });
    const created = await post("/users", { name: "Synthetic invited member", email: `${id}-member@example.invalid`, roleId: id, managerId: id });
    assert.equal(created.status, 201, await created.clone().text());
    const member = CreateUserResponse.parse(await created.json());
    assert.equal(calls[0].redirectUrl, "https://workspace.replit.dev/sign-up");
    assert.equal(calls[0].notify, true); assert.equal(calls[0].publicMetadata?.flowbuilderTenantId, id);
    assert.equal(member.status, "invited"); assert.equal(member.managerId, id);
    assert.equal((await post(`/users/${member.id}/invitation`, undefined, "requester")).status, 403);
    assert.equal((await post(`/users/${member.id}/invitation`, undefined, "foreign")).status, 404);
    assert.equal(calls.length, 1);
    const resent = await post(`/users/${member.id}/invitation`);
    assert.equal(resent.status, 200, await resent.clone().text());
    assert.equal(calls.length, 2); assert.equal(calls[1].redirectUrl, calls[0].redirectUrl);
    assert.equal(calls[1].ignoreExisting, true); assert.equal(calls[1].notify, true);
    assert.deepEqual(revoked, ["synthetic-invite-1"]);
    const [saved] = await db.select().from(usersTable).where(eq(usersTable.id, member.id));
    assert.equal(saved.clerkInvitationId, "synthetic-invite-2"); assert.equal(saved.roleId, id); assert.equal(saved.managerId, id);
    assert.equal(saved.status, "invited");
    failDelivery = true;
    assert.equal((await post(`/users/${member.id}/invitation`)).status, 409);
    const [unchanged] = await db.select().from(usersTable).where(eq(usersTable.id, member.id));
    assert.equal(unchanged.clerkInvitationId, saved.clerkInvitationId);
    assert.deepEqual(revoked, ["synthetic-invite-1"]);
    failDelivery = false;
    await db.update(usersTable).set({ status: "active", clerkUserId: `${id}-accepted` }).where(eq(usersTable.id, member.id));
    assert.equal((await post(`/users/${member.id}/invitation`)).status, 409);
    assert.equal(calls.length, 2);
  } finally {
    server.closeAllConnections(); await new Promise<void>(r => server.close(() => r()));
    await db.delete(auditEventsTable).where(eq(auditEventsTable.tenantId, id));
    await db.delete(usersTable).where(eq(usersTable.tenantId, id));
    await db.delete(rolesTable).where(eq(rolesTable.tenantId, id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
    await pool.end();
  }
});
