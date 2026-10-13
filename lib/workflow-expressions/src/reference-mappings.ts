export type ReferenceMapping = { sourceColumn: string; targetFieldId: string; mode: "suggestion" | "locked" };
type MappingField = {
  id: string; type: string; sourceTableId?: string | null; readOnly?: boolean;
  appFormula?: string | null; referenceMappings?: ReferenceMapping[];
  optionMappedValues?: Record<string, Record<string, string | number | boolean | null>>;
};

/** Deliberately limited to scalar, non-relational targets. No implicit coercion. */
export function referenceColumnCompatible(columnType: string, target: MappingField): boolean {
  if (target.sourceTableId || target.appFormula?.trim() || target.readOnly) return false;
  if (columnType === "number") return ["number", "decimal", "percent", "price"].includes(target.type);
  if (columnType === "boolean") return ["checkbox", "yesno"].includes(target.type);
  if (columnType === "date") return target.type === "date";
  return columnType === "text" && ["text", "textarea", "longtext", "name", "email", "phone", "url", "address"].includes(target.type);
}

/** Changing/clearing a selection replaces all its mapped answers, even edited suggestions. */
export function fillReferenceSelection(fields: MappingField[], values: Record<string, unknown>, sourceId: string, selection: unknown): Record<string, unknown> {
  const next = { ...values, [sourceId]: selection };
  const source = fields.find(field => field.id === sourceId);
  for (const mapping of source?.referenceMappings ?? []) {
    const target = fields.find(field => field.id === mapping.targetFieldId);
    // Never let stale/malicious configuration overwrite a formula or read-only field.
    if (!target || target.appFormula?.trim() || target.readOnly || target.sourceTableId) continue;
    next[target.id] = typeof selection === "string" ? source?.optionMappedValues?.[selection]?.[target.id] ?? "" : "";
  }
  return next;
}

/** Locked answers always come from the fresh, server-authorized projection, not the payload. */
export function applyLockedReferenceMappings(fields: MappingField[], values: Record<string, unknown>): Record<string, unknown> {
  const next = { ...values };
  for (const source of fields) {
    const selection = next[source.id];
    for (const mapping of source.referenceMappings ?? []) {
      if (mapping.mode !== "locked") continue;
      const target = fields.find(field => field.id === mapping.targetFieldId);
      if (!target || target.appFormula?.trim() || target.readOnly || target.sourceTableId) continue;
      next[target.id] = typeof selection === "string" ? source.optionMappedValues?.[selection]?.[target.id] ?? "" : "";
    }
  }
  return next;
}
