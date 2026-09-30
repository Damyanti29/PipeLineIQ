import { cn } from '@/lib/utils'

// options: [{ value, label }]
export function FilterPills({ options, value, onChange, className }) {
  return (
    <div className={cn('flex gap-1 flex-wrap', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'badge px-3 py-1 border transition-colors',
            value === option.value
              ? 'bg-brand-500/10 text-brand-400 border-brand-500/20'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border)] hover:border-brand-500/30',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
