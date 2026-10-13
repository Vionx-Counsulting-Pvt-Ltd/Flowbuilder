import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { ArrowLeft, ArrowRight, CircleAlert, Clock3, Eye, GitBranch, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetWorkflowQueryKey, getListRolesQueryKey, getListUsersQueryKey, getListWorkflowsQueryKey,
  useCreateWorkflow, useGetCurrentUser, useGetWorkflow, useListRoles, useListUsers, useUpdateWorkflow,
} from '@workspace/api-client-react';
import type { WorkflowField, WorkflowInput, WorkflowStage } from '@workspace/api-client-react';

const newId = () => crypto.randomUUID();
const blankField = (): WorkflowField => ({ id: newId(), label: '', type: 'text', required: false });
const blankStage = (order: number): WorkflowStage => ({ id: newId(), name: '', order, assigneeType: 'manager', assigneeLabel: 'Manager', slaHours: 24 });
const seed = (): WorkflowInput => ({
  name: '', category: 'Operations', description: '', routing: 'sequential',
  fields: [{ id: newId(), label: '', type: 'text', required: true }],
  stages: [blankStage(1)],
});

function Button({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${className}`} />;
}
function Label({ title, children }: { title: string; children: ReactNode }) {
  return <label className="form-field"><span>{title}</span>{children}</label>;
}
const inputClass = 'input-control';

export default function WorkflowEditor() {
  const params = useParams<{ workflowId?: string }>();
  const workflowId = params.workflowId;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const current = useGetCurrentUser();
  const canBuild = Boolean(current.data?.permissions.includes('admin') || current.data?.roleName === 'Workflow Owner');
  const detail = useGetWorkflow(workflowId || '', { query: { enabled: Boolean(workflowId), queryKey: getGetWorkflowQueryKey(workflowId || '') } });
  const roles = useListRoles({ query: { enabled: canBuild, queryKey: getListRolesQueryKey() } });
  const users = useListUsers({ query: { enabled: canBuild, queryKey: getListUsersQueryKey() } });
  const create = useCreateWorkflow();
  const update = useUpdateWorkflow();
  const [definition, setDefinition] = useState<WorkflowInput>(seed);
  const initializedFor = useRef<string | null>(null);
  const [validated, setValidated] = useState(false);
  const [testValues, setTestValues] = useState<Record<string, string | boolean>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const busy = create.isPending || update.isPending;

  useEffect(() => {
    const routeKey = workflowId || '__new__';
    if (initializedFor.current === routeKey) return;
    if (workflowId && detail.data) {
      setDefinition({
        name: detail.data.name, category: detail.data.category, description: detail.data.description,
        routing: detail.data.routing, fields: detail.data.fields, stages: detail.data.stages,
      });
      initializedFor.current = routeKey;
    }
    if (!workflowId) {
      setDefinition(seed());
      initializedFor.current = routeKey;
    }
  }, [workflowId, detail.data]);

  const issues = useMemo(() => {
    const problems: string[] = [];
    if (definition.name.trim().length < 2) problems.push('Enter a workflow name with at least two characters.');
    if (!definition.category.trim()) problems.push('Choose a category.');
    if (!definition.fields.length) problems.push('Add at least one request field.');
    const labels = definition.fields.map(field => field.label.trim().toLocaleLowerCase()).filter(Boolean);
    if (labels.length !== definition.fields.length) problems.push('Every request field needs a label.');
    if (new Set(labels).size !== labels.length) problems.push('Request field labels must be unique.');
    definition.fields.forEach((field, index) => {
      if (field.type === 'select') {
        const options = (field.options || []).map(option => option.trim()).filter(Boolean);
        if (!options.length) problems.push(`Field ${index + 1} needs at least one dropdown option.`);
        if (new Set(options.map(option => option.toLowerCase())).size !== options.length) problems.push(`Field ${index + 1} has duplicate dropdown options.`);
      }
    });
    if (!definition.stages.length) problems.push('Add at least one approval stage.');
    definition.stages.forEach((stage, index) => {
      if (!stage.name.trim()) problems.push(`Stage ${index + 1} needs a name.`);
      if (!Number.isInteger(stage.slaHours) || stage.slaHours <= 0) problems.push(`${stage.name || `Stage ${index + 1}`} needs a positive whole-number SLA.`);
      if (stage.assigneeType !== 'manager' && !stage.assigneeId) problems.push(`${stage.name || `Stage ${index + 1}`} needs an assigned ${stage.assigneeType}.`);
      if (stage.conditionFieldId || stage.conditionValue) {
        if (!stage.conditionFieldId || !definition.fields.some(field => field.id === stage.conditionFieldId)) problems.push(`${stage.name || `Stage ${index + 1}`} condition must reference an existing field.`);
        if (!stage.conditionValue?.trim()) problems.push(`${stage.name || `Stage ${index + 1}`} condition needs a match value.`);
      }
    });
    return problems;
  }, [definition]);

  function setField(id: string, patch: Partial<WorkflowField>) {
    setDefinition(current => ({ ...current, fields: current.fields.map(field => field.id === id ? { ...field, ...patch } : field) }));
  }
  function setStage(id: string, patch: Partial<WorkflowStage>) {
    setDefinition(current => ({ ...current, stages: current.stages.map(stage => stage.id === id ? { ...stage, ...patch } : stage) }));
  }
  function validatePreview() {
    const errors: Record<string, string> = {};
    definition.fields.forEach(field => {
      const value = testValues[field.id];
      if (field.required && (field.type === 'checkbox' ? value !== true : String(value ?? '').trim() === '')) {
        errors[field.id] = 'This field is required.';
        return;
      }
      if (String(value ?? '').trim() === '') return;
      if (field.type === 'number' && !Number.isFinite(Number(value))) errors[field.id] = 'Enter a valid number.';
       if (field.type === 'date') {
         const dateValue = String(value);
         const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? new Date(`${dateValue}T00:00:00.000Z`) : null;
         if (!parsedDate || !Number.isFinite(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== dateValue) errors[field.id] = 'Enter a valid date.';
       }
      if (field.type === 'select' && !(field.options || []).includes(String(value))) errors[field.id] = 'Choose one of the listed options.';
      if (field.type === 'checkbox' && typeof value !== 'boolean') errors[field.id] = 'Choose yes or no.';
    });
    setPreviewErrors(errors);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    setValidated(true);
    setSaveError('');
    if (issues.length) return;
    const payload: WorkflowInput = {
      ...definition, name: definition.name.trim(), category: definition.category.trim(),
      fields: definition.fields.map(field => ({ ...field, label: field.label.trim(), ...(field.type === 'select' ? { options: (field.options || []).map(option => option.trim()).filter(Boolean) } : { options: undefined }) })),
      stages: definition.stages.map((stage, index) => ({ ...stage, name: stage.name.trim(), order: index + 1, assigneeLabel: stage.assigneeType === 'manager' ? 'Manager' : stage.assigneeLabel, ...(stage.conditionFieldId ? {} : { conditionFieldId: null, conditionValue: null }) })),
    };
    const onSuccess = () => {
      void qc.invalidateQueries({ queryKey: getListWorkflowsQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      setLocation('/workflows');
    };
    if (workflowId) update.mutate({ workflowId, data: payload }, { onSuccess, onError: () => setSaveError('The workflow could not be saved. Please try again.') });
    else create.mutate({ data: payload }, { onSuccess, onError: () => setSaveError('The workflow could not be saved. Please try again.') });
  }

  if (current.isLoading) return <div className="workflow-editor-loading" aria-label="Loading workspace permissions"><div /><div /><div /></div>;
  if (!canBuild) return <section className="surface workflow-editor-error" role="alert"><CircleAlert /><h1>Workflow editing is restricted</h1><p>Only workspace administrators and workflow owners can create or edit workflows.</p><Button className="button-outline" onClick={() => setLocation('/workflows')}>Back to workflows</Button></section>;
  if (workflowId && detail.isLoading) return <div className="workflow-editor-loading" aria-label="Loading workflow"><div /><div /><div /></div>;
  if (workflowId && detail.isError) return <section className="surface workflow-editor-error"><CircleAlert /><h1>Workflow unavailable</h1><p>We couldn’t load this workflow. Your changes have not been touched.</p><Button className="button-outline" onClick={() => void detail.refetch()}>Try again</Button></section>;

  return <div className="workflow-editor enter">
    <header className="editor-topline">
      <button className="editor-back" type="button" onClick={() => setLocation('/workflows')} data-testid="button-editor-back"><ArrowLeft size={16} /> Workflows</button>
      <div className="editor-status"><span className="draft-dot" /> Draft definition <span className="editor-divider" /> Changes save when you’re ready</div>
      <div className="editor-top-actions"><Button className="button-outline" type="button" onClick={() => { setValidated(true); }} data-testid="button-validate"><ShieldCheck size={15} /> Validate</Button><Button type="submit" form="workflow-definition" disabled={busy || issues.length > 0} data-testid="button-save-workflow">{busy ? 'Saving…' : workflowId ? 'Save changes' : 'Create workflow'} <ArrowRight size={15} /></Button></div>
    </header>
    <div className="editor-title-row"><div><div className="eyebrow">WORKFLOW DESIGNER / {workflowId ? 'EDIT' : 'NEW'}</div><h1 className="display">{workflowId ? 'Refine the path.' : 'Give the work a path.'}</h1><p>Define the request, then make ownership unmistakable.</p></div><div className="editor-step-chip"><GitBranch size={15} /> Workflow definition</div></div>
    <form id="workflow-definition" onSubmit={save} className="editor-layout">
      <section className="editor-main">
        <article className="surface editor-card">
          <div className="editor-card-heading"><span className="editor-number">01</span><div><h2>Workflow details</h2><p>Name the work and choose how decisions move.</p></div></div>
          <div className="editor-fields-grid">
            <Label title="Workflow name"><input className={inputClass} value={definition.name} placeholder="e.g. Vendor review" onChange={e => setDefinition(d => ({ ...d, name: e.target.value }))} data-testid="input-workflow-name" /></Label>
            <Label title="Category"><input className={inputClass} value={definition.category} placeholder="Operations" onChange={e => setDefinition(d => ({ ...d, category: e.target.value }))} data-testid="input-workflow-category" /></Label>
            <Label title="Description"><textarea className={`${inputClass} min-h-20 resize-y`} value={definition.description} placeholder="What should the requester know?" onChange={e => setDefinition(d => ({ ...d, description: e.target.value }))} data-testid="input-workflow-description" /></Label>
            <Label title="Routing style"><select className={inputClass} value={definition.routing} onChange={e => setDefinition(d => ({ ...d, routing: e.target.value as WorkflowInput['routing'] }))} data-testid="select-routing-style"><option value="sequential">Sequential · one owner at a time</option><option value="parallel">Parallel · all owners together</option><option value="conditional">Conditional · answer-based paths</option></select></Label>
          </div>
          <div className="routing-note"><GitBranch size={15} /><span>{definition.routing === 'sequential' ? 'Each approval starts when the previous one is complete.' : definition.routing === 'parallel' ? 'All approval owners receive the request at the same time.' : 'Stages can be gated by a response in the request form.'}</span></div>
        </article>
        <article className="surface editor-card">
          <div className="editor-card-heading"><span className="editor-number">02</span><div><h2>Request form</h2><p>Ask for the context that makes a good decision possible.</p></div><Button className="button-outline editor-add" type="button" onClick={() => setDefinition(d => ({ ...d, fields: [...d.fields, blankField()] }))} data-testid="button-add-field"><Plus size={15} /> Add field</Button></div>
          <div className="editor-builder-list">
            {definition.fields.map((field, index) => <div className="editor-field-card" key={field.id}>
              <div className="editor-item-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="editor-field-controls">
                <Label title="Question label"><input className={inputClass} value={field.label} placeholder="What do you need to know?" onChange={e => setField(field.id, { label: e.target.value })} data-testid={`input-field-label-${field.id}`} /></Label>
                <Label title="Answer format"><select className={inputClass} value={field.type} onChange={e => setField(field.id, { type: e.target.value as WorkflowField['type'], options: e.target.value === 'select' ? field.options || [] : undefined })} data-testid={`select-field-type-${field.id}`}><option value="text">Short text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Dropdown</option><option value="checkbox">Checkbox</option></select></Label>
                {field.type !== 'checkbox' && <Label title="Placeholder"><input className={inputClass} value={field.placeholder || ''} placeholder="Optional helper text" onChange={e => setField(field.id, { placeholder: e.target.value || undefined })} data-testid={`input-field-placeholder-${field.id}`} /></Label>}
                {field.type === 'select' && <Label title="Dropdown options · one per line"><textarea className={`${inputClass} min-h-20 resize-y`} value={(field.options || []).join('\n')} placeholder={'New vendor\nRenewal\nChange request'} onChange={e => setField(field.id, { options: e.target.value.split('\n').map(option => option.trim()).filter(Boolean) })} data-testid={`input-field-options-${field.id}`} /></Label>}
                <div className="field-card-bottom"><label className="required-control"><input type="checkbox" checked={field.required} onChange={e => setField(field.id, { required: e.target.checked })} data-testid={`toggle-field-required-${field.id}`} /><span>Required response</span></label><button type="button" className="editor-remove" aria-label={`Remove ${field.label || 'field'}`} disabled={definition.fields.length === 1} onClick={() => setDefinition(d => ({ ...d, fields: d.fields.filter(item => item.id !== field.id) }))} data-testid={`button-remove-field-${field.id}`}><Trash2 size={15} /> Remove</button></div>
              </div>
            </div>)}
          </div>
        </article>
        <article className="surface editor-card">
          <div className="editor-card-heading"><span className="editor-number">03</span><div><h2>Approval path</h2><p>Every stage has an owner and a response window.</p></div><Button className="button-outline editor-add" type="button" onClick={() => setDefinition(d => ({ ...d, stages: [...d.stages, blankStage(d.stages.length + 1)] }))} data-testid="button-add-stage"><Plus size={15} /> Add stage</Button></div>
          <div className="editor-stage-list">
            {definition.stages.map((stage, index) => <div className="editor-stage-card" key={stage.id}>
              <div className="stage-rail"><span>{String(index + 1).padStart(2, '0')}</span>{index < definition.stages.length - 1 && <i />}</div>
              <div className="stage-card-content">
                <div className="stage-fields">
                  <Label title="Stage name"><input className={inputClass} value={stage.name} placeholder="e.g. Finance review" onChange={e => setStage(stage.id, { name: e.target.value })} data-testid={`input-stage-name-${stage.id}`} /></Label>
                  <Label title="Owner type"><select className={inputClass} value={stage.assigneeType} onChange={e => { const assigneeType = e.target.value as WorkflowStage['assigneeType']; setStage(stage.id, { assigneeType, assigneeId: null, assigneeLabel: assigneeType === 'manager' ? 'Manager' : '' }); }} data-testid={`select-stage-owner-type-${stage.id}`}><option value="manager">Requester’s manager</option><option value="role">Workspace role</option><option value="user">Specific person</option></select></Label>
                  {stage.assigneeType !== 'manager' && <Label title={stage.assigneeType === 'role' ? 'Workspace role' : 'Team member'}><select className={inputClass} value={stage.assigneeId || ''} onChange={e => { const selected = stage.assigneeType === 'role' ? roles.data?.find(item => item.id === e.target.value) : users.data?.find(item => item.id === e.target.value); setStage(stage.id, { assigneeId: selected?.id || null, assigneeLabel: selected?.name || '' }); }} data-testid={`select-stage-assignee-${stage.id}`}><option value="">Choose {stage.assigneeType === 'role' ? 'a role' : 'a person'}</option>{stage.assigneeType === 'role' ? roles.data?.map(role => <option key={role.id} value={role.id}>{role.name}</option>) : users.data?.filter(user => user.status === 'active').map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Label>}
                  <Label title="SLA · hours"><input className={inputClass} type="number" min="1" value={stage.slaHours} onChange={e => setStage(stage.id, { slaHours: Number(e.target.value) })} data-testid={`input-stage-sla-${stage.id}`} /></Label>
                </div>
                {definition.routing === 'conditional' && <div className="condition-fields"><span>RUN THIS STAGE WHEN</span><select className={inputClass} value={stage.conditionFieldId || ''} onChange={e => setStage(stage.id, { conditionFieldId: e.target.value || null, conditionValue: e.target.value ? stage.conditionValue || '' : null })} data-testid={`select-stage-condition-field-${stage.id}`}><option value="">Always run</option>{definition.fields.map(field => <option value={field.id} key={field.id}>{field.label || 'Untitled field'}</option>)}</select>{stage.conditionFieldId && <input className={inputClass} value={stage.conditionValue || ''} placeholder="Answer exactly matches…" onChange={e => setStage(stage.id, { conditionValue: e.target.value })} data-testid={`input-stage-condition-value-${stage.id}`} />}</div>}
                <div className="stage-card-foot"><span><Clock3 size={13} /> {stage.slaHours || 0} hour response window</span><button type="button" className="editor-remove" disabled={definition.stages.length === 1} onClick={() => setDefinition(d => ({ ...d, stages: d.stages.filter(item => item.id !== stage.id) }))} data-testid={`button-remove-stage-${stage.id}`}><Trash2 size={14} /> Remove stage</button></div>
              </div>
            </div>)}
          </div>
        </article>
      </section>
      <aside className="editor-aside">
        <section className="surface validation-card">
          <div className="aside-kicker"><ShieldCheck size={14} /> DEFINITION CHECK</div>
          <h2>{issues.length ? 'A few details to resolve' : 'Ready to move forward'}</h2>
          <p>{issues.length ? 'The workflow needs these details before it can be saved.' : 'Your workflow meets the definition requirements.'}</p>
          {validated && issues.length > 0 && <ul className="validation-list" aria-live="polite">{issues.map((issue, index) => <li key={issue}><CircleAlert size={14} />{issue}</li>)}</ul>}
          <div className={`validation-meter ${issues.length ? '' : 'is-valid'}`}><span style={{ width: `${Math.max(12, ((7 - Math.min(issues.length, 7)) / 7) * 100)}%` }} /></div>
          <span className="validation-foot">{issues.length ? `${issues.length} ${issues.length === 1 ? 'check' : 'checks'} remaining` : 'All checks passed'}</span>
        </section>
        <section className="surface preview-card">
          <div className="preview-heading"><div><div className="aside-kicker"><Eye size={14} /> LIVE PREVIEW</div><h2>Request form</h2></div><span className="preview-live">LIVE</span></div>
          <p className="preview-description">{definition.description || 'A requester will see this form when they start.'}</p>
          <div className="preview-form">
            {definition.fields.map(field => <div className="preview-field" key={field.id}>
              <label htmlFor={`preview-${field.id}`}>{field.label || 'Untitled question'}{field.required && <i>Required</i>}</label>
              {field.type === 'textarea' ? <textarea id={`preview-${field.id}`} className={inputClass} placeholder={field.placeholder || ''} value={String(testValues[field.id] ?? '')} onChange={e => setTestValues(v => ({ ...v, [field.id]: e.target.value }))} aria-invalid={Boolean(previewErrors[field.id])} data-testid={`preview-input-${field.id}`} />
                : field.type === 'select' ? <select id={`preview-${field.id}`} className={inputClass} value={String(testValues[field.id] ?? '')} onChange={e => setTestValues(v => ({ ...v, [field.id]: e.target.value }))} aria-invalid={Boolean(previewErrors[field.id])} data-testid={`preview-input-${field.id}`}><option value="">Choose an option</option>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select>
                  : field.type === 'checkbox' ? <label className="preview-checkbox"><input id={`preview-${field.id}`} type="checkbox" checked={testValues[field.id] === true} onChange={e => setTestValues(v => ({ ...v, [field.id]: e.target.checked }))} aria-invalid={Boolean(previewErrors[field.id])} data-testid={`preview-input-${field.id}`} /> Yes</label>
                    : <input id={`preview-${field.id}`} className={inputClass} type={field.type === 'number' || field.type === 'date' ? field.type : 'text'} placeholder={field.placeholder || ''} value={String(testValues[field.id] ?? '')} onChange={e => setTestValues(v => ({ ...v, [field.id]: e.target.value }))} aria-invalid={Boolean(previewErrors[field.id])} data-testid={`preview-input-${field.id}`} />}
              {previewErrors[field.id] && <span className="preview-error" role="alert">{previewErrors[field.id]}</span>}
            </div>)}
            {!definition.fields.length && <div className="preview-empty">Add a request field to see your form here.</div>}
            <Button className="button-primary preview-test-button" type="button" onClick={validatePreview} data-testid="button-test-preview">Test this form <ArrowRight size={14} /></Button>
          </div>
        </section>
        <section className="path-summary"><div className="aside-kicker"><GitBranch size={14} /> ROUTE SUMMARY</div><div className="summary-route">{definition.stages.map((stage, index) => <div className="summary-route-item" key={stage.id}><span>{index + 1}</span><div><b>{stage.name || 'Unnamed stage'}</b><small>{stage.assigneeLabel || (stage.assigneeType === 'manager' ? 'Manager' : 'Owner not selected')} · {stage.slaHours}h SLA</small></div></div>)}{!definition.stages.length && <span className="summary-empty">No approval stages yet</span>}</div></section>
        {saveError && <p className="editor-save-error" role="alert">{saveError}</p>}
      </aside>
    </form>
  </div>;
}
