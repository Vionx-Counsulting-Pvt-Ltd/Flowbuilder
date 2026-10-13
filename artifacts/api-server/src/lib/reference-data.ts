import { and, asc, eq, inArray } from "drizzle-orm";
import { db, referenceRowsTable, referenceTablesTable, type ReferenceColumn, type ReferenceValues, type WorkflowField } from "@workspace/db";
import { getFormDereferences } from "@workspace/workflow-expressions";

export class ReferenceDataError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const referenceChoiceTypes = new Set(["select", "enum", "ref", "lookup", "multiselect", "enumlist", "radio"]);
export function validateColumns(columns: ReferenceColumn[]) {
  const keys = new Set<string>();
  const labels = new Set<string>();
  const aliases = new Set<string>();
  for (const column of columns) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(column.key) || ["constructor", "prototype", "__proto__"].includes(column.key.toLowerCase())) throw new ReferenceDataError("Use a unique column key starting with a letter, containing only letters, numbers, and underscores.");
    const label = column.label.trim().toLowerCase();
    if (!label || keys.has(column.key.toLowerCase()) || labels.has(label)) throw new ReferenceDataError("Column keys and names must be nonempty and unique.");
    if (aliases.has(column.key.toLowerCase()) || aliases.has(label)) throw new ReferenceDataError("Column names and keys must not overlap across different columns.");
    aliases.add(column.key.toLowerCase()); aliases.add(label);
    keys.add(column.key.toLowerCase()); labels.add(label);
  }
}
export function normalizeReferenceValues(values: ReferenceValues, columns: ReferenceColumn[], context = "Row"): ReferenceValues {
  const known = new Set(columns.map(column => column.key));
  if (Object.keys(values).some(key => !known.has(key))) throw new ReferenceDataError(`${context}: unknown column. Match the table's column keys.`);
  const result: ReferenceValues = {};
  for (const column of columns) {
    const value = values[column.key];
    const empty = value == null || (typeof value === "string" && !value.trim());
    if (empty) {
      if (column.required) throw new ReferenceDataError(`${context}: ${column.label} is required.`);
      result[column.key] = null; continue;
    }
    if (column.type === "text") {
      const text = String(value).trim();
      if (text.length > 2000) throw new ReferenceDataError(`${context}: ${column.label} exceeds 2,000 characters.`);
      result[column.key] = text;
    } else if (column.type === "number") {
      const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
      if (!Number.isFinite(number)) throw new ReferenceDataError(`${context}: ${column.label} must be a number.`);
      result[column.key] = number;
    } else if (column.type === "boolean") {
      const text = String(value).trim().toLowerCase();
      if (["true", "yes", "1"].includes(text)) result[column.key] = true;
      else if (["false", "no", "0"].includes(text)) result[column.key] = false;
      else throw new ReferenceDataError(`${context}: ${column.label} must be true/false, yes/no, or 1/0.`);
    } else {
      const text = String(value).trim();
      const parsed = new Date(`${text}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new ReferenceDataError(`${context}: ${column.label} must be a valid YYYY-MM-DD date.`);
      result[column.key] = text;
    }
  }
  return result;
}

/** IDs are the submitted values; labels are refreshed for new forms and snapshotted for requests. */
export async function hydrateReferenceFields(tenantId: string, fields: WorkflowField[], strict = false): Promise<WorkflowField[]> {
  fields = storedReferenceFields(fields);
  const dereferences = getFormDereferences(fields);
  const ids = [...new Set(fields.map(field => field.sourceTableId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return fields;
  const tables = await db.select().from(referenceTablesTable).where(and(eq(referenceTablesTable.tenantId, tenantId), inArray(referenceTablesTable.id, ids)));
  const rows = tables.length ? await db.select().from(referenceRowsTable).where(and(inArray(referenceRowsTable.tableId, tables.map(table => table.id)), eq(referenceRowsTable.active, true))).orderBy(asc(referenceRowsTable.createdAt), asc(referenceRowsTable.id)) : [];
  return fields.map(field => {
    if (!field.sourceTableId) {
      const { optionLabels: _labels, ...manual } = field;
      return manual;
    }
    const table = tables.find(item => item.id === field.sourceTableId);
    const column = table?.columns.find(item => item.key === field.sourceLabelColumn);
    if (!referenceChoiceTypes.has(field.type) || !table || !column) {
      if (strict) throw new ReferenceDataError(`Choose an available table and display column for “${field.label}”.`);
      return { ...field, options: [], optionLabels: {} };
    }
    const choices = rows.filter(row => row.tableId === table.id && row.values[column.key] != null && String(row.values[column.key]).trim() !== "");
    const requested = table.columns.filter(column => dereferences.some(ref =>
      [field.id, field.key, field.label].some(name => name?.trim().toLocaleLowerCase() === ref.field.toLocaleLowerCase()) &&
      [column.key, column.label].some(name => name.trim().toLocaleLowerCase() === ref.column.toLocaleLowerCase())));
    return {
      ...field,
      options: choices.map(row => row.id),
      optionLabels: Object.fromEntries(choices.map(row => [row.id, String(row.values[column.key])])),
      referenceColumns: (strict ? table.columns : requested).map(({ key, label }) => ({ key, label })),
      referenceData: requested.length ? Object.fromEntries(choices.map(row => [row.id, Object.fromEntries(requested.map(column => [column.key, row.values[column.key] ?? null]))])) : {},
    };
  });
}
export function storedReferenceFields(fields: WorkflowField[]): WorkflowField[] {
  return fields.map(field => {
    const { optionLabels: _labels, referenceData: _data, referenceColumns: _columns, ...definition } = field;
    return field.sourceTableId ? { ...definition, options: [] } : definition;
  });
}

/** Keep only the selected row's approved column values for historical rules. */
export function snapshotReferenceFields(fields: WorkflowField[], values: Record<string, unknown>): WorkflowField[] {
  const refs = getFormDereferences(fields);
  return fields.map(field => {
    if (!field.sourceTableId) return field;
    const selected = values[field.id];
    const row = typeof selected === "string" && field.referenceData && Object.prototype.hasOwnProperty.call(field.referenceData, selected) ? field.referenceData[selected] : undefined;
    return {
      ...field,
      referenceColumns: field.referenceColumns?.filter(column => refs.some(ref =>
        [field.id, field.key, field.label].some(name => name?.trim().toLocaleLowerCase() === ref.field.toLocaleLowerCase()) &&
        [column.key, column.label].some(name => name.toLocaleLowerCase() === ref.column.toLocaleLowerCase()))),
      referenceData: row ? { [selected as string]: row } : {},
    };
  });
}
