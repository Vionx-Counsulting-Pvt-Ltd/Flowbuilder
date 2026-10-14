import { pgTable, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { tenantsTable, workflowsTable, requestsTable, usersTable, type WorkflowField } from "./flowbuilder";

export const staffTable = pgTable("flow_staff", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  workflowId: text("workflow_id").notNull().references(() => workflowsTable.id),
  requestId: integer("request_id").notNull().references(() => requestsTable.id),
  status: text("status").notNull().default("active"),
  fields: jsonb("fields").$type<WorkflowField[]>().notNull(),
  values: jsonb("values").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, t => [uniqueIndex("flow_staff_request_idx").on(t.requestId)]);

export const staffManagersTable = pgTable("flow_staff_managers", {
  workflowId: text("workflow_id").notNull().references(() => workflowsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
}, t => [uniqueIndex("flow_staff_manager_idx").on(t.workflowId, t.userId)]);

export const insertStaffSchema = createInsertSchema(staffTable);
