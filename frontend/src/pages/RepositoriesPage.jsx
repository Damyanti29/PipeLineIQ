import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, GitBranch, Plus } from 'lucide-react'
import { RepoCard } from '@/components/ui/RepoCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { mockRepositories } from '@/data/mockData'

export function RepositoriesPage() {
  const [repos, setRepos] = useState(mockRepositories)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = repos.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.owner.toLowerCase().includes(search.toLowerCase())
    const matchesFilter =
      filter === 'all' ? true :
      filter === 'monitoring' ? r.monitoringEnabled :
      filter === 'critical' ? r.health === 'critical' :
      filter === 'healthy' ? r.health === 'healthy' : true
    return matchesSearch && matchesFilter
  })

  const toggleMonitoring = (id) => {
    setRepos(prev => prev.map(r =>
      r.id === id ? { ...r, monitoringEnabled: !r.monitoringEnabled } : r
    ))
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Repositories</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {repos.filter(r => r.monitoringEnabled).length} of {repos.length} repositories monitored
          </p>
        </div>
        <button className="btn-primary text-sm">
          <Plus className="h-4 w-4" />
          Add repository
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="search"
            placeholder="Search repositories..."
            className="input pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            id="repo-search"
          />
        </div>
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'All' },
            { value: 'monitoring', label: 'Monitored' },
            { value: 'critical', label: '🔴 Critical' },
            { value: 'healthy', label: '🟢 Healthy' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={filter === opt.value
                ? 'badge bg-brand-500/10 text-brand-400 border border-brand-500/20 px-3 py-1.5'
                : 'badge bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] px-3 py-1.5 hover:border-brand-600/30 transition-colors'}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No repositories found"
          description={search ? `No results for "${search}"` : "Connect your GitHub account to start monitoring repositories."}
          action={
            <Link to="/integrations" className="btn-primary text-sm">
              Connect GitHub
            </Link>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(repo => (
            <RepoCard
              key={repo.id}
              repo={repo}
              onToggleMonitoring={toggleMonitoring}
            />
          ))}
        </div>
      )}
    </div>
  )
}
