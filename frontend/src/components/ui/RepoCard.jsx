import { Link } from 'react-router-dom'
import { GitBranch, AlertTriangle, Activity, CheckCircle, Circle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/utils/format'
import { repositoryHealth } from '@/utils/repositoryHealth'

const HEALTH_CONFIG = {
  critical: { icon: AlertTriangle, color: 'text-red-500',   bg: 'bg-red-500/10',   border: 'border-red-500/20',   label: 'Critical' },
  warning:  { icon: Activity,      color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'Open errors' },
  healthy:  { icon: CheckCircle,   color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'Healthy' },
  paused:   { icon: Circle,        color: 'text-[var(--text-muted)]', bg: 'bg-[var(--bg-tertiary)]', border: 'border-[var(--border)]', label: 'Not monitoring' },
}

export function RepoCard({ repo, onToggleMonitoring, busy = false }) {
  const health = HEALTH_CONFIG[repositoryHealth(repo)]
  const HealthIcon = health.icon

  return (
    <div className="card-hover flex flex-col gap-4 animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/repositories/${repo.id}`} className="font-semibold text-[var(--text-primary)] truncate hover:text-brand-400">
              {repo.name}
            </Link>
            <span className={cn('badge text-xs border', health.bg, health.color, health.border)}>
              <HealthIcon className="h-3 w-3" />
              {health.label}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{repo.owner}</p>
        </div>
        <a
          href={repo.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label="Open on GitHub"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex flex-col">
          <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{repo.stats?.open_errors ?? 0}</span>
          <span className="text-xs text-[var(--text-muted)]">open errors</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-bold text-red-500 tabular-nums">{repo.stats?.open_critical ?? 0}</span>
          <span className="text-xs text-[var(--text-muted)]">critical</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <GitBranch className="h-3.5 w-3.5" />
          {repo.default_branch}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs">
        {repo.stats?.last_error_at ? (
          <span className="text-[var(--text-muted)]">Last error {timeAgo(repo.stats.last_error_at)}</span>
        ) : (
          <span className="text-green-500">No errors yet</span>
        )}
        <Link to={`/repositories/${repo.id}`} className="text-brand-400 hover:text-brand-300">Details →</Link>
      </div>

      <button
        onClick={() => onToggleMonitoring?.(repo)}
        disabled={busy}
        className={cn(
          'w-full rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200 disabled:opacity-50',
          repo.monitoring_enabled
            ? 'border-[var(--border)] text-[var(--text-secondary)] hover:border-red-500/30 hover:text-red-500 hover:bg-red-500/5'
            : 'border-brand-600/30 bg-brand-600/10 text-brand-400 hover:bg-brand-600/20',
        )}
      >
        {repo.monitoring_enabled ? 'Pause monitoring' : 'Resume monitoring'}
      </button>
    </div>
  )
}
