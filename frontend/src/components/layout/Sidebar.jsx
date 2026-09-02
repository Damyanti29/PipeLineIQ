import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, GitBranch, Bug, AlertTriangle,
  Plug, Settings, Zap, LogOut, ChevronLeft, ChevronRight,
  Bell
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/repositories', icon: GitBranch,        label: 'Repositories' },
  { to: '/errors',       icon: Bug,              label: 'Errors',
    badge: 7, badgeColor: 'bg-red-500' },
  { to: '/incidents',    icon: AlertTriangle,    label: 'Incidents',
    badge: 12, badgeColor: 'bg-orange-500' },
  { to: '/integrations', icon: Plug,             label: 'Integrations' },
  { to: '/settings',     icon: Settings,         label: 'Settings' },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[var(--sidebar-border)] flex-shrink-0">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 shadow-lg shadow-brand-900/30">
          <Zap className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-[var(--text-primary)] leading-tight">PipelineIQ</span>
            <span className="text-[10px] text-[var(--text-muted)] leading-tight">Error Monitoring</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(p => !p)}
          className="ml-auto p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label, badge, badgeColor }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(isActive ? 'sidebar-link-active' : 'sidebar-link', 'relative')
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{label}</span>}
            {badge && (
              <span className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-full text-[10px] font-bold text-white px-1',
                badgeColor,
                collapsed ? 'absolute top-1 right-1' : ''
              )}>
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="flex-shrink-0 border-t border-[var(--sidebar-border)] px-2 py-3 space-y-1">
        <ThemeToggle className="w-full justify-start rounded-lg" />

        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-left"
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>

        {!collapsed && user && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mt-1">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold">
              {user.name?.charAt(0) ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--text-primary)] truncate">{user.name}</p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">{user.email}</p>
            </div>
            <span className="text-[10px] font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded">
              {user.plan}
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
