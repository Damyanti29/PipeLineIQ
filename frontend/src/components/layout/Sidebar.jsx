import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, GitBranch, Bug, AlertTriangle,
  Plug, Settings, LogOut, ChevronLeft, ChevronRight, X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/repositories', icon: GitBranch,       label: 'Repositories' },
  { to: '/errors',       icon: Bug,             label: 'Errors' },
  { to: '/incidents',    icon: AlertTriangle,   label: 'Incidents' },
  { to: '/integrations', icon: Plug,            label: 'Integrations' },
  { to: '/settings',     icon: Settings,        label: 'Settings' },
]

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  // The mobile drawer always shows labels.
  const compact = collapsed && !mobileOpen

  const handleLogout = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-all duration-300',
          compact ? 'w-16' : 'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-[var(--sidebar-border)] flex-shrink-0">
          <Logo showText={!compact} />
          <button
            onClick={onToggleCollapsed}
            className="ml-auto p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors hidden md:block"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          <button
            onClick={onCloseMobile}
            className="ml-auto p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onCloseMobile}
              className={({ isActive }) => (isActive ? 'sidebar-link-active' : 'sidebar-link')}
              title={compact ? label : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!compact && <span className="flex-1 truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="flex-shrink-0 border-t border-[var(--sidebar-border)] px-2 py-3 space-y-1">
          <ThemeToggle className="w-full justify-start rounded-lg" />

          <button onClick={handleLogout} className="sidebar-link w-full text-left" title={compact ? 'Log out' : undefined}>
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!compact && <span>Log out</span>}
          </button>

          {!compact && user && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg mt-1">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--text-primary)] truncate">{user.name}</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate">{user.email}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
