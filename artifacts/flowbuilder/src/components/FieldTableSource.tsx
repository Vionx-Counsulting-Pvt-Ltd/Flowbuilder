import { Link } from "wouter";
import { referenceColumnCompatible } from "@workspace/workflow-expressions";
import { getGetReferenceTableQueryKey, useGetReferenceTable, type ReferenceTable, type WorkflowField } from "@workspace/api-client-react";

export default function FieldTableSource({ field, fields, tables, patch, loading, error }: {
  field: WorkflowField;
  fields: WorkflowField[];
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
      patch({ sourceTableId: table?.id || null, sourceLabelColumn: table?.columns[0]?.key || null, referenceMappings: [], options: [], optionLabels: {}, optionMappedValues: {} });
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
      {["select", "enum", "ref", "lookup", "radio"].includes(field.type) && <RelatedMappings field={field} fields={fields} columns={source.columns} patch={patch} />}
    </>}
    {!tables.length && !loading && !error && <small>No tables yet. <Link href="/tables" className="text-link">Create or upload a table</Link></small>}
  </div>;
}

function RelatedMappings({ field, fields, columns, patch }: {
  field: WorkflowField; fields: WorkflowField[]; columns: ReferenceTable["columns"]; patch: (patch: Partial<WorkflowField>) => void;
}) {
  const mappings = field.referenceMappings ?? [];
  const used = new Set(fields.flatMap(source => (source.referenceMappings ?? []).map(mapping => mapping.targetFieldId)));
  const candidates = columns.flatMap(column => fields.filter(target => target.id !== field.id && !used.has(target.id) && referenceColumnCompatible(column.type, target)).map(target => ({ column, target })));
  const change = (index: number, update: Partial<NonNullable<WorkflowField["referenceMappings"]>[number]>) => patch({ referenceMappings: mappings.map((mapping, i) => i === index ? { ...mapping, ...update } : mapping) });
  return <div className="space-y-2">
    <span>Fill related fields</span>
    <small>Only mapped columns are shared with requesters. Changing or clearing the selection replaces or clears every mapped answer, including edited suggestions.</small>
    {mappings.map((mapping, index) => <div key={index} className="space-y-2 rounded-lg border border-border p-2" data-testid={`reference-mapping-${index}`}>
      <label className="form-field"><span>Source column</span><select className="input-control" value={mapping.sourceColumn} onChange={event => change(index, { sourceColumn: event.target.value })}><option value="">Choose column</option>{columns.map(column => <option key={column.key} value={column.key}>{column.label} · {column.type}</option>)}</select></label>
      <label className="form-field"><span>Target field</span><select className="input-control" value={mapping.targetFieldId} onChange={event => change(index, { targetFieldId: event.target.value })}><option value="">Choose field</option>{fields.filter(target => target.id === mapping.targetFieldId || (!used.has(target.id) && columns.some(column => column.key === mapping.sourceColumn && referenceColumnCompatible(column.type, target)))).map(target => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
      <label className="form-field"><span>Copied value behavior</span><select className="input-control" value={mapping.mode} onChange={event => change(index, { mode: event.target.value as "suggestion" | "locked" })}><option value="suggestion">Suggestion · requester can edit</option><option value="locked">Locked · verified on submission</option></select></label>
      <button type="button" className="text-link" onClick={() => patch({ referenceMappings: mappings.filter((_, i) => i !== index) })}>Remove mapping</button>
    </div>)}
    <button type="button" className="button button-outline" disabled={!candidates.length || mappings.length >= 50} onClick={() => patch({ referenceMappings: [...mappings, { sourceColumn: candidates[0].column.key, targetFieldId: candidates[0].target.id, mode: "suggestion" }] })}>Add field mapping</button>
    {!candidates.length && <small>Add an editable text, number, date, or yes/no field with a matching column type. Formula, read-only, and table-choice fields cannot be targets.</small>}
  </div>;
}
