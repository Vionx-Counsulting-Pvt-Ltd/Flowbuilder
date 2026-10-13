import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Database, Download, FileUp, Pencil, Plus, Search, Trash2, X, FileSpreadsheet } from 'lucide-react';
import {
  getGetReferenceTableQueryKey, getListReferenceTablesQueryKey, getListWorkflowsQueryKey,
  useAddReferenceRows, useCreateReferenceTable, useDeleteReferenceRow, useDeleteReferenceTable,
  useGetCurrentUser, useGetReferenceTable, useListReferenceTables, useUpdateReferenceRow, useUpdateReferenceTable,
} from '@workspace/api-client-react';
import type { ReferenceColumn, ReferenceColumnType, ReferenceRow, ReferenceValues } from '@workspace/api-client-react';
import { MAX_COLUMNS, exportRowsCsv, exportTemplateCsv, parseUpload, type ParseResult } from '../lib/reference-import';
import './TablesPage.css';

function errMsg(e: unknown): string {
  const d = (e as { data?: { error?: string } } | null)?.data;
  if (d && typeof d.error === 'string') return d.error;
  return e instanceof Error ? e.message : 'Something went wrong.';
}
const TYPES: ReferenceColumnType[] = ['text', 'number', 'date', 'boolean'];

function Modal({ title, subtitle, onClose, children, footer, narrow, testid }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer: ReactNode; narrow?: boolean; testid?: string }) {
  useEffect(() => { const l = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', l); return () => window.removeEventListener('keydown', l); }, [onClose]);
  return <div className="tb-modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className={`tb-modal${narrow ? ' narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title} data-testid={testid}>
      <header><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</header>
      <div className="tb-body">{children}</div>
      <footer className="tb-foot">{footer}</footer>
    </section>
  </div>;
}
function Btn({ variant = 'outline', children, ...p }: { variant?: 'primary' | 'outline' | 'danger' | 'quiet'; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement> & { 'data-testid'?: string }) {
  return <button type="button" {...p} className={`button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 button-${variant}`}>{children}</button>;
}
const Err = ({ children }: { children: ReactNode }) => <div className="tb-err" role="alert" data-testid="text-error">{children}</div>;
const keyFromLabel = (l: string) => { const s = l.trim().replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')); const k = /^[a-zA-Z]/.test(s) ? s : s ? `c${s}` : ''; return k.charAt(0).toLowerCase() + k.slice(1); };

interface ColDraft extends ReferenceColumn { locked: boolean; touched: boolean }

function TableEditor({ existing, onClose, onSaved, onError }: { existing?: { id: string; name: string; description: string; columns: ReferenceColumn[] }; onClose: () => void; onSaved: (id: string, msg: string) => void; onError: (m: string) => void }) {
  const create = useCreateReferenceTable(); const update = useUpdateReferenceTable();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [cols, setCols] = useState<ColDraft[]>(existing ? existing.columns.map(c => ({ ...c, locked: true, touched: true })) : [{ key: '', label: '', type: 'text', required: false, locked: false, touched: false }]);
  const [error, setError] = useState('');
  const pending = create.isPending || update.isPending;
  const patch = (i: number, p: Partial<ColDraft>) => setCols(cs => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const submit = () => {
    setError('');
    if (name.trim().length < 2) return setError('Table name needs at least 2 characters.');
    if (!cols.length) return setError('Add at least one column.');
    const seen = new Set<string>();
    for (const [i, c] of cols.entries()) {
      if (!c.label.trim()) return setError(`Column ${i + 1} needs a label.`);
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(c.key)) return setError(`Column ${i + 1}: key must start with a letter and use only letters, numbers and underscores.`);
      if (seen.has(c.key.toLowerCase())) return setError(`Duplicate column key "${c.key}".`);
      seen.add(c.key.toLowerCase());
    }
    const data = { name: name.trim(), description: description.trim(), columns: cols.map(({ key, label, type, required }) => ({ key, label: label.trim(), type, required })) };
    const opts = { onSuccess: (t: { id: string }) => onSaved(t.id, existing ? 'Table updated.' : 'Table created.'), onError: (e: unknown) => { const m = errMsg(e); setError(m); onError(m); } };
    if (existing) update.mutate({ tableId: existing.id, data }, opts); else create.mutate({ data }, opts);
  };
  return <Modal title={existing ? 'Edit table' : 'New table'} subtitle="Columns define what each row stores. Existing keys are locked so form sources keep working." onClose={onClose} testid="dialog-table-editor"
    footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={pending} onClick={submit} data-testid="button-save-table">{pending ? 'Saving...' : 'Save table'}</Btn></>}>
    {error && <Err>{error}</Err>}
    <label className="form-field"><span>Name</span><input className="input-control" value={name} onChange={e => setName(e.target.value)} placeholder="Onboarding branches" data-testid="input-table-name" /></label>
    <label className="form-field"><span>Description</span><textarea className="input-control min-h-16" value={description} onChange={e => setDescription(e.target.value)} data-testid="input-table-description" /></label>
    <div className="grid gap-2">
      <div className="eyebrow">COLUMNS ({cols.length}/{MAX_COLUMNS})</div>
      {cols.map((c, i) => <div className="tb-col-row" key={i} data-testid={`row-column-${i}`}>
        <input className="input-control" placeholder="Label" value={c.label} onChange={e => patch(i, { label: e.target.value, ...(c.locked || c.touched ? {} : { key: keyFromLabel(e.target.value) }) })} data-testid={`input-column-label-${i}`} />
        <input className={`input-control mono ${c.locked ? 'tb-dim' : ''}`} placeholder="key" value={c.key} disabled={c.locked} title={c.locked ? 'Existing keys are locked' : ''} onChange={e => patch(i, { key: e.target.value, touched: true })} data-testid={`input-column-key-${i}`} />
        <select className="input-control" value={c.type} onChange={e => patch(i, { type: e.target.value as ReferenceColumnType })} data-testid={`select-column-type-${i}`}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <label className="chk"><input type="checkbox" checked={c.required} onChange={e => patch(i, { required: e.target.checked })} data-testid={`checkbox-column-required-${i}`} />Required</label>
        <button type="button" className="tb-ghost danger" aria-label="Remove column" onClick={() => setCols(cs => cs.filter((_, j) => j !== i))} data-testid={`button-remove-column-${i}`}><X size={14} /></button>
      </div>)}
      <div><Btn disabled={cols.length >= MAX_COLUMNS} onClick={() => setCols(cs => [...cs, { key: '', label: '', type: 'text', required: false, locked: false, touched: false }])} data-testid="button-add-column"><Plus size={14} /> Add column</Btn></div>
    </div>
  </Modal>;
}

function RowEditor({ tableId, columns, row, onClose, onDone, onError }: { tableId: string; columns: ReferenceColumn[]; row?: ReferenceRow; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const add = useAddReferenceRows(); const upd = useUpdateReferenceRow();
  const [vals, setVals] = useState<Record<string, string | boolean>>(() => Object.fromEntries(columns.map(c => { const v = row?.values[c.key]; return [c.key, c.type === 'boolean' ? v === true : v === null || v === undefined ? '' : String(v)]; })));
  const [active, setActive] = useState(row?.active ?? true);
  const [error, setError] = useState('');
  const submit = () => {
    const values: ReferenceValues = {};
    for (const c of columns) {
      const v = vals[c.key];
      if (c.type === 'boolean') { values[c.key] = v === true; continue; }
      const t = String(v).trim();
      if (!t) { if (c.required) return setError(`"${c.label}" is required.`); values[c.key] = null; continue; }
      if (c.type === 'number') { const n = Number(t); if (!Number.isFinite(n)) return setError(`"${c.label}" must be a number.`); values[c.key] = n; }
      else values[c.key] = t;
    }
    const cb = { onSuccess: () => onDone(row ? 'Row updated.' : 'Row added.'), onError: (e: unknown) => { const m = errMsg(e); setError(m); onError(m); } };
    if (row) upd.mutate({ tableId, rowId: row.id, data: { values, active } }, cb); else add.mutate({ tableId, data: { rows: [{ values, active }] } }, cb);
  };
  return <Modal title={row ? 'Edit row' : 'Add row'} onClose={onClose} testid="dialog-row-editor" footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={add.isPending || upd.isPending} onClick={submit} data-testid="button-save-row">Save row</Btn></>}>
    {error && <Err>{error}</Err>}
    {columns.map(c => <label className="form-field" key={c.key}><span>{c.label}{c.required ? ' *' : ''} <small className="mono">{c.type}</small></span>
      {c.type === 'boolean'
        ? <input type="checkbox" checked={vals[c.key] === true} onChange={e => setVals(v => ({ ...v, [c.key]: e.target.checked }))} data-testid={`input-row-${c.key}`} />
        : <input className="input-control" type={c.type === 'date' ? 'date' : c.type === 'number' ? 'number' : 'text'} step="any" value={String(vals[c.key])} onChange={e => setVals(v => ({ ...v, [c.key]: e.target.value }))} data-testid={`input-row-${c.key}`} />}
    </label>)}
    <label className="chk flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} data-testid="checkbox-row-active" /> Active (offered in forms)</label>
  </Modal>;
}

function ImportDialog({ tableId, columns, existingRows, onClose, onDone, onError }: { tableId: string; columns: ReferenceColumn[]; existingRows: number; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const add = useAddReferenceRows();
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [serverError, setServerError] = useState('');
  const ok = result && result.errors.length === 0 && result.rows.length > 0;
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setServerError(''); setFileName(f.name);
    try { setResult(await parseUpload(f, columns, existingRows)); }
    catch (e) { setResult({ rows: [], skippedBlank: 0, totalRead: 0, errors: [`Could not read file: ${errMsg(e)}`] }); }
    finally { setBusy(false); }
  };
  const confirm = () => {
    if (!result || !ok) return;
    add.mutate({ tableId, data: { rows: result.rows.map(r => ({ values: r.values, active: true })) } }, {
      onSuccess: () => onDone(`Appended ${result.rows.length} rows from ${fileName}.`),
      onError: e => { const m = errMsg(e); setServerError(m); onError(m); },
    });
  };
  return <Modal title="Bulk upload rows" subtitle="CSV or the first worksheet of an XLSX file, up to 10 MB. Headers must match a column key or label. Preview and append rows without replacing existing data." onClose={onClose} testid="dialog-import"
    footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!ok || add.isPending} onClick={confirm} data-testid="button-confirm-import">{add.isPending ? 'Appending...' : ok ? `Append ${result!.rows.length} rows` : 'Append rows'}</Btn></>}>
    <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input-control" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-import-file" />
    <div className="text-xs text-muted-foreground">Columns: {columns.map(c => c.key + (c.required ? '*' : '')).join(', ')}. Dates YYYY-MM-DD; booleans true/false, yes/no, 1/0. Limits: 5000 rows per upload, 10000 per table.</div>
    {busy && <div className="skeleton h-20 w-full" />}
    {serverError && <Err>{serverError}</Err>}
    {result && !busy && result.errors.length > 0 && <Err><b>{result.errors.length} problem{result.errors.length === 1 ? '' : 's'} found. Nothing was imported.</b><ul data-testid="list-import-errors">{result.errors.slice(0, 200).map((m, i) => <li key={i}>{m}</li>)}</ul>{result.errors.length > 200 && <div>...and {result.errors.length - 200} more.</div>}</Err>}
    {result && !busy && ok && <div data-testid="preview-import">
      <div className="mb-2 text-sm font-semibold">{result.rows.length} rows ready{result.skippedBlank ? ` (${result.skippedBlank} blank rows skipped)` : ''}. Previewing the first {Math.min(20, result.rows.length)}.</div>
      <div className="tb-scroll" style={{ maxHeight: 280 }}><table className="tb-table"><thead><tr><th>#</th>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>{result.rows.slice(0, 20).map(r => <tr key={r.rowNumber}><td className="mono">{r.rowNumber}</td>{columns.map(c => <td key={c.key}>{cell(r.values[c.key])}</td>)}</tr>)}</tbody></table></div>
    </div>}
  </Modal>;
}
const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));

export default function TablesPage() {
  const qc = useQueryClient();
  const me = useGetCurrentUser();
  const canManage = Boolean(me.data?.permissions.includes('build') || me.data?.permissions.includes('admin') || me.data?.roleName === 'Workflow Owner');
  const list = useListReferenceTables({ query: { queryKey: getListReferenceTablesQueryKey(), enabled: canManage, refetchInterval: 15000 } });
  const [selected, setSelected] = useState<string>('');
  const tableId = selected || list.data?.[0]?.id || '';
  const detail = useGetReferenceTable(tableId, { query: { enabled: canManage && Boolean(tableId), queryKey: getGetReferenceTableQueryKey(tableId), refetchInterval: 15000 } });
  const upd = useUpdateReferenceRow(); const delRow = useDeleteReferenceRow(); const delTable = useDeleteReferenceTable();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | 'new' | 'edit' | 'row' | 'import' | 'delTable'>(null);
  const [editRow, setEditRow] = useState<ReferenceRow | undefined>();
  const [rowToDelete, setRowToDelete] = useState<ReferenceRow | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  const table = detail.data;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListReferenceTablesQueryKey() });
    if (tableId) void qc.invalidateQueries({ queryKey: getGetReferenceTableQueryKey(tableId) });
    void qc.invalidateQueries({ queryKey: getListWorkflowsQueryKey() });
    void qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/workflows') });
  };
  const ok = (msg: string) => { refresh(); setModal(null); setRowToDelete(null); setToast({ kind: 'ok', msg }); };
  const fail = (m: string) => setToast({ kind: 'err', msg: m });
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!table) return [];
    return q ? table.rows.filter(r => Object.values(r.values).some(v => cell(v).toLowerCase().includes(q))) : table.rows;
  }, [table, search]);

  if (me.isLoading) return <div className="tb-skel"><div className="skeleton h-24 w-full" /><div className="skeleton h-64 w-full" /></div>;
  if (!canManage) return <div className="surface p-8" data-testid="state-unauthorized"><div className="eyebrow">TABLES</div><h1 className="display mt-1 text-3xl font-bold">Tables are managed by builders and admins</h1><p className="mt-2 text-sm text-muted-foreground">Ask a workspace admin or Workflow Owner for access to maintain shared option lists.</p></div>;

  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end enter">
      <div><div className="eyebrow">SHARED DATA</div><h1 className="display mt-1 text-[2rem] font-bold leading-tight sm:text-[2.45rem]" data-testid="text-page-title">Tables</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Keep long option lists in one place and link them to form fields as sources, instead of retyping them in every workflow.</p></div>
      <Btn variant="primary" onClick={() => setModal('new')} data-testid="button-new-table"><Plus size={16} /> New table</Btn>
    </div>
    {list.isLoading ? <div className="tb-skel"><div className="skeleton h-24 w-full" /><div className="skeleton h-64 w-full" /></div>
    : list.isError ? <div className="surface p-8 text-center" data-testid="state-error"><h3 className="font-semibold">Tables could not be loaded</h3><p className="mt-1 text-sm text-muted-foreground">{errMsg(list.error)}</p><Btn className="mt-4" onClick={() => void list.refetch()}>Try again</Btn></div>
    : !list.data?.length ? <div className="empty-state" data-testid="state-empty"><div className="empty-mark"><Database size={20} /></div><h3 className="mt-4 font-semibold">No tables yet</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Create a table for branches, cost centres or vendors, then bulk upload its rows from a spreadsheet.</p><div className="mt-5"><Btn variant="primary" onClick={() => setModal('new')}><Plus size={15} /> Create your first table</Btn></div></div>
    : <div className="tb-layout enter enter-delay-1">
      <aside className="surface tb-list" data-testid="section-source-management"><h2>Sources</h2>
        {list.data.map(t => <button key={t.id} className={`tb-item${t.id === tableId ? ' active' : ''}`} onClick={() => { setSelected(t.id); setSearch(''); }} data-testid={`item-table-${t.id}`}><b>{t.name}</b><small>{t.rowCount} rows, {t.activeRowCount} active, {t.columns.length} cols</small></button>)}
      </aside>
      <section className="surface tb-main" data-testid="section-table-detail">
        {detail.isLoading || !table ? (detail.isError ? <div className="p-8 text-center"><p className="text-sm">{errMsg(detail.error)}</p><Btn className="mt-3" onClick={() => void detail.refetch()}>Try again</Btn></div> : <div className="tb-skel p-5"><div className="skeleton h-16 w-full" /><div className="skeleton h-48 w-full" /></div>) : <>
          <div className="tb-head"><div><h2 data-testid="text-table-name">{table.name}</h2>{table.description && <p>{table.description}</p>}
            <div className="tb-chips">{table.columns.map(c => <span className="tb-chip" key={c.key} data-testid={`chip-column-${c.key}`}>{c.key}: {c.type}{c.required ? '*' : ''}</span>)}</div></div>
            <div className="tb-actions">
              <Btn onClick={() => setModal('edit')} data-testid="button-edit-table"><Pencil size={14} /> Edit</Btn>
              <Btn onClick={() => setModal('import')} data-testid="button-import"><FileUp size={14} /> Bulk upload</Btn>
              <Btn onClick={() => void exportTemplateCsv(table.name, table.columns)} data-testid="button-download-template"><FileSpreadsheet size={14} /> Template</Btn>
              <Btn onClick={() => void exportRowsCsv(table.name, table.columns, table.rows)} data-testid="button-export-csv"><Download size={14} /> Export CSV</Btn>
              <Btn variant="danger" onClick={() => setModal('delTable')} data-testid="button-delete-table"><Trash2 size={14} /> Delete</Btn>
            </div></div>
          <div className="tb-toolbar"><label className="tb-search"><Search size={14} /><input placeholder="Search rows" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-rows" /></label>
            <div className="flex items-center gap-3 text-xs text-muted-foreground"><span data-testid="text-row-count">{rows.length} of {table.rows.length} rows</span><Btn variant="primary" onClick={() => { setEditRow(undefined); setModal('row'); }} data-testid="button-add-row"><Plus size={14} /> Add row</Btn></div></div>
          {rows.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground" data-testid="state-no-rows">{table.rows.length ? 'No rows match your search.' : 'This table has no rows yet. Add one or bulk upload a spreadsheet.'}</div>
          : <div className="tb-scroll"><table className="tb-table"><thead><tr>{table.columns.map(c => <th key={c.key}>{c.label}</th>)}<th>Status</th><th /></tr></thead>
            <tbody>{rows.map(r => <tr key={r.id} className={r.active ? '' : 'off'} data-testid={`row-reference-${r.id}`}>
              {table.columns.map(c => <td key={c.key}>{cell(r.values[c.key])}</td>)}
              <td><button className={`tb-pill${r.active ? '' : ' off'}`} disabled={upd.isPending} onClick={() => upd.mutate({ tableId, rowId: r.id, data: { values: r.values, active: !r.active } }, { onSuccess: () => ok(r.active ? 'Row deactivated.' : 'Row activated.'), onError: e => fail(errMsg(e)) })} data-testid={`button-toggle-active-${r.id}`}>{r.active ? 'Active' : 'Inactive'}</button></td>
              <td><div className="tb-icons"><button className="tb-ghost" onClick={() => { setEditRow(r); setModal('row'); }} data-testid={`button-edit-row-${r.id}`}>Edit</button><button className="tb-ghost danger" onClick={() => setRowToDelete(r)} data-testid={`button-delete-row-${r.id}`}>Delete</button></div></td></tr>)}</tbody></table></div>}
        </>}
      </section>
    </div>}

    {modal === 'new' && <TableEditor onClose={() => setModal(null)} onError={fail} onSaved={(id, m) => { setSelected(id); ok(m); }} />}
    {modal === 'edit' && table && <TableEditor existing={table} onClose={() => setModal(null)} onError={fail} onSaved={(_, m) => ok(m)} />}
    {modal === 'row' && table && <RowEditor tableId={tableId} columns={table.columns} row={editRow} onClose={() => setModal(null)} onDone={ok} onError={fail} />}
    {modal === 'import' && table && <ImportDialog tableId={tableId} columns={table.columns} existingRows={table.rows.length} onClose={() => setModal(null)} onDone={ok} onError={fail} />}
    {modal === 'delTable' && table && <Modal narrow title={`Delete "${table.name}"?`} subtitle="This permanently removes the table and all its rows. The server blocks this while workflows use it." onClose={() => setModal(null)} testid="dialog-delete-table"
      footer={<><Btn onClick={() => setModal(null)}>Cancel</Btn><Btn variant="danger" disabled={delTable.isPending} data-testid="button-confirm-delete-table" onClick={() => delTable.mutate({ tableId }, { onSuccess: () => { setSelected(''); ok('Table deleted.'); }, onError: e => { setModal(null); fail(errMsg(e)); } })}>{delTable.isPending ? 'Deleting...' : 'Delete table'}</Btn></>}><span /></Modal>}
    {rowToDelete && <Modal narrow title="Delete this row?" subtitle="Forms will stop offering it immediately." onClose={() => setRowToDelete(null)} testid="dialog-delete-row"
      footer={<><Btn onClick={() => setRowToDelete(null)}>Cancel</Btn><Btn variant="danger" disabled={delRow.isPending} data-testid="button-confirm-delete-row" onClick={() => delRow.mutate({ tableId, rowId: rowToDelete.id }, { onSuccess: () => ok('Row deleted.'), onError: e => { setRowToDelete(null); fail(errMsg(e)); } })}>Delete row</Btn></>}><span /></Modal>}
    {toast && <div className={`tb-toast ${toast.kind}`} role="status" data-testid={`toast-${toast.kind}`}><span>{toast.msg}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><X size={14} /></button></div>}
  </div>;
}
