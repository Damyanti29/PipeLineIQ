import { useState } from 'react'
import { Clock, Repeat2, AlertTriangle } from 'lucide-react'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { mockIncidents } from '@/data/mockData'
import { timeAgo } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

export function IncidentsPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')

  const filtered = mockIncidents.filter(i =>
    filter === 'all' ? true : i.status === filter
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Incidents</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          {mockIncidents.filter(i => i.status === 'open').length} open incidents
        </p>
      </div>

      <div className="flex gap-2">
        {['all', 'open', 'resolved'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={filter === f
              ? 'badge bg-brand-500/10 text-brand-400 border border-brand-500/20 px-3 py-1.5'
              : 'badge bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)] px-3 py-1.5 hover:border-brand-500/30 transition-colors'}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No incidents" description="No incidents match your filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map(incident => (
            <div
              key={incident.id}
              className="card-hover p-4 cursor-pointer"
              onClick={() => navigate(`/errors/${incident.errorId}`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(`/errors/${incident.errorId}`)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[var(--text-primary)] text-sm">{incident.title}</span>
                    <SeverityBadge severity={incident.severity} />
                    <StatusBadge status={incident.status} />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{incident.description}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-[var(--text-muted)]">{incident.repositoryName}</span>
                    <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                      <Repeat2 className="h-3 w-3" />{incident.occurrences} occurrences
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                      <Clock className="h-3 w-3" />{timeAgo(incident.updatedAt)}
                    </span>
                    <span className="badge badge-default text-[10px]">{incident.environment}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
