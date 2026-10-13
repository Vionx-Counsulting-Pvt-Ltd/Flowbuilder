import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { tenantsTable } from "./flowbuilder";

export type ReferenceColumn = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean";
  required: boolean;
};
export type ReferenceValues = Record<string, string | number | boolean | null>;

export const referenceTablesTable = pgTable("flow_reference_tables", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  columns: jsonb("columns").$type<ReferenceColumn[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const referenceRowsTable = pgTable("flow_reference_rows", {
  id: text("id").primaryKey(),
  tableId: text("table_id").notNull().references(() => referenceTablesTable.id, { onDelete: "cascade" }),
  values: jsonb("values").$type<ReferenceValues>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertReferenceTableSchema = createInsertSchema(referenceTablesTable).omit({ createdAt: true, updatedAt: true });
export const insertReferenceRowSchema = createInsertSchema(referenceRowsTable).omit({ createdAt: true });
export type ReferenceTableRecord = typeof referenceTablesTable.$inferSelect;
export type ReferenceRowRecord = typeof referenceRowsTable.$inferSelect;
