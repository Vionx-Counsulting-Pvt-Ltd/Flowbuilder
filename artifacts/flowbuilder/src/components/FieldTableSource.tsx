import { Link } from "wouter";
import { getGetReferenceTableQueryKey, useGetReferenceTable, type ReferenceTable, type WorkflowField } from "@workspace/api-client-react";

export default function FieldTableSource({ field, tables, patch, loading, error }: {
  field: WorkflowField;
  tables: ReferenceTable[];
  patch: (patch: Partial<WorkflowField>) => void;
  loading: boolean;
  error: boolean;
}) {
  const detail = useGetReferenceTable(field.sourceTableId || "", { query: { queryKey: getGetReferenceTableQueryKey(field.sourceTableId || ""), enabled: Boolean(field.sourceTableId), staleTime: 5000 } });
  const source = tables.find(table => table.id === field.sourceTableId);
  return <div className="form-field">
    <span>Option source</span>
    <select className="input-control" value={field.sourceTableId || ""} data-testid={`select-field-table-${field.id}`} onChange={event => {
      const table = tables.find(table => table.id === event.target.value);
      patch({ sourceTableId: table?.id || null, sourceLabelColumn: table?.columns[0]?.key || null, options: [], optionLabels: {} });
    }}>
      <option value="">Enter choices manually</option>
      {field.sourceTableId && !source && <option value={field.sourceTableId}>Unavailable table</option>}
      {tables.map(table => <option key={table.id} value={table.id}>{table.name} · {table.activeRowCount} active rows</option>)}
    </select>
    {loading && <small>Loading tables…</small>}
    {error && <small role="alert">Tables could not be loaded. Refresh the page to retry.</small>}
    {source && <>
      <span>Display column</span>
      <select className="input-control" value={field.sourceLabelColumn || ""} data-testid={`select-field-table-column-${field.id}`} onChange={event => patch({ sourceLabelColumn: event.target.value, options: [], optionLabels: {} })}>
        <option value="">Choose a column</option>
        {source.columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
      </select>
      {detail.isLoading ? <small>Loading choices…</small> : detail.isError ? <small role="alert">This table could not be loaded.</small> : <small>{field.options?.length || 0} available choices. Active table rows update automatically. Selections use stable row IDs.</small>}
      <Link href="/tables" className="text-link">Maintain this table</Link>
    </>}
    {!tables.length && !loading && !error && <small>No tables yet. <Link href="/tables" className="text-link">Create or upload a table</Link></small>}
  </div>;
}
