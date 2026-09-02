import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, GitBranch, Star, Eye, EyeOff, GitCommit, CheckCircle, XCircle, Loader } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { mockRepositories, mockErrors, mockDeployments, mockRepoErrorTrend } from '@/data/mockData'
import { timeAgo, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState } from 'react'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-[var(--text-primary)] mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[var(--text-muted)] capitalize">{p.dataKey}:</span>
          <span className="font-medium text-[var(--text-primary)]">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

const DEPLOY_ICONS = {
  success: { icon: CheckCircle, color: 'text-green-500' },
  failed: { icon: XCircle, color: 'text-red-500' },
  running: { icon: Loader, color: 'text-blue-400 animate-spin' },
}

export function RepositoryDetailPage() {
  const { id } = useParams()
  const repo = mockRepositories.find(r => r.id === id) ?? mockRepositories[0]
  const repoErrors = mockErrors.filter(e => e.repositoryId === repo.id)
  const repoDeployments = mockDeployments.filter(d => d.repositoryId === repo.id)
  const [monitoring, setMonitoring] = useState(repo.monitoringEnabled)

  const HEALTH_COLORS = {
    critical: 'text-red-500 bg-red-500/10 border-red-500/20',
    warning: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    healthy: 'text-green-500 bg-green-500/10 border-green-500/20',
    unknown: 'text-[var(--text-muted)] bg-[var(--bg-tertiary)] border-[var(--border)]',
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <Link to="/repositories" className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors w-fit">
        <ArrowLeft className="h-4 w-4" />
        Back to repositories
      </Link>

      {/* Repo header */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">{repo.fullName}</h2>
              <span className={cn('badge border', HEALTH_COLORS[repo.health])}>
                {repo.health}
              </span>
            </div>
            {repo.description && (
              <p className="text-sm text-[var(--text-secondary)] mt-1">{repo.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-sm text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" />{repo.branch}
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5" />{repo.stars}
              </span>
              <span>{repo.language}</span>
              <span>Updated {timeAgo(repo.updatedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonitoring(p => !p)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200',
                monitoring
                  ? 'border-green-500/30 bg-green-500/10 text-green-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30'
                  : 'border-brand-500/30 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20'
              )}
            >
              {monitoring ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {monitoring ? 'Monitoring active' : 'Enable monitoring'}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-[var(--border)]">
          <div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{repo.errorCount}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Total errors</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-500">{repo.criticalCount}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Critical errors</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{repoDeployments.length}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Deployments</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Error Trend */}
        <div className="card p-5">
          <h3 className="section-title mb-4">Error Trend</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={mockRepoErrorTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="repoErrors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="errors" stroke="#7c3aed" strokeWidth={2} fill="url(#repoErrors)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Deployments */}
        <div className="card p-5">
          <h3 className="section-title mb-4">Recent Deployments</h3>
          <div className="space-y-3">
            {repoDeployments.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No deployments found.</p>
            ) : repoDeployments.map(dep => {
              const { icon: Icon, color } = DEPLOY_ICONS[dep.status] ?? DEPLOY_ICONS.running
              return (
                <div key={dep.id} className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0">
                  <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', color)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text-primary)] truncate">{dep.commitMessage}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono">
                        <GitCommit className="h-3 w-3" />{dep.commitSha}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{dep.duration}</span>
                      <span className="text-xs text-[var(--text-muted)]">{timeAgo(dep.createdAt)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Recent Errors */}
      <div className="card p-5">
        <h3 className="section-title mb-4">Recent Errors</h3>
        {repoErrors.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No errors detected. 🎉</p>
        ) : (
          <div className="space-y-2">
            {repoErrors.map(error => (
              <ErrorCard key={error.id} error={error} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
