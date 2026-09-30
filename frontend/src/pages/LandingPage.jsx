import { Link } from 'react-router-dom'
import {
  Code2, MessageSquare, Brain, Bell, Shield, ArrowRight, Terminal, TrendingUp,
  Sparkles, Fingerprint, Layers, Server, CheckCircle2, ShieldCheck, FileCode, Repeat2,
} from 'lucide-react'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { Logo } from '@/components/ui/Logo'
import { PipelineFlow } from '@/components/ui/PipelineFlow'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'

const FEATURES = [
  { icon: Fingerprint, title: 'Smart fingerprinting', tone: 'from-rose-500 to-red-600',
    description: 'Duplicate errors are grouped by type, normalized message, file and line. A thousand crashes become one issue.' },
  { icon: Brain, title: 'AI root-cause analysis', tone: 'from-violet-500 to-indigo-600',
    description: 'Gemini explains what broke, why, and suggests a concrete code fix. Secrets are redacted before anything leaves your server.' },
  { icon: Bell, title: 'One alert, not a hundred', tone: 'from-emerald-400 to-teal-600',
    description: 'Rich Slack alerts with the diagnosis and action buttons. Follow-ups are threaded, so repeats never spam your channel.' },
  { icon: Code2, title: 'GitHub native', tone: 'from-slate-500 to-slate-700',
    description: 'A GitHub App with verified webhooks. Create an issue in one click, and closing it resolves the incident.' },
  { icon: Shield, title: 'Severity detection', tone: 'from-orange-400 to-amber-600',
    description: 'Rule-based severity from the first event, refined by AI. Production-down issues rise to the top.' },
  { icon: TrendingUp, title: 'Repository health', tone: 'from-cyan-400 to-sky-600',
    description: 'Trends, health scores and a live feed of pushes, PRs, workflow runs and deployments per repository.' },
]

const HOW_IT_WORKS = [
  { title: 'Connect GitHub', desc: 'Install the PipelineIQ GitHub App and pick the repositories to monitor.' },
  { title: 'Add the SDK', desc: 'Drop in the JavaScript SDK with your DSN. Uncaught errors are captured automatically.' },
  { title: 'AI diagnoses', desc: 'Each new error group is fingerprinted and analyzed by Gemini for root cause and fix.' },
  { title: 'Get alerted', desc: 'One Slack alert per problem, with the diagnosis and a button to open a GitHub issue.' },
]

const HERO_PIPELINE = [
  { key: 'app', label: 'Your app', sublabel: 'SDK', icon: Terminal, status: 'idle' },
  { key: 'api', label: 'Ingest', sublabel: 'API', icon: Server, status: 'idle' },
  { key: 'group', label: 'Group', sublabel: 'Fingerprint', icon: Layers, status: 'idle' },
  { key: 'ai', label: 'Diagnose', sublabel: 'Gemini', icon: Brain, status: 'idle' },
  { key: 'alert', label: 'Alert', sublabel: 'Slack', icon: MessageSquare, status: 'idle' },
  { key: 'issue', label: 'Track', sublabel: 'GitHub', icon: Code2, status: 'idle' },
]

const SDK_SNIPPET = `import PipelineIQ from '@pipelineiq/sdk'

PipelineIQ.init({
  dsn: 'YOUR_PROJECT_DSN',
  environment: 'production',
})

// Uncaught errors are captured automatically, or report one yourself:
PipelineIQ.captureException(error)`

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-6 md:px-12 border-b border-[var(--border)] bg-[var(--bg-primary)]/60 backdrop-blur-xl">
        <Link to="/"><Logo subtitle={null} /></Link>
        <div className="hidden md:flex items-center gap-8 text-sm text-[var(--text-secondary)]">
          <a href="#how-it-works" className="hover:text-[var(--text-primary)] transition-colors">How it works</a>
          <a href="#features" className="hover:text-[var(--text-primary)] transition-colors">Features</a>
          <a href="#sdk" className="hover:text-[var(--text-primary)] transition-colors">SDK</a>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className="btn-ghost text-sm py-1.5 hidden sm:inline-flex">Sign in</Link>
          <Link to="/login" className="btn-primary text-sm py-1.5">Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-36 pb-20 px-6 hero-grid">
        <div className="aurora top-10 left-[10%] h-96 w-96 bg-violet-600/30" />
        <div className="aurora top-40 right-[5%] h-80 w-80 bg-cyan-500/20" style={{ animationDelay: '-5s' }} />
        <div className="aurora top-[28rem] left-[40%] h-72 w-72 bg-indigo-600/20" style={{ animationDelay: '-9s' }} />

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs text-brand-300 mb-8 animate-fade-in backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            AI root-cause analysis powered by Google Gemini
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 animate-slide-up leading-[1.02]">
            From crash to diagnosis
            <br />
            <span className="gradient-text">to Slack, automatically.</span>
          </h1>

          <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 animate-slide-up">
            PipelineIQ captures errors from your apps, groups duplicates, asks AI what went wrong and alerts your team
            once, with the fix attached.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16 animate-slide-up">
            <Link to="/login" className="btn-primary text-base px-7 py-3">
              Start monitoring <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#sdk" className="btn-secondary text-base px-7 py-3 backdrop-blur">
              <Terminal className="h-4 w-4" /> View the SDK
            </a>
          </div>

          {/* Live pipeline */}
          <div className="card gradient-border p-8 mb-10 animate-slide-up">
            <p className="label mb-6">The pipeline</p>
            <PipelineFlow nodes={HERO_PIPELINE} showStatusText={false} />
          </div>

          {/* Product preview: an example alert and its AI diagnosis */}
          <div className="grid md:grid-cols-2 gap-5 text-left">
            <PreviewErrorCard />
            <PreviewSlackCard />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-4">Illustrative example of an error group and its Slack alert.</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6 border-t border-[var(--border)]">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow="How it works" title="Four steps from error to fix" />
          <div className="grid md:grid-cols-4 gap-5">
            {HOW_IT_WORKS.map(({ title, desc }, i) => (
              <div key={title} className="card-hover p-6 relative">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white shadow-[0_0_20px_-4px_rgba(139,92,246,0.8)] mb-4">
                  {i + 1}
                </div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24 px-6 bg-[var(--bg-secondary)] border-y border-[var(--border)] overflow-hidden">
        <div className="aurora -top-20 right-0 h-80 w-80 bg-violet-600/15" />
        <div className="relative max-w-5xl mx-auto">
          <SectionHeading eyebrow="Features" title="Everything between the crash and the fix" />
          <div className="grid md:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, description, tone }) => (
              <div key={title} className="card-hover p-6 group">
                <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg mb-5 transition-transform group-hover:scale-110', tone)}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SDK */}
      <section id="sdk" className="py-24 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="label mb-3">SDK</p>
            <h2 className="text-4xl font-bold tracking-tight mb-4">A few lines to start capturing</h2>
            <p className="text-[var(--text-secondary)] mb-6">Works in the browser and Node.js. No backend URL is hardcoded: everything comes from your DSN.</p>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              {['Captures uncaught errors and promise rejections', 'Per-repository ingest key, submit-only', 'beforeSend hook to scrub or drop events', 'Never throws, never breaks your app'].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />{item}
                </li>
              ))}
            </ul>
          </div>
          <div className="gradient-border rounded-xl shadow-[0_20px_60px_-20px_rgba(124,58,237,0.5)]">
            <CodeBlock code={SDK_SNIPPET} language="javascript" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24">
        <div className="relative max-w-4xl mx-auto overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-600 p-12 text-center shadow-[0_30px_80px_-30px_rgba(124,58,237,0.8)]">
          <div className="absolute inset-0 hero-grid opacity-40" />
          <ShieldCheck className="relative h-12 w-12 text-white/90 mx-auto mb-5" />
          <h2 className="relative text-3xl md:text-4xl font-bold text-white mb-3">Start monitoring in minutes</h2>
          <p className="relative text-white/80 mb-8 max-w-lg mx-auto">Connect GitHub, add the SDK and get your first AI diagnosis in a Slack alert.</p>
          <Link to="/login" className="relative inline-flex items-center gap-2 rounded-lg bg-white px-7 py-3 text-base font-semibold text-indigo-700 shadow-xl hover:bg-white/90 transition-colors">
            Create an account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size="sm" subtitle={null} />
          <p className="text-xs text-[var(--text-muted)]">© 2026 PipelineIQ. Built with React, Express, Supabase and Gemini.</p>
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <a href="#features" className="hover:text-[var(--text-primary)] transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-[var(--text-primary)] transition-colors">How it works</a>
            <a href="#sdk" className="hover:text-[var(--text-primary)] transition-colors">SDK</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function SectionHeading({ eyebrow, title }) {
  return (
    <div className="text-center mb-14">
      <p className="label mb-3">{eyebrow}</p>
      <h2 className="text-4xl font-bold tracking-tight">{title}</h2>
    </div>
  )
}

function PreviewErrorCard() {
  return (
    <div className="card gradient-border p-5 animate-float">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500 pulse-ring text-red-500" />
        <span className="font-mono text-sm font-semibold">TypeError</span>
        <span className="badge-critical">Critical</span>
        <span className="badge-open">Open</span>
      </div>
      <p className="font-mono text-xs text-[var(--text-secondary)] mb-4">Cannot read properties of undefined (reading 'name')</p>
      <div className="flex gap-4 text-xs text-[var(--text-muted)] mb-4">
        <span className="flex items-center gap-1.5"><FileCode className="h-3.5 w-3.5" />Expense.jsx:47</span>
        <span className="flex items-center gap-1.5"><Repeat2 className="h-3.5 w-3.5" />127 occurrences · 1 group</span>
      </div>
      <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-300 mb-1"><Brain className="h-3.5 w-3.5" />AI diagnosis</p>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          <code>user</code> is undefined after the session expires, but ExpenseCard reads <code>user.name</code> without a guard.
        </p>
        <pre className="mt-2 rounded bg-black/40 p-2 text-[11px] text-emerald-300 overflow-x-auto">{"const name = user?.name ?? 'Unknown'"}</pre>
      </div>
    </div>
  )
}

function PreviewSlackCard() {
  return (
    <div className="card p-5 animate-float" style={{ animationDelay: '-3s' }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4a154b]"><MessageSquare className="h-4 w-4 text-white" /></div>
        <div>
          <p className="text-sm font-semibold">#alerts-production</p>
          <p className="text-[10px] text-[var(--text-muted)]">PipelineIQ · APP</p>
        </div>
      </div>
      <div className="border-l-4 border-red-500 pl-3 space-y-2">
        <p className="text-sm font-bold">🚨 PipelineIQ Alert</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <p><span className="font-semibold">Repository</span><br /><span className="text-[var(--text-secondary)]">acme/splitwise</span></p>
          <p><span className="font-semibold">Severity</span><br /><span className="text-red-400">🔴 CRITICAL</span></p>
          <p><span className="font-semibold">File</span><br /><span className="font-mono text-[var(--text-secondary)]">Expense.jsx:47</span></p>
          <p><span className="font-semibold">Environment</span><br /><span className="text-[var(--text-secondary)]">production</span></p>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {['View Error', 'View GitHub'].map((label) => (
            <span key={label} className="rounded border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium">{label}</span>
          ))}
          <span className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white">Create GitHub Issue</span>
        </div>
      </div>
    </div>
  )
}
