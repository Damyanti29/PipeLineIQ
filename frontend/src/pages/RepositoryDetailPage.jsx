import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, GitBranch, Eye, EyeOff, GitCommit, ExternalLink, KeyRound } from 'lucide-react'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { ErrorTrendChart } from '@/components/ui/ErrorTrendChart'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useApi } from '@/hooks/useApi'
import { API_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/utils/format'
import { getRepository, listRepositoryEvents, setMonitoring } from '@/services/repositoryService'
import { getErrorStats, listErrors } from '@/services/errorService'

const EVENT_LABELS = {
  push: 'Push',
  pull_request: 'Pull request',
  workflow_run: 'Workflow',
  deployment: 'Deployment',
  deployment_status: 'Deployment',
  issues: 'Issue',
}

// DSN format expected by @pipelineiq/sdk: <protocol>://<ingestKey>@<host>/<repositoryId>
function buildDsn(repository) {
  const url = new URL(API_URL)
  return `${url.protocol}//${repository.ingest_key}@${url.host}${url.pathname.replace(/\/$/, '')}/${repository.id}`
}

async function loadRepository(id) {
  const [repository, stats, errors, events] = await Promise.all([
    getRepository(id),
    getErrorStats({ repositoryId: id, days: 14 }),
    listErrors({ repositoryId: id, limit: 10 }),
    listRepositoryEvents(id),
  ])
  return { repository, stats, errors, events }
}

export function RepositoryDetailPage() {
  const { id } = useParams()
  const { data, loading, error, reload, setData } = useApi(() => loadRepository(id), [id])
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState(null)

  const back = (
    <Link to="/repositories" className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors w-fit">
      <ArrowLeft className="h-4 w-4" />
      Back to repositories
    </Link>
  )

  if (loading) return <div className="space-y-6 max-w-5xl">{back}<LoadingState /></div>
  if (error) {
    return (
      <div className="space-y-6 max-w-5xl">
        {back}
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? 'Repository not found' : undefined} />
      </div>
    )
  }

  const { repository, stats, errors, events } = data

  const toggleMonitoring = async () => {
    setToggling(true)
    setToggleError(null)
    try {
      const updated = await setMonitoring(repository.id, !repository.monitoring_enabled)
      setData((prev) => ({ ...prev, repository: { ...prev.repository, ...updated } }))
    } catch (err) {
      setToggleError(err)
    } finally {
      setToggling(false)
    }
  }

  const dsn = buildDsn(repository)
  const snippet = `import PipelineIQ from '@pipelineiq/sdk'

PipelineIQ.init({
  dsn: '${dsn}',
  environment: 'production',
})`

  return (
    <div className="space-y-6 max-w-5xl">
      {back}

      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-[var(--text-primary)] break-all">{repository.full_name}</h2>
              <a href={repository.html_url} target="_blank" rel="noopener noreferrer" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Open on GitHub">
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <div className="flex items-center gap-4 mt-3 text-sm text-[var(--text-muted)] flex-wrap">
              <span className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" />{repository.default_branch}</span>
              <span>Added {timeAgo(repository.created_at)}</span>
              {stats.total_errors > 0 && <span>Last error {timeAgo(repository.stats.last_error_at)}</span>}
            </div>
          </div>
          <button
            onClick={toggleMonitoring}
            disabled={toggling}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-50',
              repository.monitoring_enabled
                ? 'border-green-500/30 bg-green-500/10 text-green-500 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30'
                : 'border-brand-500/30 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20',
            )}
          >
            {repository.monitoring_enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {repository.monitoring_enabled ? 'Monitoring active' : 'Enable monitoring'}
          </button>
        </div>
        {toggleError && <div className="mt-4"><ErrorState error={toggleError} title="Could not update monitoring" /></div>}

        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-[var(--border)]">
          <Stat value={stats.open_errors} label="Open errors" />
          <Stat value={stats.critical_errors} label="Critical" className="text-red-500" />
          <Stat value={stats.open_incidents} label="Open incidents" />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="section-title mb-4">Error events (14 days)</h3>
          <ErrorTrendChart data={stats.trend} height={180} />
        </div>

        <div className="card p-5">
          <h3 className="section-title mb-4">Recent GitHub activity</h3>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No webhook events yet. Pushes, pull requests, workflow runs and deployments appear here.
            </p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0">
                  <GitCommit className="h-4 w-4 mt-0.5 flex-shrink-0 text-[var(--text-muted)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-brand-400">{EVENT_LABELS[event.event_type] ?? event.event_type}</span>
                      {event.url ? (
                        <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-primary)] truncate hover:text-brand-400">
                          {event.title}
                        </a>
                      ) : (
                        <span className="text-sm text-[var(--text-primary)] truncate">{event.title}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
                      {event.status && <StatusBadge status={event.status} className="text-[10px]" />}
                      {event.sha && <span className="font-mono">{event.sha.slice(0, 7)}</span>}
                      {event.actor && <span>@{event.actor}</span>}
                      <span>{timeAgo(event.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-400" />
          <h3 className="section-title">SDK setup</h3>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Add the SDK to your app with this DSN. It contains this repository's ingest key, which can only submit errors.
        </p>
        <CodeBlock code={snippet} language="javascript" />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title">Recent errors</h3>
          <Link to={`/errors?repositoryId=${repository.id}`} className="text-xs text-brand-400 hover:text-brand-300">View all</Link>
        </div>
        {errors.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No errors captured yet. 🎉</p>
        ) : (
          <div className="space-y-2">
            {errors.map((err) => <ErrorCard key={err.id} error={err} showRepository={false} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label, className }) {
  return (
    <div>
      <p className={cn('text-2xl font-bold text-[var(--text-primary)]', className)}>{value}</p>
      <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
    </div>
  )
}
