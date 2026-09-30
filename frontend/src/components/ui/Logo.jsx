import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Logo({ showText = true, subtitle = 'Error Monitoring', size = 'md', className }) {
  const box = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      <div className={cn('flex flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 shadow-lg shadow-brand-900/30', box)}>
        <ShieldCheck className="h-4 w-4 text-white" />
      </div>
      {showText && (
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-[var(--text-primary)] leading-tight">RepoSentinel</span>
          {subtitle && <span className="text-[10px] text-[var(--text-muted)] leading-tight">{subtitle}</span>}
        </div>
      )}
    </div>
  )
}
