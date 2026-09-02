import { Link } from 'react-router-dom'
import {
  Zap, Code2, MessageSquare, Brain, GitBranch, Bug, Bell, Shield,
  ArrowRight, CheckCircle, Terminal, AlertTriangle, TrendingUp,
  ChevronRight, Star, ExternalLink
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const FEATURES = [
  {
    icon: Bug,
    title: 'Error Fingerprinting',
    description: 'Intelligently groups duplicate errors using type, file, and line number. 127 occurrences shown as one incident.',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
  },
  {
    icon: Brain,
    title: 'AI Root-Cause Analysis',
    description: 'Powered by Gemini AI. Every error gets an instant diagnosis — root cause, explanation, and a suggested code fix.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    icon: Bell,
    title: 'Slack Alerts',
    description: 'Real-time Slack notifications for critical errors with full context, AI diagnosis, and one-click GitHub Issue creation.',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
  },
  {
    icon: Code2,
    title: 'GitHub Integration',
    description: 'GitHub App with webhook support for push, PRs, deployments, and workflow runs. Auto-create issues from incidents.',
    color: 'text-slate-300',
    bg: 'bg-slate-500/10',
  },
  {
    icon: Shield,
    title: 'Severity Detection',
    description: 'Rule-based severity scoring (Critical → Low) with AI enhancement. Never miss a production-down event.',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
  },
  {
    icon: TrendingUp,
    title: 'Error Analytics',
    description: 'Trend charts, occurrence heatmaps, and health dashboards for every repository in your stack.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Connect GitHub', desc: 'Install the PipelineIQ GitHub App and select repositories to monitor in one click.' },
  { step: '02', title: 'Add the SDK', desc: 'Drop our 3-line JavaScript SDK into your app. It auto-captures exceptions and unhandled rejections.' },
  { step: '03', title: 'AI Diagnoses', desc: 'Every error is fingerprinted, grouped, and analyzed by Gemini AI for root cause and fix suggestions.' },
  { step: '04', title: 'Slack Alert', desc: 'Critical errors trigger an instant Slack alert with full context, AI diagnosis, and action buttons.' },
]

const TESTIMONIALS = [
  {
    name: 'Sarah K.',
    role: 'Senior Engineer @ Stripe',
    avatar: 'SK',
    text: "PipelineIQ caught a null-pointer crash in production that had been silently failing for 3 days. The AI fix suggestion was spot-on. We deployed the fix in 12 minutes.",
  },
  {
    name: 'Marcus T.',
    role: 'CTO @ Finflow',
    avatar: 'MT',
    text: "We replaced Sentry + on-call runbooks with PipelineIQ. The Gemini AI diagnosis saves our team 40 minutes of debugging per incident. It's a force multiplier.",
  },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-6 md:px-12 border-b border-[var(--border)] bg-[var(--bg-primary)]/80 backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 shadow-lg shadow-brand-900/30">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold text-[var(--text-primary)]">PipelineIQ</span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm text-[var(--text-secondary)]">
          <a href="#features" className="hover:text-[var(--text-primary)] transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-[var(--text-primary)] transition-colors">How it works</a>
          <a href="#testimonials" className="hover:text-[var(--text-primary)] transition-colors">Testimonials</a>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className="btn-ghost text-sm py-1.5">Sign in</Link>
          <Link to="/login" className="btn-primary text-sm py-1.5">Get started free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden hero-grid">
        {/* Glow blobs */}
        <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-48 left-1/4 w-64 h-64 bg-violet-700/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-600/30 bg-brand-600/10 px-4 py-1.5 text-xs text-brand-300 mb-8 animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
            Powered by Google Gemini AI
            <ChevronRight className="h-3.5 w-3.5" />
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 animate-slide-up leading-[1.05]">
            From crash to diagnosis
            <br />
            <span className="gradient-text">to Slack — automatically.</span>
          </h1>

          <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 animate-slide-up">
            PipelineIQ monitors your GitHub repositories, captures application errors, runs AI-powered root-cause analysis, and fires Slack alerts — all in seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16 animate-slide-up">
            <Link to="/login" className="btn-primary text-base px-6 py-3 glow-brand">
              Start monitoring free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how-it-works"
              className="btn-secondary text-base px-6 py-3"
            >
              <Terminal className="h-4 w-4" />
              See how it works
            </a>
          </div>

          {/* Dashboard mockup */}
          <div className="relative mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden shadow-2xl shadow-black/30 animate-slide-up">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-amber-500/80" />
              <span className="h-3 w-3 rounded-full bg-green-500/80" />
              <span className="ml-3 text-xs text-[var(--text-muted)] font-mono">pipelineiq.dev/dashboard</span>
            </div>
            {/* Dashboard preview content */}
            <div className="p-6 text-left">
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Repositories', value: '4', color: 'text-brand-400' },
                  { label: 'Total Errors', value: '128', color: 'text-[var(--text-primary)]' },
                  { label: 'Critical', value: '7', color: 'text-red-400' },
                  { label: 'Incidents', value: '12', color: 'text-orange-400' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
                    <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
                <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Recent Incidents</p>
                {[
                  { type: 'TypeError', file: 'Expense.jsx:47', count: '127 occurrences', sev: 'bg-red-500' },
                  { type: 'HTTPError', file: 'db_service.py:89', count: '23 occurrences', sev: 'bg-orange-500' },
                  { type: 'ReferenceError', file: 'GroupDetail.jsx:12', count: '45 occurrences', sev: 'bg-orange-500' },
                ].map(e => (
                  <div key={e.type} className="flex items-center gap-3">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${e.sev}`} />
                    <span className="text-sm font-mono text-[var(--text-primary)]">{e.type}</span>
                    <span className="text-xs text-[var(--text-muted)] flex-1 truncate">{e.file}</span>
                    <span className="text-xs text-[var(--text-muted)]">{e.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos */}
      <section className="py-12 border-y border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-8">Integrates with the tools you already use</p>
          <div className="flex items-center justify-center gap-12 flex-wrap">
            {[
              { icon: Code2, name: 'GitHub' },
              { icon: MessageSquare, name: 'Slack' },
              { icon: Brain, name: 'Gemini AI' },
            ].map(({ icon: Icon, name }) => (
              <div key={name} className="flex items-center gap-2.5 text-[var(--text-secondary)]">
                <Icon className="h-6 w-6" />
                <span className="text-base font-semibold">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="label mb-3">How it works</p>
            <h2 className="text-4xl font-bold mb-4">Four steps from error to fix</h2>
            <p className="text-[var(--text-secondary)] max-w-lg mx-auto">
              PipelineIQ automates the entire incident response workflow so your team can focus on shipping, not debugging.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map(({ step, title, desc }, i) => (
              <div key={step} className="relative">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-full w-full h-px bg-gradient-to-r from-brand-600/40 to-transparent -translate-y-px z-0" />
                )}
                <div className="card p-5 relative z-10">
                  <span className="font-mono text-xs text-brand-400 font-bold">{step}</span>
                  <h3 className="font-semibold text-[var(--text-primary)] mt-2 mb-2">{title}</h3>
                  <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 bg-[var(--bg-secondary)]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="label mb-3">Features</p>
            <h2 className="text-4xl font-bold mb-4">Everything your team needs</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, description, color, bg }) => (
              <div key={title} className="card-hover p-6">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg} mb-4`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="label mb-3">Testimonials</p>
            <h2 className="text-4xl font-bold mb-4">Loved by engineering teams</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {TESTIMONIALS.map(({ name, role, avatar, text }) => (
              <div key={name} className="card p-6">
                <div className="flex mb-3 gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-5 leading-relaxed">"{text}"</p>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold">
                    {avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 bg-[var(--bg-secondary)]">
        <div className="max-w-2xl mx-auto text-center">
          <div className="card p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-600/5 to-violet-700/5 pointer-events-none" />
            <Zap className="h-10 w-10 text-brand-400 mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-3">Start monitoring in minutes</h2>
            <p className="text-[var(--text-secondary)] mb-8">
              Free plan includes 3 repositories and 1,000 error events/month. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/login" className="btn-primary text-base px-6 py-3 justify-center glow-brand">
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://github.com"
                className="btn-secondary text-base px-6 py-3 justify-center"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Code2 className="h-4 w-4" />
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-400" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">PipelineIQ</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">© 2026 PipelineIQ. Built with React, FastAPI, and Gemini AI.</p>
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Terms</a>
            <a href="#" className="hover:text-[var(--text-primary)] transition-colors">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
