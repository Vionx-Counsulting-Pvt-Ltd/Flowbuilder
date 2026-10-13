import { clerkClient } from "@clerk/express";
import { and, eq, ilike } from "drizzle-orm";
import {
  auditEventsTable,
  db,
  notificationsTable,
  requestsTable,
  rolesTable,
  tenantsTable,
  usersTable,
  workflowsTable,
} from "@workspace/db";
import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import type { WorkflowField, WorkflowStage } from "@workspace/db";

export type MemberContext = {
  id: string;
  clerkUserId: string;
  tenantId: string;
  tenantName: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  managerId: string | null;
};

const defaultRoleDefinitions = [
  {
    name: "Company Admin",
    description: "Manage workspace users, workflows, requests, and reports.",
    permissions: ["view", "create", "approve", "admin", "report", "build"] as const,
  },
  {
    name: "Workflow Owner",
    description: "Build workflows and action assigned requests.",
    permissions: ["view", "create", "approve", "report", "build"] as const,
  },
  {
    name: "Developer",
    description: "Build, preview, and publish workflow forms.",
    permissions: ["view", "create", "build"] as const,
  },
  {
    name: "Approver",
    description: "Review and action requests assigned to you.",
    permissions: ["view", "approve"] as const,
  },
  {
    name: "Requester",
    description: "Raise requests and track their status.",
    permissions: ["view", "create"] as const,
  },
];

async function loadMember(clerkUserId: string): Promise<MemberContext | null> {
  const [row] = await db
    .select({
      user: usersTable,
      role: rolesTable,
      tenant: tenantsTable,
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .innerJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!row || row.user.status !== "active") return null;
  return {
    id: row.user.id,
    clerkUserId,
    tenantId: row.tenant.id,
    tenantName: row.tenant.name,
    name: row.user.name,
    email: row.user.email,
    roleId: row.role.id,
    roleName: row.role.name,
    permissions: row.role.permissions,
    managerId: row.user.managerId,
  };
}

async function createStarterWorkspace(input: {
  clerkUserId: string;
  email: string;
  name: string;
}): Promise<void> {
  const tenantId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const roleIds = new Map(defaultRoleDefinitions.map((role) => [role.name, crypto.randomUUID()]));
  const tenantName = input.name.split(" ")[0]
    ? `${input.name.split(" ")[0]}'s workspace`
    : "My workspace";
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(tenantsTable).values({ id: tenantId, name: tenantName });
    await tx.insert(rolesTable).values(
      defaultRoleDefinitions.map((role) => ({
        id: roleIds.get(role.name)!,
        tenantId,
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
        isDefault: true,
      })),
    );
    await tx.insert(usersTable).values({
      id: adminUserId,
      tenantId,
      clerkUserId: input.clerkUserId,
      email: input.email,
      name: input.name,
      roleId: roleIds.get("Company Admin")!,
      status: "active",
    });

    const approverRoleId = roleIds.get("Approver")!;
    const defaultFields: WorkflowField[] = [
      {
        id: "amount",
        label: "Amount",
        type: "number",
        required: true,
        placeholder: "0.00",
      },
      {
        id: "purpose",
        label: "Business purpose",
        type: "textarea",
        required: true,
        placeholder: "Explain what this request is for",
      },
      { id: "neededBy", label: "Needed by", type: "date", required: true },
    ];
    const twoStageApproval: WorkflowStage[] = [
      {
        id: "manager-review",
        name: "Manager review",
        order: 1,
        assigneeType: "manager",
        assigneeId: null,
        assigneeLabel: "Reporting manager",
        slaHours: 24,
        conditionFieldId: null,
        conditionValue: null,
      },
      {
        id: "finance-review",
        name: "Finance review",
        order: 2,
        assigneeType: "role",
        assigneeId: approverRoleId,
        assigneeLabel: "Approver",
        slaHours: 48,
        conditionFieldId: null,
        conditionValue: null,
      },
    ];
    const workflowDefinitions: Array<typeof workflowsTable.$inferInsert> = [
      {
        id: crypto.randomUUID(),
        tenantId,
        name: "Cash advance",
        category: "Finance",
        description: "Request funds for approved business expenses.",
        status: "active",
        version: 1,
        routing: "sequential",
        fields: defaultFields,
        stages: twoStageApproval,
        ownerUserId: adminUserId,
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        name: "Staff travel",
        category: "People",
        description: "Plan and approve business travel.",
        status: "active",
        version: 1,
        routing: "sequential",
        fields: [
          { id: "destination", label: "Destination", type: "text", required: true },
          { id: "travelDates", label: "Travel dates", type: "text", required: true },
          {
            id: "purpose",
            label: "Travel purpose",
            type: "textarea",
            required: true,
          },
        ],
        stages: twoStageApproval,
        ownerUserId: adminUserId,
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        name: "Purchase request",
        category: "Operations",
        description: "Route new equipment and supplier purchases for approval.",
        status: "active",
        version: 1,
        routing: "sequential",
        fields: [
          { id: "item", label: "Item or service", type: "text", required: true },
          { id: "amount", label: "Estimated cost", type: "number", required: true },
          {
            id: "justification",
            label: "Business justification",
            type: "textarea",
            required: true,
          },
        ],
        stages: twoStageApproval,
        ownerUserId: adminUserId,
      },
    ];
    await tx.insert(workflowsTable).values(workflowDefinitions);

    const sampleRequests = [
      {
        workflow: workflowDefinitions[0],
        status: "pending_approval",
        currentStage: 1,
        data: {
          amount: 850,
          purpose: "Field team travel and accommodation",
          neededBy: now.toISOString().slice(0, 10),
        },
        dueAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        ageHours: 27,
      },
      {
        workflow: workflowDefinitions[1],
        status: "needs_clarification",
        currentStage: 0,
        data: {
          destination: "Singapore",
          travelDates: "Oct 22 – Oct 25",
          purpose: "Regional operations planning",
        },
        dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        ageHours: 5,
      },
    ] as const;

    for (const sample of sampleRequests) {
      const createdAt = new Date(now.getTime() - sample.ageHours * 60 * 60 * 1000);
      const [request] = await tx
        .insert(requestsTable)
        .values({
          tenantId,
          requestCode: `FB-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          workflowId: sample.workflow.id,
          requesterId: adminUserId,
          status: sample.status,
          currentStage: sample.currentStage,
          assignedUserId:
            sample.status === "needs_clarification" ? adminUserId : null,
          assignedRoleId:
            sample.status === "pending_approval" ? approverRoleId : null,
          dueAt: sample.dueAt,
          formData: sample.data,
          fieldsSnapshot: sample.workflow.fields,
          stagesSnapshot: sample.workflow.stages,
          createdAt,
          updatedAt: createdAt,
        })
        .returning();
      const requestCode = `FB-${now.getFullYear()}-${String(request.id).padStart(4, "0")}`;
      await tx
        .update(requestsTable)
        .set({ requestCode })
        .where(eq(requestsTable.id, request.id));
      await tx.insert(auditEventsTable).values({
        tenantId,
        requestId: request.id,
        entityType: "request",
        entityId: String(request.id),
        actorUserId: adminUserId,
        action: "Request submitted",
        comment: null,
        createdAt,
      });
      await tx.insert(notificationsTable).values({
        tenantId,
        userId: adminUserId,
        requestId: request.id,
        title:
          sample.status === "needs_clarification"
            ? "Clarification requested"
            : "Request awaiting approval",
        message: `${sample.workflow.name} · ${requestCode}`,
        type:
          sample.status === "needs_clarification"
            ? "clarification"
            : "task_assigned",
        createdAt,
      });
    }

    await tx.insert(auditEventsTable).values({
      tenantId,
      requestId: null,
      entityType: "workspace",
      entityId: tenantId,
      actorUserId: adminUserId,
      action: "Workspace created",
    });
  });
}

async function inviteExistingMember(input: {
  clerkUserId: string;
  email: string;
  name: string;
}): Promise<boolean> {
  const [invitedMember] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        ilike(usersTable.email, input.email),
        eq(usersTable.status, "invited"),
      ),
    )
    .limit(1);
  if (!invitedMember) return false;

  await db
    .update(usersTable)
    .set({
      clerkUserId: input.clerkUserId,
      name: input.name,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, invitedMember.id));
  return true;
}

export async function resolveMember(
  clerkUserId: string,
): Promise<MemberContext | null> {
  const existing = await loadMember(clerkUserId);
  if (existing) return existing;

  const [byClerkId] = await db
    .select({ status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  if (byClerkId) return null;

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ??
    `${clerkUserId}@member.flowbuilder.invalid`;
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email.split("@")[0] ||
    "Workspace member";
  const joinedWorkspace = await inviteExistingMember({
    clerkUserId,
    email,
    name,
  });

  if (!joinedWorkspace) {
    await createStarterWorkspace({ clerkUserId, email, name });
  }
  return loadMember(clerkUserId);
}

export async function requireMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Sign in to access this workspace." });
    return;
  }

  const member = await resolveMember(auth.userId);
  if (!member) {
    res.status(403).json({ error: "This workspace account is inactive." });
    return;
  }
  res.locals.member = member;
  next();
}

export function currentMember(res: Response): MemberContext {
  return res.locals.member as MemberContext;
}

export function hasPermission(
  member: MemberContext,
  permission: string,
): boolean {
  return member.permissions.includes("admin") || member.permissions.includes(permission);
}
