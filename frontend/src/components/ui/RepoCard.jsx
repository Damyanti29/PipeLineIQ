import { useNavigate } from 'react-router-dom'
import { GitBranch, AlertTriangle, Activity, CheckCircle, Circle, ExternalLink } from 'lucide-react'
import { cn, timeAgo } from '@/lib/utils'

const HEALTH_CONFIG = {
  critical: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Critical', border: 'border-red-500/20' },
  warning:  { icon: Activity,      color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Warning', border: 'border-orange-500/20' },
  healthy:  { icon: CheckCircle,   color: 'text-green-500', bg: 'bg-green-500/10', label: 'Healthy', border: 'border-green-500/20' },
  unknown:  { icon: Circle,        color: 'text-[var(--text-muted)]', bg: 'bg-[var(--bg-tertiary)]', label: 'Not monitoring', border: 'border-[var(--border)]' },
}

const LANG_COLORS = {
  TypeScript: '#3178c6',
  JavaScript: '#f7df1e',
  Python: '#3776ab',
  Go: '#00acd7',
  Rust: '#dea584',
}

export function RepoCard({ repo, onToggleMonitoring }) {
  const navigate = useNavigate()
  const health = HEALTH_CONFIG[repo.health] ?? HEALTH_CONFIG.unknown
  const HealthIcon = health.icon

  return (
    <div className="card-hover flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[var(--text-primary)] truncate">{repo.name}</h3>
            <span
              className={cn('badge text-xs', health.bg, health.color, `border ${health.border}`)}
            >
              <HealthIcon className="h-3 w-3" />
              {health.label}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{repo.owner}</p>
        </div>
        <button
          onClick={() => navigate(`/repositories/${repo.id}`)}
          className="flex-shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>

      {/* Description */}
      {repo.description && (
        <p className="text-sm text-[var(--text-secondary)] -mt-2 line-clamp-2">{repo.description}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex flex-col">
          <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{repo.errorCount}</span>
          <span className="text-xs text-[var(--text-muted)]">errors</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-bold text-red-500 tabular-nums">{repo.criticalCount}</span>
          <span className="text-xs text-[var(--text-muted)]">critical</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <GitBranch className="h-3.5 w-3.5" />
          {repo.branch}
        </div>
      </div>

      {/* Language + last error */}
      <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: LANG_COLORS[repo.language] ?? '#94a3b8' }}
          />
          <span className="text-xs text-[var(--text-muted)]">{repo.language}</span>
        </div>
        {repo.lastError ? (
          <span className="text-xs text-[var(--text-muted)]">Last error {repo.lastError}</span>
        ) : (
          <span className="text-xs text-green-500">No errors</span>
        )}
      </div>

      {/* Monitoring toggle */}
      <button
        onClick={() => onToggleMonitoring?.(repo.id)}
        className={cn(
          'w-full rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200',
          repo.monitoringEnabled
            ? 'border-[var(--border)] text-[var(--text-secondary)] hover:border-red-500/30 hover:text-red-500 hover:bg-red-500/5'
            : 'border-brand-600/30 bg-brand-600/10 text-brand-400 hover:bg-brand-600/20'
        )}
      >
        {repo.monitoringEnabled ? '⬛ Disable Monitoring' : '▶ Enable Monitoring'}
      </button>
    </div>
  )
}
