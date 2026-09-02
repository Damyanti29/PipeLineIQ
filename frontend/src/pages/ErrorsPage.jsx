import { useState } from 'react'
import { Search, Filter } from 'lucide-react'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { mockErrors, mockRepositories } from '@/data/mockData'
import { Bug } from 'lucide-react'

const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low']
const STATUSES = ['all', 'open', 'resolved']

export function ErrorsPage() {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('all')
  const [status, setStatus] = useState('all')
  const [repoFilter, setRepoFilter] = useState('all')
  const [sort, setSort] = useState('lastSeen')

  const repoNames = ['all', ...new Set(mockErrors.map(e => e.repositoryName))]

  const filtered = mockErrors
    .filter(e => {
      const matchSearch = e.errorType.toLowerCase().includes(search.toLowerCase()) ||
        e.message.toLowerCase().includes(search.toLowerCase()) ||
        e.fileName.toLowerCase().includes(search.toLowerCase())
      return (
        matchSearch &&
        (severity === 'all' || e.severity === severity) &&
        (status === 'all' || e.status === status) &&
        (repoFilter === 'all' || e.repositoryName === repoFilter)
      )
    })
    .sort((a, b) => {
      if (sort === 'occurrences') return b.occurrences - a.occurrences
      if (sort === 'severity') {
        const order = { critical: 0, high: 1, medium: 2, low: 3 }
        return order[a.severity] - order[b.severity]
      }
      return new Date(b.lastSeen) - new Date(a.lastSeen)
    })

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Errors</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          {filtered.length} grouped error{filtered.length !== 1 ? 's' : ''} across all repositories
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="search"
              placeholder="Search errors..."
              className="input pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              id="error-search"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--text-muted)]" />
            <select
              className="input py-2 w-auto"
              value={sort}
              onChange={e => setSort(e.target.value)}
              id="sort-select"
            >
              <option value="lastSeen">Sort: Last seen</option>
              <option value="occurrences">Sort: Occurrences</option>
              <option value="severity">Sort: Severity</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Severity pills */}
          <div className="flex gap-1 flex-wrap">
            {SEVERITIES.map(s => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={severity === s
                  ? 'badge bg-brand-500/10 text-brand-400 border border-brand-500/20 px-3 py-1'
                  : 'badge bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)] px-3 py-1 hover:border-brand-500/30 transition-colors'}
              >
                {s === 'all' ? 'All severities' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {/* Status pills */}
          <div className="flex gap-1 flex-wrap">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={status === s
                  ? 'badge bg-brand-500/10 text-brand-400 border border-brand-500/20 px-3 py-1'
                  : 'badge bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)] px-3 py-1 hover:border-brand-500/30 transition-colors'}
              >
                {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {/* Repo filter */}
          <select
            className="input py-1 w-auto text-xs"
            value={repoFilter}
            onChange={e => setRepoFilter(e.target.value)}
            id="repo-filter"
          >
            {repoNames.map(r => (
              <option key={r} value={r}>{r === 'all' ? 'All repos' : r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Bug}
          title="No errors found"
          description={search ? `No errors match "${search}"` : 'No errors matching your filters.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(error => (
            <ErrorCard key={error.id} error={error} />
          ))}
        </div>
      )}
    </div>
  )
}
