import { useQueries } from "@tanstack/react-query";
import { getGetReferenceTableQueryKey, getListReferenceTablesQueryKey, getReferenceTable, useListReferenceTables, type WorkflowField } from "@workspace/api-client-react";

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
  const resolved = fields.map(field => {
    if (!field.sourceTableId) return field;
    const source = sources[ids.indexOf(field.sourceTableId)];
    if (!source?.data) return source?.isError ? { ...field, options: [], optionLabels: {} } : field;
    const column = source.data.columns.find(column => column.key === field.sourceLabelColumn);
    const rows = column ? source.data.rows.filter(row => row.active && row.values[column.key] != null && String(row.values[column.key]).trim() !== "") : [];
    return { ...field, options: rows.map(row => row.id), optionLabels: Object.fromEntries(rows.map(row => [row.id, String(row.values[column!.key])])) };
  });
  return { fields: resolved, tables, sources, ids };
}
