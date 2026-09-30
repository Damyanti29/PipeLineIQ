import { useNavigate } from 'react-router-dom'
import { FileCode, Clock, Repeat2 } from 'lucide-react'
import { SeverityDot, SeverityBadge } from './SeverityBadge'
import { StatusBadge } from './StatusBadge'
import { formatLocation, timeAgo } from '@/utils/format'

export function ErrorCard({ error, showRepository = true }) {
  const navigate = useNavigate()
  const open = () => navigate(`/errors/${error.id}`)
  return (
    <div
      className="card-hover cursor-pointer p-4 animate-fade-in"
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <div className="flex items-start gap-3">
        <SeverityDot severity={error.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{error.error_type}</span>
            <SeverityBadge severity={error.severity} />
            <StatusBadge status={error.status} />
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-1 truncate">{error.message}</p>
          <div className="flex items-center gap-x-4 gap-y-1 mt-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <FileCode className="h-3.5 w-3.5" />
              {formatLocation(error.file_name, error.line_number)}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Repeat2 className="h-3.5 w-3.5" />
              {error.occurrences} occurrence{error.occurrences === 1 ? '' : 's'}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Clock className="h-3.5 w-3.5" />
              {timeAgo(error.last_seen)}
            </span>
            {showRepository && error.repository && (
              <span className="text-xs text-[var(--text-muted)] hidden sm:block">{error.repository.full_name}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
