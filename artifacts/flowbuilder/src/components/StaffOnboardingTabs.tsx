import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, UserCog, X } from 'lucide-react';
import {
  getListUsersQueryKey, getListWorkflowStaffQueryKey, useListUsers, useListWorkflowStaff,
  useSetStaffManagers, useUpdateStaffMember,
} from '@workspace/api-client-react';
import type { StaffMember, WorkflowField } from '@workspace/api-client-react';

export type StaffTab = 'dashboard' | 'active' | 'evaluation' | 'inactive';
const TABS: Array<{ id: StaffTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' }, { id: 'active', label: 'Active Staff' },
  { id: 'evaluation', label: 'Evaluation' }, { id: 'inactive', label: 'Inactive Staff' },
];
const TEXT = ['text', 'textarea', 'longtext', 'name', 'email', 'phone', 'url', 'address', 'time', 'color', 'duration', 'datetime', 'latlong', 'location', 'xy'];
const NUM = ['number', 'decimal', 'percent', 'price', 'progress'];
const BOOL = ['checkbox', 'yesno'];
const SINGLE = ['select', 'enum', 'radio', 'lookup', 'ref'];
const MULTI = ['multiselect', 'enumlist'];
const editable = (f: WorkflowField) => !f.hidden && (TEXT.includes(f.type) || NUM.includes(f.type) || f.type === 'date' || BOOL.includes(f.type) || SINGLE.includes(f.type) || MULTI.includes(f.type));
const visible = (f: WorkflowField) => !f.hidden && !['file', 'image', 'thumbnail', 'drawing', 'signature', 'video', 'people', 'show'].includes(f.type);
const optionsOf = (f: WorkflowField) => (f.options?.length ? f.options : Object.keys(f.optionLabels ?? {}));
const labelOf = (f: WorkflowField, v: string) => f.optionLabels?.[v] ?? v;
function show(f: WorkflowField, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.map(x => labelOf(f, String(x))).join(', ') : '—';
  return labelOf(f, String(v));
}
function errText(err: unknown) {
  const e = err as { status?: number; message?: string } | null;
  if (e?.status === 409) return 'This record was changed by someone else. Close and reopen it to see the latest details, then try again.';
  return e?.message || 'We could not save this change. Please try again.';
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal-panel max-w-xl" role="dialog" aria-modal="true" aria-label={title}><header className="flex items-start justify-between border-b border-border px-6 py-5"><h2 className="display text-xl font-bold">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></header><div className="max-h-[75vh] overflow-y-auto p-6">{children}</div></section></div>;
}

function EditStaff({ workflowId, member, onClose }: { workflowId: string; member: StaffMember; onClose: () => void }) {
  const qc = useQueryClient(); const update = useUpdateStaffMember();
  const fields = member.fields.filter(editable);
  const [status, setStatus] = useState<'active' | 'inactive'>(member.status);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...member.values }));
  const [error, setError] = useState('');
  const set = (id: string, v: unknown) => setValues(cur => ({ ...cur, [id]: v }));
  const submit = () => {
    setError('');
    const out: Record<string, unknown> = {};
    fields.forEach(f => { out[f.id] = values[f.id] ?? (BOOL.includes(f.type) ? false : MULTI.includes(f.type) ? [] : ''); });
    update.mutate({ workflowId, staffId: member.id, data: { status, values: out, expectedUpdatedAt: member.updatedAt } }, {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getListWorkflowStaffQueryKey(workflowId) }); onClose(); },
      onError: e => setError(errText(e)),
    });
  };
  return <Dialog title={`Edit ${member.name}`} onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit(); }}>
      <p className="text-sm text-muted-foreground">Changes update the staff register only. The approved onboarding request remains unchanged. Onboarding formulas are not recalculated here.</p>
      <label className="block"><span className="form-label">Employment status</span><select className="input-control" value={status} onChange={e => setStatus(e.target.value as 'active' | 'inactive')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      {fields.map(f => {
        const v = values[f.id]; const dis = update.isPending; const id = `staff-${f.id}`;
        let input: ReactNode;
        if (BOOL.includes(f.type)) input = <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={dis} checked={v === true} onChange={e => set(f.id, e.target.checked)} /> Yes</label>;
        else if (SINGLE.includes(f.type) && optionsOf(f).length) input = <select id={id} className="input-control" disabled={dis} value={String(v ?? '')} onChange={e => set(f.id, e.target.value)}><option value="">Not set</option>{optionsOf(f).map(o => <option key={o} value={o}>{labelOf(f, o)}</option>)}</select>;
        else if (MULTI.includes(f.type)) { const cur = Array.isArray(v) ? v.map(String) : []; input = <div className="flex flex-wrap gap-3">{optionsOf(f).map(o => <label key={o} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={dis} checked={cur.includes(o)} onChange={e => set(f.id, e.target.checked ? [...cur, o] : cur.filter(x => x !== o))} />{labelOf(f, o)}</label>)}</div>; }
        else if (NUM.includes(f.type)) input = <input id={id} className="input-control" type="number" step="any" disabled={dis} value={v === undefined || v === null ? '' : String(v)} onChange={e => set(f.id, e.target.value === '' ? '' : Number(e.target.value))} />;
        else if (f.type === 'date') input = <input id={id} className="input-control" type="date" disabled={dis} value={String(v ?? '').slice(0, 10)} onChange={e => set(f.id, e.target.value)} />;
        else input = <input id={id} className="input-control" disabled={dis} value={String(v ?? '')} onChange={e => set(f.id, e.target.value)} />;
        return <div key={f.id}><label htmlFor={id} className="form-label">{f.label}{f.required ? ' *' : ''}</label>{input}</div>;
      })}
      {!fields.length && <p className="text-sm text-muted-foreground">No editable fields on this record. You can still change its status.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-quiet inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  </Dialog>;
}

function ManagersDialog({ workflowId, initial, onClose }: { workflowId: string; initial: string[]; onClose: () => void }) {
  const qc = useQueryClient(); const save = useSetStaffManagers();
  const users = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const [ids, setIds] = useState<string[]>(initial); const [error, setError] = useState('');
  const members = (users.data ?? []).filter(u => u.status !== 'inactive' || ids.includes(u.id));
  return <Dialog title="Staff managers" onClose={onClose}>
    <p className="mb-3 text-sm text-muted-foreground">Managers can edit staff details and active or inactive status. Unticking a member revokes access.</p>
    {users.isLoading ? <p className="text-sm text-muted-foreground">Loading members…</p> : users.isError ? <p className="form-error">Could not load workspace members.</p> :
      <div className="space-y-2">{members.map(u => <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ids.includes(u.id)} onChange={e => setIds(cur => e.target.checked ? [...cur, u.id] : cur.filter(x => x !== u.id))} /><b>{u.name}</b><span className="text-muted-foreground">{u.email}</span></label>)}</div>}
    {error && <p className="form-error mt-3" role="alert">{error}</p>}
    <div className="modal-actions mt-5"><button type="button" className="button button-quiet inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold" onClick={onClose}>Cancel</button><button type="button" className="button button-primary inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={save.isPending || users.isLoading || users.isError}
      onClick={() => { setError(''); save.mutate({ workflowId, data: { userIds: ids } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListWorkflowStaffQueryKey(workflowId) }); onClose(); }, onError: e => setError(errText(e)) }); }}>{save.isPending ? 'Saving…' : 'Save managers'}</button></div>
  </Dialog>;
}

export default function StaffOnboardingTabs({ workflowId, dashboard, onTabChange }: { workflowId: string; dashboard: ReactNode; onTabChange?: (tab: StaffTab) => void }) {
  const [tab, setTab] = useState<StaffTab>('dashboard'); const [editing, setEditing] = useState<string | null>(null); const [managers, setManagers] = useState(false); const [q, setQ] = useState('');
  const staffQ = useListWorkflowStaff(workflowId, { query: { queryKey: getListWorkflowStaffQueryKey(workflowId), staleTime: 0, refetchInterval: 15000, refetchOnMount: 'always' } });
  useEffect(() => { setTab('dashboard'); setEditing(null); setManagers(false); setQ(''); onTabChange?.('dashboard'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workflowId]);
  const register = staffQ.data;
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (register?.staff ?? []).filter(s => s.status === tab && (!term || [s.name, s.branch, s.region, s.designation].some(x => x.toLowerCase().includes(term))));
  }, [register, tab, q]);
  const selectTab = (t: StaffTab) => { setTab(t); setQ(''); onTabChange?.(t); };
  const canManage = Boolean(register?.canManage);
  const editMember = register?.staff.find(s => s.id === editing);
  return <>
    <div className="workflow-toolbar"><div className="tabs" role="tablist" aria-label="Staff onboarding views">{TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'selected' : ''} onClick={() => selectTab(t.id)}>{t.label}</button>)}</div>
      {register?.canAssignManagers && tab !== 'dashboard' && <button type="button" className="button button-outline inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold" onClick={() => setManagers(true)}><UserCog size={15} /> Managers ({register.managerIds.length})</button>}
    </div>
    {tab === 'dashboard' ? dashboard : tab === 'evaluation' ? <section className="surface p-8 text-center"><h3 className="display text-lg font-bold">Evaluation is not configured yet</h3><p className="mt-2 text-sm text-muted-foreground">This view will be set up in a later phase. Nothing is tracked here for now.</p></section> : <>
      <div className="list-toolbar"><label className="searchbox wide"><input aria-label="Search staff" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, branch, region or designation…" /></label></div>
      {staffQ.isLoading ? <section className="surface p-6 text-sm text-muted-foreground">Loading staff…</section> : staffQ.isError ? <section className="surface p-6 text-sm"><p className="form-error">Could not load staff.</p><button type="button" className="button button-outline mt-3 rounded-lg px-4 py-2 text-sm font-semibold" onClick={() => void staffQ.refetch()}>Retry</button></section> :
        <section className="surface">{rows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{q ? 'No staff match this search.' : tab === 'active' ? 'No active staff yet. Records appear here after a request is fully approved.' : 'No inactive staff.'}</div> :
          <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>NAME</th><th>BRANCH</th><th>REGION</th><th>DESIGNATION</th>{canManage && <th>DETAILS</th>}{canManage && <th />}</tr></thead><tbody>{rows.map(s => <tr key={s.id}><td><b>{s.name}</b></td><td>{s.branch || '—'}</td><td>{s.region || '—'}</td><td>{s.designation || '—'}</td>
            {canManage && <td>{s.fields.filter(visible).slice(0, 3).map(f => `${f.label}: ${show(f, s.values[f.id])}`).join(' · ') || '—'}</td>}
            {canManage && <td><button type="button" className="button button-quiet inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold" onClick={() => setEditing(s.id)}><Pencil size={13} /> Edit</button></td>}</tr>)}</tbody></table></div>}</section>}
    </>}
    {editMember && canManage && <EditStaff key={editMember.id + editMember.updatedAt} workflowId={workflowId} member={editMember} onClose={() => setEditing(null)} />}
    {managers && register?.canAssignManagers && <ManagersDialog workflowId={workflowId} initial={register.managerIds} onClose={() => setManagers(false)} />}
  </>;
}
