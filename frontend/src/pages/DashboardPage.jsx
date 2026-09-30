import { Link } from 'react-router-dom'
import {
  GitBranch, Bug, AlertTriangle, Activity,
  MessageSquare, CheckCircle, ArrowRight, ExternalLink, Code2,
} from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { IncidentCard } from '@/components/ui/IncidentCard'
import { ErrorTrendChart } from '@/components/ui/ErrorTrendChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { repositoryHealth } from '@/utils/repositoryHealth'
import { useAuth } from '@/hooks/useAuth'
import { useApi } from '@/hooks/useApi'
import { getErrorStats } from '@/services/errorService'
import { listIncidents } from '@/services/incidentService'
import { listRepositories } from '@/services/repositoryService'
import { getGithubStatus } from '@/services/githubService'
import { getSlackStatus } from '@/services/slackService'
import { cn } from '@/lib/utils'

const HEALTH_DOT = {
  critical: 'bg-red-500 animate-pulse',
  warning: 'bg-orange-500',
  healthy: 'bg-green-500',
  paused: 'bg-[var(--text-muted)]',
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

async function loadDashboard() {
  const [stats, incidents, repositories, github, slack] = await Promise.all([
    getErrorStats({ days: 14 }),
    listIncidents({ limit: 5 }),
    listRepositories(),
    getGithubStatus(),
    getSlackStatus(),
  ])
  return { stats, incidents, repositories, github, slack }
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useApi(loadDashboard)

  const greeting = (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          Good {getGreeting()}, {user?.name?.split(' ')[0]} 👋
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">Here's what's happening with your repositories.</p>
      </div>
      <Link to="/repositories" className="btn-secondary text-sm py-1.5 hidden sm:flex">
        <GitBranch className="h-4 w-4" />
        View repos
      </Link>
    </div>
  )

  if (loading) return <div className="space-y-6 max-w-7xl">{greeting}<LoadingState /></div>
  if (error) return <div className="space-y-6 max-w-7xl">{greeting}<ErrorState error={error} onRetry={reload} /></div>

  const { stats, incidents, repositories, github, slack } = data

  if (!github.connected && repositories.length === 0) {
    return (
      <div className="space-y-6 max-w-7xl">
        {greeting}
        <div className="card">
          <EmptyState
            icon={Code2}
            title="Connect GitHub to get started"
            description="Install the RepoSentinel GitHub App, choose repositories to monitor, then add the SDK to your app."
            action={<Link to="/integrations" className="btn-primary text-sm">Go to integrations</Link>}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {greeting}

      {!slack.connected && (
        <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
          <MessageSquare className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-sm text-[var(--text-secondary)] flex-1">Connect Slack to receive real-time error alerts in your team channel.</p>
          <Link to="/integrations" className="text-xs font-medium text-green-400 hover:text-green-300 flex items-center gap-1">
            Connect <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={GitBranch} value={stats.repositories} label="Repositories" iconColor="text-brand-400" iconBg="bg-brand-500/10" />
        <StatCard icon={Bug} value={stats.open_errors} label="Open errors" iconColor="text-orange-400" iconBg="bg-orange-500/10" />
        <StatCard icon={AlertTriangle} value={stats.critical_errors} label="Critical" iconColor="text-red-400" iconBg="bg-red-500/10" />
        <StatCard icon={Activity} value={stats.open_incidents} label="Open incidents" iconColor="text-violet-400" iconBg="bg-violet-500/10" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="section-title">Error events</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Last 14 days</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-500" />
                <span className="text-[var(--text-muted)]">All events</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-[var(--text-muted)]">Critical</span>
              </div>
            </div>
          </div>
          <ErrorTrendChart data={stats.trend} />
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Repository health</h3>
            <Link to="/repositories" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              View all <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {repositories.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No repositories monitored yet.</p>
          ) : (
            <div className="space-y-1">
              {repositories.slice(0, 8).map((repo) => (
                <Link
                  key={repo.id}
                  to={`/repositories/${repo.id}`}
                  className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <span className={cn('h-2 w-2 rounded-full flex-shrink-0', HEALTH_DOT[repositoryHealth(repo)])} />
                  <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{repo.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">{repo.stats.open_errors} open</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title">Recent incidents</h3>
          <Link to="/incidents" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
            View all <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        {incidents.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-4">No incidents yet. 🎉</p>
        ) : (
          incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} />)
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <IntegrationStatus
          connected={github.connected}
          label={github.connected ? 'GitHub connected' : 'GitHub not connected'}
          sub={github.connected ? github.installations.map((i) => `@${i.account_login}`).join(', ') : 'Install the GitHub App'}
        />
        <IntegrationStatus
          connected={slack.connected}
          label={slack.connected ? 'Slack connected' : 'Slack not connected'}
          sub={slack.connected ? `${slack.workspace_name} · ${slack.channel_name ?? ''}` : 'Get alerts in a channel'}
        />
      </div>
    </div>
  )
}

function IntegrationStatus({ connected, label, sub }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0', connected ? 'bg-green-500/10' : 'bg-[var(--bg-tertiary)]')}>
        {connected ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-[var(--text-muted)]" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-muted)] truncate">{sub}</p>
      </div>
      {!connected && (
        <Link to="/integrations" className="ml-auto text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
          Connect <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
