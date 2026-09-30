import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Repeat2, AlertTriangle, Code2, ExternalLink, FileCode } from 'lucide-react'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { FilterPills } from '@/components/ui/FilterPills'
import { LoadingState, Spinner } from '@/components/ui/LoadingState'
import { useApi } from '@/hooks/useApi'
import { formatLocation, timeAgo } from '@/utils/format'
import { createGithubIssue, listIncidents, updateIncidentStatus } from '@/services/incidentService'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'ignored', label: 'Ignored' },
]
const STATUSES = ['open', 'investigating', 'resolved', 'ignored']

export function IncidentsPage() {
  const [filter, setFilter] = useState('open')
  const { data: incidents, loading, error, reload, setData } = useApi(() => listIncidents({ status: filter }), [filter])

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Incidents</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          An incident is opened once per error group. Repeated occurrences are grouped into it, not re-alerted.
        </p>
      </div>

      <FilterPills options={FILTERS} value={filter} onChange={setFilter} />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : incidents.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No incidents" description="No incidents match this filter." />
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              onChange={(updated) => setData((prev) => prev.map((i) => (i.id === incident.id ? { ...i, ...updated } : i)))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function IncidentRow({ incident, onChange }) {
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)

  const run = async (key, action) => {
    setBusy(key)
    setActionError(null)
    try {
      onChange(await action())
    } catch (err) {
      setActionError(err)
    } finally {
      setBusy(null)
    }
  }

  const changeStatus = (status) => run('status', () => updateIncidentStatus(incident.id, status))
  const createIssue = () => run('issue', () => createGithubIssue(incident.id))
  const canCreateIssue = !incident.github_issue_number && ['open', 'investigating'].includes(incident.status)

  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/errors/${incident.error_id}`} className="font-medium text-[var(--text-primary)] text-sm hover:text-brand-400">
              {incident.title}
            </Link>
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
          </div>
          {incident.error && <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{incident.error.message}</p>}
          <div className="flex items-center gap-x-4 gap-y-1 mt-2 flex-wrap text-xs text-[var(--text-muted)]">
            <span>{incident.repository?.full_name}</span>
            {incident.error && (
              <>
                <span className="flex items-center gap-1"><FileCode className="h-3 w-3" />{formatLocation(incident.error.file_name, incident.error.line_number)}</span>
                <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" />{incident.error.occurrences} occurrences</span>
                <span className="badge badge-default text-[10px]">{incident.error.environment}</span>
              </>
            )}
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />opened {timeAgo(incident.created_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {incident.github_issue_url ? (
            <a href={incident.github_issue_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs py-1.5 text-green-500">
              <Code2 className="h-3.5 w-3.5" />#{incident.github_issue_number}<ExternalLink className="h-3 w-3" />
            </a>
          ) : canCreateIssue ? (
            <button onClick={createIssue} disabled={busy !== null} className="btn-secondary text-xs py-1.5">
              {busy === 'issue' ? <Spinner /> : <Code2 className="h-3.5 w-3.5" />}Create issue
            </button>
          ) : null}
          <select
            className="input py-1.5 w-auto text-xs"
            value={incident.status}
            onChange={(e) => changeStatus(e.target.value)}
            disabled={busy !== null}
            aria-label="Incident status"
          >
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
      </div>
      {actionError && <div className="mt-3"><ErrorState error={actionError} title="Action failed" /></div>}
    </div>
  )
}
