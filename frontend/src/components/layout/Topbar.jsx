import { Search, Bell } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const PAGE_TITLES = {
  '/dashboard':    { title: 'Dashboard',    subtitle: 'Overview of your monitoring activity' },
  '/repositories': { title: 'Repositories', subtitle: 'Manage and monitor your GitHub repositories' },
  '/errors':       { title: 'Errors',       subtitle: 'All grouped errors across repositories' },
  '/incidents':    { title: 'Incidents',    subtitle: 'Active and resolved incidents' },
  '/integrations': { title: 'Integrations', subtitle: 'Connect GitHub, Slack, and more' },
  '/settings':     { title: 'Settings',     subtitle: 'Account, notifications, and preferences' },
}

export function Topbar() {
  const { pathname } = useLocation()

  const base = '/' + pathname.split('/')[1]
  const page = PAGE_TITLES[base] ?? { title: 'PipelineIQ', subtitle: '' }

  return (
    <header className="h-16 flex items-center gap-4 px-6 border-b border-[var(--border)] bg-[var(--bg-primary)] sticky top-0 z-30">
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-[var(--text-primary)] truncate">{page.title}</h1>
        {page.subtitle && (
          <p className="text-xs text-[var(--text-muted)] hidden sm:block">{page.subtitle}</p>
        )}
      </div>

      {/* Search */}
      <div className="relative hidden md:flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
        <input
          type="search"
          placeholder="Search errors, repos..."
          className="input pl-9 w-56 text-sm h-9"
          id="global-search"
        />
        <kbd className="absolute right-3 text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </div>

      {/* Notifications */}
      <button
        className="relative p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        aria-label="Notifications"
        id="notification-bell"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
      </button>
    </header>
  )
}
