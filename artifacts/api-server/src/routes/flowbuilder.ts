import {
  ActOnRequestBody,
  ActOnRequestParams,
  ActOnRequestResponse,
  CreateRequestBody,
  CreateRequestResponse,
  CreateRoleBody,
  CreateRoleResponse,
  CreatePlatformTenantBody,
  CreatePlatformTenantResponse,
  CreateUserBody,
  CreateUserResponse,
  CreateWorkflowBody,
  CreateWorkflowResponse,
  GetCurrentUserResponse,
  GetDashboardResponse,
  GetReportOverviewResponse,
  GetRequestParams,
  GetRequestResponse,
  GetWorkflowParams,
  GetWorkflowResponse,
  ListNotificationsResponse,
  ListPeopleResponse,
  ListPlatformTenantsResponse,
  ListRequestsQueryParams,
  ListRequestsResponse,
  ListRolesResponse,
  ListUsersResponse,
  ListWorkflowsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
  UpdateRoleBody,
  UpdateRoleParams,
  UpdateRoleResponse,
  UpdatePlatformTenantBody,
  UpdatePlatformTenantParams,
  UpdatePlatformTenantResponse,
  UpdateUserBody,
  UpdateUserParams,
  UpdateUserResponse,
  UpdateWorkflowBody,
  UpdateWorkflowParams,
  UpdateWorkflowResponse,
} from "@workspace/api-zod";
import { clerkClient } from "@clerk/express";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
} from "drizzle-orm";
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
import {
  computeFormExpressions,
  evaluateExpression,
  expressionIsTrue,
  getExpressionReferences,
  validateExpression,
} from "@workspace/workflow-expressions";
import { Router, type IRouter, type Response } from "express";
import {
  currentMember,
  hasPermission,
  requireMember,
  type MemberContext,
} from "../lib/flowbuilder-auth";
import { ObjectStorageService } from "../lib/objectStorage";
import type {
  WorkflowField,
  WorkflowStage,
} from "@workspace/db";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
router.use(requireMember);

type RequestRow = {
  request: typeof requestsTable.$inferSelect;
  workflowName: string;
  workflowOwnerId: string;
  requesterName: string;
};

const isOrgAdmin = (member: MemberContext) =>
  member.permissions.includes("admin");

async function isPlatformAdmin(clerkUserId: string): Promise<boolean> {
  const user = await clerkClient.users.getUser(clerkUserId);
  return user.publicMetadata.flowbuilderPlatformAdmin === true;
}

async function requirePlatformAdmin(
  member: MemberContext,
  res: Response,
): Promise<boolean> {
  if (await isPlatformAdmin(member.clerkUserId)) return true;
  res.status(403).json({ error: "Platform administrator access is required." });
  return false;
}

function tenantBranding(tenant: {
  logoUrl: string | null;
  primaryColor: string | null;
  customDomain: string | null;
}) {
  return {
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    customDomain: tenant.customDomain,
  };
}

async function platformTenantResponse(tenant: typeof tenantsTable.$inferSelect) {
  const [[members], [requests]] = await Promise.all([
    db
      .select({ value: count() })
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenant.id)),
    db
      .select({ value: count() })
      .from(requestsTable)
      .where(eq(requestsTable.tenantId, tenant.id)),
  ]);
  return {
    id: tenant.id,
    name: tenant.name,
    plan: tenant.plan,
    memberLimit: tenant.memberLimit,
    requestLimit: tenant.requestLimit,
    memberCount: members?.value ?? 0,
    requestCount: requests?.value ?? 0,
    branding: tenantBranding(tenant),
    createdAt: tenant.createdAt,
  };
}

function validBrandingUrl(url: string | null | undefined) {
  if (!url) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function groupedStages(stages: WorkflowStage[]): number[] {
  return [...new Set(stages.map((stage) => stage.order))].sort(
    (left, right) => left - right,
  );
}

const choiceFieldTypes = new Set([
  "select", "enum", "multiselect", "enumlist", "radio", "lookup", "progress", "ref",
]);
const progressOptions = new Set(["Empty", "Quarter", "Half", "Three Quarter", "Full"]);
const appSheetColors = new Set(["Black", "Blue", "Green", "Orange", "Purple", "Red", "Yellow", "White"]);
const uploadFieldTypes = new Set(["file", "image", "thumbnail", "drawing", "signature"]);

function formulaDependencyError(fields: WorkflowField[]): string | null {
  const formulaFields = fields.filter((field) => field.appFormula?.trim() || field.initialValueExpression?.trim());
  const formulasById = new Map(formulaFields.map((field) => [field.id, field]));
  const fieldsByName = new Map<string, WorkflowField>();
  for (const field of fields) {
    for (const name of [field.id, field.key, field.label]) {
      if (name?.trim()) fieldsByName.set(name.trim().toLocaleLowerCase(), field);
    }
  }
  const dependencies = new Map<string, Set<string>>();
  for (const field of formulaFields) {
    const expression = field.appFormula?.trim() || field.initialValueExpression!;
    const refs = getExpressionReferences(expression);
    dependencies.set(field.id, new Set(refs
      .map((reference) => fieldsByName.get(reference.toLocaleLowerCase())?.id)
      .filter((id): id is string => Boolean(id && formulasById.has(id)))));
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return formulaFields.some((field) => visit(field.id))
    ? "Computed fields cannot depend on each other in a loop."
    : null;
}

function workflowDefinitionError(
  fields: WorkflowField[],
  stages: WorkflowStage[],
  requirePublish = false,
): string | null {
  if (requirePublish && fields.length === 0) return "Add at least one request field.";

  const fieldIds = new Set<string>();
  const fieldLabels = new Set<string>();
  const fieldKeys = new Set<string>();
  for (const field of fields) {
    const label = field.label.trim();
    if (!label) return "Every request field needs a label.";
    if (!field.id.trim()) return `The field “${label}” needs a stable identifier.`;
    if (fieldIds.has(field.id)) return `The field “${label}” is duplicated.`;
    if (fieldLabels.has(label.toLowerCase())) {
      return `The field label “${label}” is used more than once.`;
    }
    fieldIds.add(field.id);
    fieldLabels.add(label.toLowerCase());
    if (field.key?.trim()) {
      const normalizedKey = field.key.trim().toLowerCase();
      if (fieldKeys.has(normalizedKey)) return `The field key “${field.key}” is duplicated.`;
      fieldKeys.add(normalizedKey);
    }
    if (field.width !== undefined && (!Number.isInteger(field.width) || field.width < 1 || field.width > 6)) {
      return `Set a valid width for “${label}”.`;
    }
    if (choiceFieldTypes.has(field.type) && field.type !== "progress") {
      const options = (field.options ?? [])
        .map((option) => option.trim())
        .filter(Boolean);
      if (requirePublish && options.length === 0) {
        return `Add at least one option to “${label}”.`;
      }
      if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
        return `Remove duplicate options from “${label}”.`;
      }
    }
    if (
      requirePublish &&
      field.displayCondition &&
      !fields.some((candidate) => candidate.id === field.displayCondition?.fieldId)
    ) {
      return `Choose an existing field for the display condition on “${label}”.`;
    }
    if (requirePublish) {
      for (const [property, expression] of [
        ["initial value", field.initialValueExpression],
        ["computed value", field.appFormula],
        ["visibility", field.showIf],
        ["required rule", field.requiredIf],
        ["validation", field.validIf],
      ] as const) {
        if (!expression?.trim()) continue;
        const validation = validateExpression(expression, fields);
        if (!validation.valid) return `The ${property} expression for “${label}” is invalid: ${validation.error}`;
      }
    }
    if (
      field.min !== undefined &&
      field.min !== null &&
      field.max !== undefined &&
      field.max !== null &&
      field.min > field.max
    ) {
      return `The minimum for “${label}” must not exceed its maximum.`;
    }
    if (
      field.minLength !== undefined &&
      field.maxLength !== undefined &&
      field.minLength !== null &&
      field.maxLength !== null &&
      field.minLength > field.maxLength
    ) {
      return `The minimum length for “${label}” must not exceed its maximum length.`;
    }
  }

  if (requirePublish) {
    try {
      const formulaError = formulaDependencyError(fields);
      if (formulaError) return formulaError;
    } catch (error) {
      return error instanceof Error ? error.message : "A computed field expression is invalid.";
    }
  }

  if (requirePublish && stages.length === 0) return "Add at least one approval stage.";
  for (const stage of stages) {
    if (!stage.name.trim()) return "Every approval stage needs a name.";
    if (!Number.isInteger(stage.slaHours) || stage.slaHours < 1) {
      return `Set a valid SLA for “${stage.name}”.`;
    }
    if (stage.assigneeType !== "manager" && !stage.assigneeLabel.trim()) {
      return `Choose an owner for “${stage.name}”.`;
    }
    if (stage.conditionFieldId) {
      if (requirePublish && !fields.some((field) => field.id === stage.conditionFieldId)) {
        return `Choose an existing request field for the condition on “${stage.name}”.`;
      }
      if (requirePublish && !stage.conditionValue?.trim()) {
        return `Add a match value for the condition on “${stage.name}”.`;
      }
    }
  }
  return null;
}

function isFieldVisible(
  field: WorkflowField,
  fields: WorkflowField[],
  formData: Record<string, unknown>,
  member?: MemberContext,
): boolean {
  if (field.hidden) return false;
  if (field.showIf?.trim()) {
    try {
      return expressionIsTrue(field.showIf, {
        fields,
        values: { ...formData, _THIS: formData[field.id] },
        user: member ? { email: member.email, name: member.name, role: member.roleName } : undefined,
      });
    } catch {
      return false;
    }
  }
  const condition = field.displayCondition;
  if (!condition) return true;
  const currentValue = formData[condition.fieldId];
  const matches = Array.isArray(currentValue)
    ? currentValue.some((value) => String(value) === condition.value)
    : String(currentValue ?? "") === condition.value;
  if (condition.operator === "notEquals") return !matches;
  if (condition.operator === "contains") {
    return Array.isArray(currentValue)
      ? matches
      : String(currentValue ?? "").includes(condition.value);
  }
  return matches;
}

function formSubmissionError(
  fields: WorkflowField[],
  formData: Record<string, unknown>,
  member: MemberContext,
): string | null {
  for (const field of fields) {
    if (field.type === "show" || !isFieldVisible(field, fields, formData, member)) continue;
    const value = formData[field.id];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    let conditionallyRequired = false;
    if (field.requiredIf?.trim()) {
      try {
        conditionallyRequired = expressionIsTrue(field.requiredIf, {
          fields,
        values: { ...formData, _THIS: formData[field.id] },
          user: { email: member.email, name: member.name, role: member.roleName },
        });
      } catch {
        return `The required rule for ${field.label} could not be evaluated.`;
      }
    }
    if (
      (field.required || conditionallyRequired) &&
      (empty || (field.type === "checkbox" && value !== true))
    ) {
      return `${field.label} is required.`;
    }
    if (empty) continue;

    if (["text", "textarea", "longtext", "name", "email", "phone", "url", "address", "duration"].includes(field.type)) {
      if (typeof value !== "string") {
        return `${field.label} must be text.`;
      }
      if (field.minLength && value.length < field.minLength) {
        return `${field.label} is too short.`;
      }
      if (field.maxLength && value.length > field.maxLength) {
        return `${field.label} is too long.`;
      }
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return `${field.label} must be a valid email address.`;
      }
      if (field.type === "phone" && !/^\+?[\d\s().-]{5,25}$/.test(value)) {
        return `${field.label} must be a valid phone number.`;
      }
      if (field.type === "duration" && !/^-?\d{1,4}:[0-5]\d(?::[0-5]\d)?$/.test(value)) {
        return `${field.label} must be entered as hours and minutes.`;
      }
      if (field.type === "url") {
        try {
          const url = new URL(value);
          if (!["http:", "https:"].includes(url.protocol)) return `${field.label} must be a valid web address.`;
        } catch {
          return `${field.label} must be a valid web address.`;
        }
      }
    } else if (["number", "decimal", "price", "percent"].includes(field.type)) {
      const numberValue =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? Number(value)
            : Number.NaN;
      if (!Number.isFinite(numberValue)) {
        return `${field.label} must be a valid number.`;
      }
      if (field.type === "number" && !Number.isInteger(numberValue)) {
        return `${field.label} must be a whole number.`;
      }
      if (field.type === "percent" && (numberValue < 0 || numberValue > 1)) {
        return `${field.label} must be between 0 and 1 (for example, 0.25 for 25%).`;
      }
      if (field.min !== undefined && field.min !== null && numberValue < field.min) {
        return `${field.label} must be at least ${field.min}.`;
      }
      if (field.max !== undefined && field.max !== null && numberValue > field.max) {
        return `${field.label} must be no more than ${field.max}.`;
      }
    } else if (field.type === "date") {
      const date =
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Date(`${value}T00:00:00.000Z`)
          : null;
      if (
        !date ||
        !Number.isFinite(date.valueOf()) ||
        date.toISOString().slice(0, 10) !== value
      ) {
        return `${field.label} must be a valid date.`;
      }
    } else if (field.type === "time") {
      if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        return `${field.label} must be a valid time.`;
      }
    } else if (field.type === "datetime") {
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
        !Number.isFinite(new Date(value).valueOf())
      ) {
        return `${field.label} must be a valid date and time.`;
      }
    } else if (field.type === "progress") {
      if (typeof value !== "string" || !progressOptions.has(value)) {
        return `${field.label} must be a valid progress value.`;
      }
    } else if (choiceFieldTypes.has(field.type) && !["multiselect", "enumlist"].includes(field.type)) {
      if (
        typeof value !== "string" ||
        !(field.options ?? []).includes(value)
      ) {
        return `Choose a valid option for ${field.label}.`;
      }
    } else if (field.type === "multiselect" || field.type === "enumlist") {
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== "string" || !(field.options ?? []).includes(item))
      ) {
        return `Choose valid options for ${field.label}.`;
      }
    } else if ((field.type === "checkbox" || field.type === "yesno") && typeof value !== "boolean") {
      return `${field.label} must be true or false.`;
    } else if (field.type === "people") {
      const choices = Array.isArray(value) ? value : [value];
      if (
        (Array.isArray(value) && !field.multiple) ||
        (!Array.isArray(value) && field.multiple) ||
        choices.some((choice) => typeof choice !== "string")
      ) {
        return `Choose valid people for ${field.label}.`;
      }
    } else if (uploadFieldTypes.has(field.type)) {
      const maxFiles = field.multiple ? field.maxFiles ?? 10 : 1;
      if (
        !Array.isArray(value) ||
        value.length > maxFiles ||
        (!field.multiple && value.length > 1) ||
        value.some(
          (file) =>
            !file ||
            typeof file !== "object" ||
            typeof (file as { fileId?: unknown }).fileId !== "string" ||
            !/^[0-9a-f-]{36}$/i.test((file as { fileId: string }).fileId) ||
            typeof (file as { name?: unknown }).name !== "string" ||
            typeof (file as { contentType?: unknown }).contentType !== "string" ||
            typeof (file as { size?: unknown }).size !== "number",
        )
      ) {
        return `Upload valid files for ${field.label}.`;
      }
      const maxBytes = (field.maxFileSizeMB ?? 20) * 1024 * 1024;
      if (value.some((file) => (file as { size: number }).size > maxBytes)) {
        return `A file for ${field.label} exceeds the allowed size.`;
      }
      if (field.type !== "file" && value.some((file) => {
        const contentType = (file as { contentType: string }).contentType.toLowerCase();
        return field.type === "image" || field.type === "thumbnail" || field.type === "drawing" || field.type === "signature"
          ? !contentType.startsWith("image/")
          : false;
      })) {
        return `${field.label} must contain image files.`;
      }
    } else if (field.type === "video") {
      try {
        const url = new URL(String(value));
        if (!["http:", "https:"].includes(url.protocol)) return `${field.label} must be a video URL.`;
      } catch {
        return `${field.label} must be a video URL.`;
      }
    } else if (field.type === "color") {
      if (typeof value !== "string" || (!appSheetColors.has(value) && !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value))) {
        return `${field.label} must be a valid color.`;
      }
    } else if (["latlong", "location", "xy"].includes(field.type)) {
      const coordinatePair = Array.isArray(value)
        ? value
        : value && typeof value === "object"
          ? field.type === "xy"
            ? [(value as { x?: unknown }).x, (value as { y?: unknown }).y]
            : [(value as { latitude?: unknown; lat?: unknown }).latitude ?? (value as { lat?: unknown }).lat, (value as { longitude?: unknown; lon?: unknown }).longitude ?? (value as { lon?: unknown }).lon]
          : typeof value === "string"
            ? value.split(",").map((coordinate) => coordinate.trim())
            : [];
      if (coordinatePair.length !== 2 || coordinatePair.some((coordinate) => !Number.isFinite(Number(coordinate)))) {
        return `${field.label} must contain two valid coordinates.`;
      }
      if (field.type !== "xy") {
        const [latitude, longitude] = coordinatePair.map(Number);
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          return `${field.label} has coordinates outside the valid latitude/longitude range.`;
        }
      } else if (coordinatePair.some((coordinate) => Number(coordinate) < 0 || Number(coordinate) > 100)) {
        return `${field.label} must use X and Y values from 0 to 100.`;
      }
    }

    if (field.validIf?.trim()) {
      let validationValue: unknown;
      try {
        validationValue = evaluateExpression(field.validIf, {
          fields,
          values: { ...formData, _THIS: value },
          user: { email: member.email, name: member.name, role: member.roleName },
        });
      } catch {
        return `The validation rule for ${field.label} could not be evaluated.`;
      }
      if (typeof validationValue === "boolean") {
        if (!validationValue) return field.invalidMessage?.trim() || `${field.label} is not valid.`;
      } else if (Array.isArray(validationValue)) {
        const chosen = Array.isArray(value) ? value : [value];
        if (chosen.some((item) => !validationValue.some((allowed) => String(allowed) === String(item)))) {
          return field.invalidMessage?.trim() || `Choose a valid value for ${field.label}.`;
        }
      } else {
        return `The validation rule for ${field.label} must return true/false or a list of allowed values.`;
      }
    }
  }
  return null;
}

function currentStages(
  request: typeof requestsTable.$inferSelect,
): WorkflowStage[] {
  const groups = groupedStages(request.stagesSnapshot);
  const currentOrder = groups[request.currentStage];
  if (currentOrder === undefined) return [];
  return request.stagesSnapshot.filter((stage) => stage.order === currentOrder);
}

function assignedStages(
  request: typeof requestsTable.$inferSelect,
  member: MemberContext,
): WorkflowStage[] {
  if (request.status === "needs_clarification") {
    return request.assignedUserId === member.id ? currentStages(request) : [];
  }
  const approved = new Set(request.approvedStageIds);
  return currentStages(request).filter((stage) => {
    if (approved.has(stage.id)) return false;
    if (stage.assigneeType === "user") {
      return stage.assigneeId === member.id;
    }
    if (stage.assigneeType === "manager") {
      return request.assignedUserId === member.id;
    }
    return (
      stage.assigneeId === member.roleId ||
      stage.assigneeLabel.toLowerCase() === member.roleName.toLowerCase()
    );
  });
}

function canSeeRequest(
  row: RequestRow,
  member: MemberContext,
): boolean {
  return (
    isOrgAdmin(member) ||
    row.request.requesterId === member.id ||
    row.workflowOwnerId === member.id ||
    row.request.assignedUserId === member.id ||
    row.request.assignedRoleId === member.roleId ||
    assignedStages(row.request, member).length > 0
  );
}

function canActOnRequest(
  request: typeof requestsTable.$inferSelect,
  member: MemberContext,
): boolean {
  if (!hasPermission(member, "approve")) return false;
  return isOrgAdmin(member) || assignedStages(request, member).length > 0;
}

function requestSummary(row: RequestRow) {
  const stages = row.request.stagesSnapshot;
  const groups = groupedStages(stages);
  const active = currentStages(row.request);
  const currentStageName =
    active.map((stage) => stage.name).join(" + ") ||
    (row.request.status === "approved" ? "Approved" : "Complete");
  return {
    id: row.request.id,
    requestCode: row.request.requestCode,
    workflowId: row.request.workflowId,
    workflowName: row.workflowName,
    requesterId: row.request.requesterId,
    requesterName: row.requesterName,
    status: row.request.status,
    currentStage: row.request.currentStage + 1,
    currentStageName,
    totalStages: groups.length,
    dueAt: row.request.dueAt,
    createdAt: row.request.createdAt,
    updatedAt: row.request.updatedAt,
  };
}

async function getRequestRows(
  tenantId: string,
  limit = 250,
): Promise<RequestRow[]> {
  return db
    .select({
      request: requestsTable,
      workflowName: workflowsTable.name,
      workflowOwnerId: workflowsTable.ownerUserId,
      requesterName: usersTable.name,
    })
    .from(requestsTable)
    .innerJoin(
      workflowsTable,
      eq(requestsTable.workflowId, workflowsTable.id),
    )
    .innerJoin(usersTable, eq(requestsTable.requesterId, usersTable.id))
    .where(eq(requestsTable.tenantId, tenantId))
    .orderBy(desc(requestsTable.createdAt))
    .limit(limit);
}

async function getRequestDetail(
  requestId: number,
  tenantId: string,
): Promise<unknown | null> {
  const [row] = await db
    .select({
      request: requestsTable,
      workflowName: workflowsTable.name,
      workflowOwnerId: workflowsTable.ownerUserId,
      requesterName: usersTable.name,
    })
    .from(requestsTable)
    .innerJoin(
      workflowsTable,
      eq(requestsTable.workflowId, workflowsTable.id),
    )
    .innerJoin(usersTable, eq(requestsTable.requesterId, usersTable.id))
    .where(
      and(
        eq(requestsTable.id, requestId),
        eq(requestsTable.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const events = await db
    .select({
      event: auditEventsTable,
      actorName: usersTable.name,
    })
    .from(auditEventsTable)
    .leftJoin(usersTable, eq(auditEventsTable.actorUserId, usersTable.id))
    .where(
      and(
        eq(auditEventsTable.tenantId, tenantId),
        eq(auditEventsTable.requestId, requestId),
      ),
    )
    .orderBy(auditEventsTable.createdAt);

  return {
    ...requestSummary(row),
    formData: row.request.formData,
    fields: row.request.fieldsSnapshot,
    stages: row.request.stagesSnapshot,
    audit: events.map(({ event, actorName }) => ({
      id: event.id,
      actorName: actorName ?? "Workspace member",
      action: event.action,
      comment: event.comment,
      createdAt: event.createdAt,
    })),
  };
}

async function recordAudit(input: {
  tenantId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  comment?: string | null;
  requestId?: number | null;
}) {
  await db.insert(auditEventsTable).values({
    tenantId: input.tenantId,
    requestId: input.requestId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    action: input.action,
    comment: input.comment ?? null,
  });
}

async function addNotification(input: {
  tenantId: string;
  userIds: string[];
  requestId?: number | null;
  title: string;
  message: string;
  type: string;
}) {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return;
  await db.insert(notificationsTable).values(
    userIds.map((userId) => ({
      tenantId: input.tenantId,
      userId,
      requestId: input.requestId ?? null,
      title: input.title,
      message: input.message,
      type: input.type,
    })),
  );
}

async function createDueDateNotifications(tenantId: string): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dueRequests = await db
    .select()
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.tenantId, tenantId),
        inArray(requestsTable.status, ["pending_approval", "needs_clarification"]),
        lt(requestsTable.dueAt, soon),
      ),
    )
    .orderBy(requestsTable.dueAt)
    .limit(5000);
  if (dueRequests.length === 0) return;

  const requestIds = dueRequests.map((request) => request.id);
  const [existingReminders, activeMembers] = await Promise.all([
    db
      .select({
        userId: notificationsTable.userId,
        requestId: notificationsTable.requestId,
        type: notificationsTable.type,
      })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, tenantId),
          inArray(notificationsTable.requestId, requestIds),
          inArray(notificationsTable.type, ["due_soon", "overdue"]),
        ),
      ),
    db
      .select({ userId: usersTable.id, roleId: usersTable.roleId, roleName: rolesTable.name })
      .from(usersTable)
      .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
      .where(
        and(
          eq(usersTable.tenantId, tenantId),
          eq(usersTable.status, "active"),
        ),
      ),
  ]);
  const existingKeys = new Set(
    existingReminders.map((item) => `${item.requestId}:${item.type}:${item.userId}`),
  );
  const roleMembers = new Map<string, string[]>();
  for (const user of activeMembers) {
    for (const roleKey of [user.roleId, user.roleName.toLowerCase()]) {
      roleMembers.set(roleKey, [...(roleMembers.get(roleKey) ?? []), user.userId]);
    }
  }

  const pending: Array<typeof notificationsTable.$inferInsert> = [];
  for (const request of dueRequests) {
    if (!request.dueAt) continue;
    const reminderType = request.dueAt < now ? "overdue" : "due_soon";
    const targets = new Set<string>();
    if (request.assignedUserId) targets.add(request.assignedUserId);
    if (request.assignedRoleId) {
      for (const userId of roleMembers.get(request.assignedRoleId) ?? []) {
        targets.add(userId);
      }
    }
    for (const stage of currentStages(request)) {
      if (stage.assigneeType === "user" && stage.assigneeId) {
        targets.add(stage.assigneeId);
      } else if (stage.assigneeType === "role") {
        const roleKey = stage.assigneeId || stage.assigneeLabel.toLowerCase();
        for (const userId of roleMembers.get(roleKey) ?? []) targets.add(userId);
        if (stage.assigneeId) {
          for (const userId of roleMembers.get(stage.assigneeLabel.toLowerCase()) ?? []) {
            targets.add(userId);
          }
        }
      }
    }
    for (const userId of targets) {
      const key = `${request.id}:${reminderType}:${userId}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      pending.push({
        tenantId,
        userId,
        requestId: request.id,
        title: reminderType === "overdue" ? "Approval task is overdue" : "Approval task due soon",
        message: request.requestCode,
        type: reminderType,
      });
    }
  }
  if (pending.length) {
    await db.insert(notificationsTable).values(pending).onConflictDoNothing();
  }
}

const dueNotificationTimer = setInterval(() => {
  void (async () => {
    try {
      const tenants = await db.select({ id: tenantsTable.id }).from(tenantsTable);
      for (const tenant of tenants) await createDueDateNotifications(tenant.id);
    } catch (error) {
      console.error("FlowBuilder due-date notification sweep failed", error);
    }
  })();
}, 15 * 60 * 1000);
dueNotificationTimer.unref();

async function workflowResponse(
  workflow: typeof workflowsTable.$inferSelect,
) {
  const [[owner], [requestCount]] = await Promise.all([
    db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, workflow.ownerUserId))
      .limit(1),
    db
      .select({ value: count() })
      .from(requestsTable)
      .where(eq(requestsTable.workflowId, workflow.id)),
  ]);
  return {
    ...workflow,
    ownerName: owner?.name ?? "Workspace member",
    requestCount: requestCount?.value ?? 0,
  };
}

async function roleResponse(role: typeof rolesTable.$inferSelect) {
  const [memberCount] = await db
    .select({ value: count() })
    .from(usersTable)
    .where(eq(usersTable.roleId, role.id));
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    memberCount: memberCount?.value ?? 0,
    isDefault: role.isDefault,
  };
}

async function assignedTarget(
  stages: WorkflowStage[],
  tenantId: string,
  requesterManagerId: string | null,
) {
  let assignedUserId: string | null = null;
  let assignedRoleId: string | null = null;
  const firstRoleStage = stages.find((stage) => stage.assigneeType === "role");
  const firstUserStage = stages.find(
    (stage) => stage.assigneeType === "user" || stage.assigneeType === "manager",
  );
  if (firstRoleStage) {
    const [role] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.tenantId, tenantId),
          firstRoleStage.assigneeId
            ? or(
                eq(rolesTable.id, firstRoleStage.assigneeId),
                eq(rolesTable.name, firstRoleStage.assigneeLabel),
              )
            : eq(rolesTable.name, firstRoleStage.assigneeLabel),
        ),
      )
      .limit(1);
    assignedRoleId = role?.id ?? firstRoleStage.assigneeId ?? null;
  }
  if (firstUserStage?.assigneeType === "user") {
    assignedUserId = firstUserStage.assigneeId ?? null;
  } else if (firstUserStage?.assigneeType === "manager") {
    assignedUserId = requesterManagerId;
  }
  return { assignedUserId, assignedRoleId };
}

async function notifyCurrentStages(
  tenantId: string,
  requestId: number,
  requestCode: string,
  stages: WorkflowStage[],
  title: string,
  type: string,
) {
  const roleNames = stages
    .filter((stage) => stage.assigneeType === "role")
    .map((stage) => stage.assigneeLabel);
  const roleIds = stages
    .filter((stage) => stage.assigneeType === "role" && stage.assigneeId)
    .map((stage) => stage.assigneeId!);
  const userIds = stages
    .filter((stage) => stage.assigneeType === "user" && stage.assigneeId)
    .map((stage) => stage.assigneeId!);
  const recipients = await db
    .select({ id: usersTable.id, roleName: rolesTable.name })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(
      and(
        eq(usersTable.tenantId, tenantId),
        eq(usersTable.status, "active"),
        or(
          roleIds.length ? inArray(rolesTable.id, roleIds) : undefined,
          roleNames.length ? inArray(rolesTable.name, roleNames) : undefined,
          userIds.length ? inArray(usersTable.id, userIds) : undefined,
        ),
      ),
    );
  await addNotification({
    tenantId,
    requestId,
    userIds: recipients.map((recipient) => recipient.id),
    title,
    message: requestCode,
    type,
  });
}

router.get("/me", async (_req, res): Promise<void> => {
  const member = currentMember(res);
  const [tenant] = await db
    .select({
      logoUrl: tenantsTable.logoUrl,
      primaryColor: tenantsTable.primaryColor,
      customDomain: tenantsTable.customDomain,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, member.tenantId))
    .limit(1);
  res.json(
    GetCurrentUserResponse.parse({
      id: member.id,
      name: member.name,
      email: member.email,
      roleId: member.roleId,
      roleName: member.roleName,
      tenantId: member.tenantId,
      tenantName: member.tenantName,
      permissions: member.permissions,
      isPlatformAdmin: await isPlatformAdmin(member.clerkUserId),
      branding: tenantBranding(tenant ?? { logoUrl: null, primaryColor: null, customDomain: null }),
    }),
  );
});

router.get("/dashboard", async (_req, res): Promise<void> => {
  const member = currentMember(res);
  await createDueDateNotifications(member.tenantId);
  const rows = (await getRequestRows(member.tenantId)).filter((row) =>
    canSeeRequest(row, member),
  );
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const tasks = rows.filter(
    ({ request }) =>
      ["pending_approval", "needs_clarification"].includes(request.status) &&
      (isOrgAdmin(member) || assignedStages(request, member).length > 0),
  );
  const [workflowRows, [totalRequestsResult]] = await Promise.all([
    db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.tenantId, member.tenantId))
      .orderBy(desc(workflowsTable.updatedAt))
      .limit(8),
    db
      .select({ value: count() })
      .from(requestsTable)
      .where(eq(requestsTable.tenantId, member.tenantId)),
  ]);
  const [completedTodayResult] = await db
    .select({ value: count() })
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.tenantId, member.tenantId),
        inArray(requestsTable.status, ["approved", "completed"]),
        gte(requestsTable.updatedAt, startOfToday),
      ),
    );
  const summary = await Promise.all(
    workflowRows.map(async (workflow) => ({
      id: workflow.id,
      name: workflow.name,
      category: workflow.category,
      status: workflow.status,
      requestCount: (
        await db
          .select({ value: count() })
          .from(requestsTable)
          .where(eq(requestsTable.workflowId, workflow.id))
      )[0]?.value ?? 0,
    })),
  );

  const apiTasks = tasks.map(({ request, workflowName, requesterName }) => {
    const row = { request, workflowName, workflowOwnerId: "", requesterName };
    const overview = requestSummary(row);
    return {
      id: request.id,
      requestCode: request.requestCode,
      workflowName,
      requesterName,
      currentStageName: overview.currentStageName,
      status: request.status,
      dueAt: request.dueAt,
      createdAt: request.createdAt,
      totalStages: overview.totalStages,
      currentStage: request.currentStage + 1,
    };
  });

  res.json(
    GetDashboardResponse.parse({
      pendingCount: tasks.length,
      overdueCount: tasks.filter(
        ({ request }) => request.dueAt && request.dueAt < now,
      ).length,
      completedToday: completedTodayResult?.value ?? 0,
      allocatedToday: tasks.length,
      totalRequests: totalRequestsResult?.value ?? 0,
      tasks: apiTasks,
      myWorkflows: summary,
      recentRequests: rows.slice(0, 5).map(requestSummary),
    }),
  );
});

router.get("/workflows", async (_req, res): Promise<void> => {
  const member = currentMember(res);
  const rows = await db
    .select()
    .from(workflowsTable)
    .where(eq(workflowsTable.tenantId, member.tenantId))
    .orderBy(desc(workflowsTable.updatedAt));
  const visible = isOrgAdmin(member)
    ? rows
    : rows.filter(
        (workflow) =>
          workflow.status === "active" ||
          workflow.ownerUserId === member.id ||
          hasPermission(member, "build") ||
          member.roleName === "Workflow Owner",
      );
  const result = await Promise.all(visible.map(workflowResponse));
  res.json(ListWorkflowsResponse.parse(result));
});

router.post("/workflows", async (req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "build") && member.roleName !== "Workflow Owner") {
    res.status(403).json({ error: "You do not have permission to build workflows." });
    return;
  }
  const parsed = CreateWorkflowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const definitionError = workflowDefinitionError(
    parsed.data.fields as WorkflowField[],
    parsed.data.stages as WorkflowStage[],
  );
  if (definitionError) {
    res.status(400).json({ error: definitionError });
    return;
  }
  const id = crypto.randomUUID();
  const [workflow] = await db
    .insert(workflowsTable)
    .values({
      id,
      tenantId: member.tenantId,
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description,
      routing: parsed.data.routing,
      fields: parsed.data.fields as WorkflowField[],
      stages: parsed.data.stages as WorkflowStage[],
      status: "draft",
      version: 1,
      ownerUserId: member.id,
    })
    .returning();
  await recordAudit({
    tenantId: member.tenantId,
    actorUserId: member.id,
    entityType: "workflow",
    entityId: id,
    action: "Workflow created",
  });
  res.status(201).json(
    CreateWorkflowResponse.parse(await workflowResponse(workflow)),
  );
});

router.get("/workflows/:workflowId", async (req, res): Promise<void> => {
  const member = currentMember(res);
  const params = GetWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [workflow] = await db
    .select()
    .from(workflowsTable)
    .where(
      and(
        eq(workflowsTable.id, params.data.workflowId),
        eq(workflowsTable.tenantId, member.tenantId),
      ),
    )
    .limit(1);
  if (!workflow) {
    res.status(404).json({ error: "Workflow not found." });
    return;
  }
  res.json(GetWorkflowResponse.parse(await workflowResponse(workflow)));
});

router.patch("/workflows/:workflowId", async (req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "build") && member.roleName !== "Workflow Owner") {
    res.status(403).json({ error: "You do not have permission to edit workflows." });
    return;
  }
  const params = UpdateWorkflowParams.safeParse(req.params);
  const parsed = UpdateWorkflowBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(workflowsTable)
    .where(
      and(
        eq(workflowsTable.id, params.data.workflowId),
        eq(workflowsTable.tenantId, member.tenantId),
      ),
    )
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Workflow not found." });
    return;
  }
  if (
    parsed.data.fields ||
    parsed.data.stages ||
    parsed.data.status === "active"
  ) {
    const definitionError = workflowDefinitionError(
      (parsed.data.fields as WorkflowField[] | undefined) ?? existing.fields,
      (parsed.data.stages as WorkflowStage[] | undefined) ?? existing.stages,
      parsed.data.status === "active",
    );
    if (definitionError) {
      res.status(400).json({ error: definitionError });
      return;
    }
  }
  const [workflow] = await db
    .update(workflowsTable)
    .set({
      ...parsed.data,
      fields: parsed.data.fields
        ? (parsed.data.fields as WorkflowField[])
        : existing.fields,
      stages: parsed.data.stages
        ? (parsed.data.stages as WorkflowStage[])
        : existing.stages,
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(workflowsTable.id, existing.id))
    .returning();
  await recordAudit({
    tenantId: member.tenantId,
    actorUserId: member.id,
    entityType: "workflow",
    entityId: workflow.id,
    action: `Workflow updated · v${workflow.version}`,
  });
  res.json(UpdateWorkflowResponse.parse(await workflowResponse(workflow)));
});

router.get("/requests", async (req, res): Promise<void> => {
  const member = currentMember(res);
  const query = ListRequestsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const search = query.data.search?.trim().toLowerCase() ?? "";
  const rows = (await getRequestRows(member.tenantId))
    .filter((row) => canSeeRequest(row, member))
    .filter((row) => !query.data.status || row.request.status === query.data.status)
    .filter(
      (row) =>
        !search ||
        row.request.requestCode.toLowerCase().includes(search) ||
        row.workflowName.toLowerCase().includes(search) ||
        row.requesterName.toLowerCase().includes(search),
    );
  res.json(ListRequestsResponse.parse(rows.map(requestSummary)));
});

router.post("/requests", async (req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "create")) {
    res.status(403).json({ error: "You do not have permission to submit requests." });
    return;
  }
  const parsed = CreateRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [workflow] = await db
    .select()
    .from(workflowsTable)
    .where(
      and(
        eq(workflowsTable.id, parsed.data.workflowId),
        eq(workflowsTable.tenantId, member.tenantId),
        eq(workflowsTable.status, "active"),
      ),
    )
    .limit(1);
  if (!workflow) {
    res.status(404).json({ error: "Active workflow not found." });
    return;
  }
  const [tenant] = await db
    .select({ requestLimit: tenantsTable.requestLimit })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, member.tenantId))
    .limit(1);
  const [requestCount] = await db
    .select({ value: count() })
    .from(requestsTable)
    .where(eq(requestsTable.tenantId, member.tenantId));
  if (tenant && (requestCount?.value ?? 0) >= tenant.requestLimit) {
    res.status(403).json({ error: "This workspace has reached its request limit." });
    return;
  }
  const submissionData: Record<string, unknown> = { ...parsed.data.formData };
  for (const field of workflow.fields) {
    if (field.appFormula?.trim() || (field.readOnly && field.initialValueExpression?.trim())) {
      delete submissionData[field.id];
    } else if (field.readOnly) {
      submissionData[field.id] =
        field.type === "checkbox"
          ? field.defaultValue === "true"
          : field.defaultValue ?? "";
    }
  }
  let calculatedData: Record<string, unknown>;
  try {
    calculatedData = computeFormExpressions(
      workflow.fields,
      submissionData,
      { email: member.email, name: member.name, role: member.roleName },
    );
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error
        ? `A workflow expression could not be calculated: ${error.message}`
        : "A workflow expression could not be calculated.",
    });
    return;
  }
  Object.assign(submissionData, calculatedData);
  for (const field of workflow.fields) {
    if (field.type === "show" || !isFieldVisible(field, workflow.fields, submissionData, member)) {
      delete submissionData[field.id];
    }
  }
  const formError = formSubmissionError(workflow.fields, submissionData, member);
  if (formError) {
    res.status(400).json({ error: formError });
    return;
  }
  const selectedPeople = new Set<string>();
  for (const field of workflow.fields) {
    if (field.type !== "people" || !isFieldVisible(field, workflow.fields, submissionData, member)) continue;
    const value = submissionData[field.id];
    for (const id of Array.isArray(value) ? value : value ? [value] : []) {
      if (typeof id === "string") selectedPeople.add(id);
    }
  }
  if (selectedPeople.size > 0) {
    const activePeople = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.tenantId, member.tenantId),
          eq(usersTable.status, "active"),
          inArray(usersTable.id, [...selectedPeople]),
        ),
      );
    if (activePeople.length !== selectedPeople.size) {
      res.status(400).json({ error: "Choose active people from this workspace." });
      return;
    }
  }
  for (const field of workflow.fields) {
    if (!uploadFieldTypes.has(field.type) || !isFieldVisible(field, workflow.fields, submissionData, member)) continue;
    const files = submissionData[field.id] as Array<{
      fileId: string;
      name: string;
      contentType: string;
      size: number;
    }> | undefined;
    for (const uploaded of files ?? []) {
      const storedFile = await objectStorage.getTenantFile(member.tenantId, uploaded.fileId);
      if (!storedFile) {
        res.status(400).json({ error: `A file for ${field.label} could not be found.` });
        return;
      }
      const [metadata] = await storedFile.getMetadata();
      const actualSize = Number(metadata.size);
      const actualType = String(metadata.contentType ?? uploaded.contentType);
      const requiresImage = ["image", "thumbnail", "drawing", "signature"].includes(field.type);
      if (
        !Number.isFinite(actualSize) ||
        actualSize > (field.maxFileSizeMB ?? 20) * 1024 * 1024 ||
        (requiresImage && !actualType.toLowerCase().startsWith("image/"))
      ) {
        res.status(400).json({
          error: requiresImage && !actualType.toLowerCase().startsWith("image/")
            ? `${field.label} must contain image files.`
            : `A file for ${field.label} exceeds the allowed size.`,
        });
        return;
      }
      const acceptedTypes = (field.accept ?? "")
        .split(",")
        .map((type) => type.trim().toLowerCase())
        .filter(Boolean);
      if (
        acceptedTypes.length > 0 &&
        !acceptedTypes.some((accepted) =>
          accepted.startsWith(".")
            ? uploaded.name.toLowerCase().endsWith(accepted)
            : accepted.endsWith("/*")
              ? actualType.toLowerCase().startsWith(accepted.slice(0, -1))
              : actualType.toLowerCase() === accepted,
        )
      ) {
        res.status(400).json({ error: `A file for ${field.label} has an unsupported type.` });
        return;
      }
      uploaded.size = actualSize;
      uploaded.contentType = actualType;
    }
  }
  let eligibleStages = workflow.stages.filter((stage) => {
    if (!stage.conditionFieldId) return true;
    const conditionValue = submissionData[stage.conditionFieldId];
    return (
      (Array.isArray(conditionValue)
        ? conditionValue.some((value) => String(value) === String(stage.conditionValue ?? ""))
        : String(conditionValue ?? "") === String(stage.conditionValue ?? ""))
    );
  });
  if (workflow.routing === "parallel" && eligibleStages.length > 0) {
    eligibleStages = eligibleStages.map((stage) => ({ ...stage, order: 1 }));
  }
  if (eligibleStages.length === 0) {
    res.status(400).json({ error: "No approval stages match this request." });
    return;
  }
  const [requester] = await db
    .select({ managerId: usersTable.managerId })
    .from(usersTable)
    .where(eq(usersTable.id, member.id))
    .limit(1);
  const initialStages = eligibleStages.filter(
    (stage) => stage.order === groupedStages(eligibleStages)[0],
  );
  const target = await assignedTarget(
    initialStages,
    member.tenantId,
    requester?.managerId ?? null,
  );
  const dueHours = Math.min(...initialStages.map((stage) => stage.slaHours));
  const createdAt = new Date();
  const [request] = await db
    .insert(requestsTable)
    .values({
      tenantId: member.tenantId,
      requestCode: `FB-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      workflowId: workflow.id,
      requesterId: member.id,
      status: "pending_approval",
      currentStage: 0,
      assignedUserId: target.assignedUserId,
      assignedRoleId: target.assignedRoleId,
      dueAt: new Date(createdAt.getTime() + dueHours * 60 * 60 * 1000),
      formData: submissionData,
      fieldsSnapshot: workflow.fields,
      stagesSnapshot: eligibleStages,
      approvedStageIds: [],
    })
    .returning();
  const requestCode = `FB-${createdAt.getFullYear()}-${String(request.id).padStart(4, "0")}`;
  const [saved] = await db
    .update(requestsTable)
    .set({ requestCode })
    .where(eq(requestsTable.id, request.id))
    .returning();
  await recordAudit({
    tenantId: member.tenantId,
    actorUserId: member.id,
    entityType: "request",
    entityId: String(saved.id),
    requestId: saved.id,
    action: "Request submitted",
  });
  await addNotification({
    tenantId: member.tenantId,
    requestId: saved.id,
    userIds: [member.id],
    title: "Request submitted",
    message: `${workflow.name} · ${requestCode}`,
    type: "status_change",
  });
  await notifyCurrentStages(
    member.tenantId,
    saved.id,
    requestCode,
    initialStages,
    "Approval task assigned",
    "task_assigned",
  );
  const detail = await getRequestDetail(saved.id, member.tenantId);
  res.status(201).json(CreateRequestResponse.parse(detail));
});

router.get("/requests/:requestId", async (req, res): Promise<void> => {
  const member = currentMember(res);
  const params = GetRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await getRequestRows(member.tenantId);
  const row = rows.find(({ request }) => request.id === params.data.requestId);
  if (!row || !canSeeRequest(row, member)) {
    res.status(404).json({ error: "Request not found." });
    return;
  }
  const detail = await getRequestDetail(params.data.requestId, member.tenantId);
  res.json(GetRequestResponse.parse(detail));
});

router.post("/requests/:requestId/actions", async (req, res): Promise<void> => {
  const member = currentMember(res);
  const params = ActOnRequestParams.safeParse(req.params);
  const parsed = ActOnRequestBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [request] = await db
    .select()
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.id, params.data.requestId),
        eq(requestsTable.tenantId, member.tenantId),
      ),
    )
    .limit(1);
  if (!request) {
    res.status(404).json({ error: "Request not found." });
    return;
  }
  const { action, comment } = parsed.data;

  if (action === "respond_clarification") {
    if (
      request.status !== "needs_clarification" ||
      request.requesterId !== member.id ||
      !comment?.trim()
    ) {
      res.status(403).json({
        error: "Only the requester can respond to a clarification, with a comment.",
      });
      return;
    }
    const active = currentStages(request);
    const target = await assignedTarget(active, member.tenantId, null);
    await db
      .update(requestsTable)
      .set({
        status: "pending_approval",
        assignedUserId: target.assignedUserId,
        assignedRoleId: target.assignedRoleId,
        updatedAt: new Date(),
      })
      .where(eq(requestsTable.id, request.id));
    await recordAudit({
      tenantId: member.tenantId,
      actorUserId: member.id,
      entityType: "request",
      entityId: String(request.id),
      requestId: request.id,
      action: "Clarification provided",
      comment,
    });
    await notifyCurrentStages(
      member.tenantId,
      request.id,
      request.requestCode,
      active,
      "Clarification received",
      "status_change",
    );
  } else if (action === "request_clarification") {
    if (
      request.status !== "pending_approval" ||
      !comment?.trim() ||
      !canActOnRequest(request, member)
    ) {
      res.status(403).json({
        error: "You must be assigned to this task and include a clarification request.",
      });
      return;
    }
    await db
      .update(requestsTable)
      .set({
        status: "needs_clarification",
        assignedUserId: request.requesterId,
        assignedRoleId: null,
        updatedAt: new Date(),
      })
      .where(eq(requestsTable.id, request.id));
    await recordAudit({
      tenantId: member.tenantId,
      actorUserId: member.id,
      entityType: "request",
      entityId: String(request.id),
      requestId: request.id,
      action: "Clarification requested",
      comment,
    });
    await addNotification({
      tenantId: member.tenantId,
      requestId: request.id,
      userIds: [request.requesterId],
      title: "Clarification requested",
      message: `${request.requestCode} · ${comment}`,
      type: "clarification",
    });
  } else {
    if (
      request.status !== "pending_approval" ||
      !canActOnRequest(request, member)
    ) {
      res.status(403).json({ error: "You are not assigned to this approval task." });
      return;
    }
    if (action === "reject") {
      await db
        .update(requestsTable)
        .set({
          status: "rejected",
          assignedUserId: null,
          assignedRoleId: null,
          updatedAt: new Date(),
        })
        .where(eq(requestsTable.id, request.id));
      await recordAudit({
        tenantId: member.tenantId,
        actorUserId: member.id,
        entityType: "request",
        entityId: String(request.id),
        requestId: request.id,
        action: "Request rejected",
        comment,
      });
      await addNotification({
        tenantId: member.tenantId,
        requestId: request.id,
        userIds: [request.requesterId],
        title: "Request rejected",
        message: request.requestCode,
        type: "status_change",
      });
    } else {
      const current = currentStages(request);
      const stagesForMember = assignedStages(request, member);
      const stagesToApprove = isOrgAdmin(member)
        ? current.filter((stage) => !request.approvedStageIds.includes(stage.id))
        : stagesForMember;
      if (stagesToApprove.length === 0) {
        res.status(403).json({ error: "You have no outstanding approval in this stage." });
        return;
      }
      const approvedStageIds = [
        ...new Set([
          ...request.approvedStageIds,
          ...stagesToApprove.map((stage) => stage.id),
        ]),
      ];
      const currentGroupComplete = current.every((stage) =>
        approvedStageIds.includes(stage.id),
      );
      const nextStageIndex = request.currentStage + 1;
      const allGroups = groupedStages(request.stagesSnapshot);
      const nextGroupOrder = allGroups[nextStageIndex];
      const nextGroup = nextGroupOrder
        ? request.stagesSnapshot.filter(
            (stage) => stage.order === nextGroupOrder,
          )
        : [];
      const nextTarget = nextGroup.length
        ? await assignedTarget(nextGroup, member.tenantId, null)
        : { assignedUserId: null, assignedRoleId: null };
      const finalStatus =
        currentGroupComplete && nextGroup.length === 0 ? "approved" : "pending_approval";
      const dueHours = nextGroup.length
        ? Math.min(...nextGroup.map((stage) => stage.slaHours))
        : null;
      await db
        .update(requestsTable)
        .set({
          approvedStageIds: currentGroupComplete ? [] : approvedStageIds,
          currentStage: currentGroupComplete ? nextStageIndex : request.currentStage,
          status: finalStatus,
          assignedUserId: currentGroupComplete
            ? nextTarget.assignedUserId
            : request.assignedUserId,
          assignedRoleId: currentGroupComplete
            ? nextTarget.assignedRoleId
            : request.assignedRoleId,
          dueAt:
            currentGroupComplete && dueHours !== null
              ? new Date(Date.now() + dueHours * 60 * 60 * 1000)
              : finalStatus === "approved"
                ? null
                : request.dueAt,
          updatedAt: new Date(),
        })
        .where(eq(requestsTable.id, request.id));
      await recordAudit({
        tenantId: member.tenantId,
        actorUserId: member.id,
        entityType: "request",
        entityId: String(request.id),
        requestId: request.id,
        action:
          finalStatus === "approved"
            ? "Request approved"
            : "Approval recorded",
        comment,
      });
      if (currentGroupComplete && nextGroup.length > 0) {
        await notifyCurrentStages(
          member.tenantId,
          request.id,
          request.requestCode,
          nextGroup,
          "Approval task assigned",
          "task_assigned",
        );
      }
      if (finalStatus === "approved") {
        await addNotification({
          tenantId: member.tenantId,
          requestId: request.id,
          userIds: [request.requesterId],
          title: "Request approved",
          message: request.requestCode,
          type: "status_change",
        });
      }
    }
  }

  const detail = await getRequestDetail(request.id, member.tenantId);
  res.json(ActOnRequestResponse.parse(detail));
});

router.get("/people", async (_req, res): Promise<void> => {
  const member = currentMember(res);
  const people = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.tenantId, member.tenantId),
        eq(usersTable.status, "active"),
      ),
    )
    .orderBy(usersTable.name);
  res.json(ListPeopleResponse.parse(people));
});

router.get("/users", async (_req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "build") && member.roleName !== "Workflow Owner") {
    res.status(403).json({ error: "You do not have access to the workspace directory." });
    return;
  }
  const rows = await db
    .select({ user: usersTable, roleName: rolesTable.name })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(usersTable.tenantId, member.tenantId))
    .orderBy(usersTable.name);
  res.json(
    ListUsersResponse.parse(
      rows.map(({ user, roleName }) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        roleName,
        status: user.status,
        managerId: user.managerId,
        createdAt: user.createdAt,
      })),
    ),
  );
});

router.post("/users", async (req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "admin")) {
    res.status(403).json({ error: "Only workspace admins can add members." });
    return;
  }
  const [tenant] = await db
    .select({ memberLimit: tenantsTable.memberLimit })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, member.tenantId))
    .limit(1);
  const [memberCount] = await db
    .select({ value: count() })
    .from(usersTable)
    .where(eq(usersTable.tenantId, member.tenantId));
  if (tenant && (memberCount?.value ?? 0) >= tenant.memberLimit) {
    res.status(403).json({ error: "This workspace has reached its member limit." });
    return;
  }
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [role] = await db
    .select()
    .from(rolesTable)
    .where(
      and(
        eq(rolesTable.id, parsed.data.roleId),
        eq(rolesTable.tenantId, member.tenantId),
      ),
    )
    .limit(1);
  if (!role) {
    res.status(400).json({ error: "Choose a role from this workspace." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const [duplicate] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.tenantId, member.tenantId),
        eq(usersTable.email, email),
      ),
    )
    .limit(1);
  if (duplicate) {
    res.status(409).json({ error: "A member with this email already exists." });
    return;
  }

  let invitationId: string | null = null;
  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: email,
      notify: true,
      publicMetadata: { flowbuilderTenantId: member.tenantId },
      redirectUrl: "/sign-up",
    });
    invitationId = invitation.id;
  } catch (error) {
    req.log.warn({ error, email }, "Unable to send workspace invitation");
    res.status(409).json({
      error:
        "The invitation could not be sent. Check that the email is not already registered.",
    });
    return;
  }
  const userId = crypto.randomUUID();
  const [user] = await db
    .insert(usersTable)
    .values({
      id: userId,
      tenantId: member.tenantId,
      email,
      name: parsed.data.name,
      roleId: role.id,
      managerId: parsed.data.managerId ?? null,
      status: "invited",
      clerkInvitationId: invitationId,
    })
    .returning();
  await recordAudit({
    tenantId: member.tenantId,
    actorUserId: member.id,
    entityType: "user",
    entityId: userId,
    action: `Member invited as ${role.name}`,
  });
  res.status(201).json(
    CreateUserResponse.parse({
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      roleName: role.name,
      status: user.status,
      managerId: user.managerId,
      createdAt: user.createdAt,
    }),
  );
});

router.patch("/users/:userId", async (req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "admin")) {
    res.status(403).json({ error: "Only workspace admins can update members." });
    return;
  }
  const params = UpdateUserParams.safeParse(req.params);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.id, params.data.userId),
        eq(usersTable.tenantId, member.tenantId),
      ),
    )
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Member not found." });
    return;
  }
  if (parsed.data.roleId) {
    const [role] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.id, parsed.data.roleId),
          eq(rolesTable.tenantId, member.tenantId),
        ),
      )
      .limit(1);
    if (!role) {
      res.status(400).json({ error: "Choose a role from this workspace." });
      return;
    }
  }
  const [existingRole] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, existing.roleId))
    .limit(1);
  if (
    existingRole?.name === "Company Admin" &&
    (parsed.data.roleId || parsed.data.status === "inactive")
  ) {
    const [otherAdmin] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
      .where(
        and(
          eq(usersTable.tenantId, member.tenantId),
          eq(usersTable.status, "active"),
          eq(rolesTable.name, "Company Admin"),
        ),
      )
      .limit(2);
    if (otherAdmin?.id === existing.id) {
      const admins = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .where(
          and(
            eq(usersTable.tenantId, member.tenantId),
            eq(usersTable.status, "active"),
            eq(rolesTable.name, "Company Admin"),
          ),
        );
      if (admins.length <= 1) {
        res.status(400).json({
          error: "Assign another Company Admin before removing this one.",
        });
        return;
      }
    }
  }
  const [user] = await db
    .update(usersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, existing.id))
    .returning();
  if (
    parsed.data.status === "inactive" &&
    existing.clerkInvitationId &&
    !existing.clerkUserId
  ) {
    try {
      await clerkClient.invitations.revokeInvitation(
        existing.clerkInvitationId,
      );
    } catch (error) {
      req.log.warn({ error, userId: user.id }, "Unable to revoke invitation");
    }
  }
  const [role] = await db
    .select({ name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.id, user.roleId))
    .limit(1);
  await recordAudit({
    tenantId: member.tenantId,
    actorUserId: member.id,
    entityType: "user",
    entityId: user.id,
    action: `Member updated · ${user.status}`,
  });
  res.json(
    UpdateUserResponse.parse({
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      roleName: role?.name ?? "Requester",
      status: user.status,
      managerId: user.managerId,
      createdAt: user.createdAt,
    }),
  );
});

router.get("/roles", async (_req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "build") && member.roleName !== "Workflow Owner") {
    res.status(403).json({ error: "You do not have access to workspace roles." });
    return;
  }
  const roles = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.tenantId, member.tenantId))
    .orderBy(rolesTable.name);
  const result = await Promise.all(roles.map(roleResponse));
  res.json(ListRolesResponse.parse(result));
});

router.post("/roles", async (req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "admin")) {
    res.status(403).json({ error: "Only workspace admins can create roles." });
    return;
  }
  const parsed = CreateRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = crypto.randomUUID();
  const [role] = await db
    .insert(rolesTable)
    .values({
      id,
      tenantId: member.tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      permissions: parsed.data.permissions,
      isDefault: false,
    })
    .returning();
  await recordAudit({
    tenantId: member.tenantId,
    actorUserId: member.id,
    entityType: "role",
    entityId: id,
    action: `Role created · ${role.name}`,
  });
  res.status(201).json(CreateRoleResponse.parse(await roleResponse(role)));
});

router.patch("/roles/:roleId", async (req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "admin")) {
    res.status(403).json({ error: "Only workspace admins can update roles." });
    return;
  }
  const params = UpdateRoleParams.safeParse(req.params);
  const parsed = UpdateRoleBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(rolesTable)
    .where(
      and(
        eq(rolesTable.id, params.data.roleId),
        eq(rolesTable.tenantId, member.tenantId),
      ),
    )
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Role not found." });
    return;
  }
  const [role] = await db
    .update(rolesTable)
    .set(parsed.data)
    .where(eq(rolesTable.id, existing.id))
    .returning();
  await recordAudit({
    tenantId: member.tenantId,
    actorUserId: member.id,
    entityType: "role",
    entityId: role.id,
    action: `Role updated · ${role.name}`,
  });
  res.json(UpdateRoleResponse.parse(await roleResponse(role)));
});

router.get("/notifications", async (_req, res): Promise<void> => {
  const member = currentMember(res);
  await createDueDateNotifications(member.tenantId);
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.tenantId, member.tenantId),
        eq(notificationsTable.userId, member.id),
      ),
    )
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(
    ListNotificationsResponse.parse(
      rows.map((notification) => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        requestId: notification.requestId,
        read: notification.readAt !== null,
        createdAt: notification.createdAt,
      })),
    ),
  );
});

router.patch(
  "/notifications/:notificationId/read",
  async (req, res): Promise<void> => {
    const member = currentMember(res);
    const params = MarkNotificationReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [notification] = await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.id, params.data.notificationId),
          eq(notificationsTable.tenantId, member.tenantId),
          eq(notificationsTable.userId, member.id),
        ),
      )
      .returning();
    if (!notification) {
      res.status(404).json({ error: "Notification not found." });
      return;
    }
    res.json(
      MarkNotificationReadResponse.parse({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        requestId: notification.requestId,
        read: notification.readAt !== null,
        createdAt: notification.createdAt,
      }),
    );
  },
);

router.get("/reports/overview", async (_req, res): Promise<void> => {
  const member = currentMember(res);
  if (!hasPermission(member, "report")) {
    res.status(403).json({ error: "You do not have access to reporting." });
    return;
  }
  const requests = await db
    .select()
    .from(requestsTable)
    .where(eq(requestsTable.tenantId, member.tenantId))
    .orderBy(desc(requestsTable.createdAt))
    .limit(5000);
  const resolved = requests.filter((request) =>
    ["approved", "rejected", "completed"].includes(request.status),
  );
  const averageTurnaroundHours =
    resolved.length === 0
      ? 0
      : resolved.reduce(
          (sum, request) =>
            sum +
            (request.updatedAt.getTime() - request.createdAt.getTime()) /
              (60 * 60 * 1000),
          0,
        ) / resolved.length;
  const approvedCount = resolved.filter(
    (request) => request.status === "approved" || request.status === "completed",
  ).length;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const weeklyVolume = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = day.toISOString().slice(0, 10);
    return {
      label: day.toLocaleDateString("en", { weekday: "short" }),
      count: requests.filter(
        (request) => request.createdAt.toISOString().slice(0, 10) === key,
      ).length,
    };
  });
  const userRows = await db
    .select({ user: usersTable, roleName: rolesTable.name })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(
      and(
        eq(usersTable.tenantId, member.tenantId),
        eq(usersTable.status, "active"),
      ),
    )
    .limit(12);
  const workload = userRows.map(({ user }) => ({
    name: user.name,
    pending: requests.filter(
      (request) =>
        ["pending_approval", "needs_clarification"].includes(request.status) &&
        (request.assignedUserId === user.id ||
          request.assignedRoleId === user.roleId),
    ).length,
    completed: requests.filter(
      (request) =>
        ["approved", "completed"].includes(request.status) &&
        request.requesterId === user.id,
    ).length,
  }));
  res.json(
    GetReportOverviewResponse.parse({
      totalRequests: requests.length,
      pendingRequests: requests.filter((request) =>
        ["submitted", "pending_approval", "needs_clarification"].includes(
          request.status,
        ),
      ).length,
      averageTurnaroundHours,
      approvalRate:
        resolved.length === 0 ? 0 : (approvedCount / resolved.length) * 100,
      weeklyVolume,
      workload,
    }),
  );
});

router.get("/platform/tenants", async (_req, res): Promise<void> => {
  const member = currentMember(res);
  if (!(await requirePlatformAdmin(member, res))) return;
  const tenants = await db
    .select()
    .from(tenantsTable)
    .orderBy(desc(tenantsTable.createdAt))
    .limit(2000);
  res.json(
    ListPlatformTenantsResponse.parse(
      await Promise.all(tenants.map(platformTenantResponse)),
    ),
  );
});

router.post("/platform/tenants", async (req, res): Promise<void> => {
  const member = currentMember(res);
  if (!(await requirePlatformAdmin(member, res))) return;
  const parsed = CreatePlatformTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.adminEmail.trim().toLowerCase();
  const branding = parsed.data.branding;
  if (
    !validBrandingUrl(branding?.logoUrl) ||
    (branding?.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(branding.primaryColor)) ||
    (branding?.customDomain && !/^(?=.{1,253}$)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(branding.customDomain))
  ) {
    res.status(400).json({ error: "Check the logo URL, brand color, and custom domain." });
    return;
  }

  const tenantId = crypto.randomUUID();
  let invitationId: string;
  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: email,
      notify: true,
      publicMetadata: { flowbuilderTenantId: tenantId },
      redirectUrl: "/sign-up",
    });
    invitationId = invitation.id;
  } catch (error) {
    req.log.warn({ error, email }, "Unable to invite the first tenant admin");
    res.status(409).json({
      error: "The admin invitation could not be sent. Check that this email is available in Clerk.",
    });
    return;
  }

  const defaultRoles = [
    { name: "Company Admin", description: "Manage workspace users, workflows, requests, and reports.", permissions: ["view", "create", "approve", "admin", "report"] },
    { name: "Workflow Owner", description: "Build workflows and action assigned requests.", permissions: ["view", "create", "approve", "report"] },
    { name: "Approver", description: "Review and action requests assigned to you.", permissions: ["view", "approve"] },
    { name: "Requester", description: "Raise requests and track their status.", permissions: ["view", "create"] },
  ] as const;
  const roleIds = new Map(defaultRoles.map((role) => [role.name, crypto.randomUUID()]));
  const adminId = crypto.randomUUID();
  try {
    const [tenant] = await db.transaction(async (tx) => {
      const [createdTenant] = await tx
        .insert(tenantsTable)
        .values({
          id: tenantId,
          name: parsed.data.name.trim(),
          plan: parsed.data.plan,
          memberLimit: parsed.data.memberLimit,
          requestLimit: parsed.data.requestLimit,
          logoUrl: branding?.logoUrl ?? null,
          primaryColor: branding?.primaryColor ?? null,
          customDomain: branding?.customDomain?.toLowerCase() ?? null,
        })
        .returning();
      await tx.insert(rolesTable).values(
        defaultRoles.map((role) => ({
          id: roleIds.get(role.name)!,
          tenantId,
          name: role.name,
          description: role.description,
          permissions: [...role.permissions],
          isDefault: true,
        })),
      );
      await tx.insert(usersTable).values({
        id: adminId,
        tenantId,
        email,
        name: parsed.data.adminName.trim(),
        roleId: roleIds.get("Company Admin")!,
        status: "invited",
        clerkInvitationId: invitationId,
      });
      await tx.insert(auditEventsTable).values({
        tenantId,
        entityType: "workspace",
        entityId: tenantId,
        action: "Tenant provisioned",
      });
      return [createdTenant];
    });
    res.status(201).json(
      CreatePlatformTenantResponse.parse(await platformTenantResponse(tenant)),
    );
  } catch (error) {
    try {
      await clerkClient.invitations.revokeInvitation(invitationId);
    } catch (revokeError) {
      req.log.warn({ revokeError, invitationId }, "Unable to revoke an uncommitted tenant invite");
    }
    req.log.error({ error, tenantId }, "Unable to provision tenant");
    res.status(500).json({ error: "The tenant could not be provisioned." });
  }
});

router.patch("/platform/tenants/:tenantId", async (req, res): Promise<void> => {
  const member = currentMember(res);
  if (!(await requirePlatformAdmin(member, res))) return;
  const params = UpdatePlatformTenantParams.safeParse(req.params);
  const parsed = UpdatePlatformTenantBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (
    (parsed.data.branding && !validBrandingUrl(parsed.data.branding.logoUrl)) ||
    (parsed.data.branding?.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(parsed.data.branding.primaryColor)) ||
    (parsed.data.branding?.customDomain && !/^(?=.{1,253}$)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(parsed.data.branding.customDomain))
  ) {
    res.status(400).json({ error: "Check the logo URL, brand color, and custom domain." });
    return;
  }
  const [existing] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, params.data.tenantId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Tenant not found." });
    return;
  }
  const branding = parsed.data.branding;
  const [updated] = await db
    .update(tenantsTable)
    .set({
      ...(parsed.data.name === undefined ? {} : { name: parsed.data.name.trim() }),
      ...(parsed.data.plan === undefined ? {} : { plan: parsed.data.plan }),
      ...(parsed.data.memberLimit === undefined ? {} : { memberLimit: parsed.data.memberLimit }),
      ...(parsed.data.requestLimit === undefined ? {} : { requestLimit: parsed.data.requestLimit }),
      ...(branding === undefined
        ? {}
        : {
            logoUrl: branding.logoUrl,
            primaryColor: branding.primaryColor,
            customDomain: branding.customDomain?.toLowerCase() ?? null,
          }),
    })
    .where(eq(tenantsTable.id, existing.id))
    .returning();
  await recordAudit({
    tenantId: existing.id,
    actorUserId: member.id,
    entityType: "tenant",
    entityId: existing.id,
    action: "Tenant plan or branding updated",
  });
  res.json(UpdatePlatformTenantResponse.parse(await platformTenantResponse(updated)));
});

export default router;
