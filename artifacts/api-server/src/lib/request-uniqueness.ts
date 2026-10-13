import { and, eq, ne, sql } from "drizzle-orm";
import { db, requestsTable, type WorkflowField } from "@workspace/db";
import { ExpressionError, expressionUsesRequestHistory, getUniqueFieldIds } from "@workspace/workflow-expressions";

type Connection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type Workflow = { id: string; fields: WorkflowField[] };

export function uniquenessFieldIds(fields: WorkflowField[]): string[] {
  return [...new Set(fields.flatMap(field => expressionUsesRequestHistory(field.validIf)
    ? getUniqueFieldIds(field.validIf!, fields, field.id)
    : []))];
}

export async function lockRequestUniqueness(connection: Connection, tenantId: string, workflowId: string) {
  await connection.execute(sql`select pg_advisory_xact_lock(hashtext(${`flow-request-uniqueness:${tenantId}:${workflowId}`}))`);
}

/** Only booleans reach expression evaluation; never send other requesters' answers to the browser. */
export async function requestUniquenessChecks(
  connection: Connection, tenantId: string, workflow: Workflow, values: Record<string, unknown>, excludeRequestId?: number,
): Promise<Record<string, boolean>> {
  const checks: Record<string, boolean> = {};
  for (const id of uniquenessFieldIds(workflow.fields)) {
    const field = workflow.fields.find(candidate => candidate.id === id)!;
    const value = values[id];
    if (value == null || (typeof value === "string" && !value.trim())) { checks[id] = true; continue; }
    if (typeof value !== "string" && typeof value !== "number") throw new ExpressionError("ISUNIQUE supports text and number answers only.");
    const normalized = String(value).trim().toLowerCase();
    const stableKey = field.key?.trim().toLowerCase() || null;
    const [existing] = await connection.select({ id: requestsTable.id }).from(requestsTable).where(and(
      eq(requestsTable.tenantId, tenantId),
      eq(requestsTable.workflowId, workflow.id),
      excludeRequestId == null ? undefined : ne(requestsTable.id, excludeRequestId),
      sql`(lower(btrim(${requestsTable.formData}->>${id})) = ${normalized} or exists (
        select 1 from jsonb_array_elements(${requestsTable.fieldsSnapshot}) historical_field
        where (historical_field->>'id' = ${id}
          or (${stableKey}::text is not null and lower(btrim(historical_field->>'key')) = ${stableKey}))
        and lower(btrim(${requestsTable.formData}->>(historical_field->>'id'))) = ${normalized}
      ))`,
    )).limit(1);
    checks[id] = !existing;
  }
  return checks;
}
