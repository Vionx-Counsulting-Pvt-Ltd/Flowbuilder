import { sql } from "drizzle-orm";
import { requestsTable, type db } from "@workspace/db";

type RequestTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const submissionDateFormatter = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Colombo",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

export function requestReferencePrefix(workflowName: string, submittedAt: Date): string {
  const words = workflowName.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’][\p{L}\p{N}\p{M}]+)*/gu) ?? [];
  const initials = words.map(word => Array.from(word)[0]).join("").toUpperCase() || "WF";
  const parts = submissionDateFormatter.formatToParts(submittedAt);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)!.value;
  return `${initials}-${part("year")}-${part("month")}-${part("day")}`;
}

export function formatRequestReference(prefix: string, counter: number): string {
  if (!Number.isInteger(counter) || counter < 1 || counter > 999999) {
    throw new Error("The daily six-digit request reference counter is exhausted or invalid.");
  }
  return `${prefix}-${String(counter).padStart(6, "0")}`;
}

/** Allocate and insert the request in the same transaction so failed submissions don't consume a number. */
export async function allocateRequestReference(
  tx: RequestTransaction,
  workflowName: string,
  submittedAt: Date,
): Promise<string> {
  const prefix = requestReferencePrefix(workflowName, submittedAt);
  const prefixLength = Array.from(prefix).length;
  // Codes are globally unique. Workflows/workspaces with the same initials share the day's sequence.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`flow-request-reference:${prefix}`}))`);
  const result = await tx.execute<{ nextCounter: number }>(sql`
    select coalesce(max(right(${requestsTable.requestCode}, 6)::integer), 0) + 1 as "nextCounter"
    from ${requestsTable}
    where left(${requestsTable.requestCode}, ${prefixLength + 1}) = ${`${prefix}-`}
      and length(${requestsTable.requestCode}) = ${prefixLength + 7}
      and right(${requestsTable.requestCode}, 6) ~ '^[0-9]{6}$'
  `);
  return formatRequestReference(prefix, result.rows[0].nextCounter);
}
