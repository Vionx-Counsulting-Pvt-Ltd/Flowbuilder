import { and, eq, notExists, sql } from "drizzle-orm";
import { db, requestsTable, staffTable, workflowsTable, type WorkflowField } from "@workspace/db";

export const isStaffOnboarding = (name: string) =>
  name.trim().toLowerCase().replace(/[\s_-]+/g, "") === "staffonboarding";
type Client = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Idempotent reconciliation includes older approved requests without overwriting staff edits. */
export async function syncApprovedStaff(tenantId: string, workflowId: string, client: Client = db) {
  const [workflow] = await client.select().from(workflowsTable).where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.tenantId, tenantId)));
  if (!workflow || !isStaffOnboarding(workflow.name)) return;
  const approved = await client.select().from(requestsTable).where(and(
    eq(requestsTable.tenantId, tenantId), eq(requestsTable.workflowId, workflowId),
    eq(requestsTable.status, "approved"),
    notExists(client.select({ one: sql`1` }).from(staffTable).where(eq(staffTable.requestId, requestsTable.id))),
  ));
  for (const request of approved) {
    await client.insert(staffTable).values({
      id: crypto.randomUUID(), tenantId, workflowId, requestId: request.id,
      fields: request.fieldsSnapshot, values: request.formData, status: "active",
    }).onConflictDoNothing({ target: staffTable.requestId });
  }
}

export function staffDisplay(fields: WorkflowField[], values: Record<string, unknown>) {
  const find = (...labels: string[]) => {
    const field = fields.find(f => labels.includes(f.label.trim().toLowerCase()));
    if (!field) return "";
    const value = values[field.id];
    if (value == null) return "";
    const render = (v: unknown) => field.optionLabels?.[String(v)] ?? String(v);
    return Array.isArray(value) ? value.map(render).join(", ") : render(value);
  };
  return {
    name: find("full name", "employee name", "name") || [find("first name"), find("last name")].filter(Boolean).join(" ") || "Staff member",
    branch: find("branch"), region: find("region"), designation: find("designation", "job title"),
  };
}

const restricted = new Set(["file", "image", "thumbnail", "drawing", "signature", "video", "people", "show"]);
export function validateStaffValues(fields: WorkflowField[], existing: Record<string, unknown>, input: Record<string, unknown>) {
  const output = { ...existing };
  for (const [key, value] of Object.entries(input)) {
    const field = fields.find(f => f.id === key);
    if (!field) throw new Error("An unknown staff field was provided.");
    if (restricted.has(field.type) || field.hidden) {
      if (JSON.stringify(value) !== JSON.stringify(existing[key])) throw new Error(`${field.label} cannot be changed in the staff register.`);
      continue;
    }
    const empty = value == null || value === "" || (Array.isArray(value) && !value.length);
    if (field.required && empty) throw new Error(`${field.label} is required.`);
    if (!empty) {
      if (["number", "decimal", "percent", "price", "progress"].includes(field.type)) {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field.label} must be a number.`);
        if ((field.min != null && value < field.min) || (field.max != null && value > field.max)) throw new Error(`${field.label} is outside its allowed range.`);
      } else if (["checkbox", "yesno"].includes(field.type)) {
        if (typeof value !== "boolean") throw new Error(`${field.label} must be Yes or No.`);
      } else if (["multiselect", "enumlist"].includes(field.type)) {
        if (!Array.isArray(value) || value.length > 500 || value.some(v => typeof v !== "string")) throw new Error(`${field.label} must be a list of choices.`);
        if (!field.sourceTableId && field.options?.length && value.some(v => !field.options!.includes(v))) throw new Error(`${field.label} contains an invalid choice.`);
      } else {
        if (typeof value !== "string" || value.length > 65536) throw new Error(`${field.label} must be text.`);
        if ((field.minLength != null && value.length < field.minLength) || (field.maxLength != null && value.length > field.maxLength)) throw new Error(`${field.label} has an invalid length.`);
        if (["select", "enum", "radio"].includes(field.type) && !field.sourceTableId && field.options?.length && !field.options.includes(value)) throw new Error(`${field.label} contains an invalid choice.`);
        if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${field.label} must be an email address.`);
        if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`${field.label} must be a valid date.`);
      }
    }
    output[key] = value;
  }
  return output;
}
