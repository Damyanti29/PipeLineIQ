import { cn } from '@/lib/utils'

export function Spinner({ className }) {
  return <span className={cn('inline-block h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin', className)} />
}

export function LoadingState({ label = 'Loading…', fullScreen = false }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 text-sm text-[var(--text-muted)]', fullScreen ? 'min-h-screen bg-[var(--bg-primary)]' : 'py-16')}>
      <Spinner className="text-brand-500" />
      {label}
    </div>
  )
}
