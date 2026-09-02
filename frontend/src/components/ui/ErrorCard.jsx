import { useNavigate } from 'react-router-dom'
import { FileCode, Clock, Repeat2 } from 'lucide-react'
import { SeverityDot, SeverityBadge } from './SeverityBadge'
import { StatusBadge } from './StatusBadge'
import { timeAgo } from '@/lib/utils'

export function ErrorCard({ error }) {
  const navigate = useNavigate()
  return (
    <div
      className="card-hover cursor-pointer p-4 animate-fade-in"
      onClick={() => navigate(`/errors/${error.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(`/errors/${error.id}`)}
    >
      <div className="flex items-start gap-3">
        <SeverityDot severity={error.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
              {error.errorType}
            </span>
            <SeverityBadge severity={error.severity} />
            <StatusBadge status={error.status} />
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-1 truncate">{error.message}</p>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <FileCode className="h-3.5 w-3.5" />
              {error.fileName}:{error.lineNumber}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Repeat2 className="h-3.5 w-3.5" />
              {error.occurrences} occurrences
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Clock className="h-3.5 w-3.5" />
              {timeAgo(error.lastSeen)}
            </span>
            <span className="text-xs text-[var(--text-muted)] hidden sm:block">
              {error.repositoryName}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
