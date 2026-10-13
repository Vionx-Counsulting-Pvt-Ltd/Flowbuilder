import { and, eq } from "drizzle-orm";
import { db, requestsTable, rolesTable, usersTable, workflowsTable } from "@workspace/db";
import type { MemberContext } from "./flowbuilder-auth";
import { hydrateReferenceFields } from "./reference-data";

export function canEditReturnedRequest(
  request: { tenantId: string; requesterId: string; status: string },
  member: Pick<MemberContext, "id" | "tenantId" | "permissions">,
): boolean {
  return request.tenantId === member.tenantId &&
    request.status === "needs_clarification" &&
    (request.requesterId === member.id || member.permissions.includes("admin"));
}

/** Returning a task must not make it disappear from the returning approver's view. */
export function canViewReturnedApproval(
  request: Pick<typeof requestsTable.$inferSelect, "status" | "currentStage" | "stagesSnapshot">,
  member: Pick<MemberContext, "id" | "roleId" | "roleName">,
  requesterManagerId?: string | null,
): boolean {
  if (request.status !== "needs_clarification") return false;
  const orders = [...new Set(request.stagesSnapshot.map(stage => stage.order))].sort((a, b) => a - b);
  return request.stagesSnapshot.some(stage => stage.order === orders[request.currentStage] && (
    (stage.assigneeType === "user" && stage.assigneeId === member.id) ||
    (stage.assigneeType === "manager" && requesterManagerId === member.id) ||
    (stage.assigneeType === "role" && (stage.assigneeId === member.roleId ||
      stage.assigneeLabel.toLowerCase() === member.roleName.toLowerCase()))
  ));
}

/** Keep the submitted form version, and evaluate formulas as its original requester. */
export async function correctionContext(request: typeof requestsTable.$inferSelect, member: MemberContext) {
  const [workflow] = await db.select().from(workflowsTable).where(and(
    eq(workflowsTable.id, request.workflowId), eq(workflowsTable.tenantId, member.tenantId),
  )).limit(1);
  const [requester] = await db.select({ user: usersTable, roleName: rolesTable.name })
    .from(usersTable).innerJoin(rolesTable, eq(rolesTable.id, usersTable.roleId)).where(and(
      eq(usersTable.id, request.requesterId), eq(usersTable.tenantId, member.tenantId),
    )).limit(1);
  if (!workflow || !requester) return null;
  workflow.fields = await hydrateReferenceFields(member.tenantId,
    request.fieldsSnapshot.length ? request.fieldsSnapshot : workflow.fields, true);
  if (request.routingSnapshot?.length) {
    workflow.stages = request.routingSnapshot;
    // Parallel stage orders were normalized when the original request was submitted.
    workflow.routing = "sequential";
  }
  return {
    workflow,
    expressionMember: {
      ...member, id: requester.user.id, name: requester.user.name, email: requester.user.email,
      roleId: requester.user.roleId, roleName: requester.roleName,
    },
  };
}
