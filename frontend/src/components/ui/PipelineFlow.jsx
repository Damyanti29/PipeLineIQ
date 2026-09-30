import { Fragment } from 'react'
import { cn } from '@/lib/utils'

// status: 'ok' | 'warn' | 'down' | 'idle'
const STATUS_STYLES = {
  ok:   { dot: 'bg-emerald-400 text-emerald-400', ring: 'border-emerald-400/30', icon: 'text-emerald-300', label: 'Operational' },
  warn: { dot: 'bg-amber-400 text-amber-400',     ring: 'border-amber-400/30',   icon: 'text-amber-300',   label: 'Not configured' },
  down: { dot: 'bg-red-500 text-red-500',         ring: 'border-red-500/40',     icon: 'text-red-400',     label: 'Unavailable' },
  idle: { dot: 'bg-brand-400 text-brand-400',     ring: 'border-brand-400/30',   icon: 'text-brand-300',   label: '' },
}

// nodes: [{ key, label, sublabel?, icon, status }]. Connectors animate when both ends work.
export function PipelineFlow({ nodes, showStatusText = true, className }) {
  return (
    <div className={cn('flex flex-wrap sm:flex-nowrap items-stretch justify-center gap-y-4', className)}>
      {nodes.map((node, index) => {
        const style = STATUS_STYLES[node.status] ?? STATUS_STYLES.idle
        const Icon = node.icon
        const next = nodes[index + 1]
        const flowing = next && node.status !== 'down' && next.status !== 'down' && node.status !== 'warn' && next.status !== 'warn'
        return (
          <Fragment key={node.key}>
            <div className="flex flex-col items-center text-center w-24 sm:w-28 flex-shrink-0">
              <div
                className={cn(
                  'relative flex h-12 w-12 items-center justify-center rounded-2xl border bg-[var(--bg-tertiary)]/60 backdrop-blur',
                  'shadow-[0_0_24px_-8px_rgba(139,92,246,0.6)] animate-float',
                  style.ring,
                )}
                style={{ animationDelay: `${index * 0.4}s` }}
              >
                <Icon className={cn('h-5 w-5', style.icon)} />
                <span className={cn('absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full pulse-ring', style.dot)} />
              </div>
              <p className="mt-2 text-xs font-semibold text-[var(--text-primary)] leading-tight">{node.label}</p>
              {node.sublabel && <p className="text-[10px] text-[var(--text-muted)] leading-tight mt-0.5">{node.sublabel}</p>}
              {showStatusText && style.label && (
                <p className={cn('text-[10px] font-medium mt-1', style.icon)}>{node.statusText ?? style.label}</p>
              )}
            </div>
            {next && (
              <div className="hidden sm:flex items-start pt-6 flex-1 min-w-6">
                <div className="relative h-px w-full bg-[var(--border)] overflow-hidden">
                  <div className={cn('absolute inset-0', flowing ? 'flow-line' : 'flow-line-idle')} style={{ animationDelay: `${index * 0.35}s` }} />
                </div>
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
