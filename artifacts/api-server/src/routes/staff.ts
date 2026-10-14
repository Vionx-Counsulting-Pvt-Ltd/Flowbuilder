import { Router, type IRouter, type Response } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, staffTable, staffManagersTable, usersTable, workflowsTable, auditEventsTable } from "@workspace/db";
import { SetStaffManagersBody, UpdateStaffMemberBody } from "@workspace/api-zod";
import { currentMember, requireMember, type MemberContext } from "../lib/flowbuilder-auth";
import { isStaffOnboarding, staffDisplay, syncApprovedStaff, validateStaffValues } from "../lib/staff-register";
import { hydrateReferenceFields } from "../lib/reference-data";

class StaffError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
async function workflowFor(member: MemberContext, workflowId: string) {
  const [workflow] = await db.select().from(workflowsTable).where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.tenantId, member.tenantId)));
  if (!workflow || !isStaffOnboarding(workflow.name) || workflow.status === "deleted") throw new StaffError("Staff Onboarding workflow not found.", 404);
  if (workflow.status !== "active" && !member.permissions.includes("admin") && !member.permissions.includes("build")) throw new StaffError("This workflow is not available.", 403);
  return workflow;
}
async function permissions(member: MemberContext, workflowId: string) {
  const managers = await db.select().from(staffManagersTable).where(eq(staffManagersTable.workflowId, workflowId));
  const canAssignManagers = member.permissions.includes("admin");
  return { canAssignManagers, canManage: canAssignManagers || managers.some(m => m.userId === member.id), managerIds: canAssignManagers ? managers.map(m => m.userId) : [] };
}
function serialize(row: typeof staffTable.$inferSelect, canManage: boolean) {
  const fields = row.fields.map(({ referenceData: _data, optionMappedValues: _mapped, ...field }) => field);
  return { id: row.id, requestId: row.requestId, status: row.status, ...staffDisplay(row.fields, row.values),
    fields: canManage ? fields : [], values: canManage ? row.values : {}, updatedAt: row.updatedAt.toISOString() };
}
async function register(member: MemberContext, workflowId: string) {
  const access = await permissions(member, workflowId);
  const rows = await db.select().from(staffTable).where(and(eq(staffTable.tenantId, member.tenantId), eq(staffTable.workflowId, workflowId))).orderBy(asc(staffTable.createdAt));
  const staff = await Promise.all(rows.map(async row => {
    if (!access.canManage) return serialize(row, false);
    const hydrated = await hydrateReferenceFields(member.tenantId, row.fields);
    return serialize({ ...row, fields: hydrated.map((field, i) => ({ ...field, optionLabels: { ...row.fields[i]?.optionLabels, ...field.optionLabels } })) }, true);
  }));
  return { ...access, staff };
}
export function createStaffRouter(memberMiddleware: typeof requireMember = requireMember): IRouter {
const router: IRouter = Router();
router.use(memberMiddleware);
router.get("/workflows/:workflowId/staff", async (req, res) => {
  const member = currentMember(res), id = String(req.params.workflowId);
  await workflowFor(member, id);
  await syncApprovedStaff(member.tenantId, id);
  res.json(await register(member, id));
});
router.put("/workflows/:workflowId/staff/managers", async (req, res) => {
  const member = currentMember(res), id = String(req.params.workflowId);
  if (!member.permissions.includes("admin")) throw new StaffError("Only workspace admins can assign staff managers.", 403);
  await workflowFor(member, id);
  const parsed = SetStaffManagersBody.safeParse(req.body);
  if (!parsed.success) throw new StaffError("Provide up to 100 workspace member IDs.");
  const ids = [...new Set(parsed.data.userIds)];
  await db.transaction(async tx => {
    // Serialize concurrent assignment changes and staff edits against revocation.
    await tx.select().from(workflowsTable).where(eq(workflowsTable.id, id)).for("update");
    const users = ids.length ? await tx.select().from(usersTable).where(and(eq(usersTable.tenantId, member.tenantId), inArray(usersTable.id, ids))) : [];
    if (users.length !== ids.length) throw new StaffError("Every staff manager must belong to this workspace.");
    await tx.delete(staffManagersTable).where(eq(staffManagersTable.workflowId, id));
    if (ids.length) await tx.insert(staffManagersTable).values(ids.map(userId => ({ workflowId: id, userId })));
    await tx.insert(auditEventsTable).values({ tenantId: member.tenantId, entityType: "workflow", entityId: id, actorUserId: member.id, action: "Staff managers updated" });
  });
  res.json(await register(member, id));
});
router.patch("/workflows/:workflowId/staff/:staffId", async (req, res) => {
  const member = currentMember(res), id = String(req.params.workflowId);
  await workflowFor(member, id);
  const parsed = UpdateStaffMemberBody.safeParse(req.body);
  if (!parsed.success) throw new StaffError("Provide staff information, an active/inactive status, and the last update time.");
  const updated = await db.transaction(async tx => {
    await tx.select().from(workflowsTable).where(eq(workflowsTable.id, id)).for("update");
    const managers = await tx.select().from(staffManagersTable).where(and(eq(staffManagersTable.workflowId, id), eq(staffManagersTable.userId, member.id)));
    if (!member.permissions.includes("admin") && !managers.length) throw new StaffError("Only admins and designated staff managers can edit staff.", 403);
    const [row] = await tx.select().from(staffTable).where(and(eq(staffTable.id, String(req.params.staffId)), eq(staffTable.tenantId, member.tenantId), eq(staffTable.workflowId, id))).for("update");
    if (!row) throw new StaffError("Staff member not found.", 404);
    if (row.updatedAt.toISOString() !== new Date(parsed.data.expectedUpdatedAt).toISOString()) throw new StaffError("This staff record changed. Refresh it before saving.", 409);
    let values: Record<string, unknown>;
    const fields = await hydrateReferenceFields(member.tenantId, row.fields);
    for (const field of fields) {
      if (!field.sourceTableId || !(field.id in parsed.data.values)) continue;
      const value = parsed.data.values[field.id];
      const old = row.values[field.id];
      const incoming = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
      if (incoming.some(v => !field.options?.includes(String(v)) && !(Array.isArray(old) ? old.includes(v) : old === v))) throw new StaffError(`${field.label} contains an unavailable table value.`);
    }
    try { values = validateStaffValues(fields, row.values, parsed.data.values); }
    catch (error) { throw new StaffError((error as Error).message); }
    const savedFields = fields.map((field, i) => ({ ...row.fields[i], optionLabels: { ...row.fields[i]?.optionLabels, ...field.optionLabels } }));
    const [changed] = await tx.update(staffTable).set({ values, fields: savedFields, status: parsed.data.status,
      updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) }).where(eq(staffTable.id, row.id)).returning();
    await tx.insert(auditEventsTable).values({ tenantId: member.tenantId, requestId: row.requestId, entityType: "staff", entityId: row.id, actorUserId: member.id,
      action: row.status === changed.status ? "Staff information updated" : `Staff marked ${changed.status}` });
    return changed;
  });
  res.json(serialize(updated, true));
});
router.use((error: unknown, _req: import("express").Request, res: Response, next: import("express").NextFunction) => {
  if (error instanceof StaffError) { res.status(error.status).json({ error: error.message }); return; }
  next(error);
});
return router;
}
export default createStaffRouter();
