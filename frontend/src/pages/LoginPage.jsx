import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Code2, ArrowRight, AlertCircle, CheckCircle, Brain, Fingerprint, BellRing } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Spinner } from '@/components/ui/LoadingState'

export function LoginPage() {
  const { isAuthenticated, isConfigured, signIn, signUp, signInWithGitHub, resetPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Links can pick the form: <Link to="/login" state={{ mode: 'signup' }}> (or 'signin').
  const requestedMode = location.state?.mode === 'signup' ? 'signup' : 'signin'
  const [mode, setMode] = useState(requestedMode) // 'signin' | 'signup'
  // Also when that link is followed while /login is already open (e.g. from the Helpline).
  const [modeLocationKey, setModeLocationKey] = useState(location.key)
  if (modeLocationKey !== location.key) {
    setModeLocationKey(location.key)
    if (location.state?.mode) setMode(requestedMode)
  }
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const destination = location.state?.from ?? '/dashboard'
  if (isAuthenticated) return <Navigate to={destination} replace />

  const run = async (action) => {
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    run(async () => {
      if (mode === 'signin') {
        await signIn(email, password)
        navigate(destination, { replace: true })
      } else {
        const { needsConfirmation } = await signUp(email, password, fullName.trim())
        if (needsConfirmation) {
          setInfo('Check your inbox to confirm your email, then sign in.')
          setMode('signin')
        } else {
          navigate('/dashboard', { replace: true })
        }
      }
    })
  }

  const handleForgotPassword = () => {
    if (!email) {
      setError('Enter your email first, then click "Forgot password?".')
      return
    }
    run(async () => {
      await resetPassword(email)
      setInfo('If an account exists for that email, a reset link is on its way.')
    })
  }

  const switchMode = () => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
    setError('')
    setInfo('')
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex">
      <BrandPanel />
      <div className="relative flex flex-1 flex-col">
      <div className="flex items-center justify-between px-6 h-16">
        <Link to="/" className="lg:invisible"><Logo size="sm" subtitle={null} /></Link>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {mode === 'signin' ? 'Sign in to your PipelineIQ account' : 'Start monitoring your repositories'}
            </p>
          </div>

          <div className="card gradient-border p-8 space-y-5">
            {import.meta.env.VITE_DEMO_MODE === 'true' && (
              <div className="rounded-lg bg-brand-500/10 border border-brand-500/20 px-3 py-2.5 text-sm text-brand-300">
                Demo mode: sign in with any email and password.
              </div>
            )}
            {!isConfigured && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-sm text-amber-500">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>frontend/.env</code>.</span>
              </div>
            )}

            <button
              onClick={() => run(signInWithGitHub)}
              disabled={loading || !isConfigured}
              className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--border)] transition-all duration-200 active:scale-95 disabled:opacity-60"
            >
              <Code2 className="h-4 w-4" />
              Continue with GitHub
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border)]" /></div>
              <div className="relative flex justify-center">
                <span className="bg-[var(--bg-card)] px-3 text-xs text-[var(--text-muted)]">or continue with email</span>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-sm text-red-400" role="alert">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
              </div>
            )}
            {info && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2.5 text-sm text-green-500" role="status">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />{info}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <label className="label" htmlFor="full-name">Name</label>
                  <input id="full-name" type="text" className="input" placeholder="Ada Lovelace" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="label" htmlFor="email">Email</label>
                <input id="email" type="email" className="input" placeholder="you@company.dev" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="label" htmlFor="password">Password</label>
                  {mode === 'signin' && (
                    <button type="button" onClick={handleForgotPassword} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    className="input pr-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    minLength={mode === 'signup' ? 8 : undefined}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading || !isConfigured} className="btn-primary w-full justify-center py-2.5 text-sm">
                {loading ? <Spinner /> : <>{mode === 'signin' ? 'Sign in' : 'Create account'}<ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>

            <p className="text-center text-sm text-[var(--text-muted)]">
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button onClick={switchMode} className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

const HIGHLIGHTS = [
  { icon: Fingerprint, title: 'Duplicates grouped automatically', text: 'One error group per bug, however many times it fires.' },
  { icon: Brain, title: 'AI root-cause analysis', text: 'Gemini explains the failure and suggests a fix.' },
  { icon: BellRing, title: 'One Slack alert per problem', text: 'With the diagnosis and a one-click GitHub issue.' },
]

function BrandPanel() {
  return (
    <div className="relative hidden lg:flex w-[46%] flex-col justify-between overflow-hidden border-r border-[var(--border)] bg-[var(--bg-secondary)] p-12">
      <div className="aurora -top-20 -left-20 h-96 w-96 bg-violet-600/35" />
      <div className="aurora bottom-0 right-0 h-80 w-80 bg-cyan-500/20" style={{ animationDelay: '-6s' }} />
      <div className="absolute inset-0 hero-grid" />
      <Link to="/" className="relative"><Logo subtitle={null} /></Link>
      <div className="relative">
        <h2 className="text-4xl font-black tracking-tight leading-tight text-[var(--text-primary)]">
          Know what broke,<br /><span className="gradient-text">and why.</span>
        </h2>
        <p className="mt-4 max-w-sm text-[var(--text-secondary)]">
          AI-powered error and incident monitoring for your GitHub repositories.
        </p>
        <div className="mt-10 space-y-5">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_0_20px_-4px_rgba(139,92,246,0.8)]">
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
                <p className="text-sm text-[var(--text-muted)]">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="relative text-xs text-[var(--text-muted)]">© 2026 PipelineIQ</p>
    </div>
  )
}
