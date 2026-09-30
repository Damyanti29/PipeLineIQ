import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, FileCode, Repeat2, Clock, GitBranch,
  CheckCircle, RotateCcw, Code2, Brain, Lightbulb,
  AlertTriangle, EyeOff, ExternalLink,
} from 'lucide-react'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState, Spinner } from '@/components/ui/LoadingState'
import { useApi } from '@/hooks/useApi'
import { cn } from '@/lib/utils'
import { formatDate, formatLocation, timeAgo } from '@/utils/format'
import { getError, updateErrorStatus } from '@/services/errorService'
import { createGithubIssue } from '@/services/incidentService'

export function ErrorDetailPage() {
  const { id } = useParams()
  const { data: error, loading, error: loadError, reload, setData } = useApi(() => getError(id), [id])
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)

  const back = (
    <Link to="/errors" className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors w-fit">
      <ArrowLeft className="h-4 w-4" />
      Back to errors
    </Link>
  )

  if (loading) return <div className="space-y-5 max-w-4xl">{back}<LoadingState /></div>
  if (loadError) {
    return (
      <div className="space-y-5 max-w-4xl">
        {back}
        <ErrorState error={loadError} onRetry={loadError.status === 404 ? undefined : reload} title={loadError.status === 404 ? 'Error not found' : undefined} />
      </div>
    )
  }

  const activeIncident = error.incidents.find((i) => i.status === 'open' || i.status === 'investigating')
  const issueIncident = error.incidents.find((i) => i.github_issue_url)
  const ai = error.ai_analysis

  const run = async (key, action) => {
    setBusy(key)
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(null)
    }
  }

  const changeStatus = (status) =>
    run(status, async () => {
      const updated = await updateErrorStatus(error.id, status)
      setData((prev) => ({ ...prev, status: updated.status }))
    })

  const createIssue = () =>
    run('issue', async () => {
      const result = await createGithubIssue(activeIncident.id)
      setData((prev) => ({
        ...prev,
        incidents: prev.incidents.map((i) => (i.id === activeIncident.id ? { ...i, ...result } : i)),
      }))
    })

  return (
    <div className="space-y-5 max-w-4xl">
      {back}

      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="font-mono text-lg font-bold text-[var(--text-primary)]">{error.error_type}</span>
              <SeverityBadge severity={error.severity} />
              <StatusBadge status={error.status} />
            </div>
            <p className="text-sm text-[var(--text-secondary)] font-mono leading-relaxed break-words">{error.message}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {error.status === 'open' ? (
              <>
                <button onClick={() => changeStatus('resolved')} disabled={busy !== null} className="btn-secondary text-sm py-1.5">
                  {busy === 'resolved' ? <Spinner /> : <CheckCircle className="h-4 w-4" />}Resolve
                </button>
                <button onClick={() => changeStatus('ignored')} disabled={busy !== null} className="btn-ghost text-sm py-1.5">
                  {busy === 'ignored' ? <Spinner /> : <EyeOff className="h-4 w-4" />}Ignore
                </button>
              </>
            ) : (
              <button onClick={() => changeStatus('open')} disabled={busy !== null} className="btn-secondary text-sm py-1.5">
                {busy === 'open' ? <Spinner /> : <RotateCcw className="h-4 w-4" />}Reopen
              </button>
            )}
            {issueIncident ? (
              <a href={issueIncident.github_issue_url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5 text-green-500">
                <Code2 className="h-4 w-4" />Issue #{issueIncident.github_issue_number}<ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : activeIncident ? (
              <button onClick={createIssue} disabled={busy !== null} className="btn-secondary text-sm py-1.5">
                {busy === 'issue' ? <Spinner /> : <Code2 className="h-4 w-4" />}Create GitHub issue
              </button>
            ) : null}
          </div>
        </div>

        {actionError && <div className="mt-4"><ErrorState error={actionError} title="Action failed" /></div>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[var(--border)]">
          <MetaItem label="File" icon={FileCode} value={formatLocation(error.file_name, error.line_number)} mono />
          <MetaItem label="Occurrences" icon={Repeat2} value={error.occurrences.toLocaleString()} />
          <MetaItem label="First seen" icon={Clock} value={formatDate(error.first_seen)} />
          <MetaItem label="Last seen" icon={Clock} value={timeAgo(error.last_seen)} />
          <MetaItem label="Repository" icon={GitBranch} value={<Link to={`/repositories/${error.repository.id}`} className="hover:text-brand-400">{error.repository.full_name}</Link>} />
          <MetaItem label="Environment" icon={AlertTriangle} value={error.environment} />
          <MetaItem
            label="Incident"
            icon={AlertTriangle}
            value={activeIncident ? <StatusBadge status={activeIncident.status} /> : 'None active'}
          />
        </div>
      </div>

      <AiDiagnosis analysis={ai} />

      <div className="card p-5">
        <h3 className="section-title mb-4">Stack trace</h3>
        {error.stack_trace ? <CodeBlock code={error.stack_trace} language="stacktrace" /> : <p className="text-sm text-[var(--text-muted)]">No stack trace captured.</p>}
      </div>

      <div className="card p-5">
        <h3 className="section-title mb-4">Recent occurrences</h3>
        {error.recent_events.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No occurrences recorded.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {error.recent_events.map((event) => (
              <div key={event.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-[var(--text-primary)]">{new Date(event.timestamp).toLocaleString()}</span>
                <span className="badge badge-default text-[10px]">{event.environment}</span>
                {event.request_url && <span className="text-[var(--text-muted)] truncate max-w-xs">{event.request_url}</span>}
                {event.metadata?.release && <span className="text-[var(--text-muted)]">release {event.metadata.release}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AiDiagnosis({ analysis }) {
  if (analysis?.status !== 'completed') {
    const pending = !analysis || analysis.status === 'pending'
    return (
      <div className="card p-5 border-dashed">
        <div className="flex items-center gap-3 text-[var(--text-muted)]">
          <Brain className="h-5 w-5" />
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{pending ? 'AI diagnosis pending' : 'AI diagnosis unavailable'}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {pending
                ? 'The analysis will appear here once the worker has processed this error.'
                : analysis.reason === 'not_configured'
                  ? 'Gemini is not configured on the server (GEMINI_API_KEY).'
                  : 'Gemini could not analyze this error. The error and its incident were kept.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6 border-brand-600/20 bg-gradient-to-br from-brand-950/20 to-transparent">
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/15">
          <Brain className="h-4 w-4 text-brand-400" />
        </div>
        <h3 className="font-semibold text-[var(--text-primary)]">AI diagnosis</h3>
        <span className="badge bg-brand-500/10 text-brand-400 border border-brand-500/20 text-[10px]">Gemini</span>
        <span className="text-xs text-[var(--text-muted)] ml-auto">Affected area: {analysis.affectedArea}</span>
      </div>

      <div className="space-y-5">
        <div>
          <p className="label mb-2">Root cause</p>
          <div className="rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] p-4">
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">{analysis.rootCause}</p>
          </div>
        </div>
        <div>
          <p className="label mb-2">Explanation</p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{analysis.explanation}</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            <p className="label">Suggested fix</p>
          </div>
          <CodeBlock code={analysis.suggestedFix} language="suggestion" />
        </div>
      </div>
    </div>
  )
}

function MetaItem({ label, icon: Icon, value, mono = false }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={cn('text-sm text-[var(--text-primary)] font-medium truncate', mono && 'font-mono')}>{value}</span>
    </div>
  )
}
