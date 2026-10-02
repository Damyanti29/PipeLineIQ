import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  open:          { label: 'Open',          className: 'badge-open' },
  investigating: { label: 'Investigating', className: 'badge-medium' },
  resolved:      { label: 'Resolved',      className: 'badge-resolved' },
  ignored:       { label: 'Ignored',       className: 'badge-default' },
  success:       { label: 'Success',       className: 'badge-resolved' },
  failure:       { label: 'Failed',        className: 'badge-critical' },
  error:         { label: 'Error',         className: 'badge-critical' },
  in_progress:   { label: 'In progress',   className: 'badge-low' },
  pending:       { label: 'Pending',       className: 'badge-low' },
  merged:        { label: 'Merged',        className: 'badge-open' },
  closed:        { label: 'Closed',        className: 'badge-default' },
  analyzing:     { label: 'Analyzing',     className: 'badge-low' },
  no_issue:      { label: 'No issue',      className: 'badge-default' },
  alerted:       { label: 'Needs a fix',   className: 'badge-high' },
  fix_proposed:  { label: 'Fix PR ready',  className: 'badge-open' },
  dismissed:     { label: 'Dismissed',     className: 'badge-default' },
  failed:        { label: 'Analysis failed', className: 'badge-critical' },
}

export function StatusBadge({ status, className }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status ?? 'Unknown', className: 'badge-default' }
  return <span className={cn(cfg.className, className)}>{cfg.label}</span>
}
