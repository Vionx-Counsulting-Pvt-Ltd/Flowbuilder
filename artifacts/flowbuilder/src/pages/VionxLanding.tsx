import { Link } from 'wouter';
import { ArrowRight, ArrowUpRight, Check, Database, FileText, GitBranch, History, LayoutDashboard, Building2, Sigma } from 'lucide-react';
import './VionxLanding.css';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const capabilities = [
  { icon: FileText, title: 'Request forms you control', body: 'Design the questions each process needs, with required rules, conditional fields and clear layouts.' },
  { icon: Sigma, title: 'AppSheet-style expressions', body: 'Compute values, show or hide fields and validate answers with formulas your team already knows.' },
  { icon: Database, title: 'Maintained data tables', body: 'Keep reference data in one place and link form choices and related values to it.' },
  { icon: GitBranch, title: 'Accountable approvals', body: 'Route by role or reporting manager, in sequence or in parallel, with a response window on every stage.' },
  { icon: History, title: 'Full request history', body: 'Every submission, decision and clarification stays attached to the request.' },
  { icon: LayoutDashboard, title: 'Dashboard and reporting', body: 'See what is waiting, what is overdue and how work is moving across the workspace.' },
];
const sectors = ['MSMEs', 'Microfinance institutions', 'Non-bank financial businesses'];
const steps = [
  { n: '01', t: 'Define the request', b: 'Build the form and the rules behind it.' },
  { n: '02', t: 'Assign the route', b: 'Name an owner and a response window for each stage.' },
  { n: '03', t: 'Decide with context', b: 'Approvers see the full request and its history.' },
  { n: '04', t: 'Review the record', b: 'Track progress and outcomes from one dashboard.' },
];

export default function VionxLanding() {
  return <div className="vx-landing">
    <a className="vx-skip" href="#vx-main">Skip to content</a>
    <header className="vx-nav">
      <Link href="/" className="vx-brand" aria-label="FlowBuilder by VionX"><img src={`${base}/vionx-logo.png`} alt="VionX Consulting" width="140" height="48" /><span>FlowBuilder</span></Link>
      <nav className="vx-links" aria-label="Primary"><a href="#capabilities">Capabilities</a><a href="#approach">How it works</a><a href="#built-for">Built for</a><a href="#about">About VionX</a></nav>
      <div className="vx-nav-cta"><Link href="/sign-in" className="vx-link-quiet">Sign in</Link><Link href="/sign-up" className="vx-btn vx-btn-primary">Get started</Link></div>
    </header>
    <main id="vx-main">
      <section className="vx-hero">
        <div className="vx-hero-copy">
          <p className="vx-eyebrow">Workflow management by VionX</p>
          <h1>Clear processes.<br />Accountable approvals.</h1>
          <p className="vx-lead">FlowBuilder gives MSMEs, microfinance institutions and non-bank financial businesses one disciplined place to design requests, route decisions and keep the record.</p>
          <div className="vx-actions"><Link href="/sign-up" className="vx-btn vx-btn-primary">Create your workspace <ArrowRight size={16} /></Link><a className="vx-btn vx-btn-outline" href="https://vionx.lk/#contact" target="_blank" rel="noreferrer">Talk to VionX <ArrowUpRight size={16} /></a></div>
        </div>
        <figure className="vx-example" aria-label="Example workflow">
          <figcaption>Example: staff expense approval</figcaption>
          <div className="vx-card">
            <div className="vx-card-head"><b>Expense reimbursement</b><span>Example</span></div>
            <div className="vx-form"><div><small>Amount</small><i>Required</i></div><div><small>Business purpose</small><i>Required</i></div><div><small>Receipt</small><i>Optional</i></div></div>
            <ol className="vx-route">
              <li><span><Check size={13} /></span><div><b>Submitted</b><small>Requester</small></div></li>
              <li><span className="is-now" /><div><b>Line manager review</b><small>Reporting manager, 24h window</small></div></li>
              <li><span /><div><b>Finance approval</b><small>Role: Finance</small></div></li>
            </ol>
          </div>
          <p>Illustrative only. Not live data.</p>
        </figure>
      </section>

      <section className="vx-section" id="capabilities">
        <div className="vx-head"><p className="vx-eyebrow">What FlowBuilder does</p><h2>The controls a process needs, without the overhead.</h2></div>
        <div className="vx-grid">{capabilities.map(c => <article key={c.title}><c.icon size={22} strokeWidth={1.7} /><h3>{c.title}</h3><p>{c.body}</p></article>)}</div>
      </section>

      <section className="vx-dark" id="built-for">
        <div className="vx-dark-in">
          <div><p className="vx-eyebrow vx-on-dark">Built for</p><h2>Businesses where every approval has to be traceable.</h2><p className="vx-dark-p">Separate workspaces keep each organisation's workflows, people and data apart, so one product can serve many teams cleanly.</p></div>
          <ul>{sectors.map(s => <li key={s}><Building2 size={18} />{s}</li>)}</ul>
        </div>
      </section>

      <section className="vx-section" id="approach">
        <div className="vx-head"><p className="vx-eyebrow">How it works</p><h2>From first question to final decision.</h2></div>
        <ol className="vx-steps">{steps.map(s => <li key={s.n}><span>{s.n}</span><h3>{s.t}</h3><p>{s.b}</p></li>)}</ol>
      </section>

      <section className="vx-about" id="about">
        <div><p className="vx-eyebrow">About VionX</p><h2>Clarity in Strategy. Precision in Execution.</h2></div>
        <div><p>FlowBuilder is a product of VionX Consulting, a Corporate Advisory and Technology firm that combines industry and domain experience with technical precision.</p><p>Alongside workflow management systems, VionX builds ERP for MSMEs, core systems for Microfinance and NBFCs, and ECL models.</p><a className="vx-link-arrow" href="https://vionx.lk/" target="_blank" rel="noreferrer">Visit vionx.lk <ArrowUpRight size={15} /></a></div>
      </section>

      <section className="vx-cta"><h2>Put your next process on a clear path.</h2><div className="vx-actions"><Link href="/sign-up" className="vx-btn vx-btn-primary">Get started <ArrowRight size={16} /></Link><a className="vx-btn vx-btn-outline" href="https://vionx.lk/#contact" target="_blank" rel="noreferrer">Book a consultation <ArrowUpRight size={16} /></a></div></section>
    </main>
    <footer className="vx-footer"><img src={`${base}/vionx-logo.png`} alt="VionX Consulting" width="112" height="39" /><span>FlowBuilder is a VionX project.</span><div><Link href="/sign-in">Sign in</Link><a href="https://vionx.lk/" target="_blank" rel="noreferrer">vionx.lk</a></div></footer>
  </div>;
}
