import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Logo({ showText = true, subtitle = 'Error Monitoring', size = 'md', className }) {
  const box = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      <div className={cn('flex flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-brand-600 to-indigo-600 shadow-[0_0_20px_-4px_rgba(139,92,246,0.8)] ring-1 ring-white/20', box)}>
        <ShieldCheck className="h-4 w-4 text-white" />
      </div>
      {showText && (
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-[var(--text-primary)] leading-tight">PipelineIQ</span>
          {subtitle && <span className="text-[10px] text-[var(--text-muted)] leading-tight">{subtitle}</span>}
        </div>
      )}
    </div>
  )
}
