import { AlertCircle, RotateCcw } from 'lucide-react'

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="card flex items-start gap-3 border-red-500/20 bg-red-500/5">
      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5 break-words">{error?.message ?? String(error)}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary text-xs py-1.5">
          <RotateCcw className="h-3.5 w-3.5" />Retry
        </button>
      )}
    </div>
  )
}
