import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { LoadingState } from '@/components/ui/LoadingState'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Authenticated pages are code-split so the landing and login pages stay small.
const page = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })))
const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage')
const RepositoriesPage = page(() => import('@/pages/RepositoriesPage'), 'RepositoriesPage')
const RepositoryDetailPage = page(() => import('@/pages/RepositoryDetailPage'), 'RepositoryDetailPage')
const ErrorsPage = page(() => import('@/pages/ErrorsPage'), 'ErrorsPage')
const ErrorDetailPage = page(() => import('@/pages/ErrorDetailPage'), 'ErrorDetailPage')
const IncidentsPage = page(() => import('@/pages/IncidentsPage'), 'IncidentsPage')
const PipelinePage = page(() => import('@/pages/PipelinePage'), 'PipelinePage')
const IntegrationsPage = page(() => import('@/pages/IntegrationsPage'), 'IntegrationsPage')
const SettingsPage = page(() => import('@/pages/SettingsPage'), 'SettingsPage')

export default function App() {
  return (
    <Suspense fallback={<LoadingState fullScreen />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Authenticated (DashboardLayout redirects to /login without a session) */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/repositories" element={<RepositoriesPage />} />
          <Route path="/repositories/:id" element={<RepositoryDetailPage />} />
          <Route path="/errors" element={<ErrorsPage />} />
          <Route path="/errors/:id" element={<ErrorDetailPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
