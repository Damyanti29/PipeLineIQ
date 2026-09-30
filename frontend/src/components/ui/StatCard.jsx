import { cn } from '@/lib/utils'

const TONES = {
  violet: { tile: 'from-violet-500 to-indigo-600', glow: 'bg-violet-500/25', line: 'from-violet-500/0 via-violet-400 to-violet-500/0', stroke: '#a78bfa' },
  orange: { tile: 'from-orange-400 to-amber-600',  glow: 'bg-orange-500/20', line: 'from-orange-500/0 via-orange-400 to-orange-500/0', stroke: '#fb923c' },
  red:    { tile: 'from-rose-500 to-red-600',      glow: 'bg-red-500/20',    line: 'from-red-500/0 via-red-400 to-red-500/0',       stroke: '#f87171' },
  cyan:   { tile: 'from-cyan-400 to-sky-600',      glow: 'bg-cyan-500/20',   line: 'from-cyan-500/0 via-cyan-400 to-cyan-500/0',     stroke: '#22d3ee' },
}

function Sparkline({ values, stroke }) {
  if (!values?.length || values.every((v) => v === 0)) return null
  const max = Math.max(...values, 1)
  const step = 100 / Math.max(values.length - 1, 1)
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(28 - (v / max) * 26).toFixed(2)}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="hidden min-[420px]:block h-8 w-24" aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// spark: optional array of numbers (oldest → newest) drawn as a sparkline.
export function StatCard({ icon: Icon, value, label, hint, tone = 'violet', spark }) {
  const t = TONES[tone] ?? TONES.violet
  return (
    <div className="card relative overflow-hidden animate-fade-in p-5">
      <div className={cn('absolute inset-x-0 top-0 h-px bg-gradient-to-r', t.line)} />
      <div className={cn('absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl', t.glow)} />
      <div className="relative flex items-start justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg', t.tile)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <Sparkline values={spark} stroke={t.stroke} />
      </div>
      <div className="relative mt-4">
        <p className="text-3xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">{value}</p>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">{label}</p>
        {hint && <p className="text-xs text-[var(--text-muted)] mt-1">{hint}</p>}
      </div>
    </div>
  )
}
