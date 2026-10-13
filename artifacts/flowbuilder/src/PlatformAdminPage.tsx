import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2, Check, ChevronDown, CircleAlert, Clock3,
  Globe2, Layers3, LoaderCircle, Pencil, Plus, RefreshCw, Search, Settings2, Shield,
  Users, Workflow, X,
} from 'lucide-react';
import {
  getListPlatformTenantsQueryKey, useCreatePlatformTenant, useListPlatformTenants,
  useUpdatePlatformTenant,
} from '@workspace/api-client-react';
import type { PlatformTenant, PlatformTenantInput, PlatformTenantUpdate } from '@workspace/api-client-react';

type Plan = PlatformTenant['plan'];
type TenantForm = {
  name: string; adminName: string; adminEmail: string; plan: Plan;
  memberLimit: string; requestLimit: string; logoUrl: string; primaryColor: string; customDomain: string;
};
type FormErrors = Partial<Record<keyof TenantForm, string>>;

const emptyForm: TenantForm = {
  name: '', adminName: '', adminEmail: '', plan: 'starter', memberLimit: '20',
  requestLimit: '10000', logoUrl: '', primaryColor: '', customDomain: '',
};
const plans: Array<{ value: Plan; label: string; detail: string }> = [
  { value: 'starter', label: 'Starter', detail: 'For a team getting organized' },
  { value: 'professional', label: 'Professional', detail: 'For growing operations' },
  { value: 'enterprise', label: 'Enterprise', detail: 'For complex organizations' },
];

function cx(...parts: Array<string | false | undefined>) { return parts.filter(Boolean).join(' '); }
function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'The change could not be saved. Your entries are still here—please try again.';
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
function validate(form: TenantForm, creating: boolean): FormErrors {
  const errors: FormErrors = {};
  if (form.name.trim().length < 2) errors.name = 'Enter a workspace name with at least 2 characters.';
  if (creating && form.adminName.trim().length < 2) errors.adminName = 'Enter the first admin’s name.';
  if (creating && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail.trim())) errors.adminEmail = 'Enter a valid email address.';
  for (const key of ['memberLimit', 'requestLimit'] as const) {
    const value = Number(form[key]);
    if (!Number.isInteger(value) || value < 1) errors[key] = 'Set a whole-number limit of at least 1.';
  }
  const logo = form.logoUrl.trim();
  if (logo && !isHttpsUrl(logo)) errors.logoUrl = 'Use a complete https:// URL.';
  const domain = form.customDomain.trim();
  if (domain && !/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain)) {
    errors.customDomain = 'Enter a domain such as approvals.company.com.';
  }
  if (form.primaryColor.trim() && !/^#[0-9a-fA-F]{6}$/.test(form.primaryColor.trim())) errors.primaryColor = 'Use a six-digit hex color, such as #397e63.';
  return errors;
}
function isHttpsUrl(value: string) {
  try { const parsed = new URL(value); return parsed.protocol === 'https:'; }
  catch { return false; }
}

function UsageMeter({ label, used, limit, icon }: { label: string; used: number; limit: number; icon: ReactNode }) {
  const ratio = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const exceeded = used > limit;
  return <div className="pa-usage">
    <div className="pa-usage-top"><span className="pa-usage-label">{icon}{label}</span><span className={cx('pa-usage-numbers', exceeded && 'is-over')}>{used.toLocaleString()} <i>/</i> {limit.toLocaleString()}</span></div>
    <div className="pa-track" role="meter" aria-label={`${label} usage`} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
      <span className={cx(exceeded && 'is-over')} style={{ width: `${ratio}%` }} />
    </div>
  </div>;
}

function TenantDialog({ tenant, onClose, onSaved }: { tenant?: PlatformTenant; onClose: () => void; onSaved: () => void }) {
  const create = useCreatePlatformTenant();
  const update = useUpdatePlatformTenant();
  const creating = !tenant;
  const [form, setForm] = useState<TenantForm>(() => tenant ? {
    ...emptyForm, name: tenant.name, plan: tenant.plan, memberLimit: String(tenant.memberLimit),
    requestLimit: String(tenant.requestLimit), logoUrl: tenant.branding.logoUrl || '',
    primaryColor: tenant.branding.primaryColor || '', customDomain: tenant.branding.customDomain || '',
  } : emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const busy = create.isPending || update.isPending;
  const set = (key: keyof TenantForm, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
    setServerError('');
  };
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [busy, onClose]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(form, creating);
    setErrors(nextErrors);
    setServerError('');
    if (Object.keys(nextErrors).length) return;
    const branding = {
      logoUrl: form.logoUrl.trim() || null,
      primaryColor: form.primaryColor.trim() || null,
      customDomain: form.customDomain.trim().toLowerCase() || null,
    };
    const onSuccess = () => onSaved();
    const onError = (error: unknown) => setServerError(errorText(error));
    if (creating) {
      const data: PlatformTenantInput = {
        name: form.name.trim(), adminName: form.adminName.trim(), adminEmail: form.adminEmail.trim(),
        plan: form.plan, memberLimit: Number(form.memberLimit), requestLimit: Number(form.requestLimit), branding,
      };
      create.mutate({ data }, { onSuccess, onError });
    } else {
      const data: PlatformTenantUpdate = {
        name: form.name.trim(), plan: form.plan, memberLimit: Number(form.memberLimit), requestLimit: Number(form.requestLimit), branding,
      };
      update.mutate({ tenantId: tenant.id, data }, { onSuccess, onError });
    }
  }
  const field = (key: keyof TenantForm, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <label className="pa-field" htmlFor={`tenant-${key}`}>
      <span>{label}</span>
      <input id={`tenant-${key}`} data-testid={`input-tenant-${key}`} value={form[key]} onChange={event => set(key, event.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `error-${key}` : undefined} {...props} />
      {hint && <small>{hint}</small>}
      {errors[key] && <small className="pa-field-error" id={`error-${key}`}>{errors[key]}</small>}
    </label>
  );
  return <div className="pa-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="pa-dialog" role="dialog" aria-modal="true" aria-labelledby="pa-dialog-title">
      <header className="pa-dialog-head">
        <div className="pa-dialog-mark"><Building2 size={19} /></div>
        <div className="pa-dialog-title-wrap"><span className="pa-kicker">{creating ? 'NEW WORKSPACE' : 'WORKSPACE SETTINGS'}</span><h2 id="pa-dialog-title">{creating ? 'Provision a tenant' : `Manage ${tenant.name}`}</h2><p>{creating ? 'Set up the company space and invite its first administrator.' : 'Keep ownership and workspace limits in step.'}</p></div>
        <button type="button" className="pa-icon-btn" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={18} /></button>
      </header>
      <form onSubmit={submit} noValidate>
        <div className="pa-dialog-body">
          <div className="pa-form-section"><div className="pa-form-section-head"><span className="pa-section-index">01</span><div><b>Workspace</b><small>Company identity and first point of contact</small></div></div>
            {field('name', 'Company / workspace name', { placeholder: 'Company name', autoComplete: 'organization', required: true })}
            {creating && <div className="pa-form-grid">{field('adminName', 'First admin name', { placeholder: 'Full name', autoComplete: 'name', required: true })}{field('adminEmail', 'Admin email', { placeholder: 'name@company.com', type: 'email', autoComplete: 'email', required: true })}</div>}
          </div>
          <div className="pa-form-section"><div className="pa-form-section-head"><span className="pa-section-index">02</span><div><b>Plan & capacity</b><small>Usage limits can be adjusted at any time</small></div></div>
            <label className="pa-field" htmlFor="tenant-plan"><span>Plan</span><div className="pa-select-wrap"><select id="tenant-plan" data-testid="select-tenant-plan" value={form.plan} onChange={event => set('plan', event.target.value)}>{plans.map(plan => <option key={plan.value} value={plan.value}>{plan.label} — {plan.detail}</option>)}</select><ChevronDown size={15} /></div></label>
            <div className="pa-form-grid">{field('memberLimit', 'Member limit', { type: 'number', min: 1, step: 1, inputMode: 'numeric' }, 'Maximum workspace members')}{field('requestLimit', 'Request limit', { type: 'number', min: 1, step: 1, inputMode: 'numeric' }, 'Maximum requests')}</div>
          </div>
          <div className="pa-form-section pa-last-section"><div className="pa-form-section-head"><span className="pa-section-index">03</span><div><b>White-label details</b><small>Optional identity settings for this workspace</small></div></div>
            {field('logoUrl', 'Logo URL', { type: 'url', placeholder: 'https://company.com/logo.svg' })}
            <div className="pa-form-grid pa-brand-grid">{field('primaryColor', 'Primary color', { placeholder: '#397e63', maxLength: 7 })}{field('customDomain', 'Custom domain', { placeholder: 'approvals.company.com', autoCapitalize: 'none' }, 'Metadata only; does not configure DNS routing.')}</div>
          </div>
          {serverError && <div className="pa-server-error" role="alert"><CircleAlert size={17} /><span>{serverError}</span></div>}
        </div>
        <footer className="pa-dialog-actions"><button type="button" className="pa-secondary-btn" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="pa-primary-btn" disabled={busy} data-testid={creating ? 'button-create-tenant-submit' : 'button-save-tenant'}>
          {busy ? <><LoaderCircle className="pa-spin" size={16} /> Saving workspace…</> : <>{creating ? <Plus size={16} /> : <Check size={16} />}{creating ? 'Provision workspace' : 'Save changes'}</>}
        </button></footer>
      </form>
    </section>
  </div>;
}

export default function PlatformAdminPage() {
  const queryClient = useQueryClient();
  const tenantsQuery = useListPlatformTenants();
  const [dialogTenant, setDialogTenant] = useState<PlatformTenant | null | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const tenants = tenantsQuery.data || [];
  const filtered = useMemo(() => tenants.filter(tenant =>
    (tenant.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ||
      (tenant.branding.customDomain || '').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) &&
    (planFilter === 'all' || tenant.plan === planFilter),
  ), [tenants, search, planFilter]);
  const totalMembers = tenants.reduce((sum, tenant) => sum + tenant.memberCount, 0);
  const totalRequests = tenants.reduce((sum, tenant) => sum + tenant.requestCount, 0);
  function saved() {
    setDialogTenant(undefined);
    setNotice('Workspace changes saved. Tenant list refreshed.');
    void queryClient.invalidateQueries({ queryKey: getListPlatformTenantsQueryKey() });
    window.setTimeout(() => setNotice(''), 4200);
  }

  return <section className="platform-admin">
    <style>{styles}</style>
    <div className="pa-content">
      <div className="pa-heading">
        <div><div className="pa-eyebrow"><span /> TENANT CONTROL PLANE</div><h1>Company workspaces<span>.</span></h1><p>Provision teams, keep capacity visible, and make every workspace feel like their own.</p></div>
        <button type="button" className="pa-primary-btn pa-create-btn" onClick={() => setDialogTenant(null)} data-testid="button-provision-tenant"><Plus size={17} /> Provision tenant</button>
      </div>
      <section className="pa-overview" aria-label="Tenant overview">
        <div className="pa-overview-feature"><div className="pa-overview-label">WORKSPACES <Building2 size={15} /></div><div className="pa-overview-value">{tenantsQuery.isLoading ? <i className="pa-value-skeleton" /> : tenants.length.toLocaleString()}</div><div className="pa-overview-foot">Separate teams. One clear view.</div><div className="pa-overview-stamp"><Layers3 size={15} /><span>PLATFORM<br />DIRECTORY</span></div></div>
        <div className="pa-overview-stat"><div className="pa-overview-label">PEOPLE ACROSS TENANTS <Users size={15} /></div><div className="pa-overview-value">{tenantsQuery.isLoading ? <i className="pa-value-skeleton" /> : totalMembers.toLocaleString()}</div><div className="pa-stat-foot"><span className="pa-stat-dot green" />Current member count</div></div>
        <div className="pa-overview-stat"><div className="pa-overview-label">REQUESTS IN MOTION <Workflow size={15} /></div><div className="pa-overview-value">{tenantsQuery.isLoading ? <i className="pa-value-skeleton" /> : totalRequests.toLocaleString()}</div><div className="pa-stat-foot"><span className="pa-stat-dot amber" />Across company workspaces</div></div>
      </section>
      <section className="pa-directory">
        <div className="pa-directory-head">
          <div><div className="pa-section-kicker">THE DIRECTORY</div><h2>Tenant workspaces <span>{tenantsQuery.isLoading ? '—' : String(tenants.length).padStart(2, '0')}</span></h2><p>Plans, capacity, and the details that keep teams moving.</p></div>
          <div className="pa-tools">
            <label className="pa-search"><Search size={16} /><span className="pa-visually-hidden">Search workspaces</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a workspace" data-testid="input-tenant-search" /></label>
            <label className="pa-filter-label"><span className="pa-visually-hidden">Filter by plan</span><select value={planFilter} onChange={event => setPlanFilter(event.target.value)} data-testid="select-plan-filter"><option value="all">All plans</option>{plans.map(plan => <option key={plan.value} value={plan.value}>{plan.label}</option>)}</select><ChevronDown size={14} /></label>
          </div>
        </div>
        {tenantsQuery.isLoading ? <div className="pa-skeleton-list" aria-label="Loading tenant workspaces">{[0, 1, 2].map(row => <div className="pa-skeleton-row" key={row}><i /><span /><span /><span /></div>)}</div>
          : tenantsQuery.isError ? <div className="pa-state pa-error-state" role="alert"><div className="pa-state-icon"><CircleAlert size={19} /></div><h3>Couldn’t reach the directory</h3><p>Your tenant records are safe. Retry the list when the connection is ready.</p><button type="button" className="pa-secondary-btn" onClick={() => void tenantsQuery.refetch()} data-testid="button-retry-tenants"><RefreshCw size={15} /> Try again</button></div>
          : !filtered.length ? <div className="pa-state"><div className="pa-state-icon"><Building2 size={19} /></div><h3>{tenants.length ? 'No workspaces match that search' : 'A clear directory, ready to grow'}</h3><p>{tenants.length ? 'Try another company name or plan.' : 'Provision a tenant workspace and invite its first company admin to begin.'}</p>{tenants.length ? <button type="button" className="pa-secondary-btn" onClick={() => { setSearch(''); setPlanFilter('all'); }}>Clear filters</button> : <button type="button" className="pa-primary-btn" onClick={() => setDialogTenant(null)}><Plus size={16} /> Provision first tenant</button>}</div>
          : <div className="pa-table-wrap"><table className="pa-table"><thead><tr><th>WORKSPACE</th><th>PLAN</th><th>MEMBERS</th><th>REQUESTS</th><th>CREATED</th><th><span className="pa-visually-hidden">Manage workspace</span></th></tr></thead>
            <tbody>{filtered.map((tenant, index) => <tr key={tenant.id} className="pa-tenant-row" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }} data-testid={`row-tenant-${tenant.id}`}>
              <td><div className="pa-tenant-identity"><span className="pa-monogram" style={{ '--tenant-color': tenant.branding.primaryColor || '#397e63' } as CSSProperties}>{tenant.branding.logoUrl ? <img src={tenant.branding.logoUrl} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} /> : tenant.name.trim().slice(0, 1).toUpperCase()}</span><span className="pa-tenant-copy"><b>{tenant.name}</b><small>{tenant.branding.customDomain ? <><Globe2 size={11} />{tenant.branding.customDomain}</> : <>ID <code>{tenant.id}</code></>}</small></span></div></td>
              <td><span className={`pa-plan-tag plan-${tenant.plan}`}><i />{tenant.plan}</span></td>
              <td><UsageMeter label="Members" used={tenant.memberCount} limit={tenant.memberLimit} icon={<Users size={13} />} /></td>
              <td><UsageMeter label="Requests" used={tenant.requestCount} limit={tenant.requestLimit} icon={<Workflow size={13} />} /></td>
              <td><span className="pa-created"><Clock3 size={13} />{formatDate(tenant.createdAt)}</span></td>
              <td><button type="button" className="pa-edit-btn" aria-label={`Manage ${tenant.name}`} onClick={() => setDialogTenant(tenant)} data-testid={`button-edit-tenant-${tenant.id}`}><Pencil size={14} /><span>Manage</span></button></td>
            </tr>)}</tbody>
          </table>
          <div className="pa-table-footer"><span><i className="pa-live-pip" />Showing <b>{filtered.length}</b> of <b>{tenants.length}</b> workspaces</span><span><Settings2 size={13} /> Domains are stored as workspace metadata</span></div>
        </div>}
      </section>
      <footer className="pa-footnote"><span><Shield size={13} /> Changes here affect the selected company workspace only.</span><span>FLOWBUILDER <i>·</i> PLATFORM OWNER</span></footer>
    </div>
    {notice && <div className="pa-toast" role="status"><span><Check size={15} /></span>{notice}</div>}
    {dialogTenant !== undefined && <TenantDialog tenant={dialogTenant || undefined} onClose={() => setDialogTenant(undefined)} onSaved={saved} />}
  </section>;
}

const styles = `
.platform-admin{--pa-ink:#26383c;--pa-muted:#81908b;--pa-line:#e6e6db;--pa-paper:#fffefa;--pa-green:#397e63;--pa-forest:#28483f;--pa-amber:#bd8450;min-height:0;background:#f6f5ed;color:var(--pa-ink);font-family:var(--app-font-sans,'DM Sans',sans-serif);padding-bottom:24px}
.platform-admin *{box-sizing:border-box}
.pa-topline{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,5.1vw,76px);border-bottom:1px solid #e7e5db;background:#faf9f3}
.pa-brandline{display:flex;align-items:center;gap:9px;color:#304044;font-family:var(--app-font-serif,'Manrope',sans-serif);font-size:15px;font-weight:800;letter-spacing:-.04em}
.pa-brand-icon{display:grid;width:27px;height:27px;place-items:center;border-radius:8px;background:#e2eee4;color:#397e63}.pa-brandline i{height:15px;border-left:1px solid #d7d9ce;margin:0 5px}.pa-brandline{font-size:10px;letter-spacing:.1em;color:#82908a}.pa-brandline>span:nth-child(2){font-family:var(--app-font-serif,'Manrope',sans-serif);font-size:15px;letter-spacing:-.04em;color:#304044}
.pa-secure{display:flex;align-items:center;gap:7px;color:#77857e;font:500 9px var(--app-font-mono,'DM Mono',monospace);letter-spacing:.09em}.pa-secure svg{color:#54856a}.pa-secure-dot{width:6px;height:6px;border-radius:50%;background:#6b9d78;margin-left:2px}
.pa-content{max-width:1390px;margin:0 auto;padding:45px clamp(20px,5.1vw,76px) 30px}
.pa-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:27px;animation:pa-rise .42s both}
.pa-eyebrow,.pa-section-kicker{display:flex;align-items:center;gap:8px;color:#78867e;font:500 9px var(--app-font-mono,'DM Mono',monospace);letter-spacing:.12em}.pa-eyebrow>span{width:6px;height:6px;border-radius:50%;background:#57916f;box-shadow:0 0 0 3px #e3eee1}
.pa-heading h1{margin:11px 0 5px;color:#293a3e;font:800 clamp(31px,4vw,44px)/1.04 var(--app-font-serif,'Manrope',sans-serif);letter-spacing:-.055em}.pa-heading h1 span{color:#589174}.pa-heading p{margin:0;color:#84908a;font-size:12px;line-height:1.6}
.pa-primary-btn,.pa-secondary-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:8px;padding:10px 15px;font:700 11px var(--app-font-sans,'DM Sans',sans-serif);cursor:pointer;transition:transform .16s ease,background-color .16s ease,box-shadow .16s ease,border-color .16s ease}.pa-primary-btn{border:1px solid #397e63;background:#397e63;color:#fffefa;box-shadow:0 2px 5px #397e6326}.pa-primary-btn:hover{background:#2f6c54;box-shadow:0 5px 13px #397e632b;transform:translateY(-1px)}.pa-primary-btn:active,.pa-secondary-btn:active{transform:translateY(1px)}.pa-primary-btn:disabled,.pa-secondary-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}.pa-create-btn{flex:none;padding:12px 17px}
.pa-overview{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:13px;margin-bottom:28px;animation:pa-rise .42s 60ms both}
.pa-overview-feature,.pa-overview-stat{position:relative;min-height:137px;overflow:hidden;border:1px solid #e6e4d9;border-radius:12px;padding:17px 19px;background:#fffefa;box-shadow:0 2px 8px #2c3d3a09}.pa-overview-feature{border-color:#28483f;background:#28483f;color:#f4f3e9}.pa-overview-label{display:flex;align-items:center;justify-content:space-between;color:#9da79e;font:500 8px var(--app-font-mono,'DM Mono',monospace);letter-spacing:.1em}.pa-overview-label svg{color:#8a9a8f}.pa-overview-feature .pa-overview-label{color:#bdcbbf}.pa-overview-feature .pa-overview-label svg{color:#9bb9a1}
.pa-overview-value{margin-top:12px;font:800 35px/1 var(--app-font-serif,'Manrope',sans-serif);letter-spacing:-.06em;color:#34464a}.pa-overview-feature .pa-overview-value{color:#f5f2e7}.pa-overview-foot,.pa-stat-foot{margin-top:7px;color:#8a9590;font-size:10px}.pa-overview-feature .pa-overview-foot{color:#b9c9bc}.pa-stat-foot{display:flex;align-items:center;gap:6px}.pa-stat-dot{width:5px;height:5px;border-radius:50%}.pa-stat-dot.green{background:#67a67b}.pa-stat-dot.amber{background:#c68c56}.pa-overview-stamp{position:absolute;right:17px;bottom:17px;display:flex;align-items:center;gap:6px;color:#9dbba4;font:500 7px/1.45 var(--app-font-mono,'DM Mono',monospace);letter-spacing:.08em}.pa-overview-stamp svg{color:#78a888}.pa-value-skeleton{display:inline-block;width:42px;height:30px;border-radius:5px;background:#eaece4;animation:pa-shimmer 1.2s ease-in-out infinite alternate}.pa-overview-feature .pa-value-skeleton{background:#446257}
.pa-directory{overflow:hidden;border:1px solid #e5e3d9;border-radius:13px;background:#fffefa;box-shadow:0 3px 14px #2c3d3a08;animation:pa-rise .42s 110ms both}
.pa-directory-head{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;border-bottom:1px solid #ecebe4;padding:19px 21px 17px}.pa-directory-head h2{margin:5px 0 4px;font:800 19px var(--app-font-serif,'Manrope',sans-serif);letter-spacing:-.04em;color:#344247}.pa-directory-head h2 span{margin-left:5px;color:#9ca59c;font:500 10px var(--app-font-mono,'DM Mono',monospace);letter-spacing:0}.pa-directory-head p{margin:0;color:#8a9590;font-size:10px}.pa-tools{display:flex;gap:8px;align-items:center}.pa-search,.pa-filter-label{height:34px;display:flex;align-items:center;gap:8px;border:1px solid #e4e3d9;border-radius:7px;background:#fffefa;color:#89948e;padding:0 10px}.pa-search{width:204px}.pa-search input{width:100%;border:0;outline:0;background:transparent;color:#3b4a4e;font:11px var(--app-font-sans,'DM Sans',sans-serif)}.pa-search input::placeholder{color:#a4aba4}.pa-filter-label{position:relative;min-width:105px}.pa-filter-label select{appearance:none;width:100%;border:0;outline:0;background:transparent;color:#697772;font:600 10px var(--app-font-sans,'DM Sans',sans-serif);cursor:pointer;padding-right:10px}.pa-filter-label>svg{position:absolute;right:9px;pointer-events:none}.pa-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.pa-table-wrap{overflow-x:auto}.pa-table{width:100%;border-collapse:collapse;text-align:left;min-width:830px}.pa-table thead th{height:39px;background:#fbfaf6;color:#9aa29b;font:500 8px var(--app-font-mono,'DM Mono',monospace);letter-spacing:.1em}.pa-table th{padding:0 15px}.pa-table th:first-child,.pa-table td:first-child{padding-left:21px}.pa-table th:last-child,.pa-table td:last-child{padding-right:19px;text-align:right}.pa-tenant-row{border-top:1px solid #efeee7;animation:pa-rise .34s both}.pa-tenant-row:hover td{background:#fcfbf7}.pa-tenant-row td{padding:15px;color:#59686a;font-size:10px;transition:background-color .15s ease}.pa-tenant-identity{display:flex;align-items:center;gap:10px;min-width:190px}.pa-monogram{position:relative;display:grid;width:35px;height:35px;flex:none;place-items:center;border:1px solid color-mix(in srgb,var(--tenant-color),white 76%);border-radius:9px;background:color-mix(in srgb,var(--tenant-color),white 91%);color:var(--tenant-color);font:800 14px var(--app-font-serif,'Manrope',sans-serif)}.pa-monogram img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:4px;border-radius:8px;background:#fffefa}.pa-tenant-copy{display:flex;min-width:0;flex-direction:column;gap:4px}.pa-tenant-copy>b{overflow:hidden;max-width:190px;color:#3c4b4e;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.pa-tenant-copy small{display:flex;align-items:center;gap:4px;color:#929b95;font-size:9px}.pa-tenant-copy small svg{color:#82988a}.pa-tenant-copy code{color:#88948e;font:9px var(--app-font-mono,'DM Mono',monospace)}
.pa-plan-tag{display:inline-flex;align-items:center;gap:6px;border-radius:5px;padding:5px 7px;background:#f2f1eb;color:#69736e;font-size:9px;font-weight:700;text-transform:capitalize;white-space:nowrap}.pa-plan-tag i{width:5px;height:5px;border-radius:50%;background:#929b91}.pa-plan-tag.plan-professional{background:#eaf1e9;color:#49775a}.pa-plan-tag.plan-professional i{background:#59916b}.pa-plan-tag.plan-enterprise{background:#f5eee1;color:#967243}.pa-plan-tag.plan-enterprise i{background:#b5894f}
.pa-usage{width:133px}.pa-usage-top{display:flex;align-items:center;justify-content:space-between;gap:7px}.pa-usage-label{display:flex;align-items:center;gap:5px;color:#87918b;font-size:9px}.pa-usage-label svg{color:#78907e}.pa-usage-numbers{color:#505f60;font:500 9px var(--app-font-mono,'DM Mono',monospace);white-space:nowrap}.pa-usage-numbers i{color:#b0b6af;font-style:normal}.pa-usage-numbers.is-over{color:#a6564a}.pa-track{height:4px;margin-top:7px;overflow:hidden;border-radius:9px;background:#efeee7}.pa-track>span{display:block;height:100%;border-radius:inherit;background:#78a681;transition:width .42s cubic-bezier(.2,.7,.2,1)}.pa-track>span.is-over{background:#bd7661}
.pa-created{display:flex;align-items:center;gap:6px;color:#77847e;white-space:nowrap}.pa-created svg{color:#9ba59e}.pa-edit-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #e5e5dc;border-radius:6px;padding:7px 9px;background:#fffefa;color:#6f7d75;font:600 9px var(--app-font-sans,'DM Sans',sans-serif);cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease,transform .15s ease}.pa-edit-btn:hover{border-color:#cbdccd;background:#eff5ed;color:#397e63;transform:translateY(-1px)}
.pa-table-footer{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #efeee7;padding:11px 20px;color:#8b9690;font-size:9px}.pa-table-footer>span{display:flex;align-items:center;gap:5px}.pa-table-footer b{color:#596963;font-weight:700}.pa-table-footer svg{color:#78917f}.pa-live-pip{width:5px;height:5px;border-radius:50%;background:#69a47a}
.pa-state{display:flex;min-height:265px;flex-direction:column;align-items:center;justify-content:center;padding:30px;text-align:center}.pa-state-icon{display:grid;width:42px;height:42px;place-items:center;border:1px solid #e1e8db;border-radius:12px;background:#f2f5ed;color:#598167}.pa-state h3{margin:13px 0 5px;color:#40504e;font:800 16px var(--app-font-serif,'Manrope',sans-serif);letter-spacing:-.03em}.pa-state p{max-width:340px;margin:0 0 16px;color:#87928c;font-size:10px;line-height:1.7}.pa-error-state .pa-state-icon{border-color:#efd8d1;background:#fbefec;color:#b66154}
.pa-secondary-btn{border:1px solid #e2e2d9;background:#fffefa;color:#65736d}.pa-secondary-btn:hover{border-color:#ccd9cd;background:#f5f7f0;color:#397e63}
.pa-skeleton-list{padding:3px 20px}.pa-skeleton-row{height:67px;display:flex;align-items:center;gap:20px;border-bottom:1px solid #efeee7}.pa-skeleton-row i,.pa-skeleton-row span{display:block;height:11px;border-radius:5px;background:linear-gradient(90deg,#eeeee6,#f7f6f0,#eeeee6);background-size:200% 100%;animation:pa-shimmer 1.3s infinite alternate}.pa-skeleton-row i{width:35px;height:35px;border-radius:9px}.pa-skeleton-row span{width:90px}.pa-skeleton-row span:first-of-type{width:180px}
.pa-footnote{display:flex;justify-content:space-between;gap:12px;padding:17px 2px 0;color:#929c94;font-size:9px}.pa-footnote span{display:flex;align-items:center;gap:6px}.pa-footnote svg{color:#73917b}.pa-footnote span:last-child{font:500 8px var(--app-font-mono,'DM Mono',monospace);letter-spacing:.09em}.pa-footnote i{color:#bd8d5d;font-style:normal}
.pa-toast{position:fixed;right:24px;bottom:22px;z-index:120;display:flex;align-items:center;gap:9px;border:1px solid #d8e5d9;border-radius:10px;padding:12px 15px;background:#fffefa;color:#52675a;box-shadow:0 12px 36px #253c3020;font-size:11px;animation:pa-rise .22s both}.pa-toast>span{display:grid;width:23px;height:23px;place-items:center;border-radius:7px;background:#e8f2e8;color:#43805a}
.pa-backdrop{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:18px;background:#1f343647;backdrop-filter:blur(3px);animation:pa-fade .18s both}.pa-dialog{width:min(590px,100%);max-height:calc(100dvh - 36px);overflow:auto;border:1px solid #e6e4d9;border-radius:15px;background:#fffefa;box-shadow:0 22px 70px #1c282b38;animation:pa-rise .22s cubic-bezier(.2,.7,.2,1) both}.pa-dialog-head{display:flex;align-items:flex-start;gap:12px;border-bottom:1px solid #eceae2;padding:19px 22px}.pa-dialog-mark{display:grid;width:34px;height:34px;flex:none;place-items:center;border-radius:9px;background:#e9f1e7;color:#4a8060}.pa-dialog-title-wrap{flex:1}.pa-kicker{color:#849188;font:500 8px var(--app-font-mono,'DM Mono',monospace);letter-spacing:.12em}.pa-dialog-head h2{margin:4px 0 3px;color:#304145;font:800 20px var(--app-font-serif,'Manrope',sans-serif);letter-spacing:-.04em}.pa-dialog-head p{margin:0;color:#89948e;font-size:10px}.pa-icon-btn{display:grid;width:30px;height:30px;flex:none;place-items:center;border:0;border-radius:7px;background:transparent;color:#87918d;cursor:pointer}.pa-icon-btn:hover{background:#f2f1eb;color:#3d4d4c}
.pa-dialog-body{padding:17px 22px 18px}.pa-form-section{padding:0 0 16px;margin-bottom:16px;border-bottom:1px solid #eeede6}.pa-last-section{padding-bottom:0;margin-bottom:0;border-bottom:0}.pa-form-section-head{display:flex;align-items:center;gap:9px;margin-bottom:13px}.pa-section-index{color:#7b9b80;font:500 9px var(--app-font-mono,'DM Mono',monospace)}.pa-form-section-head div{display:flex;flex-direction:column;gap:2px}.pa-form-section-head b{color:#4a5959;font-size:10px}.pa-form-section-head small{color:#929b94;font-size:9px}
.pa-field{display:block;margin-top:11px}.pa-field>span{display:block;margin-bottom:6px;color:#53615e;font-size:10px;font-weight:700}.pa-field input,.pa-select-wrap select{display:block;width:100%;height:36px;min-width:0;border:1px solid #e2e1d8;border-radius:7px;padding:0 10px;background:#fffefa;color:#36464a;font:11px var(--app-font-sans,'DM Sans',sans-serif);transition:border-color .16s ease,box-shadow .16s ease}.pa-field input:focus,.pa-select-wrap select:focus{border-color:#75a487;box-shadow:0 0 0 3px #397e6318;outline:0}.pa-field input::placeholder{color:#abb1a9}.pa-field input[aria-invalid=true]{border-color:#c77c6c}.pa-field small{display:block;margin-top:5px;color:#929a94;font-size:8px;line-height:1.5}.pa-field .pa-field-error{color:#a74e43;font-size:9px}.pa-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pa-select-wrap{position:relative}.pa-select-wrap select{appearance:none;padding-right:28px;cursor:pointer}.pa-select-wrap svg{position:absolute;right:10px;top:11px;color:#89958e;pointer-events:none}.pa-brand-grid{grid-template-columns:.65fr 1.35fr}.pa-server-error{display:flex;align-items:flex-start;gap:9px;margin-top:13px;border:1px solid #efd3ce;border-radius:8px;padding:10px 11px;background:#fbefed;color:#a24d43;font-size:10px;line-height:1.55}.pa-server-error svg{flex:none;margin-top:1px}.pa-dialog-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #eceae2;padding:13px 22px 16px}.pa-spin{animation:pa-spin .85s linear infinite}
@keyframes pa-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes pa-fade{from{opacity:0}to{opacity:1}}@keyframes pa-shimmer{from{opacity:.55}to{opacity:1}}@keyframes pa-spin{to{transform:rotate(360deg)}}
@media(max-width:850px){.pa-content{padding-top:32px}.pa-overview{grid-template-columns:1fr 1fr}.pa-overview-feature{grid-row:span 2}.pa-directory-head{align-items:flex-start;flex-direction:column}.pa-tools{width:100%}.pa-search{flex:1}.pa-table-footer>span:last-child{display:none}}
@media(max-width:600px){.pa-topline{height:52px;padding:0 18px}.pa-secure{font-size:0}.pa-secure svg{width:16px;height:16px}.pa-content{padding:28px 15px 22px}.pa-heading{align-items:flex-start;flex-direction:column;gap:16px;margin-bottom:20px}.pa-heading h1{font-size:34px}.pa-create-btn{width:100%}.pa-overview{gap:8px;margin-bottom:19px}.pa-overview-feature,.pa-overview-stat{min-height:114px;padding:13px}.pa-overview-feature{grid-row:span 1;grid-column:span 2}.pa-overview-value{font-size:29px}.pa-overview-stamp{right:13px;bottom:13px}.pa-directory-head{padding:16px 14px}.pa-directory-head h2{font-size:17px}.pa-tools{gap:6px}.pa-search{width:auto;min-width:0}.pa-search input{font-size:10px}.pa-filter-label{min-width:90px;padding:0 8px}.pa-table{min-width:790px}.pa-table-footer{padding:10px 13px}.pa-footnote{flex-direction:column}.pa-dialog-head{padding:16px}.pa-dialog-body{padding:14px 16px}.pa-dialog-actions{padding:12px 16px 14px}.pa-dialog-actions button{flex:1}.pa-form-grid,.pa-brand-grid{grid-template-columns:1fr;gap:0}.pa-state{min-height:235px;padding:22px}.pa-toast{right:12px;bottom:12px;left:12px;justify-content:center}.pa-directory{border-radius:11px}}
@media(prefers-reduced-motion:reduce){.platform-admin *,.platform-admin *::before,.platform-admin *::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
