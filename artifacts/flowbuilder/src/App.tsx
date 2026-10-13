import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ClerkProvider, Show, SignIn as ClerkSignInView, SignUp as ClerkSignUpView, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, Clock3, FileCheck2, Filter, GitBranch, LayoutDashboard,
  ListChecks, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  Users, Workflow as WorkflowIcon, X, XCircle, Zap,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey, getGetDashboardQueryKey, getGetReportOverviewQueryKey, getGetRequestQueryKey,
  getGetWorkflowQueryKey, getListNotificationsQueryKey, getListRequestsQueryKey, getListRolesQueryKey,
  getListUsersQueryKey, getListWorkflowsQueryKey, useActOnRequest, useCreateRequest, useCreateRole,
  useCreateUser, useCreateWorkflow, useGetCurrentUser, useGetDashboard, useGetReportOverview,
  useGetRequest, useGetWorkflow, useListNotifications, useListPeople, useListRequests, useListRoles, useListUsers,
  useListWorkflows, useMarkNotificationRead, useUpdateRole, useUpdateUser, useUpdateWorkflow,
} from '@workspace/api-client-react';
import type {
  Notification, RequestStatus, RequestSummary, Workflow, WorkflowField, WorkflowInput, WorkflowStage,
  WorkspaceRole, WorkspaceUser,
} from '@workspace/api-client-react';
import WorkflowEditor from './WorkflowEditor';
import RequestFormModal from './components/RequestFormModal';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 25_000, retry: 1 } } });
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#397e63', colorForeground: '#26333d', colorMutedForeground: '#738087', colorDanger: '#bd514b',
    colorBackground: '#fffefa', colorInput: '#fffefa', colorInputForeground: '#26333d', colorNeutral: '#dedbd1',
    fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffefa] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#26333d] font-bold tracking-tight',
    headerSubtitle: 'text-[#738087]',
    socialButtonsBlockButtonText: 'text-[#26333d] font-semibold',
    formFieldLabel: 'text-[#33424a] font-semibold',
    footerActionLink: 'text-[#397e63] font-semibold',
    footerActionText: 'text-[#738087]',
    dividerText: 'text-[#738087]',
    identityPreviewEditButton: 'text-[#397e63]',
    formFieldSuccessText: 'text-[#397e63]',
    alertText: 'text-[#26333d]',
    logoBox: 'mb-3',
    logoImage: 'h-9',
    socialButtonsBlockButton: 'border-[#dedbd1] hover:bg-[#f3f1e9]',
    formButtonPrimary: 'bg-[#397e63] hover:bg-[#2f6c54] text-white font-semibold',
    formFieldInput: 'bg-[#fffefa] border-[#dedbd1] text-[#26333d]',
    footerAction: 'text-[#738087]',
    dividerLine: 'bg-[#dedbd1]',
    alert: 'bg-[#fbefed] border-[#edc7c3]',
    otpCodeFieldInput: 'border-[#dedbd1] text-[#26333d]',
    formFieldRow: 'mb-4',
    main: 'text-[#26333d]',
  },
};

function invalidate(qc: ReturnType<typeof useQueryClient>, keys: readonly (readonly unknown[])[]) {
  keys.forEach(queryKey => { void qc.invalidateQueries({ queryKey }); });
}
function cx(...names: Array<string | false | null | undefined>) { return names.filter(Boolean).join(' '); }
function initials(name?: string) { return (name || 'Team member').split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase(); }
function formatDate(value?: string | null, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  if (!value) return 'No due date';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('en', options).format(date);
}
function timeAgo(value: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  return hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
function StatusPill({ status }: { status: string }) {
  const label = status.replaceAll('_', ' ');
  return <span className={`status-pill status-${status}`}>{label}</span>;
}
function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'outline' | 'danger'; 'data-testid'?: string }) {
  return <button data-testid={props['data-testid']} {...props} type={props.type || 'button'} className={cx('button inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50', `button-${variant}`, className)}>{children}</button>;
}
function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; 'data-testid'?: string }) {
  return <button aria-label={label} title={label} data-testid={props['data-testid']} {...props} type={props.type || 'button'} className={cx('icon-button', props.className)}>{children}</button>;
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: ReactNode; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end enter">
    <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1 className="display mt-1 text-[2rem] font-bold leading-tight sm:text-[2.45rem]" data-testid="text-page-title">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>
    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
  </div>;
}
function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Loading"><div className="skeleton h-24 w-full" />{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-14 w-full" />)}</div>;
}
function LoadState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  if (loading) return <Skeleton />;
  if (error) return <div className="surface flex min-h-56 flex-col items-center justify-center p-8 text-center"><CircleHelp className="mb-3 text-destructive" /><h3 className="font-semibold">We couldn’t load this view</h3><p className="mt-1 text-sm text-muted-foreground">Your workspace data is still safe. Try again in a moment.</p><Button variant="outline" className="mt-5" onClick={retry}>Try again</Button></div>;
  return <>{children}</>;
}
function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark"><GitBranch size={20} /></div><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
function Modal({ title, subtitle, onClose, children, width = 'max-w-xl' }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => { const listener = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`modal-panel ${width}`} role="dialog" aria-modal="true" aria-label={title}><header className="flex items-start justify-between border-b border-border px-6 py-5"><div><h2 className="display text-xl font-bold">{title}</h2>{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></header><div className="max-h-[75vh] overflow-y-auto p-6">{children}</div></section></div>;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function TextInput(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={cx('input-control', props.className)} />; }
function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={cx('input-control min-h-24 resize-y', props.className)} />; }
function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={cx('input-control', props.className)} />; }

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/workflows', label: 'Workflows', icon: WorkflowIcon },
  { href: '/requests', label: 'Requests', icon: ListChecks },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/reports', label: 'Reports', icon: Activity },
];
function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><Landing /></Show></>;
}
function Landing() {
  return <main className="landing">
    <nav className="landing-nav"><Link href="/" className="brand"><img src={`${basePath}/logo.svg`} alt="" /><span>flowbuilder</span></Link><div className="hidden items-center gap-8 md:flex"><a href="#how-it-works">How it works</a><a href="#teams">For teams</a><a href="#principles">Why FlowBuilder</a></div><div className="flex items-center gap-2"><Link href="/sign-in" className="landing-signin">Sign in</Link><Link href="/sign-up" className="button button-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">Start building <ArrowRight size={15} /></Link></div></nav>
    <section className="landing-hero">
      <div className="hero-copy enter"><div className="hero-kicker"><span className="kicker-dot" /> THE WORK BEHIND THE WORK</div><h1 className="display">Good work moves<br /><em>with intention.</em></h1><p>FlowBuilder gives every request a clear path, every decision an owner, and every team a little more room to do their best work.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" className="button button-primary inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold">Build your first workflow <ArrowRight size={16} /></Link><a className="button button-outline inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold" href="#how-it-works">See how it works <ChevronRight size={16} /></a></div><div className="hero-proof"><div className="proof-avatars"><span>MK</span><span>JL</span><span>RA</span><span>+</span></div><span>Made for the teams keeping things moving</span></div></div>
      <div className="hero-art enter enter-delay-2"><div className="art-grid" /><div className="route-card"><div className="route-top"><span className="route-label">REQUEST FLOW</span><span className="live-dot">Live</span></div><div className="route-title">New vendor review</div><div className="route-sub">FINANCE · 3 STEPS</div><div className="route-line"><span className="route-node done"><Check size={13} /></span><div><b>Request submitted</b><small>by Morgan Kim · 9:42 AM</small></div><CheckCircle2 className="route-check" size={17} /></div><div className="route-line"><span className="route-node active-node"><span /></span><div><b>Finance review</b><small>with Alex Rivera · In progress</small></div><span className="working">NOW</span></div><div className="route-line"><span className="route-node" /><div><b>Operations approval</b><small>Up next · SLA 24h</small></div></div><div className="route-bottom"><span>Average completion</span><strong>1.4 days <ArrowDownRight size={14} /></strong></div></div><div className="floating-note"><span className="note-icon"><Zap size={14} /></span><div><b>Nothing falls through</b><small>One clear owner at every step</small></div></div><div className="art-index">01 <span>/ 04</span></div></div>
      <div className="hero-foot"><span>THE OPERATIONS WORKSPACE</span><span>Built for clarity, not more noise <ArrowDownRight size={14} /></span></div>
    </section>
    <section className="landing-trust"><span>WORK THAT CROSSES TEAM BOUNDARIES</span><div><b>Finance</b><b>People</b><b>Operations</b><b>Legal</b><b>IT & Security</b></div></section>
    <section className="landing-section" id="how-it-works"><div className="section-label">A BETTER KIND OF HANDOFF</div><div className="section-split"><h2 className="display">From “who owns this?”<br />to <em>already in motion.</em></h2><p>Build a path once. Let the right people know when it’s their turn. Keep the whole story in one place, from first ask to final sign-off.</p></div><div className="feature-rail"><article><span className="feature-number">01</span><GitBranch /><h3>Design the path</h3><p>Shape each workflow around how your team actually works. Add the right questions, owners, and guardrails.</p></article><article><span className="feature-number">02</span><Users /><h3>Give work an owner</h3><p>Requests find the right person automatically—by role, manager, or a simple condition you define.</p></article><article><span className="feature-number">03</span><FileCheck2 /><h3>Keep the whole story</h3><p>See what changed, who decided, and what’s next without chasing context across five tools.</p></article></div></section>
    <section className="landing-band" id="teams"><div className="band-quote">“</div><div><div className="section-label">CLARITY IS A TEAM SPORT</div><h2 className="display">Make the process<br />feel like progress.</h2><p>One calm place for thoughtful work to get done. Less chasing. Fewer “just checking in” messages. Better decisions, with the context to back them up.</p><Link href="/sign-up" className="band-link">Give your team a clearer path <ArrowRight size={16} /></Link></div><div className="band-metrics"><div><b>01</b><span>home for every request</span></div><div><b>Every</b><span>handoff has an owner</span></div><div><b>Always</b><span>the full decision trail</span></div></div></section>
    <section className="landing-last" id="principles"><div className="section-label">YOUR TEAM HAS BETTER THINGS TO DO</div><h2 className="display">Make work flow.<br /><em>Get back to the work.</em></h2><Link href="/sign-up" className="button button-primary inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold">Create your workspace <ArrowRight size={16} /></Link></section>
    <footer className="landing-footer"><Link href="/" className="brand"><img src={`${basePath}/logo.svg`} alt="" /><span>flowbuilder</span></Link><span>Thoughtful work, moving forward.</span><Link href="/sign-in">Sign in to your workspace <ArrowRight size={14} /></Link></footer>
  </main>;
}
function SignInPage() { return <div className="auth-wrap"><div className="auth-context"><Link href="/" className="brand"><img src={`${basePath}/logo.svg`} alt="" /><span>flowbuilder</span></Link><p>Every decision has a next step.</p></div><div className="auth-clerk"><ClerkSignIn /></div></div>; }
function ClerkSignIn() { return <ClerkSignInView routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />; }
function SignupPage() { return <div className="auth-wrap"><div className="auth-context"><Link href="/" className="brand"><img src={`${basePath}/logo.svg`} alt="" /><span>flowbuilder</span></Link><p>Set a better pace for the work ahead.</p></div><div className="auth-clerk"><ClerkSignUpView routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>; }

function AppFrame() {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const current = useGetCurrentUser();
  const unread = useListNotifications();
  const notificationCount = unread.data?.filter(item => !item.read).length || 0;
  const visibleNav = nav.filter(item => {
    if (item.href === '/team') return current.data?.permissions.includes('admin') ?? false;
    if (item.href === '/reports') return Boolean(current.data?.permissions.includes('report') || current.data?.permissions.includes('admin'));
    return true;
  });
  const activeNav = visibleNav.find(item => location.startsWith(item.href))?.href || '/dashboard';
  return <div className="app-shell flex">
    <aside className={cx('sidebar fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col transition-transform md:translate-x-0', mobileNav ? 'translate-x-0' : '-translate-x-full')}>
      <Link href="/dashboard" className="sidebar-brand"><img src={`${basePath}/logo.svg`} alt="" /><span>flowbuilder</span><span className="workspace-label">WORKSPACE</span></Link>
      <div className="sidebar-workspace"><span className="workspace-monogram">{initials(current.data?.tenantName).slice(0, 1)}</span><div><b>{current.data?.tenantName || 'Your workspace'}</b><small>Operations team</small></div><ChevronDown size={15} /></div>
       <span className="sidebar-caption">WORKSPACE</span><nav className="sidebar-nav">{visibleNav.map(item => <Link key={item.href} href={item.href} onClick={() => setMobileNav(false)} className={cx('nav-link', activeNav === item.href && 'active')}><item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.href === '/requests' && <span className="nav-count">{notificationCount ? Math.min(notificationCount, 9) : ''}</span>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><Sparkles size={16} /><span>Small steps, clear owners.<br />That’s how good work gets done.</span></div><div className="user-menu"><div className="avatar">{initials(current.data?.name)}</div><div className="user-copy"><b>{current.data?.name || 'Loading profile'}</b><small>{current.data?.roleName || 'Workspace member'}</small></div><button className="user-signout" onClick={() => window.dispatchEvent(new Event('flowbuilder:signout'))} aria-label="Account options"><MoreHorizontal size={17} /></button></div></div>
    </aside>
    {mobileNav && <button className="mobile-scrim md:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <main className="main-column min-w-0 flex-1 md:ml-[248px]">
       <header className="topbar"><div className="flex items-center gap-3"><IconButton label="Open menu" className="md:hidden" onClick={() => setMobileNav(true)}><Menu size={20} /></IconButton><span className="crumb">Workspace <ChevronRight size={13} /> <b>{visibleNav.find(item => item.href === activeNav)?.label || 'Overview'}</b></span></div><div className="topbar-actions"><Link href="/notifications" className="top-icon" aria-label="Notifications"><Bell size={18} />{notificationCount > 0 && <i />}</Link><button className="help-link"><CircleHelp size={17} /><span>Help</span></button><span className="top-avatar">{initials(current.data?.name)}</span></div></header>
      <div className="page-content"><Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/workflows/new" component={WorkflowEditor} />
        <Route path="/workflows/:workflowId/edit" component={WorkflowEditor} />
        <Route path="/workflows" component={WorkflowsPage} />
        <Route path="/requests" component={RequestsPage} />
        <Route path="/requests/:requestId" component={RequestDetailPage} />
        <Route path="/team" component={TeamPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route component={NotFoundPage} />
      </Switch></div>
    </main>
  </div>;
}
function AccountSignOutListener() {
  const { signOut } = useClerk();
  useEffect(() => { const listener = () => { void signOut({ redirectUrl: basePath || '/' }); }; window.addEventListener('flowbuilder:signout', listener); return () => window.removeEventListener('flowbuilder:signout', listener); }, [signOut]);
  return null;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk(); const qc = useQueryClient(); const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== userId) {
      qc.clear();
      void qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    }
    previous.current = userId;
  }), [addListener, qc]);
  return null;
}
function ProtectedFrame() { return <><Show when="signed-in"><AccountSignOutListener /><AppFrame /></Show><Show when="signed-out"><Redirect to="/" /></Show></>; }
function AuthPage({ mode }: { mode: 'in' | 'up' }) { return mode === 'in' ? <SignInPage /> : <SignupPage />; }
function Router() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to pick up where your team left off.' } }, signUp: { start: { title: 'Make work move', subtitle: 'Create your team’s FlowBuilder workspace.' } } }} routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={() => <AuthPage mode="in" />} />
      <Route path="/sign-up/*?" component={() => <AuthPage mode="up" />} />
      <Route component={ProtectedFrame} />
    </Switch></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <WouterRouter base={basePath}><Router /></WouterRouter>;
}

const filters = ['All', 'Overdue', 'Due today', 'Due in 3 days', 'This week', 'Pending clarification'] as const;
function DashboardPage() {
  const query = useGetDashboard(); const current = useGetCurrentUser();
  const [filter, setFilter] = useState<string>('All');
  const tasks = query.data?.tasks || [];
  const visible = tasks.filter(task => {
    if (filter === 'Pending clarification') return task.status === 'needs_clarification';
    if (!task.dueAt) return filter === 'All';
    const due = new Date(task.dueAt); const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayDiff = Math.floor((new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - today.getTime()) / 86_400_000);
    if (filter === 'Overdue') return dayDiff < 0;
    if (filter === 'Due today') return dayDiff === 0;
    if (filter === 'Due in 3 days') return dayDiff >= 0 && dayDiff <= 3;
    if (filter === 'This week') return dayDiff >= 0 && dayDiff <= 7;
    return true;
  });
  const summary = query.data;
  return <LoadState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}><>
    <PageHeading eyebrow="MONDAY, YOUR WAY" title={<>Good morning<span className="title-period">.</span></>} description="Here’s what needs your attention, and what your team has been moving forward." action={<Link href="/workflows" className="button button-outline inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"><WorkflowIcon size={16} /> Browse workflows</Link>} />
    <section className="summary-grid enter enter-delay-1">
      <div className="summary-card focus-card"><div className="summary-label">MY OPEN TASKS <ArrowUpRight size={14} /></div><b>{summary?.pendingCount ?? 0}</b><span><i className="mini-dot orange" /> {summary?.overdueCount ?? 0} overdue and need a look</span><div className="mini-bars">{[38, 63, 49, 76, 54, 86, 68].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div></div>
      <div className="summary-card"><div className="summary-label">COMPLETED TODAY <CheckCircle2 size={14} /></div><b>{summary?.completedToday ?? 0}<small> / {summary?.allocatedToday ?? 0}</small></b><span>Requests moved to the next step</span><div className="summary-progress"><i style={{ width: `${summary?.allocatedToday ? Math.min(100, Math.round((summary.completedToday / summary.allocatedToday) * 100)) : 0}%` }} /></div></div>
      <div className="summary-card"><div className="summary-label">REQUESTS IN MOTION <Activity size={14} /></div><b>{summary?.totalRequests ?? 0}</b><span>Across your workspace</span><span className="summary-trend"><ArrowUpRight size={14} /> Your team’s queue</span></div>
    </section>
    <div className="dashboard-columns enter enter-delay-2">
      <section className="surface task-panel"><div className="panel-heading"><div><h2>On your plate</h2><p>Good work starts with the next right thing.</p></div><Link href="/requests" className="text-link">All requests <ArrowRight size={14} /></Link></div>
        <div className="filter-strip" role="tablist" aria-label="Filter tasks">{filters.map(item => <button key={item} role="tab" aria-selected={filter === item} className={cx(filter === item && 'selected')} onClick={() => setFilter(item)} data-testid={`filter-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}{item === 'Overdue' && !!summary?.overdueCount && <i className="filter-badge">{summary.overdueCount}</i>}</button>)}</div>
        {visible.length ? <div className="task-list">{visible.map((task, index) => <Link href={`/requests/${task.id}`} key={task.id} className="task-row" data-testid={`task-row-${task.id}`}><div className={cx('task-symbol', task.status === 'needs_clarification' && 'symbol-clarify')}>{task.status === 'needs_clarification' ? <CircleHelp size={17} /> : <FileCheck2 size={17} />}</div><div className="task-main"><div><b>{task.workflowName}</b><span className="task-code mono">{task.requestCode}</span></div><small>{task.requesterName} <i /> {task.currentStageName}</small></div><div className={cx('task-due', task.dueAt && new Date(task.dueAt) < new Date() && 'overdue')}><Clock3 size={13} />{formatDate(task.dueAt)}</div><ChevronRight className="row-arrow" size={16} /></Link>)}</div> : <EmptyState title={filter === 'All' ? 'A clear plate. Nice.' : 'Nothing in this view'} body={filter === 'All' ? 'You’re all caught up. When a request needs you, it’ll show up here.' : `There are no tasks matching “${filter}” right now.`} />}</section>
      <aside className="dashboard-side">
         <section className="surface side-widget"><div className="widget-head"><div><span className="section-label">YOUR WORKFLOWS</span><h2>Shortcuts</h2></div><Link href="/workflows" className="tiny-action" aria-label="All workflows"><ArrowRight size={15} /></Link></div>{summary?.myWorkflows?.length ? <div className="shortcut-list">{summary.myWorkflows.slice(0, 5).map(wf => <Link href="/workflows" key={wf.id} className="shortcut"><span className="shortcut-icon"><GitBranch size={16} /></span><span><b>{wf.name}</b><small>{wf.requestCount} requests · {wf.category}</small></span><ArrowRight size={14} /></Link>)}</div> : <div className="widget-empty">Your team’s workflows will appear here.</div>}{(current.data?.permissions.includes('admin') || current.data?.roleName === 'Workflow Owner') && <Link className="widget-cta" href="/workflows"><Plus size={15} /> Create a workflow</Link>}</section>
        <section className="progress-note"><div className="progress-orbit"><span>{summary?.allocatedToday ? Math.round((summary.completedToday / summary.allocatedToday) * 100) : 0}<small>%</small></span></div><div><b>Steady progress</b><p>{summary?.completedToday ?? 0} of {summary?.allocatedToday ?? 0} tasks wrapped today. Keep the rhythm going.</p></div></section>
      </aside>
    </div>
    <section className="surface recent-panel enter enter-delay-3"><div className="panel-heading"><div><h2>Recently submitted</h2><p>Requests entering the system across your team.</p></div><Link href="/requests" className="text-link">View all <ArrowRight size={14} /></Link></div><RequestTable requests={summary?.recentRequests?.slice(0, 5) || []} /></section>
  </></LoadState>;
}

function RequestTable({ requests }: { requests: RequestSummary[] }) {
  if (!requests.length) return <EmptyState title="No requests yet" body="New requests will appear here as soon as someone submits a workflow." />;
  return <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>REQUEST</th><th>REQUESTER</th><th>STATUS</th><th>STEP</th><th>DUE</th><th /></tr></thead><tbody>{requests.map(request => <tr key={request.id} data-testid={`request-row-${request.id}`}><td><Link href={`/requests/${request.id}`} className="request-title">{request.workflowName}<small className="mono">{request.requestCode}</small></Link></td><td>{request.requesterName}</td><td><StatusPill status={request.status} /></td><td>{request.currentStage} of {request.totalStages}</td><td>{formatDate(request.dueAt)}</td><td><Link className="row-open" href={`/requests/${request.id}`} aria-label={`Open ${request.requestCode}`}><ChevronRight size={17} /></Link></td></tr>)}</tbody></table></div>;
}

function WorkflowModal({ workflow, onClose }: { workflow?: Workflow; onClose: () => void }) {
  const qc = useQueryClient(); const create = useCreateWorkflow(); const update = useUpdateWorkflow();
  const availableRoles = useListRoles(); const availableUsers = useListUsers();
  const detail = useGetWorkflow(workflow?.id ?? '', { query: { enabled: Boolean(workflow?.id), queryKey: getGetWorkflowQueryKey(workflow?.id ?? '') } });
  const [name, setName] = useState(workflow?.name || ''); const [category, setCategory] = useState(workflow?.category || 'Operations');
  const [description, setDescription] = useState(workflow?.description || ''); const [routing, setRouting] = useState<WorkflowInput['routing']>(workflow?.routing || 'sequential');
  const [fields, setFields] = useState<WorkflowField[]>(workflow?.fields || [{ id: crypto.randomUUID(), label: 'Request title', type: 'text', required: true }]);
  const [stages, setStages] = useState<WorkflowStage[]>(workflow?.stages || [{ id: crypto.randomUUID(), name: 'Manager review', order: 1, assigneeType: 'manager', assigneeLabel: 'Manager', slaHours: 24 }]);
  const busy = create.isPending || update.isPending;
  function submit(e: FormEvent) {
    e.preventDefault(); if (name.trim().length < 2 || !stages.length) return;
    const payload: WorkflowInput = { name: name.trim(), category, description, routing, fields, stages: stages.map((stage, i) => ({ ...stage, order: i + 1 })) };
    const done = () => { invalidate(qc, [getListWorkflowsQueryKey(), getGetDashboardQueryKey()]); onClose(); };
    if (workflow) update.mutate({ workflowId: workflow.id, data: payload }, { onSuccess: done });
    else create.mutate({ data: payload }, { onSuccess: done });
  }
  return <Modal title={workflow ? 'Edit workflow' : 'Create a workflow'} subtitle="Set the shape of the work, then give each step a clear owner." onClose={onClose} width="max-w-3xl"><form onSubmit={submit} className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Workflow name"><TextInput required minLength={2} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Purchase approval" /></Field><Field label="Category"><TextInput required value={category} onChange={e => setCategory(e.target.value)} placeholder="Operations" /></Field></div>
    <Field label="Description"><TextArea value={description} onChange={e => setDescription(e.target.value)} placeholder="What should teammates know before starting?" /></Field>
    <Field label="Routing style"><SelectInput value={routing} onChange={e => setRouting(e.target.value as WorkflowInput['routing'])}><option value="sequential">Sequential — one step at a time</option><option value="parallel">Parallel — all approvers together</option><option value="conditional">Conditional — based on answers</option></SelectInput></Field>
    <div><div className="builder-section-head"><div><h3>Request form</h3><p>Ask only for what the approvers need.</p></div><Button type="button" variant="outline" onClick={() => setFields(items => [...items, { id: crypto.randomUUID(), label: '', type: 'text', required: false }])}><Plus size={15} /> Add field</Button></div>
       <div className="builder-items">{fields.map((field, i) => <div className="builder-item" key={field.id}><span className="builder-count">{String(i + 1).padStart(2, '0')}</span><TextInput aria-label="Field label" required value={field.label} placeholder="Question label" onChange={e => setFields(items => items.map(x => x.id === field.id ? { ...x, label: e.target.value } : x))} /><SelectInput aria-label="Field type" value={field.type} onChange={e => setFields(items => items.map(x => x.id === field.id ? { ...x, type: e.target.value as WorkflowField['type'], options: e.target.value === 'select' ? (x.options || []) : undefined } : x))}><option value="text">Short text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Dropdown</option><option value="checkbox">Checkbox</option></SelectInput>{field.type === 'select' && <TextInput aria-label="Dropdown options, separated by commas" value={(field.options || []).join(', ')} placeholder="Option A, Option B" onChange={e => setFields(items => items.map(x => x.id === field.id ? { ...x, options: e.target.value.split(',').map(option => option.trim()).filter(Boolean) } : x))} />}<label className="required-toggle"><input type="checkbox" checked={field.required} onChange={e => setFields(items => items.map(x => x.id === field.id ? { ...x, required: e.target.checked } : x))} /> Required</label><IconButton label="Remove field" disabled={fields.length === 1} onClick={() => setFields(items => items.filter(x => x.id !== field.id))}><X size={15} /></IconButton></div>)}</div>
    </div>
    <div><div className="builder-section-head"><div><h3>Approval stages</h3><p>Make responsibility visible at every handoff.</p></div><Button type="button" variant="outline" onClick={() => setStages(items => [...items, { id: crypto.randomUUID(), name: '', order: items.length + 1, assigneeType: 'role', assigneeLabel: '', slaHours: 24 }])}><Plus size={15} /> Add stage</Button></div>
       <div className="builder-items">{stages.map((stage, i) => <div className="stage-editor" key={stage.id}><span className="stage-step">{i + 1}</span><TextInput aria-label="Stage name" required value={stage.name} placeholder="Stage name" onChange={e => setStages(items => items.map(x => x.id === stage.id ? { ...x, name: e.target.value } : x))} /><SelectInput aria-label="Assignee type" value={stage.assigneeType} onChange={e => setStages(items => items.map(x => x.id === stage.id ? { ...x, assigneeType: e.target.value as WorkflowStage['assigneeType'], assigneeId: null, assigneeLabel: e.target.value === 'manager' ? 'Manager' : '' } : x))}><option value="manager">Requester’s manager</option><option value="role">Workspace role</option><option value="user">Specific person</option></SelectInput>{stage.assigneeType === 'role' && <SelectInput aria-label="Assignee role" required value={stage.assigneeId || ''} onChange={e => { const role = availableRoles.data?.find(item => item.id === e.target.value); setStages(items => items.map(x => x.id === stage.id ? { ...x, assigneeId: role?.id || null, assigneeLabel: role?.name || '' } : x)); }}><option value="">Choose a role</option>{availableRoles.data?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</SelectInput>}{stage.assigneeType === 'user' && <SelectInput aria-label="Assignee person" required value={stage.assigneeId || ''} onChange={e => { const person = availableUsers.data?.find(item => item.id === e.target.value); setStages(items => items.map(x => x.id === stage.id ? { ...x, assigneeId: person?.id || null, assigneeLabel: person?.name || '' } : x)); }}><option value="">Choose a person</option>{availableUsers.data?.filter(person => person.status === 'active').map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</SelectInput>}<TextInput aria-label="SLA hours" type="number" min="1" required value={stage.slaHours} onChange={e => setStages(items => items.map(x => x.id === stage.id ? { ...x, slaHours: Number(e.target.value) } : x))} />{routing === 'conditional' && <><SelectInput aria-label="Condition field" value={stage.conditionFieldId || ''} onChange={e => setStages(items => items.map(x => x.id === stage.id ? { ...x, conditionFieldId: e.target.value || null, conditionValue: e.target.value ? (x.conditionValue || '') : null } : x))}><option value="">Always run this stage</option>{fields.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</SelectInput>{stage.conditionFieldId && <TextInput aria-label="Run when answer equals" value={stage.conditionValue || ''} placeholder="Exact answer" onChange={e => setStages(items => items.map(x => x.id === stage.id ? { ...x, conditionValue: e.target.value } : x))} />}</>}</div>)}</div>
    </div>
    {(create.isError || update.isError) && <p className="form-error">Couldn’t save this workflow. Check your connection and try again.</p>}
    {workflow && detail.isLoading && <p className="text-xs text-muted-foreground">Loading the latest saved version…</p>}
    <div className="modal-actions"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !name.trim() || !stages.length}>{busy ? 'Saving…' : workflow ? 'Save changes' : 'Create workflow'} <ArrowRight size={15} /></Button></div>
  </form></Modal>;
}
function WorkflowsPage() {
  const qc = useQueryClient(); const query = useListWorkflows(); const update = useUpdateWorkflow(); const current = useGetCurrentUser();
  const canBuild = Boolean(current.data?.permissions.includes('build') || current.data?.permissions.includes('admin') || current.data?.roleName === 'Workflow Owner');
  const [search, setSearch] = useState(''); const [tab, setTab] = useState('All');
  const rows = query.data?.filter(w => (tab === 'All' || w.status === tab.toLowerCase()) && `${w.name} ${w.category} ${w.description}`.toLowerCase().includes(search.toLowerCase())) || [];
  function openEditor(workflowId?: string) { window.open(`${basePath}${workflowId ? `/workflows/${workflowId}/edit` : '/workflows/new'}`, '_blank', 'noopener,noreferrer'); }
  function changeStatus(wf: Workflow) { update.mutate({ workflowId: wf.id, data: { status: wf.status === 'active' ? 'inactive' : 'active' } }, { onSuccess: () => invalidate(qc, [getListWorkflowsQueryKey(), getGetWorkflowQueryKey(wf.id)]) }); }
  return <><PageHeading eyebrow="THE SYSTEMS YOUR TEAM RUNS ON" title="Workflows" description="Build a reliable path for recurring work. Make the next handoff obvious." action={canBuild && <Button onClick={() => openEditor()} data-testid="button-new-workflow"><Plus size={16} /> New workflow</Button>} />
    <div className="workflow-toolbar"><div className="tabs">{['All', 'Active', 'Draft', 'Inactive'].map(t => <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>{t}<span>{t === 'All' ? query.data?.length || 0 : query.data?.filter(w => w.status === t.toLowerCase()).length || 0}</span></button>)}</div><label className="searchbox"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search workflows" aria-label="Search workflows" /></label></div>
     <LoadState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>{rows.length ? <div className="workflow-grid">{rows.map((wf, index) => <article className={`workflow-card surface enter enter-delay-${Math.min(index % 3 + 1, 3)}`} key={wf.id}><div className="workflow-card-head"><span className="workflow-glyph"><GitBranch size={18} /></span><StatusPill status={wf.status} />{canBuild && <button className="card-menu" aria-label={`Edit ${wf.name}`} onClick={() => openEditor(wf.id)} data-testid={`button-edit-workflow-menu-${wf.id}`}><MoreHorizontal size={18} /></button>}</div><div className="workflow-category">{wf.category} <span>·</span> v{wf.version}</div><h2>{wf.name}</h2><p>{wf.description || 'A clear path for this kind of request.'}</p><div className="workflow-route">{wf.stages.slice(0, 3).map((stage, i) => <span key={stage.id}><i className={i === 0 ? 'route-start' : ''} />{stage.name}</span>)}{wf.stages.length > 3 && <small>+{wf.stages.length - 3}</small>}</div><div className="workflow-card-foot"><span><Users size={14} /> {wf.ownerName}</span><span><FileCheck2 size={14} /> {wf.requestCount} requests</span></div>{canBuild && <div className="workflow-actions"><Button variant="outline" className="flex-1" onClick={() => openEditor(wf.id)} data-testid={`button-edit-workflow-${wf.id}`}><Settings2 size={15} /> Edit workflow</Button><Button variant={wf.status === 'active' ? 'quiet' : 'outline'} className="min-w-24" disabled={update.isPending} onClick={() => changeStatus(wf)}>{wf.status === 'active' ? 'Pause' : 'Publish'}</Button></div>}</article>)}</div> : <EmptyState title={search ? 'No workflows found' : 'Start with one clear path'} body={search ? 'Try a different name or category.' : 'Create the first workflow your team can rely on. Add request fields, owners, and approval stages as you go.'} action={!search && canBuild && <Button onClick={() => openEditor()} data-testid="button-create-first-workflow"><Plus size={15} /> Create a workflow</Button>} />}</LoadState>
  </>;
}

function LegacyRequestCreateModal({ workflows, onClose }: { workflows: Workflow[]; onClose: () => void }) {
  const qc = useQueryClient(); const create = useCreateRequest(); const [, setLocation] = useLocation(); const [workflowId, setWorkflowId] = useState(workflows.find(w => w.status === 'active')?.id || '');
  const selected = workflows.find(w => w.id === workflowId); const [values, setValues] = useState<Record<string, unknown>>({});
  function submit(e: FormEvent) { e.preventDefault(); if (!selected) return; create.mutate({ data: { workflowId, formData: values } }, { onSuccess: request => { invalidate(qc, [getListRequestsQueryKey(), getGetDashboardQueryKey(), getGetReportOverviewQueryKey()]); onClose(); setLocation(`/requests/${request.id}`); } }); }
  return <Modal title="Start a request" subtitle="Choose a workflow, then share the context your approvers need." onClose={onClose}><form onSubmit={submit} className="space-y-4"><Field label="Workflow"><SelectInput value={workflowId} onChange={e => { setWorkflowId(e.target.value); setValues({}); }} required><option value="">Choose a workflow</option>{workflows.filter(w => w.status === 'active').map(w => <option key={w.id} value={w.id}>{w.name} · {w.category}</option>)}</SelectInput></Field>{selected?.fields.map(field => <Field key={field.id} label={`${field.label}${field.required ? ' *' : ''}`}>{field.type === 'textarea' ? <TextArea required={field.required} value={String(values[field.id] ?? '')} placeholder={field.placeholder || ''} onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))} /> : field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(values[field.id])} onChange={e => setValues(v => ({ ...v, [field.id]: e.target.checked }))} /> : field.type === 'select' ? <SelectInput required={field.required} value={String(values[field.id] ?? '')} onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))}><option value="">Choose an option</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</SelectInput> : <TextInput type={field.type === 'number' || field.type === 'date' ? field.type : 'text'} required={field.required} value={String(values[field.id] ?? '')} placeholder={field.placeholder || ''} onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))} />}</Field>)}{!selected && <EmptyState title="Choose a workflow to begin" body={workflows.length ? 'Select an active workflow above to see its form.' : 'There are no active workflows yet. Ask a workspace admin to publish one.'} />}{create.isError && <p className="form-error">Couldn’t submit this request. Please try again.</p>}<div className="modal-actions"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!selected || create.isPending}>{create.isPending ? 'Submitting…' : 'Submit request'} <ArrowRight size={15} /></Button></div></form></Modal>;
}
function RequestsPage() {
  const qc = useQueryClient(); const workflows = useListWorkflows(); const current = useGetCurrentUser(); const [status, setStatus] = useState('All statuses'); const [search, setSearch] = useState(''); const [create, setCreate] = useState(false);
  const params = useMemo(() => ({ ...(status !== 'All statuses' ? { status: status.replaceAll(' ', '_') as RequestStatus } : {}), ...(search.trim() ? { search: search.trim() } : {}) }), [status, search]);
  const query = useListRequests(params);
   return <><PageHeading eyebrow="EVERY REQUEST, ONE CLEAR VIEW" title="Requests" description="Follow each request from its first question to its final decision." action={current.data?.permissions.includes('create') && <Button onClick={() => setCreate(true)}><Plus size={16} /> New request</Button>} />
    <div className="list-toolbar"><label className="searchbox wide"><Search size={16} /><input aria-label="Search requests" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by request, workflow or person…" /></label><div className="select-with-icon"><Filter size={15} /><SelectInput aria-label="Filter request status" value={status} onChange={e => setStatus(e.target.value)}><option>All statuses</option><option>Submitted</option><option>Pending approval</option><option>Needs clarification</option><option>Approved</option><option>Rejected</option><option>Completed</option></SelectInput></div></div>
    <LoadState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}><section className="surface"><RequestTable requests={query.data || []} /></section></LoadState>
     {create && <RequestFormModal workflows={workflows.data || []} onClose={() => { setCreate(false); invalidate(qc, [getListRequestsQueryKey(), getGetDashboardQueryKey()]); }} />}
  </>;
}

function SubmittedFieldValue({ field, value, people }: { field: WorkflowField; value: unknown; people: Array<{ id: string; name: string }> }) {
  if (field.type === 'file') {
    const files = Array.isArray(value) ? value as Array<{ fileId: string; name: string }> : [];
    return files.length ? <div className="flex flex-col gap-1">{files.map(file => <a key={file.fileId} className="text-link" href={`${basePath}/api/storage/objects/${file.fileId}`} target="_blank" rel="noreferrer" data-testid={`link-request-file-${file.fileId}`}>{file.name}</a>)}</div> : <>—</>;
  }
  if (field.type === 'people') {
    const ids = Array.isArray(value) ? value : value ? [value] : [];
    const names = ids.map(id => people.find(person => person.id === id)?.name ?? 'Workspace member');
    return names.length ? names.join(', ') : '—';
  }
  if (field.type === 'checkbox') return value === true ? 'Yes' : value === false ? 'No' : '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return value === undefined || value === null || value === '' ? '—' : String(value);
}

function RequestDetailPage() {
  const params = useParams<{ requestId: string }>(); const id = Number(params.requestId); const qc = useQueryClient(); const query = useGetRequest(id);
  const current = useGetCurrentUser(); const people = useListPeople();
  const action = useActOnRequest(); const [comment, setComment] = useState(''); const [actionDialog, setActionDialog] = useState<'approve' | 'reject' | 'request_clarification' | 'respond_clarification' | null>(null);
  const request = query.data;
  function submitAction(e: FormEvent) { e.preventDefault(); if (!request || !actionDialog) return; action.mutate({ requestId: id, data: { action: actionDialog, comment: comment.trim() || null } }, { onSuccess: () => { invalidate(qc, [getGetRequestQueryKey(id), getListRequestsQueryKey(), getGetDashboardQueryKey(), getGetReportOverviewQueryKey()]); setActionDialog(null); setComment(''); } }); }
  return <LoadState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>{request ? <><div className="detail-back"><Link href="/requests"><ChevronLeft size={16} /> All requests</Link><span className="mono">{request.requestCode}</span></div><PageHeading eyebrow={request.workflowName.toUpperCase()} title={request.requestCode} description={`Submitted by ${request.requesterName} · ${formatDate(request.createdAt, { month: 'long', day: 'numeric', year: 'numeric' })}`} action={<StatusPill status={request.status} />} />
       <div className="detail-layout"><div className="detail-main">
      <section className="surface detail-progress"><div className="detail-panel-title"><div><h2>Approval progress</h2><p>Everyone can see where this is and what happens next.</p></div><span className="stage-progress-label">{request.currentStage} of {request.totalStages} stages</span></div><div className="stage-track">{request.stages.map((stage, i) => { const finished = i + 1 < request.currentStage || ['approved', 'completed'].includes(request.status); const now = i + 1 === request.currentStage && !finished; return <div className="stage-track-item" key={stage.id}><div className={cx('stage-track-node', finished && 'finished', now && 'current')}>{finished ? <Check size={14} /> : <span>{i + 1}</span>}</div><div className="stage-track-copy"><b>{stage.name}</b><small>{finished ? 'Completed' : now ? 'In review' : stage.assigneeLabel}</small></div>{i < request.stages.length - 1 && <i className={cx('stage-connector', finished && 'connector-done')} />}</div>; })}</div><div className="request-due"><Clock3 size={15} /> Due {formatDate(request.dueAt, { month: 'long', day: 'numeric', year: 'numeric' })}<span>·</span> Current owner: {request.currentStageName}</div></section>
       <section className="surface detail-form-data"><div className="detail-panel-title"><div><h2>Request details</h2><p>The context shared by the requester.</p></div></div><div className="submitted-fields">{request.fields.map(field => <div key={field.id} data-testid={`request-answer-${field.id}`}><span>{field.label}</span><b><SubmittedFieldValue field={field} value={request.formData[field.id]} people={people.data ?? []} /></b></div>)}</div></section>
      <section className="surface audit-panel"><div className="detail-panel-title"><div><h2>Activity trail</h2><p>A clear record of what happened and when.</p></div></div><div className="audit-list">{request.audit.map(event => <div className="audit-item" key={event.id}><span className="audit-dot"><Activity size={13} /></span><div><b>{event.action}</b><small>{event.actorName} · {formatDate(event.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>{event.comment && <p>“{event.comment}”</p>}</div></div>)}</div></section>
       </div><aside className="detail-aside">{request.status === 'needs_clarification' && request.requesterId === current.data?.id ? <section className="surface decision-card"><span className="section-label">YOUR TURN</span><h2>Send the missing detail.</h2><p>Your approver asked for more information. Add it here to keep this request moving.</p><Button className="w-full" onClick={() => setActionDialog('respond_clarification')} disabled={action.isPending}><CircleHelp size={16} /> Respond to clarification</Button>{action.isError && <p className="form-error mt-3">Your response didn’t go through. Please try again.</p>}</section> : current.data?.permissions.includes('approve') ? <section className="surface decision-card"><span className="section-label">YOUR TURN</span><h2>Help this move forward.</h2><p>Leave a clear decision so the requester and next owner have the context they need.</p><Button className="w-full" onClick={() => setActionDialog('approve')} disabled={action.isPending || ['approved', 'rejected', 'completed'].includes(request.status)}><Check size={16} /> Approve request</Button><Button variant="outline" className="mt-2 w-full" onClick={() => setActionDialog('request_clarification')} disabled={action.isPending || ['approved', 'rejected', 'completed'].includes(request.status)}><CircleHelp size={16} /> Ask for clarification</Button><Button variant="danger" className="mt-2 w-full" onClick={() => setActionDialog('reject')} disabled={action.isPending || ['approved', 'rejected', 'completed'].includes(request.status)}><XCircle size={16} /> Reject request</Button>{action.isError && <p className="form-error mt-3">Action didn’t go through. Please try again.</p>}</section> : <section className="surface decision-card"><span className="section-label">REQUEST STATUS</span><h2>Waiting on the next owner.</h2><p>You can follow progress here. The assigned approver will see the decision options when it is their turn.</p></section>}<section className="request-meta"><span>WORKFLOW</span><b>{request.workflowName}</b><span>REQUESTER</span><b>{request.requesterName}</b><span>LAST UPDATED</span><b>{timeAgo(request.updatedAt)}</b><span>ROUTING</span><b>{request.stages.length} approval steps</b></section></aside></div>
     {actionDialog && <Modal title={actionDialog === 'approve' ? 'Approve this request?' : actionDialog === 'reject' ? 'Reject this request?' : actionDialog === 'respond_clarification' ? 'Send your clarification?' : 'Ask for clarification'} subtitle="Add a note so the next step has the right context." onClose={() => setActionDialog(null)}><form onSubmit={submitAction}><Field label={actionDialog === 'respond_clarification' ? 'Your response' : 'Decision note'} hint={actionDialog === 'request_clarification' ? 'Tell the requester exactly what information would help.' : actionDialog === 'respond_clarification' ? 'Share the requested details with the approver.' : 'Optional, but a little context goes a long way.'}><TextArea autoFocus value={comment} onChange={e => setComment(e.target.value)} required={actionDialog === 'request_clarification' || actionDialog === 'respond_clarification'} placeholder="Add a note…" /></Field>{action.isError && <p className="form-error mt-3">We couldn’t save this action. Please try again.</p>}<div className="modal-actions mt-5"><Button type="button" variant="quiet" onClick={() => setActionDialog(null)}>Cancel</Button><Button type="submit" variant={actionDialog === 'reject' ? 'danger' : 'primary'} disabled={action.isPending}>{action.isPending ? 'Saving…' : actionDialog === 'approve' ? 'Confirm approval' : actionDialog === 'reject' ? 'Confirm rejection' : actionDialog === 'respond_clarification' ? 'Send response' : 'Send clarification request'}</Button></div></form></Modal>}
  </> : <EmptyState title="Request not found" body="This request may have been removed or you may not have access to it." action={<Link className="text-link" href="/requests">Back to requests <ArrowRight size={14} /></Link>} />}</LoadState>;
}

function TeamPage() {
  const current = useGetCurrentUser(); const qc = useQueryClient(); const users = useListUsers(); const roles = useListRoles(); const invite = useCreateUser(); const updateUser = useUpdateUser(); const createRole = useCreateRole(); const updateRole = useUpdateRole();
  const [inviteOpen, setInviteOpen] = useState(false); const [roleOpen, setRoleOpen] = useState(false); const [tab, setTab] = useState<'Members' | 'Roles'>('Members'); const [editingRole, setEditingRole] = useState<WorkspaceRole | undefined>(); const [search, setSearch] = useState('');
  const members = users.data?.filter(u => `${u.name} ${u.email} ${u.roleName}`.toLowerCase().includes(search.toLowerCase())) || [];
  if (current.data && !current.data.permissions.includes('admin')) return <PageHeading eyebrow="WORKSPACE ACCESS" title="Team settings are restricted" description="Only workspace administrators can manage members and roles." />;
  return <><PageHeading eyebrow="PEOPLE, PERMISSIONS, OWNERSHIP" title="Your team" description="Set clear responsibility for the work moving through your workspace." action={<Button onClick={() => setInviteOpen(true)}><Plus size={16} /> Invite a teammate</Button>} />
    <div className="team-stats"><div><Users size={17} /><b>{users.data?.length || 0}</b><span>members</span></div><div><ShieldCheck size={17} /><b>{roles.data?.length || 0}</b><span>workspace roles</span></div><div><Activity size={17} /><b>{users.data?.filter(user => user.status === 'active').length || 0}</b><span>active today</span></div></div>
    <div className="team-toolbar"><div className="tabs"><button className={tab === 'Members' ? 'selected' : ''} onClick={() => setTab('Members')}>Members</button><button className={tab === 'Roles' ? 'selected' : ''} onClick={() => setTab('Roles')}>Roles & permissions</button></div>{tab === 'Members' && <label className="searchbox"><Search size={16} /><input aria-label="Search team" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people" /></label>}{tab === 'Roles' && <Button variant="outline" onClick={() => { setEditingRole(undefined); setRoleOpen(true); }}><Plus size={15} /> New role</Button>}</div>
    {tab === 'Members' ? <LoadState loading={users.isLoading || roles.isLoading} error={users.isError || roles.isError} retry={() => { void users.refetch(); void roles.refetch(); }}>{members.length ? <section className="surface">{updateUser.isError && <p className="form-error px-5 pt-4" role="alert">Couldn’t update this teammate. Check the role or status and try again.</p>}<div className="overflow-x-auto"><table className="data-table"><thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>MANAGER</th><th>STATUS</th><th>JOINED</th><th /></tr></thead><tbody>{members.map(member => <tr key={member.id} data-testid={`team-member-${member.id}`}><td><div className="member-cell"><span className="avatar">{initials(member.name)}</span><span><b>{member.name}</b><small>{member.email}</small></span></div></td><td><SelectInput aria-label={`Update role for ${member.name}`} className="member-action" value={member.roleId} disabled={updateUser.isPending} onChange={e => updateUser.mutate({ userId: member.id, data: { roleId: e.target.value } }, { onSuccess: () => invalidate(qc, [getListUsersQueryKey(), getListRolesQueryKey()]) })}>{roles.data?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</SelectInput></td><td>{users.data?.find(u => u.id === member.managerId)?.name || '—'}</td><td><StatusPill status={member.status} /></td><td>{formatDate(member.createdAt, { month: 'short', year: 'numeric' })}</td><td><SelectInput aria-label={`Update status for ${member.name}`} className="member-action" value={member.status === 'inactive' ? 'inactive' : 'active'} disabled={updateUser.isPending} onChange={e => updateUser.mutate({ userId: member.id, data: { status: e.target.value as 'active' | 'inactive' } }, { onSuccess: () => invalidate(qc, [getListUsersQueryKey(), getListRolesQueryKey()]) })}><option value="active">Active</option><option value="inactive">Deactivate</option></SelectInput></td></tr>)}</tbody></table></div></section> : <EmptyState title="No teammates match" body={search ? 'Try a different name or email.' : 'Invite your teammates to give every handoff a real owner.'} action={!search && <Button onClick={() => setInviteOpen(true)}><Plus size={15} /> Invite a teammate</Button>} />}</LoadState> : <LoadState loading={roles.isLoading} error={roles.isError} retry={() => void roles.refetch()}>{roles.data?.length ? <div className="role-grid">{roles.data.map(role => <article className="surface role-card" key={role.id}><div className="role-card-head"><span className="role-badge"><ShieldCheck size={18} /></span><button className="card-menu" aria-label={`Edit ${role.name}`} onClick={() => { setEditingRole(role); setRoleOpen(true); }}><MoreHorizontal size={18} /></button></div><h2>{role.name}</h2><p>{role.description}</p><div className="permission-chips">{role.permissions.map(permission => <span key={permission}>{permission}</span>)}</div><div className="role-foot"><span>{role.memberCount} members</span>{role.isDefault && <span className="default-role">Default role</span>}</div></article>)}</div> : <EmptyState title="No roles configured" body="Create a role to shape what members can see and do." action={<Button onClick={() => setRoleOpen(true)}><Plus size={15} /> Create role</Button>} />}</LoadState>}
    {inviteOpen && <InviteModal roles={roles.data || []} members={users.data || []} busy={invite.isPending} error={invite.isError} onClose={() => setInviteOpen(false)} onSubmit={data => invite.mutate({ data }, { onSuccess: () => { invalidate(qc, [getListUsersQueryKey(), getListRolesQueryKey()]); setInviteOpen(false); } })} />}
    {roleOpen && <RoleModal role={editingRole} busy={createRole.isPending || updateRole.isPending} error={createRole.isError || updateRole.isError} onClose={() => setRoleOpen(false)} onSubmit={data => { const onSuccess = () => { invalidate(qc, [getListRolesQueryKey(), getListUsersQueryKey()]); setRoleOpen(false); }; if (editingRole) updateRole.mutate({ roleId: editingRole.id, data }, { onSuccess }); else createRole.mutate({ data }, { onSuccess }); }} />}
  </>;
}
function InviteModal({ roles, members, busy, error, onClose, onSubmit }: { roles: WorkspaceRole[]; members: WorkspaceUser[]; busy: boolean; error: boolean; onClose: () => void; onSubmit: (data: { name: string; email: string; roleId: string; managerId: string | null }) => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [roleId, setRoleId] = useState(roles[0]?.id || ''); const [managerId, setManagerId] = useState('');
  return <Modal title="Invite a teammate" subtitle="Give them a role and a clear place in the approval chain." onClose={onClose}><form className="space-y-4" onSubmit={e => { e.preventDefault(); onSubmit({ name: name.trim(), email: email.trim(), roleId, managerId: managerId || null }); }}><Field label="Full name"><TextInput required value={name} onChange={e => setName(e.target.value)} placeholder="Avery Chen" /></Field><Field label="Work email"><TextInput type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="avery@company.com" /></Field><Field label="Workspace role"><SelectInput required value={roleId} onChange={e => setRoleId(e.target.value)}><option value="">Choose a role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</SelectInput></Field><Field label="Manager (optional)"><SelectInput value={managerId} onChange={e => setManagerId(e.target.value)}><option value="">No manager assigned</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</SelectInput></Field>{error && <p className="form-error">Couldn’t invite this teammate. Check the email and try again.</p>}<div className="modal-actions"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !roleId}>{busy ? 'Sending invite…' : 'Send invite'} <ArrowRight size={15} /></Button></div></form></Modal>;
}
function RoleModal({ role, busy, error, onClose, onSubmit }: { role?: WorkspaceRole; busy: boolean; error: boolean; onClose: () => void; onSubmit: (data: { name: string; description: string; permissions: Array<'view' | 'create' | 'approve' | 'admin' | 'report' | 'build'> }) => void }) {
  const permissions: Array<'view' | 'create' | 'approve' | 'admin' | 'report' | 'build'> = ['view', 'create', 'approve', 'admin', 'report', 'build'];
  const [name, setName] = useState(role?.name || ''); const [description, setDescription] = useState(role?.description || ''); const [selected, setSelected] = useState(permissions.filter(p => role?.permissions.includes(p) ?? p === 'view'));
  return <Modal title={role ? 'Edit workspace role' : 'Create a workspace role'} subtitle="Keep permissions simple, transparent, and tied to responsibility." onClose={onClose}><form onSubmit={e => { e.preventDefault(); onSubmit({ name: name.trim(), description, permissions: selected }); }} className="space-y-4"><Field label="Role name"><TextInput required minLength={2} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Developer" /></Field><Field label="Description"><TextArea value={description} onChange={e => setDescription(e.target.value)} placeholder="What this role is responsible for" /></Field><div className="permission-options"><span className="form-label">Permissions</span>{permissions.map(permission => <label key={permission}><input type="checkbox" checked={selected.includes(permission)} onChange={e => setSelected(current => e.target.checked ? [...current, permission] : current.filter(p => p !== permission))} /><span><b>{permission === 'build' ? 'Build & publish workflows' : permission}</b><small>{({ view: 'See requests and workflows', create: 'Start requests and workflows', approve: 'Make approval decisions', admin: 'Manage workspace settings', report: 'View performance reports', build: 'Create, preview, edit, and publish workflow forms' })[permission]}</small></span></label>)}</div>{error && <p className="form-error">Couldn’t save this role. Please try again.</p>}<div className="modal-actions"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || selected.length === 0}>{busy ? 'Saving…' : role ? 'Save role' : 'Create role'}</Button></div></form></Modal>;
}

function ReportsPage() {
  const query = useGetReportOverview(); const current = useGetCurrentUser(); const report = query.data;
  if (current.data && !current.data.permissions.includes('report') && !current.data.permissions.includes('admin')) return <PageHeading eyebrow="WORKSPACE ACCESS" title="Reports are restricted" description="Your workspace role does not include report access." />;
  const maxVolume = Math.max(1, ...(report?.weeklyVolume.map(item => item.count) || [1]));
  const maxWork = Math.max(1, ...(report?.workload.map(item => item.pending + item.completed) || [1]));
  return <LoadState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}><><PageHeading eyebrow="THE SHAPE OF WORK" title="Reports" description="Spot the bottlenecks, understand the load, and make a more thoughtful process." action={<span className="report-period"><SlidersHorizontal size={15} /> Last 7 days</span>} />
    <div className="report-kpis"><div className="surface report-kpi"><span>TOTAL REQUESTS</span><b>{report?.totalRequests ?? 0}</b><small><span className="trend-good"><ArrowUpRight size={14} /></span> Across all workflows</small></div><div className="surface report-kpi"><span>IN PROGRESS</span><b>{report?.pendingRequests ?? 0}</b><small>Requests waiting on a decision</small></div><div className="surface report-kpi"><span>AVG. TURNAROUND</span><b>{report?.averageTurnaroundHours ?? 0}<small> hrs</small></b><small>From submission to final decision</small></div><div className="surface report-kpi"><span>APPROVAL RATE</span><b>{report?.approvalRate ?? 0}<small>%</small></b><small>Requests approved this period</small></div></div>
    <div className="report-grid"><section className="surface chart-panel"><div className="panel-heading"><div><h2>Request volume</h2><p>Requests submitted, grouped by day.</p></div><span className="chart-legend"><i /> Requests</span></div><div className="volume-chart"><div className="chart-y">{[maxVolume, Math.round(maxVolume * .66), Math.round(maxVolume * .33), 0].map((n, i) => <span key={i}>{n}</span>)}</div><div className="chart-bars">{report?.weeklyVolume.map((item, i) => <div className="chart-column" key={`${item.label}-${i}`}><span className="bar-value">{item.count}</span><div className="bar-track"><i style={{ height: `${Math.max(4, item.count / maxVolume * 100)}%` }} /></div><small>{item.label}</small></div>)}</div></div></section>
      <section className="surface chart-panel workload-panel"><div className="panel-heading"><div><h2>Approver workload</h2><p>Current queue alongside completed work.</p></div></div>{report?.workload.length ? <div className="workload-list">{report.workload.map(person => <div className="workload-row" key={person.name}><span className="avatar">{initials(person.name)}</span><div className="workload-person"><b>{person.name}</b><div className="workload-bar"><i style={{ width: `${person.pending / maxWork * 100}%` }} /><i style={{ width: `${person.completed / maxWork * 100}%` }} /></div></div><span className="work-count"><b>{person.pending}</b><small> pending</small></span></div>)}</div> : <EmptyState title="No workload data" body="Approver activity will appear as requests move through the workspace." />}<div className="workload-legend"><span><i className="pending-key" /> Pending</span><span><i className="complete-key" /> Completed</span></div></section></div>
    <section className="report-insight"><div className="insight-mark"><Sparkles size={17} /></div><div><b>Keep momentum visible.</b><p>Reports update as requests move through each approval stage. Use this view to spot where a small process change could help the whole team.</p></div><Link href="/workflows" className="text-link">Review workflows <ArrowRight size={14} /></Link></section>
  </></LoadState>;
}

function NotificationsPage() {
  const qc = useQueryClient(); const query = useListNotifications(); const mark = useMarkNotificationRead(); const [filter, setFilter] = useState('All');
  const list = query.data?.filter(item => filter === 'All' || (filter === 'Unread' ? !item.read : item.read)) || [];
  function markRead(item: Notification) { if (!item.read) mark.mutate({ notificationId: item.id }, { onSuccess: () => invalidate(qc, [getListNotificationsQueryKey()]) }); }
  return <><PageHeading eyebrow="A LITTLE NUDGE, WHEN IT MATTERS" title="Notifications" description="A useful trail of decisions, updates, and work that needs a response." action={<div className="tabs compact">{['All', 'Unread', 'Read'].map(t => <button key={t} className={filter === t ? 'selected' : ''} onClick={() => setFilter(t)}>{t}</button>)}</div>} />
    <LoadState loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>{list.length ? <div className="notification-list">{list.map(item => <article className={cx('surface notification-card', !item.read && 'unread')} key={item.id} data-testid={`notification-${item.id}`}><span className={`notification-icon notif-${item.type}`}><Bell size={17} /></span><div className="notification-copy"><div className="flex flex-wrap items-center gap-2"><h2>{item.title}</h2>{!item.read && <span className="unread-label">NEW</span>}</div><p>{item.message}</p><small>{timeAgo(item.createdAt)}</small><div className="notification-actions">{item.requestId && <Link href={`/requests/${item.requestId}`} onClick={() => markRead(item)} className="text-link">Open request <ArrowRight size={14} /></Link>}{!item.read && <button className="mark-read" onClick={() => markRead(item)} disabled={mark.isPending}><Check size={14} /> Mark as read</button>}</div></div><span className="notification-type">{item.type.replaceAll('_', ' ')}</span></article>)}</div> : <EmptyState title={filter === 'Unread' ? 'You’re all caught up' : 'Nothing to notify you about'} body={filter === 'Unread' ? 'New updates will land here when a request needs your attention.' : 'When something changes in your workspace, you’ll find the update here.'} />}</LoadState>
  </>;
}
function NotFoundPage() { return <div className="not-found"><span className="mono">404 / LOST IN THE FLOW</span><h1 className="display">This page took<br /><em>a different route.</em></h1><p>Let’s get you back to work.</p><Link className="button button-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold" href="/dashboard">Back to overview <ArrowRight size={15} /></Link></div>; }

export default App;
