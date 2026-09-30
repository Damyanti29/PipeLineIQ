import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter, Bug } from 'lucide-react'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { FilterPills } from '@/components/ui/FilterPills'
import { LoadingState } from '@/components/ui/LoadingState'
import { useApi } from '@/hooks/useApi'
import { listErrors } from '@/services/errorService'
import { listRepositories } from '@/services/repositoryService'

const SEVERITIES = [
  { value: 'all', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]
const STATUSES = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'ignored', label: 'Ignored' },
]

export function ErrorsPage() {
  const [params, setParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '')

  // Filters live in the URL so they survive reloads and can be linked to.
  const filters = {
    search: params.get('search') ?? '',
    severity: params.get('severity') ?? 'all',
    status: params.get('status') ?? 'open',
    repositoryId: params.get('repositoryId') ?? 'all',
    sort: params.get('sort') ?? 'last_seen',
  }
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value === '' || value === undefined) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  // Keep the box in sync when the URL changes elsewhere (e.g. the navbar search).
  const [syncedSearch, setSyncedSearch] = useState(filters.search)
  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search)
    setSearchInput(filters.search)
  }

  // Debounce free-text search into the URL.
  useEffect(() => {
    const term = searchInput.trim()
    if (term === filters.search) return undefined
    const handle = setTimeout(() => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (term) next.set('search', term)
        else next.delete('search')
        return next
      }, { replace: true })
    }, 300)
    return () => clearTimeout(handle)
  }, [searchInput, filters.search, setParams])

  const { data: errors, loading, error, reload } = useApi(() => listErrors(filters), [params.toString()])
  const { data: repositories } = useApi(listRepositories)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Errors</h2>
        {errors && (
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {errors.length} grouped error{errors.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="search"
              placeholder="Search by type, message or file…"
              className="input pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search errors"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--text-muted)]" />
            <select className="input py-2 w-auto" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Sort">
              <option value="last_seen">Sort: Last seen</option>
              <option value="occurrences">Sort: Occurrences</option>
              <option value="severity">Sort: Severity</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <FilterPills options={SEVERITIES} value={filters.severity} onChange={(v) => setFilter('severity', v)} />
          <FilterPills options={STATUSES} value={filters.status} onChange={(v) => setFilter('status', v)} />
          <select
            className="input py-1 w-auto text-xs"
            value={filters.repositoryId}
            onChange={(e) => setFilter('repositoryId', e.target.value)}
            aria-label="Repository"
          >
            <option value="all">All repositories</option>
            {(repositories ?? []).map((repo) => (
              <option key={repo.id} value={repo.id}>{repo.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : errors.length === 0 ? (
        <EmptyState
          icon={Bug}
          title="No errors found"
          description={filters.search ? `No errors match "${filters.search}".` : 'No errors match your filters.'}
        />
      ) : (
        <div className="space-y-2">
          {errors.map((err) => <ErrorCard key={err.id} error={err} />)}
        </div>
      )}
    </div>
  )
}
