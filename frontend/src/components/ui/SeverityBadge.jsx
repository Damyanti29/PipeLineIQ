import { cn } from '@/lib/utils'

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', className: 'badge-critical', dot: 'bg-red-500' },
  high:     { label: 'High',     className: 'badge-high',     dot: 'bg-orange-500' },
  medium:   { label: 'Medium',   className: 'badge-medium',   dot: 'bg-amber-500' },
  low:      { label: 'Low',      className: 'badge-low',      dot: 'bg-blue-400' },
}

export function SeverityBadge({ severity, showDot = true, className }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.low
  return (
    <span className={cn(cfg.className, className)}>
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />}
      {cfg.label}
    </span>
  )
}

export function SeverityDot({ severity, size = 'md' }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.low
  const sizes = { sm: 'h-2 w-2', md: 'h-2.5 w-2.5', lg: 'h-3 w-3' }
  return (
    <span className={cn('rounded-full flex-shrink-0 animate-pulse-slow', cfg.dot, sizes[size])} />
  )
}
