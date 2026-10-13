import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CircleAlert, Clock3, Eye, FileUp,
  GripVertical, Hash, ListChecks, Plus, Search, Settings2, ShieldCheck, Trash2, UserRound, X,
} from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetWorkflowQueryKey, getListRolesQueryKey, getListUsersQueryKey,
  getListWorkflowsQueryKey, useCreateWorkflow, useGetCurrentUser, useGetWorkflow,
  useListRoles, useListUsers, useUpdateWorkflow,
} from '@workspace/api-client-react';
import type { WorkflowField, WorkflowInput, WorkflowStage } from '@workspace/api-client-react';
import { computeFormExpressions, evaluateExpression, expressionFunctions, validateExpression, type ExpressionContext, type ExpressionUser } from '@workspace/workflow-expressions';

type FieldType = WorkflowField['type'];
const fieldTypes: { type: FieldType; label: string; icon: typeof Hash }[] = [
  { type: 'text', label: 'Text', icon: Hash }, { type: 'textarea', label: 'Textarea', icon: ListChecks },
  { type: 'longtext', label: 'Long text', icon: ListChecks }, { type: 'name', label: 'Name', icon: UserRound },
  { type: 'email', label: 'Email', icon: Hash }, { type: 'phone', label: 'Phone', icon: Hash },
  { type: 'url', label: 'URL', icon: Hash }, { type: 'address', label: 'Address', icon: ListChecks },
  { type: 'number', label: 'Number', icon: Hash }, { type: 'decimal', label: 'Decimal', icon: Hash },
  { type: 'percent', label: 'Percent', icon: Hash }, { type: 'price', label: 'Price', icon: Hash },
  { type: 'date', label: 'Date', icon: CalendarDays }, { type: 'time', label: 'Time', icon: Clock3 },
  { type: 'datetime', label: 'Date & time', icon: CalendarDays }, { type: 'duration', label: 'Duration', icon: Clock3 },
  { type: 'select', label: 'Dropdown', icon: ChevronDown }, { type: 'enum', label: 'Enum', icon: ChevronDown },
  { type: 'multiselect', label: 'Multi-select', icon: ListChecks }, { type: 'enumlist', label: 'Enum list', icon: ListChecks },
  { type: 'checkbox', label: 'Checkbox', icon: Check }, { type: 'yesno', label: 'Yes / no', icon: Check },
  { type: 'radio', label: 'Radio group', icon: ListChecks }, { type: 'progress', label: 'Progress', icon: Hash },
  { type: 'ref', label: 'Reference', icon: Search }, { type: 'file', label: 'File', icon: FileUp },
  { type: 'image', label: 'Image', icon: FileUp }, { type: 'thumbnail', label: 'Thumbnail', icon: FileUp },
  { type: 'drawing', label: 'Drawing', icon: FileUp }, { type: 'signature', label: 'Signature', icon: FileUp },
  { type: 'video', label: 'Video', icon: FileUp }, { type: 'people', label: 'People', icon: UserRound },
  { type: 'lookup', label: 'Lookup', icon: Search }, { type: 'color', label: 'Color', icon: Hash },
  { type: 'latlong', label: 'Latitude / longitude', icon: Search }, { type: 'location', label: 'Location', icon: Search },
  { type: 'xy', label: 'X / Y coordinates', icon: Search }, { type: 'show', label: 'Display text', icon: ListChecks },
];
const newId = () => crypto.randomUUID();
const progressOptions = ['Empty', 'Quarter', 'Half', 'Three Quarter', 'Full'];
const colorOptions = ['Black', 'Blue', 'Green', 'Orange', 'Purple', 'Red', 'Yellow', 'White'];
const blankField = (type: FieldType = 'text'): WorkflowField => ({
  id: newId(), label: fieldTypes.find(item => item.type === type)?.label || 'New field', type, required: false,
  width: 6, placeholder: '', ...(type === 'progress' ? { options: progressOptions } : choiceTypes.has(type) ? { options: ['Option 1', 'Option 2'] } : {}),
  ...(uploadTypes.has(type) ? { multiple: false, maxFiles: 1, maxFileSizeMB: 10, accept: uploadAccept[type] } : {}),
});
const choiceTypes = new Set<FieldType>(['select', 'enum', 'multiselect', 'enumlist', 'radio', 'ref', 'lookup', 'progress']);
const uploadAccept: Partial<Record<FieldType, string>> = { image: 'image/*', thumbnail: 'image/*', drawing: 'image/*', signature: 'image/*' };
const uploadTypes = new Set<FieldType>(['file', 'image', 'thumbnail', 'drawing', 'signature']);
const exprContext = (fields: WorkflowField[], values: Record<string, unknown>, user?: ExpressionUser): ExpressionContext => ({ fields, values, user });
function expressionResult(source: string | null | undefined, fields: WorkflowField[], values: Record<string, unknown>, fallback: unknown, user?: ExpressionUser): unknown {
  if (!source?.trim()) return fallback;
  try { return evaluateExpression(source, exprContext(fields, values, user)); } catch { return fallback; }
}
const blankStage = (order: number): WorkflowStage => ({ id: newId(), name: '', order, assigneeType: 'manager', assigneeLabel: 'Manager', slaHours: 24 });
function previewDefault(field: WorkflowField): unknown {
  if (field.type === 'checkbox') return field.defaultValue === 'true';
  if (field.type === 'yesno') return field.defaultValue === 'true' ? true : field.defaultValue === 'false' ? false : '';
  if (['multiselect', 'enumlist'].includes(field.type) || (field.type === 'people' && field.multiple) || uploadTypes.has(field.type)) return [];
  return field.defaultValue ?? '';
}
function previewValuesFor(fields: WorkflowField[], current: Record<string, unknown>, user?: ExpressionUser) {
  const values: Record<string, unknown> = Object.fromEntries(fields.map(field => [field.id, current[field.id] ?? previewDefault(field)]));
  for (const field of fields) if (field.initialValueExpression && current[field.id] === undefined) delete values[field.id];
  try { return computeFormExpressions(fields, values, user); } catch { return values; }
}
function isPreviewFieldVisible(field: WorkflowField, fields: WorkflowField[], values: Record<string, unknown>, user?: ExpressionUser) {
  if (field.hidden) return false;
  if (field.showIf?.trim()) return Boolean(expressionResult(field.showIf, fields, { ...values, _THIS: values[field.id] }, false, user));
  const condition = field.displayCondition;
  if (!condition || !fields.some(item => item.id === condition.fieldId)) return true;
  const current = values[condition.fieldId];
  const matches = Array.isArray(current)
    ? current.some(value => String(value) === condition.value)
    : String(current ?? '') === condition.value;
  if (condition.operator === 'notEquals') return !matches;
  if (condition.operator === 'contains') return Array.isArray(current) ? matches : String(current ?? '').includes(condition.value);
  return matches;
}
const seed = (): WorkflowInput => ({ name: '', category: 'Operations', description: '', routing: 'sequential', fields: [], stages: [blankStage(1)] });
const inputClass = 'input-control';
function Button({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${className}`} />;
}
function Label({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return <label className="form-field"><span>{title}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function toInput(field: WorkflowField): WorkflowInput['fields'][number] {
  return { ...field, options: field.options ? [...field.options] : undefined };
}

export default function WorkflowEditor() {
  const params = useParams<{ workflowId?: string }>();
  const workflowId = params.workflowId;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const current = useGetCurrentUser();
  const previewUser = useMemo<ExpressionUser | undefined>(() => current.data
    ? { email: current.data.email, name: current.data.name, role: current.data.roleName }
    : undefined, [current.data?.email, current.data?.name, current.data?.roleName]);
  const canBuild = Boolean(current.data?.permissions.includes('admin') || current.data?.permissions.includes('build') || current.data?.roleName === 'Workflow Owner');
  const detail = useGetWorkflow(workflowId || '', { query: { enabled: Boolean(workflowId), queryKey: getGetWorkflowQueryKey(workflowId || '') } });
  const roles = useListRoles({ query: { enabled: canBuild, queryKey: getListRolesQueryKey() } });
  const users = useListUsers({ query: { enabled: canBuild, queryKey: getListUsersQueryKey() } });
  const create = useCreateWorkflow();
  const update = useUpdateWorkflow();
  const [definition, setDefinition] = useState<WorkflowInput>(seed);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testValues, setTestValues] = useState<Record<string, unknown>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [validated, setValidated] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const initializedFor = useRef<string | null>(null);
  const busy = create.isPending || update.isPending;
  const selected = definition.fields.find(field => field.id === selectedId) || null;
  const workflowStatus = detail.data?.status;
  const filteredTypes = fieldTypes.filter(item => item.label.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => {
    const key = workflowId || '__new__';
    if (initializedFor.current === key) return;
    if (!workflowId) { setDefinition(seed()); initializedFor.current = key; return; }
    if (detail.data) {
      setDefinition({ name: detail.data.name, category: detail.data.category, description: detail.data.description, routing: detail.data.routing, fields: detail.data.fields, stages: detail.data.stages });
      setSelectedId(detail.data.fields[0]?.id || '');
      initializedFor.current = key;
    }
  }, [workflowId, detail.data]);
  const issues = useMemo(() => {
    const result: string[] = [];
    if (definition.name.trim().length < 2) result.push('Workflow name must be at least two characters.');
    if (!definition.category.trim()) result.push('Choose a category.');
    if (!definition.fields.length) result.push('Add at least one request field.');
    if (definition.fields.some(field => !field.label.trim())) result.push('Every field needs a label.');
    const labels = definition.fields.map(field => field.label.trim().toLowerCase()).filter(Boolean);
    if (new Set(labels).size !== labels.length) result.push('Field labels must be unique.');
    definition.fields.forEach((field, index) => {
      if (choiceTypes.has(field.type) && field.type !== 'progress' && !(field.options || []).some(option => option.trim())) result.push(`${field.label || `Field ${index + 1}`} needs at least one option.`);
      if (field.displayCondition && !definition.fields.some(item => item.id === field.displayCondition?.fieldId)) result.push(`${field.label || `Field ${index + 1}`} has an invalid display condition.`);
      for (const [name, expression] of [['initial value', field.initialValueExpression], ['app formula', field.appFormula], ['show condition', field.showIf], ['required condition', field.requiredIf], ['validity rule', field.validIf]] as const) {
        if (expression?.trim()) {
          const check = validateExpression(expression, definition.fields);
          if (!check.valid) result.push(`${field.label || `Field ${index + 1}`} ${name}: ${check.error}`);
        }
      }
    });
    if (!definition.stages.length) result.push('Add at least one approval stage.');
    definition.stages.forEach((stage, index) => {
      if (!stage.name.trim()) result.push(`Stage ${index + 1} needs a name.`);
      if (!Number.isInteger(stage.slaHours) || stage.slaHours < 1) result.push(`Stage ${index + 1} needs an SLA of at least one hour.`);
      if (stage.assigneeType !== 'manager' && !stage.assigneeId) result.push(`${stage.name || `Stage ${index + 1}`} needs an owner.`);
      if (stage.conditionFieldId && (!definition.fields.some(field => field.id === stage.conditionFieldId) || !stage.conditionValue?.trim())) result.push(`${stage.name || `Stage ${index + 1}`} has an incomplete condition.`);
    });
    return result;
  }, [definition]);
  const previewValues = useMemo(
    () => previewValuesFor(definition.fields, testValues, previewUser),
    [definition.fields, testValues, previewUser],
  );
  function patchField(id: string, patch: Partial<WorkflowField>) {
    setDefinition(value => ({ ...value, fields: value.fields.map(field => field.id === id ? { ...field, ...patch } : field) }));
    setSaved(false);
  }
  function addField(type: FieldType) {
    const field = blankField(type);
    setDefinition(value => ({ ...value, fields: [...value.fields, field] }));
    setSelectedId(field.id);
    setSaved(false);
  }
  function patchStage(id: string, patch: Partial<WorkflowStage>) {
    setDefinition(value => ({ ...value, stages: value.stages.map(stage => stage.id === id ? { ...stage, ...patch } : stage) }));
    setSaved(false);
  }
  function validatePreview() {
    const errors: Record<string, string> = {};
    definition.fields.forEach(field => {
      if (!isPreviewFieldVisible(field, definition.fields, previewValues, previewUser)) return;
      const value = previewValues[field.id];
      const required = field.required || Boolean(expressionResult(field.requiredIf, definition.fields, { ...previewValues, _THIS: value }, false, previewUser));
      if (required && (field.type === 'checkbox' ? value !== true : Array.isArray(value) ? !value.length : String(value ?? '').trim() === '')) errors[field.id] = 'This field is required.';
      else if (['number', 'decimal', 'percent', 'price'].includes(field.type) && String(value ?? '').trim() && !Number.isFinite(Number(value))) errors[field.id] = 'Enter a valid number.';
      else if (['number', 'decimal', 'percent', 'price'].includes(field.type) && value !== undefined && field.min != null && Number(value) < field.min) errors[field.id] = `Enter a number of at least ${field.min}.`;
      else if (['number', 'decimal', 'percent', 'price'].includes(field.type) && value !== undefined && field.max != null && Number(value) > field.max) errors[field.id] = `Enter a number no greater than ${field.max}.`;
      else if (typeof value === 'string' && field.minLength != null && value.length < field.minLength) errors[field.id] = `Use at least ${field.minLength} characters.`;
      else if (typeof value === 'string' && field.maxLength != null && value.length > field.maxLength) errors[field.id] = `Use no more than ${field.maxLength} characters.`;
      else if (field.validIf) {
        const validation = expressionResult(field.validIf, definition.fields, { ...previewValues, _THIS: value }, false, previewUser);
        const valid = typeof validation === 'boolean'
          ? validation
          : Array.isArray(validation)
            ? (Array.isArray(value) ? value.every(item => validation.some(option => String(option) === String(item))) : validation.some(option => String(option) === String(value)))
            : false;
        if (!valid) errors[field.id] = field.invalidMessage || 'This answer is not valid.';
      }
    });
    setPreviewErrors(errors);
  }
  function payload(): WorkflowInput {
    return {
      ...definition, name: definition.name.trim(), category: definition.category.trim(), description: definition.description.trim(),
      fields: definition.fields.map(field => ({ ...toInput(field), label: field.label.trim(), options: field.options?.map(option => option.trim()).filter(Boolean) })),
      stages: definition.stages.map((stage, index) => ({ ...stage, name: stage.name.trim(), order: index + 1, assigneeLabel: stage.assigneeType === 'manager' ? 'Manager' : stage.assigneeLabel, ...(stage.conditionFieldId ? {} : { conditionFieldId: null, conditionValue: null }) })),
    };
  }
  function save(event: FormEvent, intent: 'draft' | 'publish' = 'draft') {
    event.preventDefault();
    setValidated(true); setSaveError('');
    if (issues.length) return;
    const data = payload();
    const finish = (result: { id: string }) => {
      void qc.invalidateQueries({ queryKey: getListWorkflowsQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      setSaved(true);
      if (!workflowId) setLocation(`/workflows/${result.id}/edit`);
    };
    if (workflowId) {
      const updateData = { ...data, status: intent === 'publish' ? 'active' as const : workflowStatus === 'active' ? 'active' as const : 'draft' as const };
      update.mutate({ workflowId, data: updateData }, { onSuccess: finish, onError: () => setSaveError('The workflow could not be saved. Please try again.') });
    } else {
      create.mutate({ data }, {
        onSuccess: result => {
          if (intent === 'publish') {
            update.mutate({ workflowId: result.id, data: { ...data, status: 'active' } }, {
              onSuccess: finish,
              onError: () => { setSaveError('The workflow was created as a draft, but could not be published. Please try again.'); setLocation(`/workflows/${result.id}/edit`); },
            });
          } else finish(result);
        },
        onError: () => setSaveError('The workflow could not be saved. Please try again.'),
      });
    }
    setPublishConfirm(false);
  }
  function submitDraft(event: FormEvent) { save(event, 'draft'); }
  function submitPublish() {
    if (issues.length) { setValidated(true); setPublishConfirm(false); return; }
    const fakeEvent = { preventDefault() {} } as FormEvent;
    save(fakeEvent, 'publish');
  }
  if (current.isLoading) return <div className="workflow-editor-loading" aria-label="Loading workspace permissions"><div /><div /><div /></div>;
  if (!canBuild) return <section className="surface workflow-editor-error" role="alert"><CircleAlert /><h1>Builder access required</h1><p>Ask a workspace administrator to grant build access. Workflow Owner access remains supported.</p><Button className="button-outline" onClick={() => setLocation('/workflows')}>Back to workflows</Button></section>;
  if (workflowId && detail.isLoading) return <div className="workflow-editor-loading" aria-label="Loading workflow"><div /><div /><div /></div>;
  if (workflowId && detail.isError) return <section className="surface workflow-editor-error"><CircleAlert /><h1>Workflow unavailable</h1><p>This workflow could not be loaded. Your changes have not been touched.</p><Button className="button-outline" onClick={() => void detail.refetch()}>Try again</Button></section>;

  return <div className="flow-builder enter">
    <header className="fb-toolbar">
      <button className="fb-back" type="button" onClick={() => setLocation('/workflows')} data-testid="button-editor-back"><ArrowLeft size={16} /><span>Workflows</span></button>
      <div className="fb-breadcrumb"><span>WORKFLOW BUILDER</span><i>/</i><b>{workflowId ? 'EDIT' : 'NEW FORM'}</b></div>
      <div className="fb-actions">
        <span className={`fb-save-state ${saved ? 'is-saved' : ''}`} aria-live="polite">{saved ? <><Check size={13} /> Saved just now</> : workflowStatus === 'active' ? 'Published workflow' : 'Draft definition'}</span>
        <Button className="button-outline fb-preview-button" type="button" onClick={() => setPreviewOpen(true)} data-testid="button-preview"><Eye size={15} /> Preview</Button>
        <Button className="button-outline fb-save-button" type="button" disabled={busy || issues.length > 0} onClick={e => save(e as unknown as FormEvent, 'draft')} data-testid="button-save-draft">{busy ? 'Saving…' : 'Save draft'}</Button>
        <Button className="button-primary fb-publish-button" type="button" disabled={busy} onClick={() => { setValidated(true); if (!issues.length) setPublishConfirm(true); }} data-testid="button-publish">{busy ? 'Saving…' : workflowStatus === 'active' ? 'Save & publish' : 'Publish'} <ArrowRight size={15} /></Button>
      </div>
    </header>
    <form id="workflow-definition" onSubmit={submitDraft}>
      <div className="fb-titlebar">
        <div className="fb-title-copy"><div className="eyebrow">FORM DESIGNER <span>·</span> {workflowStatus === 'active' ? 'LIVE WORKFLOW' : 'UNPUBLISHED'}</div><input className="fb-name-input" value={definition.name} onChange={e => { setDefinition(value => ({ ...value, name: e.target.value })); setSaved(false); }} placeholder="Untitled workflow" aria-label="Workflow name" data-testid="input-workflow-name" /><span className="fb-title-sub">Shape the request first. Route it when it’s ready.</span></div>
        <div className="fb-title-meta"><Label title="Category"><input className={inputClass} value={definition.category} onChange={e => setDefinition(value => ({ ...value, category: e.target.value }))} placeholder="Operations" data-testid="input-workflow-category" /></Label><Label title="Routing"><select className={inputClass} value={definition.routing} onChange={e => setDefinition(value => ({ ...value, routing: e.target.value as WorkflowInput['routing'] }))} data-testid="select-routing-style"><option value="sequential">Sequential</option><option value="parallel">Parallel</option><option value="conditional">Conditional</option></select></Label></div>
      </div>
      <div className="fb-workspace">
        <aside className="fb-palette">
          <div className="fb-panel-heading"><div><span className="section-label">BUILDING BLOCKS</span><h2>Field types</h2></div><span className="fb-count">{definition.fields.length}</span></div>
          <label className="fb-search"><Search size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a field…" aria-label="Search field types" data-testid="input-search-field-types" /></label>
          <div className="fb-palette-section"><span>INPUT FIELDS</span><div className="fb-type-list">{filteredTypes.map(item => <button key={item.type} type="button" className="fb-type-button" onClick={() => addField(item.type)} data-testid={`button-add-${item.type}`}><span className="fb-type-icon"><item.icon size={15} /></span><span>{item.label}</span><Plus size={13} className="fb-type-plus" /></button>)}</div></div>
          <div className="fb-palette-foot"><span className="fb-foot-mark"><GripVertical size={15} /></span><span>Select a type to add it<br />to the form canvas.</span></div>
        </aside>
        <main className="fb-center">
          <div className="fb-canvas-top"><div><span className="section-label">REQUEST FORM</span><h2>Canvas <span>{definition.fields.length} {definition.fields.length === 1 ? 'field' : 'fields'}</span></h2></div><button type="button" className="fb-canvas-add" onClick={() => addField('text')} data-testid="button-canvas-add-field"><Plus size={15} /> Add field</button></div>
          <section className="fb-canvas" aria-label="Form canvas" data-testid="form-canvas">
            <div className="fb-form-sheet">
              <div className="fb-sheet-heading"><span className="fb-sheet-mark">F</span><div><b>{definition.name || 'Untitled workflow'}</b><small>{definition.description || 'Add a brief description to guide the requester.'}</small></div><span className="fb-sheet-chip">{definition.category || 'Category'}</span></div>
              <div className="fb-canvas-fields">
                {definition.fields.map((field, index) => <button key={field.id} type="button" className={`fb-field-block ${selectedId === field.id ? 'is-selected' : ''} ${field.hidden ? 'is-hidden' : ''}`} style={{ gridColumn: `span ${Math.min(6, Math.max(1, field.width || 6))}` }} onClick={() => setSelectedId(field.id)} data-testid={`canvas-field-${field.id}`} aria-pressed={selectedId === field.id}>
                  <div className="fb-field-block-top"><span className="fb-type-badge">{fieldTypes.find(item => item.type === field.type)?.label || field.type}</span><span className="fb-field-index">FIELD {String(index + 1).padStart(2, '0')}</span>{field.required && <span className="fb-required-mark">Required</span>}</div>
                  <strong>{field.label || 'Untitled field'}</strong>
                  <div className="fb-canvas-control">{field.type === 'show' ? (field.helpText || field.placeholder || 'Presentational content') : ['textarea', 'longtext', 'address'].includes(field.type) ? 'Long answer' : choiceTypes.has(field.type) ? (field.options?.[0] || 'Add an option') : field.type === 'checkbox' || field.type === 'yesno' ? field.placeholder || 'Choose an option' : uploadTypes.has(field.type) ? 'Private upload' : field.placeholder || 'Your answer'}</div>
                  {field.helpText && <small className="fb-block-help">{field.helpText}</small>}
                </button>)}
                {!definition.fields.length && <div className="fb-canvas-empty"><div className="fb-empty-icon"><Plus size={20} /></div><h3>Start with a question</h3><p>Choose a field type from the left to shape the request form.</p><button type="button" onClick={() => addField('text')} data-testid="button-empty-add-field">Add your first field <ArrowRight size={14} /></button></div>}
              </div>
              {definition.fields.length > 0 && <div className="fb-sheet-footer"><span><ShieldCheck size={14} /> Requester details are collected securely</span><span>{definition.fields.length} questions</span></div>}
            </div>
            <div className="fb-canvas-footnote"><span><Settings2 size={13} /> Form settings</span><span>Responsive layout · 6-column grid</span></div>
          </section>
          <section className="fb-details-card">
            <div className="fb-section-title"><div><span className="fb-section-number">01</span><div><h2>Form introduction</h2><p>Give requesters the context they need before they begin.</p></div></div></div>
            <Label title="Description"><textarea className={`${inputClass} fb-description`} value={definition.description} placeholder="What is this workflow for? Include any guidance that will help someone submit a complete request." onChange={e => setDefinition(value => ({ ...value, description: e.target.value }))} data-testid="input-workflow-description" /></Label>
          </section>
          <section className="fb-details-card fb-approval-card">
            <div className="fb-section-title"><div><span className="fb-section-number">02</span><div><h2>Approval route</h2><p>Each stage has a clear owner and response window.</p></div></div><Button className="button-outline" type="button" onClick={() => setDefinition(value => ({ ...value, stages: [...value.stages, blankStage(value.stages.length + 1)] }))} data-testid="button-add-stage"><Plus size={14} /> Add stage</Button></div>
            <div className="fb-stage-list">{definition.stages.map((stage, index) => <article key={stage.id} className="fb-stage-row">
              <div className="fb-stage-number">{String(index + 1).padStart(2, '0')}</div><div className="fb-stage-fields">
                <Label title="Stage name"><input className={inputClass} value={stage.name} onChange={e => patchStage(stage.id, { name: e.target.value })} placeholder="e.g. Finance review" data-testid={`input-stage-name-${stage.id}`} /></Label>
                <Label title="Approver"><select className={inputClass} value={stage.assigneeType} onChange={e => { const type = e.target.value as WorkflowStage['assigneeType']; patchStage(stage.id, { assigneeType: type, assigneeId: null, assigneeLabel: type === 'manager' ? 'Manager' : '' }); }} data-testid={`select-stage-owner-type-${stage.id}`}><option value="manager">Requester’s manager</option><option value="role">Workspace role</option><option value="user">Specific person</option></select></Label>
                {stage.assigneeType !== 'manager' && <Label title={stage.assigneeType === 'role' ? 'Role' : 'Team member'}><select className={inputClass} value={stage.assigneeId || ''} onChange={e => { const person = stage.assigneeType === 'role' ? roles.data?.find(item => item.id === e.target.value) : users.data?.find(item => item.id === e.target.value); patchStage(stage.id, { assigneeId: person?.id || null, assigneeLabel: person?.name || '' }); }} data-testid={`select-stage-assignee-${stage.id}`}><option value="">Choose owner</option>{stage.assigneeType === 'role' ? roles.data?.map(role => <option key={role.id} value={role.id}>{role.name}</option>) : users.data?.filter(person => person.status === 'active').map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Label>}
                <Label title="SLA · hours"><input className={inputClass} type="number" min="1" value={stage.slaHours} onChange={e => patchStage(stage.id, { slaHours: Number(e.target.value) })} data-testid={`input-stage-sla-${stage.id}`} /></Label>
                {definition.routing === 'conditional' && <div className="fb-condition"><span>RUN WHEN</span><select className={inputClass} value={stage.conditionFieldId || ''} onChange={e => patchStage(stage.id, { conditionFieldId: e.target.value || null, conditionValue: e.target.value ? stage.conditionValue || '' : null })} data-testid={`select-stage-condition-field-${stage.id}`}><option value="">Always run</option>{definition.fields.map(field => <option key={field.id} value={field.id}>{field.label || 'Untitled field'}</option>)}</select>{stage.conditionFieldId && <input className={inputClass} value={stage.conditionValue || ''} onChange={e => patchStage(stage.id, { conditionValue: e.target.value })} placeholder="Matching answer" data-testid={`input-stage-condition-value-${stage.id}`} />}</div>}
                <div className="fb-stage-foot"><span><Clock3 size={13} /> {stage.slaHours || 0} hour response window</span><button type="button" className="fb-remove-button" disabled={definition.stages.length === 1} onClick={() => setDefinition(value => ({ ...value, stages: value.stages.filter(item => item.id !== stage.id) }))} data-testid={`button-remove-stage-${stage.id}`}><Trash2 size={13} /> Remove stage</button></div>
              </div>
            </article>)}</div>
          </section>
        </main>
        <aside className="fb-properties">
          <div className="fb-properties-head"><div><span className="section-label">FIELD PROPERTIES</span><h2>{selected ? (fieldTypes.find(item => item.type === selected.type)?.label || 'Field') : 'No selection'}</h2></div>{selected && <button type="button" className="fb-prop-close" aria-label="Remove selected field" onClick={() => { if (definition.fields.length > 1) { const next = definition.fields.filter(item => item.id !== selected.id); setDefinition(value => ({ ...value, fields: next })); setSelectedId(next[0]?.id || ''); } }} data-testid={`button-remove-selected-${selected.id}`}><Trash2 size={15} /></button>}</div>
          {selected ? <div className="fb-property-content">
            <div className="fb-prop-group"><span className="fb-prop-label">IDENTITY</span><Label title="Field key" hint="Stable identifier used in submitted data."><input className={inputClass} value={selected.key || ''} placeholder={selected.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field_key'} onChange={e => patchField(selected.id, { key: e.target.value || undefined })} data-testid={`input-field-key-${selected.id}`} /></Label><Label title="Label"><input className={inputClass} value={selected.label} onChange={e => patchField(selected.id, { label: e.target.value })} placeholder="Question label" data-testid={`input-field-label-${selected.id}`} /></Label><Label title="Placeholder"><input className={inputClass} value={selected.placeholder || ''} onChange={e => patchField(selected.id, { placeholder: e.target.value || undefined })} placeholder="Help the requester answer…" data-testid={`input-field-placeholder-${selected.id}`} /></Label><Label title="Help text"><input className={inputClass} value={selected.helpText || ''} onChange={e => patchField(selected.id, { helpText: e.target.value || undefined })} placeholder="Additional guidance" data-testid={`input-field-help-${selected.id}`} /></Label></div>
            <div className="fb-prop-group"><span className="fb-prop-label">STATE</span><label className="fb-switch-row"><span>Required</span><input type="checkbox" checked={selected.required} onChange={e => patchField(selected.id, { required: e.target.checked })} data-testid={`toggle-field-required-${selected.id}`} /></label><label className="fb-switch-row"><span>Read-only</span><input type="checkbox" checked={Boolean(selected.readOnly)} onChange={e => patchField(selected.id, { readOnly: e.target.checked })} data-testid={`toggle-field-readonly-${selected.id}`} /></label><label className="fb-switch-row"><span>Hidden</span><input type="checkbox" checked={Boolean(selected.hidden)} onChange={e => patchField(selected.id, { hidden: e.target.checked })} data-testid={`toggle-field-hidden-${selected.id}`} /></label><Label title="Initial value"><input className={inputClass} value={selected.defaultValue || ''} onChange={e => patchField(selected.id, { defaultValue: e.target.value || undefined })} placeholder="Optional default" data-testid={`input-field-default-${selected.id}`} /></Label></div>
             {choiceTypes.has(selected.type) && selected.type !== 'progress' && <div className="fb-prop-group"><span className="fb-prop-label">OPTIONS</span><Label title={selected.type === 'lookup' || selected.type === 'ref' ? 'Configured values · one per line' : 'Choices · one per line'}><textarea className={`${inputClass} fb-options-input`} value={(selected.options || []).join('\n')} onChange={e => patchField(selected.id, { options: e.target.value.split('\n') })} placeholder={'New request\nChange request\nRenewal'} data-testid={`input-field-options-${selected.id}`} /></Label><span className="fb-prop-hint">Each line becomes one selectable option.</span>{['multiselect', 'enumlist'].includes(selected.type) && <label className="fb-switch-row"><span>Allow multiple selections</span><input type="checkbox" checked={selected.multiple !== false} onChange={e => patchField(selected.id, { multiple: e.target.checked })} data-testid={`toggle-field-multiple-${selected.id}`} /></label>}</div>}
             {['text', 'textarea', 'longtext', 'name', 'email', 'phone', 'url', 'address'].includes(selected.type) && <div className="fb-prop-group"><span className="fb-prop-label">VALIDATION</span><div className="fb-two-inputs"><Label title="Min length"><input className={inputClass} type="number" min="0" value={selected.minLength ?? ''} onChange={e => patchField(selected.id, { minLength: e.target.value === '' ? null : Number(e.target.value) })} data-testid={`input-field-min-length-${selected.id}`} /></Label><Label title="Max length"><input className={inputClass} type="number" min="0" value={selected.maxLength ?? ''} onChange={e => patchField(selected.id, { maxLength: e.target.value === '' ? null : Number(e.target.value) })} data-testid={`input-field-max-length-${selected.id}`} /></Label></div></div>}
             {['number', 'decimal', 'percent', 'price'].includes(selected.type) && <div className="fb-prop-group"><span className="fb-prop-label">RANGE</span><div className="fb-two-inputs"><Label title="Minimum"><input className={inputClass} type="number" step={selected.type === 'number' ? 1 : 'any'} value={selected.min ?? ''} onChange={e => patchField(selected.id, { min: e.target.value === '' ? null : Number(e.target.value) })} data-testid={`input-field-min-${selected.id}`} /></Label><Label title="Maximum"><input className={inputClass} type="number" step={selected.type === 'number' ? 1 : 'any'} value={selected.max ?? ''} onChange={e => patchField(selected.id, { max: e.target.value === '' ? null : Number(e.target.value) })} data-testid={`input-field-max-${selected.id}`} /></Label></div>{selected.type === 'percent' && <small>Stored as a fraction: 0.25 is 25%.</small>}</div>}
             {uploadTypes.has(selected.type) && <div className="fb-prop-group"><span className="fb-prop-label">UPLOAD RULES</span><label className="fb-switch-row"><span>Allow multiple files</span><input type="checkbox" checked={Boolean(selected.multiple)} onChange={e => patchField(selected.id, { multiple: e.target.checked, maxFiles: e.target.checked ? selected.maxFiles || 5 : 1 })} data-testid={`toggle-field-file-multiple-${selected.id}`} /></label><Label title="Accepted file types"><input className={inputClass} value={selected.accept || ''} onChange={e => patchField(selected.id, { accept: e.target.value || undefined })} placeholder={uploadAccept[selected.type] || ".pdf, .png"} data-testid={`input-field-accept-${selected.id}`} /></Label><div className="fb-two-inputs"><Label title="Max files"><input className={inputClass} type="number" min="1" max="10" value={selected.maxFiles || 1} onChange={e => patchField(selected.id, { maxFiles: Number(e.target.value) })} data-testid={`input-field-max-files-${selected.id}`} /></Label><Label title="Size · MB"><input className={inputClass} type="number" min="1" max="25" value={selected.maxFileSizeMB || 10} onChange={e => patchField(selected.id, { maxFileSizeMB: Number(e.target.value) })} data-testid={`input-field-max-size-${selected.id}`} /></Label></div></div>}
             <div className="fb-prop-group"><span className="fb-prop-label">EXPRESSIONS</span><span className="fb-prop-hint">Safe AppSheet-style expressions. Reference fields as [Field label] and use only listed functions.</span>
               {([['initialValueExpression', 'Initial value expression'], ['appFormula', 'App formula'], ['showIf', 'Show if'], ['requiredIf', 'Required if'], ['validIf', 'Valid if']] as const).map(([key, title]) => {
                 const source = selected[key] || '';
                 const check = source ? validateExpression(source, definition.fields) : null;
                 return <Label key={key} title={title} hint={key === 'appFormula' ? 'Formula fields are read-only; the server recomputes their submitted value.' : undefined}><textarea className={`${inputClass} fb-options-input`} value={source} placeholder={key === 'showIf' ? ' [Status] = "Ready"' : 'IF([Amount] > 0, [Amount], 0)'} onChange={e => patchField(selected.id, { [key]: e.target.value || undefined })} data-testid={`input-expression-${key}-${selected.id}`} />{check && !check.valid && <small className="form-error">{check.error}</small>}{key === 'appFormula' && source && check?.valid && <small>Preview result: {String(expressionResult(source, definition.fields, previewValues, '—', previewUser))}</small>}<details className="fb-prop-hint"><summary>Function catalog · insert a function</summary>{expressionFunctions.map(fn => <button key={fn.name} type="button" className="fb-function-suggestion" title={`${fn.description} Example: ${fn.example}`} onClick={() => patchField(selected.id, { [key]: `${source}${source ? ' ' : ''}${fn.name}(` })}>{fn.signature}</button>)}</details></Label>;
               })}
               <Label title="Invalid answer message"><input className={inputClass} value={selected.invalidMessage || ''} onChange={e => patchField(selected.id, { invalidMessage: e.target.value || undefined })} placeholder="Explain what needs to change" data-testid={`input-invalid-message-${selected.id}`} /></Label>
               <details className="fb-prop-hint"><summary>Function catalog</summary>{expressionFunctions.map(fn => <div key={fn.name}><b>{fn.signature}</b><small>{fn.description} Example: {fn.example}</small></div>)}</details>
             </div>
            {selected.type !== 'checkbox' && <div className="fb-prop-group"><span className="fb-prop-label">APPEARANCE</span><span className="fb-prop-hint">Choose how much space the field occupies.</span><div className="fb-width-picker" role="group" aria-label="Field width">{[1, 2, 3, 4, 5, 6].map(width => <button type="button" className={(selected.width || 6) === width ? 'active' : ''} key={width} onClick={() => patchField(selected.id, { width })} aria-label={`${width} of 6 columns`} aria-pressed={(selected.width || 6) === width} data-testid={`button-field-width-${width}`}>{width}</button>)}</div><div className="fb-two-inputs"><Label title="Prefix"><input className={inputClass} value={selected.prefix || ''} onChange={e => patchField(selected.id, { prefix: e.target.value || undefined })} placeholder="$" data-testid={`input-field-prefix-${selected.id}`} /></Label><Label title="Suffix"><input className={inputClass} value={selected.suffix || ''} onChange={e => patchField(selected.id, { suffix: e.target.value || undefined })} placeholder="USD" data-testid={`input-field-suffix-${selected.id}`} /></Label></div></div>}
            <div className="fb-prop-group"><span className="fb-prop-label">DISPLAY CONDITION</span><Label title="Show this field when"><select className={inputClass} value={selected.displayCondition?.fieldId || ''} onChange={e => patchField(selected.id, { displayCondition: e.target.value ? { fieldId: e.target.value, operator: selected.displayCondition?.operator || 'equals', value: selected.displayCondition?.value || '' } : null })} data-testid={`select-field-condition-${selected.id}`}><option value="">Always visible</option>{definition.fields.filter(field => field.id !== selected.id).map(field => <option key={field.id} value={field.id}>{field.label || 'Untitled field'}</option>)}</select></Label>{selected.displayCondition && <><Label title="Condition"><select className={inputClass} value={selected.displayCondition.operator} onChange={e => patchField(selected.id, { displayCondition: { ...selected.displayCondition!, operator: e.target.value as NonNullable<WorkflowField['displayCondition']>['operator'] } })} data-testid={`select-field-condition-operator-${selected.id}`}><option value="equals">Equals</option><option value="notEquals">Does not equal</option><option value="contains">Contains</option></select></Label><Label title="Answer"><input className={inputClass} value={selected.displayCondition.value} onChange={e => patchField(selected.id, { displayCondition: { ...selected.displayCondition!, value: e.target.value } })} placeholder="Match value" data-testid={`input-field-condition-value-${selected.id}`} /></Label></>}</div>
          </div> : <div className="fb-properties-empty"><Settings2 size={20} /><b>Select a field</b><span>Choose a field on the canvas to edit its label, behavior, and validation.</span></div>}
          <div className="fb-validation-mini"><div className="fb-prop-label">DEFINITION CHECK</div><div className={`fb-mini-check ${issues.length ? '' : 'good'}`}><span>{issues.length ? <CircleAlert size={14} /> : <ShieldCheck size={14} />}</span><div><b>{issues.length ? `${issues.length} checks to resolve` : 'All checks passed'}</b><small>{issues.length ? 'Fix required details to publish.' : 'Ready to save or publish.'}</small></div></div>{validated && issues.length > 0 && <ul className="fb-issue-list">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div>
        </aside>
      </div>
    </form>
    {saveError && <div className="fb-toast-error" role="alert"><CircleAlert size={16} />{saveError}<button type="button" onClick={() => setSaveError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
    {publishConfirm && <div className="fb-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPublishConfirm(false); }}><section className="fb-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="publish-title"><span className="fb-modal-icon"><ShieldCheck size={19} /></span><h2 id="publish-title">Publish this workflow?</h2><p>{workflowStatus === 'active' ? 'Your updates will become the live request form.' : 'Requesters will be able to submit this form as soon as it is published.'}</p><div className="fb-modal-actions"><Button className="button-outline" type="button" onClick={() => setPublishConfirm(false)} data-testid="button-cancel-publish">Keep editing</Button><Button className="button-primary" type="button" disabled={busy} onClick={submitPublish} data-testid="button-confirm-publish">{busy ? 'Publishing…' : 'Publish workflow'} <ArrowRight size={14} /></Button></div></section></div>}
    {previewOpen && <div className="fb-modal-backdrop fb-preview-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPreviewOpen(false); }}><section className="fb-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title"><header className="fb-preview-modal-head"><div><span className="section-label">REQUESTER VIEW</span><h2 id="preview-title">{definition.name || 'Untitled workflow'}</h2><p>{definition.description || 'This is the form requesters will see.'}</p></div><button type="button" className="fb-modal-close" onClick={() => setPreviewOpen(false)} aria-label="Close preview" data-testid="button-close-preview"><X size={19} /></button></header><div className="fb-preview-body"><div className="fb-preview-category">{definition.category} <span>·</span> {definition.fields.length} fields</div>{definition.fields.filter(field => isPreviewFieldVisible(field, definition.fields, previewValues)).map(field => <div className="fb-preview-input" key={field.id}><label htmlFor={`test-${field.id}`}>{field.label || 'Untitled field'}{field.required && <i>Required</i>}</label>{field.helpText && <small>{field.helpText}</small>}<PreviewControl field={field} value={previewValues[field.id]} people={users.data ?? []} onChange={value => setTestValues(values => ({ ...values, [field.id]: value }))} error={previewErrors[field.id]} /></div>)}{!definition.fields.length && <div className="fb-preview-empty">Your form has no fields yet. Add questions in the builder to see them here.</div>}<div className="fb-preview-footer"><Button type="button" className="button-primary" onClick={validatePreview} data-testid="button-test-preview">Check answers <ArrowRight size={14} /></Button><span>This preview won’t submit a request.</span></div></div></section></div>}
  </div>;
}

function PreviewControl({ field, value, people, onChange, error }: { field: WorkflowField; value: unknown; people: Array<{ id: string; name: string }>; onChange: (value: unknown) => void; error?: string }) {
  const common = { id: `test-${field.id}`, className: inputClass, placeholder: field.placeholder || (field.type === 'duration' ? 'HH:MM:SS' : ''), disabled: Boolean(field.readOnly || field.appFormula), 'aria-invalid': Boolean(error), 'data-testid': `preview-input-${field.id}` };
  const text = String(value ?? field.defaultValue ?? '');
  let control: ReactNode;
  if (field.type === 'show') return <div className="fb-prop-hint">{field.helpText || field.placeholder || field.label}</div>;
  if (['textarea', 'longtext', 'address'].includes(field.type)) control = <textarea {...common} value={text} minLength={field.minLength ?? undefined} maxLength={field.maxLength ?? undefined} onChange={e => onChange(e.target.value)} />;
  else if (['select', 'enum', 'lookup', 'ref', 'progress'].includes(field.type)) {
    const options = field.type === 'progress' ? progressOptions : field.options || [];
    control = <select {...common} value={text} onChange={e => onChange(e.target.value)}><option value="">Choose an option</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select>;
  }
  else if (['multiselect', 'enumlist'].includes(field.type)) control = <select {...common} multiple value={Array.isArray(value) ? value as string[] : []} onChange={e => onChange(Array.from(e.target.selectedOptions, option => option.value))}>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select>;
  else if (field.type === 'radio') control = <div className="fb-preview-choice-list">{(field.options || []).map(option => <label key={option}><input type="radio" name={`radio-${field.id}`} value={option} checked={value === option} disabled={Boolean(field.readOnly || field.appFormula)} onChange={() => onChange(option)} data-testid={`preview-radio-${field.id}`} />{option}</label>)}</div>;
  else if (field.type === 'checkbox') control = <label className="fb-preview-checkbox"><input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} disabled={Boolean(field.readOnly || field.appFormula)} data-testid={`preview-input-${field.id}`} />{field.placeholder || 'Yes'}</label>;
  else if (field.type === 'yesno') control = <div className="fb-preview-choice-list">{[['true', 'Yes'], ['false', 'No']].map(([choice, label]) => <label key={choice}><input type="radio" name={`yesno-${field.id}`} checked={String(value) === choice} disabled={Boolean(field.readOnly || field.appFormula)} onChange={() => onChange(choice === 'true')} data-testid={`preview-input-${field.id}-${choice}`} />{label}</label>)}</div>;
  else if (uploadTypes.has(field.type)) control = <input {...common} type="file" accept={field.accept || uploadAccept[field.type]} multiple={Boolean(field.multiple)} onChange={e => onChange(Array.from(e.target.files ?? [], file => file.name))} data-testid={`preview-input-${field.id}`} />;
  else if (field.type === 'people') control = <select {...common} multiple={Boolean(field.multiple)} value={field.multiple ? Array.isArray(value) ? value as string[] : [] : text} onChange={e => onChange(field.multiple ? Array.from(e.target.selectedOptions, option => option.value) : e.target.value)}><option value="">Choose a person</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>;
  else if (field.type === 'location' || field.type === 'latlong' || field.type === 'xy') control = <input {...common} type="text" value={text} placeholder={field.placeholder || 'Enter coordinates or location'} onChange={e => onChange(e.target.value)} />;
  else if (field.type === 'percent') control = <div className="flex items-center gap-2"><input {...common} type="number" step="any" value={text === '' ? '' : String(Number(text) * 100)} min={field.min == null ? undefined : field.min * 100} max={field.max == null ? undefined : field.max * 100} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value) / 100)} /><span>%</span></div>;
  else if (field.type === 'color') control = <select {...common} value={text} onChange={e => onChange(e.target.value)}><option value="">Choose a color</option>{colorOptions.map(color => <option key={color} value={color}>{color}</option>)}{text && !colorOptions.includes(text) && <option value={text}>{text}</option>}</select>;
  else control = <input {...common} type={field.type === 'datetime' ? 'datetime-local' : field.type === 'video' ? 'url' : ['number', 'decimal', 'price'].includes(field.type) ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'url' ? 'url' : 'text'} step={field.type === 'number' ? 1 : 'any'} value={text} min={['number', 'decimal', 'price'].includes(field.type) ? field.min ?? undefined : undefined} max={['number', 'decimal', 'price'].includes(field.type) ? field.max ?? undefined : undefined} minLength={field.minLength ?? undefined} maxLength={field.maxLength ?? undefined} onChange={e => onChange(e.target.value)} />;
  return <>{control}{error && <span className="fb-preview-error" role="alert">{error}</span>}</>;
}
