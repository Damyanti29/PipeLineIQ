import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, GitBranch, Plus, X, Lock } from 'lucide-react'
import { RepoCard } from '@/components/ui/RepoCard'
import { repositoryHealth } from '@/utils/repositoryHealth'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { FilterPills } from '@/components/ui/FilterPills'
import { LoadingState, Spinner } from '@/components/ui/LoadingState'
import { useApi } from '@/hooks/useApi'
import { addRepository, listRepositories, setMonitoring } from '@/services/repositoryService'
import { listGithubRepositories } from '@/services/githubService'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'monitoring', label: 'Monitored' },
  { value: 'critical', label: 'Critical' },
  { value: 'healthy', label: 'Healthy' },
]

export function RepositoriesPage() {
  const { data: repos, loading, error, reload, setData: setRepos } = useApi(listRepositories)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const toggleMonitoring = async (repo) => {
    setBusyId(repo.id)
    setActionError(null)
    try {
      const updated = await setMonitoring(repo.id, !repo.monitoring_enabled)
      setRepos((prev) => prev.map((r) => (r.id === repo.id ? { ...r, ...updated } : r)))
    } catch (err) {
      setActionError(err)
    } finally {
      setBusyId(null)
    }
  }

  const filtered = (repos ?? []).filter((r) => {
    const term = search.toLowerCase()
    const matchesSearch = r.full_name.toLowerCase().includes(term)
    const health = repositoryHealth(r)
    const matchesFilter =
      filter === 'all' ||
      (filter === 'monitoring' && r.monitoring_enabled) ||
      (filter === 'critical' && health === 'critical') ||
      (filter === 'healthy' && health === 'healthy')
    return matchesSearch && matchesFilter
  })

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Repositories</h2>
          {repos && (
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {repos.filter((r) => r.monitoring_enabled).length} of {repos.length} repositories monitored
            </p>
          )}
        </div>
        <button className="btn-primary text-sm" onClick={() => setPickerOpen((o) => !o)}>
          {pickerOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {pickerOpen ? 'Close' : 'Add repository'}
        </button>
      </div>

      {pickerOpen && <RepositoryPicker onAdded={reload} />}
      {actionError && <ErrorState error={actionError} title="Could not update repository" />}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="search"
            placeholder="Search repositories…"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search repositories"
          />
        </div>
        <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={repos.length ? 'No repositories match' : 'No repositories monitored yet'}
          description={repos.length ? 'Try a different search or filter.' : 'Connect GitHub, then add the repositories you want to monitor.'}
          action={!repos.length && <Link to="/integrations" className="btn-primary text-sm">Connect GitHub</Link>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((repo) => (
            <RepoCard key={repo.id} repo={repo} busy={busyId === repo.id} onToggleMonitoring={toggleMonitoring} />
          ))}
        </div>
      )}
    </div>
  )
}

// Lists repositories accessible through the user's GitHub App installations.
function RepositoryPicker({ onAdded }) {
  const { data, loading, error, reload, setData } = useApi(listGithubRepositories)
  const [addingId, setAddingId] = useState(null)
  const [addError, setAddError] = useState(null)
  const [search, setSearch] = useState('')

  const add = async (repo) => {
    setAddingId(repo.github_repo_id)
    setAddError(null)
    try {
      const created = await addRepository(repo.github_repo_id)
      setData((prev) => prev.map((r) => (r.github_repo_id === repo.github_repo_id ? { ...r, monitored: true, repository_id: created.id } : r)))
      onAdded()
    } catch (err) {
      setAddError(err)
    } finally {
      setAddingId(null)
    }
  }

  const visible = (data ?? []).filter((r) => r.full_name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="card space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="section-title">Add from GitHub</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Repositories your PipelineIQ GitHub App installation can access.{' '}
            <Link to="/integrations" className="text-brand-400 hover:text-brand-300">Manage installation</Link>
          </p>
        </div>
        <input
          type="search"
          className="input w-full sm:w-56 text-sm h-9"
          placeholder="Filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter GitHub repositories"
        />
      </div>

      {addError && <ErrorState error={addError} title="Could not add repository" />}

      {loading ? (
        <LoadingState label="Loading GitHub repositories…" />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={reload}
          title={error.code === 'not_configured' ? 'GitHub is not configured' : 'Could not load GitHub repositories'}
        />
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No repositories found. Install the GitHub App on an account or organization from the Integrations page.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)] max-h-80 overflow-y-auto -mx-5 px-5">
          {visible.map((repo) => (
            <div key={repo.github_repo_id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate flex items-center gap-1.5">
                  {repo.private && <Lock className="h-3 w-3 text-[var(--text-muted)]" />}
                  {repo.full_name}
                </p>
                {repo.description && <p className="text-xs text-[var(--text-muted)] truncate">{repo.description}</p>}
              </div>
              {repo.monitored ? (
                <Link to={`/repositories/${repo.repository_id}`} className="text-xs text-green-500">Monitoring ✓</Link>
              ) : (
                <button onClick={() => add(repo)} disabled={addingId !== null} className="btn-secondary text-xs py-1.5">
                  {addingId === repo.github_repo_id ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
                  Monitor
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
