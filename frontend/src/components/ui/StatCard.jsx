import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StatCard({ icon: Icon, value, label, delta, iconColor = 'text-brand-400', iconBg = 'bg-brand-500/10' }) {
  const isPositive = delta > 0
  const isNeutral = delta === 0 || delta === undefined

  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-center justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        {!isNeutral && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium',
            isPositive ? 'text-red-400' : 'text-green-400'
          )}>
            {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {Math.abs(delta)}%
          </div>
        )}
        {isNeutral && delta === 0 && (
          <div className="flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
            <Minus className="h-3.5 w-3.5" />0%
          </div>
        )}
      </div>
      <div>
        <p className="text-3xl font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">{label}</p>
      </div>
    </div>
  )
}
