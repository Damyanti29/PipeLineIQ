import { useState } from 'react'
import { Clock, ExternalLink, GitCommit, GitPullRequest, GitBranch, PlayCircle, ScanSearch, ShieldCheck, ChevronDown } from 'lucide-react'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { FilterPills } from '@/components/ui/FilterPills'
import { LoadingState, Spinner } from '@/components/ui/LoadingState'
import { useApi } from '@/hooks/useApi'
import { timeAgo } from '@/utils/format'
import { listPipelineAlerts, updatePipelineAlertStatus } from '@/services/pipelineService'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'fix_proposed', label: 'Fix PR ready' },
  { value: 'alerted', label: 'Needs a fix' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'failed', label: 'Analysis failed' },
]

export function PipelinePage() {
  const [filter, setFilter] = useState('all')
  const { data: alerts, loading, error, reload, setData } = useApi(() => listPipelineAlerts({ status: filter }), [filter])

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Push monitoring</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          Every push is reviewed by Gemini and every failed CI run is diagnosed. When a safe fix is found, a pull request is opened
          and linked in Slack. Nothing is merged without you.
        </p>
      </div>

      <FilterPills options={FILTERS} value={filter} onChange={setFilter} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No pipeline problems"
          description="Failed CI runs and bugs found in pushes to monitored repositories appear here."
        />
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onChange={(updated) => setData((prev) => prev.map((a) => (a.id === alert.id ? { ...a, ...updated } : a)))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AlertRow({ alert, onChange }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const ai = alert.analysis ?? {}
  const ci = alert.source === 'ci_failure'
  const SourceIcon = ci ? PlayCircle : ScanSearch

  const changeStatus = async (status) => {
    setBusy(true)
    setActionError(null)
    try {
      onChange(await updatePipelineAlertStatus(alert.id, status))
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-start gap-3 flex-wrap">
        <SourceIcon className="h-4 w-4 mt-0.5 text-[var(--text-muted)] flex-shrink-0" aria-label={ci ? 'CI failure' : 'Push review'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[var(--text-primary)] text-sm">
              {alert.title ?? (ci ? `${alert.workflow_name ?? 'CI'} failed` : 'Reviewing push…')}
            </span>
            {alert.severity && <SeverityBadge severity={alert.severity} />}
            <StatusBadge status={alert.status} />
          </div>
          <div className="flex items-center gap-x-4 gap-y-1 mt-2 flex-wrap text-xs text-[var(--text-muted)]">
            <span>{alert.repository?.full_name}</span>
            <span className="badge badge-default text-[10px]">{ci ? (alert.workflow_name ?? 'CI run') : 'Push review'}</span>
            <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" />{alert.branch}</span>
            <a href={alert.commit_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-brand-400">
              <GitCommit className="h-3 w-3" />{alert.commit_sha.slice(0, 7)}
            </a>
            {alert.actor && <span>by {alert.actor}</span>}
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(alert.created_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto pl-7 sm:pl-0">
          {alert.fix_pr_url && (
            <a href={alert.fix_pr_url} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs py-1.5">
              <GitPullRequest className="h-3.5 w-3.5" />Fix PR #{alert.fix_pr_number}<ExternalLink className="h-3 w-3" />
            </a>
          )}
          {alert.run_url && (
            <a href={alert.run_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs py-1.5">
              Run<ExternalLink className="h-3 w-3" />
            </a>
          )}
          {['alerted', 'fix_proposed', 'failed'].includes(alert.status) && (
            <button onClick={() => changeStatus('dismissed')} disabled={busy} className="btn-secondary text-xs py-1.5">
              {busy && <Spinner />}Dismiss
            </button>
          )}
          {(ai.rootCause || alert.fix_note) && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="btn-ghost text-xs py-1.5"
              aria-expanded={open}
              aria-label={open ? 'Hide diagnosis' : 'Show diagnosis'}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 text-sm border-t border-[var(--border)] pt-4">
          {ai.rootCause && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">Root cause</p>
              <p className="text-[var(--text-primary)]">{ai.rootCause}</p>
              {ai.explanation && <p className="text-[var(--text-secondary)] mt-1">{ai.explanation}</p>}
            </div>
          )}
          {ai.suggestedFix && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">Suggested fix</p>
              <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{ai.suggestedFix}</p>
            </div>
          )}
          {!alert.fix_pr_url && alert.fix_note && <p className="text-xs text-[var(--text-muted)] italic">No fix PR: {alert.fix_note}</p>}
          {ai.model && <p className="text-xs text-[var(--text-muted)]">Analysed by {ai.model}</p>}
        </div>
      )}
      {actionError && <div className="mt-3"><ErrorState error={actionError} title="Action failed" /></div>}
    </div>
  )
}
