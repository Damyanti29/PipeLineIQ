import { useState } from 'react'
import { Menu, Search } from 'lucide-react'
import { ApiStatusPill } from '@/components/ui/ApiStatusPill'
import { useLocation, useNavigate } from 'react-router-dom'

const PAGE_TITLES = {
  '/dashboard':    { title: 'Dashboard',    subtitle: 'Overview of your monitoring activity' },
  '/repositories': { title: 'Repositories', subtitle: 'Manage and monitor your GitHub repositories' },
  '/errors':       { title: 'Errors',       subtitle: 'All grouped errors across repositories' },
  '/incidents':    { title: 'Incidents',    subtitle: 'Active and resolved incidents' },
  '/integrations': { title: 'Integrations', subtitle: 'Connect GitHub and Slack' },
  '/settings':     { title: 'Settings',     subtitle: 'Account and preferences' },
}

export function Navbar({ onOpenMenu }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const base = '/' + pathname.split('/')[1]
  const page = PAGE_TITLES[base] ?? { title: 'PipelineIQ', subtitle: '' }

  const handleSearch = (e) => {
    e.preventDefault()
    const term = query.trim()
    navigate(term ? `/errors?search=${encodeURIComponent(term)}` : '/errors')
  }

  return (
    <header className="h-16 flex items-center gap-4 px-4 md:px-6 border-b border-[var(--border)] bg-[var(--bg-primary)]/70 backdrop-blur-xl sticky top-0 z-20">
      <button
        onClick={onOpenMenu}
        className="p-2 -ml-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-[var(--text-primary)] truncate">{page.title}</h1>
        {page.subtitle && <p className="text-xs text-[var(--text-muted)] hidden sm:block">{page.subtitle}</p>}
      </div>

      <ApiStatusPill />

      <form onSubmit={handleSearch} className="relative hidden md:flex items-center" role="search">
        <Search className="absolute left-3 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
        <input
          type="search"
          placeholder="Search errors…"
          className="input pl-9 w-56 text-sm h-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search errors"
        />
      </form>
    </header>
  )
}
