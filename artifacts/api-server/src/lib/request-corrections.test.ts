import assert from "node:assert/strict";
import test from "node:test";
import { canEditReturnedRequest, canViewReturnedApproval } from "./request-corrections";
import type { WorkflowStage } from "@workspace/db";

test("only the original requester and workspace admins may edit returned requests", () => {
  const request = { tenantId: "workspace-a", requesterId: "requester", status: "needs_clarification" };
  assert.equal(canEditReturnedRequest(request, { tenantId: "workspace-a", id: "requester", permissions: ["view", "create"] }), true);
  assert.equal(canEditReturnedRequest(request, { tenantId: "workspace-a", id: "admin", permissions: ["admin"] }), true);
  for (const permissions of [["view", "approve"], ["view", "build"], ["view", "create"]]) {
    assert.equal(canEditReturnedRequest(request, { tenantId: "workspace-a", id: "someone-else", permissions }), false);
  }
  assert.equal(canEditReturnedRequest(request, { tenantId: "workspace-b", id: "admin", permissions: ["admin"] }), false);
  for (const status of ["submitted", "pending_approval", "approved", "rejected", "completed"]) {
    assert.equal(canEditReturnedRequest({ ...request, status }, { tenantId: "workspace-a", id: "requester", permissions: ["create"] }), false);
    assert.equal(canEditReturnedRequest({ ...request, status }, { tenantId: "workspace-a", id: "admin", permissions: ["admin"] }), false);
  }
});

test("returning approvers retain read access but receive no edit access", () => {
  const stage: WorkflowStage = { id: "review", name: "Review", order: 1, assigneeType: "user",
    assigneeId: "approver", assigneeLabel: "Approver", slaHours: 24 };
  const request = { status: "needs_clarification", currentStage: 0, stagesSnapshot: [stage] };
  const member = { id: "approver", roleId: "role-a", roleName: "Approver" };
  assert.equal(canViewReturnedApproval(request, member), true);
  assert.equal(canViewReturnedApproval(request, { ...member, id: "someone-else" }), false);
  assert.equal(canViewReturnedApproval({ ...request, status: "pending_approval" }, member), false);
  assert.equal(canViewReturnedApproval({ ...request, currentStage: 1 }, member), false);
  assert.equal(canViewReturnedApproval({ ...request, stagesSnapshot: [{ ...stage, assigneeType: "role", assigneeId: "role-a" }] }, member), true);
  assert.equal(canViewReturnedApproval({ ...request, stagesSnapshot: [{ ...stage, assigneeType: "manager" }] }, member, "approver"), true);
});
