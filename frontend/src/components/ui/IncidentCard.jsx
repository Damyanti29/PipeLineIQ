import { useNavigate } from 'react-router-dom'
import { Clock, Repeat2, ArrowRight } from 'lucide-react'
import { SeverityDot, SeverityBadge } from './SeverityBadge'
import { StatusBadge } from './StatusBadge'
import { timeAgo } from '@/utils/format'

// Compact row used in the dashboard's "Recent incidents" list.
export function IncidentCard({ incident }) {
  const navigate = useNavigate()
  const open = () => navigate(`/errors/${incident.error_id}`)
  return (
    <div
      className="flex items-center gap-3 py-3 border-b border-[var(--border)] last:border-0 cursor-pointer group hover:bg-[var(--bg-tertiary)] -mx-5 px-5 transition-colors"
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <SeverityDot severity={incident.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{incident.title}</span>
          <SeverityBadge severity={incident.severity} showDot={false} />
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-[var(--text-muted)] truncate">{incident.repository?.full_name}</span>
          {incident.error && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Repeat2 className="h-3 w-3" />{incident.error.occurrences}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Clock className="h-3 w-3" />{timeAgo(incident.updated_at)}
          </span>
        </div>
      </div>
      <StatusBadge status={incident.status} />
      <ArrowRight className="h-4 w-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
    </div>
  )
}
