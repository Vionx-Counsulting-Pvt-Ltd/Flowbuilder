import { useQueries } from "@tanstack/react-query";
import { getGetReferenceTableQueryKey, getListReferenceTablesQueryKey, getReferenceTable, useListReferenceTables, type WorkflowField } from "@workspace/api-client-react";
import { getFormDereferences } from "@workspace/workflow-expressions";

export function useReferenceFields(fields: WorkflowField[], enabled: boolean) {
  const tables = useListReferenceTables({ query: { queryKey: getListReferenceTablesQueryKey(), enabled, staleTime: 5000, refetchInterval: 15000 } });
  const ids = [...new Set(fields.map(field => field.sourceTableId).filter((id): id is string => Boolean(id)))];
  const sources = useQueries({ queries: ids.map(id => ({
    queryKey: getGetReferenceTableQueryKey(id),
    queryFn: () => getReferenceTable(id),
    enabled,
    staleTime: 5000,
    refetchInterval: 15000,
  })) });
  const dereferences = getFormDereferences(fields);
  const resolved = fields.map(field => {
    if (!field.sourceTableId) return field;
    const source = sources[ids.indexOf(field.sourceTableId)];
    if (!source?.data) return source?.isError ? { ...field, options: [], optionLabels: {} } : field;
    const column = source.data.columns.find(column => column.key === field.sourceLabelColumn);
    const rows = column ? source.data.rows.filter(row => row.active && row.values[column.key] != null && String(row.values[column.key]).trim() !== "") : [];
    const requested = source.data.columns.filter(column => dereferences.some(ref =>
      [field.id, field.key, field.label].some(name => name?.trim().toLocaleLowerCase() === ref.field.toLocaleLowerCase()) &&
      [column.key, column.label].some(name => name.trim().toLocaleLowerCase() === ref.column.toLocaleLowerCase())));
    const optionMappedValues = Object.fromEntries(rows.map(row => [row.id, Object.fromEntries((field.referenceMappings ?? []).map(mapping => [mapping.targetFieldId, row.values[mapping.sourceColumn] ?? null]))]));
    return {
      ...field,
      options: rows.map(row => row.id),
      optionLabels: Object.fromEntries(rows.map(row => [row.id, String(row.values[column!.key])])),
      optionMappedValues,
      referenceColumns: source.data.columns.map(({ key, label }) => ({ key, label })),
      referenceData: Object.fromEntries(rows.map(row => [row.id, Object.fromEntries(requested.map(column => [column.key, row.values[column.key] ?? null]))])),
    };
  });
  return { fields: resolved, tables, sources, ids };
}
