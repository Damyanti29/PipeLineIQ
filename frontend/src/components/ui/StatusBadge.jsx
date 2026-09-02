import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  open:        { label: 'Open',        className: 'badge-open' },
  resolved:    { label: 'Resolved',    className: 'badge-resolved' },
  in_progress: { label: 'In Progress', className: 'badge-medium' },
  ignored:     { label: 'Ignored',     className: 'badge-default' },
  success:     { label: 'Success',     className: 'badge-resolved' },
  failed:      { label: 'Failed',      className: 'badge-critical' },
  running:     { label: 'Running',     className: 'badge-low' },
  unknown:     { label: 'Unknown',     className: 'badge-default' },
}

export function StatusBadge({ status, className }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown
  return (
    <span className={cn(cfg.className, className)}>
      {cfg.label}
    </span>
  )
}
