import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type WorkflowField = {
  id: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "longtext"
    | "name"
    | "email"
    | "phone"
    | "url"
    | "address"
    | "number"
    | "decimal"
    | "percent"
    | "price"
    | "date"
    | "time"
    | "datetime"
    | "duration"
    | "select"
    | "enum"
    | "multiselect"
    | "enumlist"
    | "checkbox"
    | "yesno"
    | "radio"
    | "progress"
    | "ref"
    | "file"
    | "image"
    | "thumbnail"
    | "drawing"
    | "signature"
    | "video"
    | "people"
    | "lookup"
    | "color"
    | "latlong"
    | "location"
    | "xy"
    | "show";
  required: boolean;
  key?: string | null;
  placeholder?: string | null;
  helpText?: string | null;
  readOnly?: boolean;
  hidden?: boolean;
  defaultValue?: string | null;
  initialValueExpression?: string | null;
  appFormula?: string | null;
  showIf?: string | null;
  requiredIf?: string | null;
  validIf?: string | null;
  invalidMessage?: string | null;
  width?: number;
  prefix?: string | null;
  suffix?: string | null;
  min?: number | null;
  max?: number | null;
  minLength?: number | null;
  maxLength?: number | null;
  multiple?: boolean;
  accept?: string | null;
  maxFiles?: number;
  maxFileSizeMB?: number;
  displayCondition?: {
    fieldId: string;
    operator: "equals" | "notEquals" | "contains";
    value: string;
  } | null;
  options?: string[];
  sourceTableId?: string | null;
  sourceLabelColumn?: string | null;
  optionLabels?: Record<string, string>;
  referenceColumns?: { key: string; label: string }[];
  referenceData?: Record<string, Record<string, string | number | boolean | null>>;
};

export type WorkflowStage = {
  id: string;
  name: string;
  order: number;
  assigneeType: "role" | "user" | "manager";
  assigneeId?: string | null;
  assigneeLabel: string;
  slaHours: number;
  conditionFieldId?: string | null;
  conditionValue?: string | null;
};

export const tenantsTable = pgTable("flow_tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("starter"),
  memberLimit: integer("member_limit").notNull().default(20),
  requestLimit: integer("request_limit").notNull().default(10000),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  customDomain: text("custom_domain"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rolesTable = pgTable(
  "flow_roles",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    permissions: jsonb("permissions")
      .$type<Array<"view" | "create" | "approve" | "admin" | "report" | "build">>()
      .notNull()
      .default([]),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("flow_roles_tenant_name_idx").on(table.tenantId, table.name)],
);

export const usersTable = pgTable(
  "flow_users",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").unique(),
    clerkInvitationId: text("clerk_invitation_id"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    roleId: text("role_id")
      .notNull()
      .references(() => rolesTable.id),
    status: text("status").notNull().default("active"),
    managerId: text("manager_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("flow_users_tenant_email_idx").on(table.tenantId, table.email),
  ],
);

export const workflowsTable = pgTable(
  "flow_workflows",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull().default("Operations"),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    routing: text("routing").notNull().default("sequential"),
    fields: jsonb("fields").$type<WorkflowField[]>().notNull().default([]),
    stages: jsonb("stages").$type<WorkflowStage[]>().notNull().default([]),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("flow_workflows_tenant_name_idx").on(
      table.tenantId,
      table.name,
    ).where(sql`${table.status} <> 'deleted'`),
  ],
);

export const requestsTable = pgTable("flow_requests", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  requestCode: text("request_code").notNull().unique(),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => workflowsTable.id),
  requesterId: text("requester_id")
    .notNull()
    .references(() => usersTable.id),
  status: text("status").notNull().default("submitted"),
  currentStage: integer("current_stage").notNull().default(0),
  assignedUserId: text("assigned_user_id"),
  assignedRoleId: text("assigned_role_id"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  formData: jsonb("form_data")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  fieldsSnapshot: jsonb("fields_snapshot")
    .$type<WorkflowField[]>()
    .notNull()
    .default([]),
  stagesSnapshot: jsonb("stages_snapshot")
    .$type<WorkflowStage[]>()
    .notNull()
    .default([]),
  approvedStageIds: jsonb("approved_stage_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const auditEventsTable = pgTable("flow_audit_events", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  requestId: integer("request_id")
    .references(() => requestsTable.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull().default("request"),
  entityId: text("entity_id").notNull(),
  actorUserId: text("actor_user_id").references(() => usersTable.id),
  action: text("action").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notificationsTable = pgTable("flow_notifications", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  requestId: integer("request_id").references(() => requestsTable.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  message: text("message").notNull().default(""),
  type: text("type").notNull().default("status_change"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("flow_notifications_due_reminder_unique_idx")
    .on(table.userId, table.requestId, table.type)
    .where(sql`${table.type} IN ('due_soon', 'overdue')`),
]);
