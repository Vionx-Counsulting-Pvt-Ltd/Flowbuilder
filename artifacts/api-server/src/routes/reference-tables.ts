import { Router, type IRouter } from "express";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { db, referenceRowsTable, referenceTablesTable, workflowsTable, type ReferenceTableRecord } from "@workspace/db";
import { AddReferenceRowsBody, CreateReferenceTableBody, UpdateReferenceRowBody, UpdateReferenceTableBody } from "@workspace/api-zod";
import { currentMember, hasPermission, requireMember } from "../lib/flowbuilder-auth";
import { normalizeReferenceValues, ReferenceDataError, validateColumns } from "../lib/reference-data";

const router: IRouter = Router();
router.use(requireMember);
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
function canManage(res: Parameters<typeof currentMember>[0]) {
  const member = currentMember(res);
  if (!hasPermission(member, "build") && member.roleName !== "Workflow Owner") throw new ReferenceDataError("Only workspace Admins and Developers can manage tables.", 403);
  return member;
}
async function ownedTable(tenantId: string, id: string, client: typeof db | Tx = db, lock = false) {
  const query = client.select().from(referenceTablesTable).where(and(eq(referenceTablesTable.id, id), eq(referenceTablesTable.tenantId, tenantId))).limit(1);
  const [table] = await (lock ? query.for("update") : query);
  if (!table) throw new ReferenceDataError("Table not found.", 404);
  return table;
}
async function detail(table: ReferenceTableRecord, client: typeof db | Tx = db) {
  const rows = await client.select().from(referenceRowsTable).where(eq(referenceRowsTable.tableId, table.id)).orderBy(asc(referenceRowsTable.createdAt), asc(referenceRowsTable.id));
  return { id: table.id, name: table.name, description: table.description, columns: table.columns, rowCount: rows.length, activeRowCount: rows.filter(row => row.active).length, createdAt: table.createdAt.toISOString(), updatedAt: table.updatedAt.toISOString(), rows: rows.map(({ id, values, active }) => ({ id, values, active })) };
}
async function linkedWorkflows(tenantId: string, tableId: string, client: typeof db | Tx) {
  const workflows = await client.select({ name: workflowsTable.name, fields: workflowsTable.fields }).from(workflowsTable).where(eq(workflowsTable.tenantId, tenantId));
  return workflows.filter(workflow => workflow.fields.some(field => field.sourceTableId === tableId));
}
async function touch(table: ReferenceTableRecord, tx: Tx) {
  const [updated] = await tx.update(referenceTablesTable).set({ updatedAt: new Date() }).where(eq(referenceTablesTable.id, table.id)).returning();
  return updated;
}

router.get("/reference-tables", async (_req, res) => {
  const member = canManage(res);
  const tables = await db.select().from(referenceTablesTable).where(eq(referenceTablesTable.tenantId, member.tenantId)).orderBy(asc(referenceTablesTable.name));
  const counts = await db.select({ tableId: referenceRowsTable.tableId, rows: count(), active: sql<number>`count(*) filter (where ${referenceRowsTable.active})` }).from(referenceRowsTable).innerJoin(referenceTablesTable, eq(referenceRowsTable.tableId, referenceTablesTable.id)).where(eq(referenceTablesTable.tenantId, member.tenantId)).groupBy(referenceRowsTable.tableId);
  res.json(tables.map(table => ({ id: table.id, name: table.name, description: table.description, columns: table.columns, rowCount: Number(counts.find(item => item.tableId === table.id)?.rows ?? 0), activeRowCount: Number(counts.find(item => item.tableId === table.id)?.active ?? 0), createdAt: table.createdAt.toISOString(), updatedAt: table.updatedAt.toISOString() })));
});
router.post("/reference-tables", async (req, res) => {
  const member = canManage(res);
  const parsed = CreateReferenceTableBody.safeParse(req.body);
  if (!parsed.success) throw new ReferenceDataError("Provide a table name (2–100 characters) and 1–20 valid columns.");
  if (parsed.data.name.trim().length < 2) throw new ReferenceDataError("Table name needs at least two nonblank characters.");
  validateColumns(parsed.data.columns);
  const [table] = await db.insert(referenceTablesTable).values({ id: crypto.randomUUID(), tenantId: member.tenantId, name: parsed.data.name.trim(), description: parsed.data.description.trim(), columns: parsed.data.columns.map(column => ({ ...column, label: column.label.trim() })) }).returning();
  res.status(201).json(await detail(table));
});
router.get("/reference-tables/:tableId", async (req, res) => {
  res.json(await detail(await ownedTable(canManage(res).tenantId, String(req.params.tableId))));
});
router.patch("/reference-tables/:tableId", async (req, res) => {
  const member = canManage(res);
  const parsed = UpdateReferenceTableBody.safeParse(req.body);
  if (!parsed.success) throw new ReferenceDataError("Provide a table name (2–100 characters) and 1–20 valid columns.");
  if (parsed.data.name.trim().length < 2) throw new ReferenceDataError("Table name needs at least two nonblank characters.");
  validateColumns(parsed.data.columns);
  const result = await db.transaction(async tx => {
    const table = await ownedTable(member.tenantId, String(req.params.tableId), tx, true);
    const removed = table.columns.filter(column => !parsed.data.columns.some(item => item.key === column.key));
    const linked = await linkedWorkflows(member.tenantId, table.id, tx);
    if (linked.some(workflow => workflow.fields.some(field => field.sourceTableId === table.id && removed.some(column => column.key === field.sourceLabelColumn)))) throw new ReferenceDataError("A removed column is linked to a form input. Unlink that input first.", 409);
    const rows = await tx.select().from(referenceRowsTable).where(eq(referenceRowsTable.tableId, table.id));
    if (removed.length && rows.length) throw new ReferenceDataError("Columns containing row data cannot be removed. Keep those columns or remove the rows first.", 409);
    for (const row of rows) {
      const values = normalizeReferenceValues(row.values, parsed.data.columns, "Existing row");
      await tx.update(referenceRowsTable).set({ values }).where(eq(referenceRowsTable.id, row.id));
    }
    const [updated] = await tx.update(referenceTablesTable).set({ name: parsed.data.name.trim(), description: parsed.data.description.trim(), columns: parsed.data.columns.map(column => ({ ...column, label: column.label.trim() })), updatedAt: new Date() }).where(eq(referenceTablesTable.id, table.id)).returning();
    return detail(updated, tx);
  });
  res.json(result);
});
router.delete("/reference-tables/:tableId", async (req, res) => {
  const member = canManage(res);
  await db.transaction(async tx => {
    const table = await ownedTable(member.tenantId, String(req.params.tableId), tx, true);
    if ((await linkedWorkflows(member.tenantId, table.id, tx)).length) throw new ReferenceDataError("This table is linked to workflow inputs. Unlink them before deleting it.", 409);
    await tx.delete(referenceTablesTable).where(eq(referenceTablesTable.id, table.id));
  });
  res.json({ deleted: true });
});
router.post("/reference-tables/:tableId/rows", async (req, res) => {
  const member = canManage(res);
  const parsed = AddReferenceRowsBody.safeParse(req.body);
  if (!parsed.success) throw new ReferenceDataError("Upload between 1 and 5,000 rows with valid cell values.");
  const result = await db.transaction(async tx => {
    const table = await ownedTable(member.tenantId, String(req.params.tableId), tx, true);
    const [existing] = await tx.select({ value: count() }).from(referenceRowsTable).where(eq(referenceRowsTable.tableId, table.id));
    if (existing.value + parsed.data.rows.length > 10000) throw new ReferenceDataError("A table can contain up to 10,000 rows.", 409);
    const rows = parsed.data.rows.map((row, index) => ({ id: crypto.randomUUID(), tableId: table.id, active: row.active ?? true, values: normalizeReferenceValues(row.values, table.columns, `Row ${index + 1}`) }));
    // Validate every row before inserting any; chunk SQL parameters without losing atomicity.
    for (let index = 0; index < rows.length; index += 500) await tx.insert(referenceRowsTable).values(rows.slice(index, index + 500));
    return detail(await touch(table, tx), tx);
  });
  res.status(201).json(result);
});
router.patch("/reference-tables/:tableId/rows/:rowId", async (req, res) => {
  const member = canManage(res);
  const parsed = UpdateReferenceRowBody.safeParse(req.body);
  if (!parsed.success) throw new ReferenceDataError("Provide valid row values.");
  const result = await db.transaction(async tx => {
    const table = await ownedTable(member.tenantId, String(req.params.tableId), tx, true);
    const values = normalizeReferenceValues(parsed.data.values, table.columns);
    const changed = await tx.update(referenceRowsTable).set({ values, active: parsed.data.active ?? true }).where(and(eq(referenceRowsTable.id, String(req.params.rowId)), eq(referenceRowsTable.tableId, table.id))).returning();
    if (!changed.length) throw new ReferenceDataError("Row not found.", 404);
    return detail(await touch(table, tx), tx);
  });
  res.json(result);
});
router.delete("/reference-tables/:tableId/rows/:rowId", async (req, res) => {
  const member = canManage(res);
  const result = await db.transaction(async tx => {
    const table = await ownedTable(member.tenantId, String(req.params.tableId), tx, true);
    const changed = await tx.delete(referenceRowsTable).where(and(eq(referenceRowsTable.id, String(req.params.rowId)), eq(referenceRowsTable.tableId, table.id))).returning();
    if (!changed.length) throw new ReferenceDataError("Row not found.", 404);
    return detail(await touch(table, tx), tx);
  });
  res.json(result);
});
router.use((error: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof ReferenceDataError) { res.status(error.status).json({ error: error.message }); return; }
  next(error);
});
export default router;
