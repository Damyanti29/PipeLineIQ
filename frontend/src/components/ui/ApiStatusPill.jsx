import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/hooks/useApi'
import { getHealth } from '@/services/healthService'
import { cn } from '@/lib/utils'

// Small live indicator: is the backend reachable? Re-checks every 30 seconds.
export function ApiStatusPill() {
  const { data, error, loading, reload } = useApi(getHealth)

  useEffect(() => {
    const timer = setInterval(reload, 30000)
    return () => clearInterval(timer)
  }, [reload])

  const state = error ? 'down' : data ? 'up' : 'checking'
  const styles = {
    up: { dot: 'bg-emerald-400 text-emerald-400', text: 'API online' },
    down: { dot: 'bg-red-500 text-red-500', text: 'API offline' },
    checking: { dot: 'bg-slate-400 text-slate-400', text: 'Checking…' },
  }[loading && !data && !error ? 'checking' : state]

  return (
    <Link
      to="/dashboard"
      title={error ? error.message : 'Backend health (GET /api/health)'}
      className="hidden sm:flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)]/50 px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    >
      <span className={cn('h-2 w-2 rounded-full pulse-ring', styles.dot)} />
      {styles.text}
    </Link>
  )
}
