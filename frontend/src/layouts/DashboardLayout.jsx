import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { LoadingState } from '@/components/ui/LoadingState'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

export function DashboardLayout() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  if (loading) return <LoadingState fullScreen label="Loading your workspace…" />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-secondary)]">
      <div className="app-backdrop" aria-hidden="true" />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className={cn('relative z-10 flex flex-col flex-1 min-w-0 transition-all duration-300', collapsed ? 'md:ml-16' : 'md:ml-60')}>
        {import.meta.env.VITE_DEMO_MODE === 'true' && (
          <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 px-4 py-1.5 text-center text-xs font-medium text-white">
            Demo mode: sample data from a local mock server. Nothing is sent to Supabase, GitHub, Slack or Gemini.
          </div>
        )}
        <Navbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
