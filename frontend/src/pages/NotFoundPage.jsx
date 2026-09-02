import { Link } from 'react-router-dom'
import { Zap, ArrowLeft } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-6">
      <div className="text-center animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/10 border border-brand-600/20 mx-auto mb-6">
          <Zap className="h-8 w-8 text-brand-400" />
        </div>
        <h1 className="text-6xl font-black text-[var(--text-primary)] mb-3">404</h1>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Page not found</h2>
        <p className="text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
          This page doesn't exist or has been moved. Let's get you back on track.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/dashboard" className="btn-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <Link to="/" className="btn-secondary">Go to Home</Link>
        </div>
      </div>
    </div>
  )
}
