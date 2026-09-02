import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  GitBranch, Bug, AlertTriangle, Activity,
  MessageSquare, CheckCircle, ArrowRight, ExternalLink
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { StatCard } from '@/components/ui/StatCard'
import { IncidentCard } from '@/components/ui/IncidentCard'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { useAuth } from '@/context/AuthContext'
import { mockStats, mockErrorTrend, mockIncidents, mockRepositories, mockIntegrations } from '@/data/mockData'
import { cn } from '@/lib/utils'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-[var(--text-primary)] mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[var(--text-muted)] capitalize">{p.dataKey}:</span>
          <span className="font-medium text-[var(--text-primary)]">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

const HEALTH_COLORS = {
  critical: 'text-red-500',
  warning: 'text-orange-500',
  healthy: 'text-green-500',
  unknown: 'text-[var(--text-muted)]',
}

export function DashboardPage() {
  const { user } = useAuth()
  const [timeRange] = useState('14d')

  const criticalRepos = mockRepositories.filter(r => r.health === 'critical')
  const recentIncidents = mockIncidents.slice(0, 5)

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            Good {getGreeting()}, {user?.name?.split(' ')[0]} 👋
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Here's what's happening with your repositories.
          </p>
        </div>
        <Link to="/repositories" className="btn-secondary text-sm py-1.5 hidden sm:flex">
          <GitBranch className="h-4 w-4" />
          View repos
        </Link>
      </div>

      {/* Slack banner (if not connected) */}
      {!mockIntegrations.slack.connected && (
        <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
          <MessageSquare className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-sm text-[var(--text-secondary)] flex-1">
            Connect Slack to receive real-time error alerts in your team channel.
          </p>
          <Link to="/integrations" className="text-xs font-medium text-green-400 hover:text-green-300 flex items-center gap-1">
            Connect <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={GitBranch}
          value={mockStats.totalRepos}
          label="Repositories"
          iconColor="text-brand-400"
          iconBg="bg-brand-500/10"
        />
        <StatCard
          icon={Bug}
          value={mockStats.totalErrors}
          label="Total Errors"
          delta={mockStats.errorDelta}
          iconColor="text-orange-400"
          iconBg="bg-orange-500/10"
        />
        <StatCard
          icon={AlertTriangle}
          value={mockStats.criticalErrors}
          label="Critical"
          delta={mockStats.criticalDelta}
          iconColor="text-red-400"
          iconBg="bg-red-500/10"
        />
        <StatCard
          icon={Activity}
          value={mockStats.openIncidents}
          label="Open Incidents"
          delta={mockStats.incidentDelta}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10"
        />
      </div>

      {/* Charts + Incidents row */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Error trend chart */}
        <div className="card lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="section-title">Error Trend</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Last 14 days</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-500" />
                <span className="text-[var(--text-muted)]">All errors</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-[var(--text-muted)]">Critical</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={mockErrorTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="errors"
                stroke="#7c3aed"
                strokeWidth={2}
                fill="url(#colorErrors)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="critical"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#colorCritical)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Repo Health */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Repository Health</h3>
            <Link to="/repositories" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              View all <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {mockRepositories.map(repo => (
              <Link
                key={repo.id}
                to={`/repositories/${repo.id}`}
                className="flex items-center gap-3 py-2 -mx-2 px-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors group"
              >
                <span className={cn(
                  'h-2 w-2 rounded-full flex-shrink-0',
                  repo.health === 'critical' ? 'bg-red-500 animate-pulse' :
                  repo.health === 'warning' ? 'bg-orange-500' :
                  repo.health === 'healthy' ? 'bg-green-500' : 'bg-[var(--text-muted)]'
                )} />
                <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{repo.name}</span>
                <span className="text-xs text-[var(--text-muted)]">{repo.errorCount} errors</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Incidents */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title">Recent Incidents</h3>
          <Link to="/incidents" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
            View all <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        {recentIncidents.map(incident => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
      </div>

      {/* Integrations status */}
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          {
            icon: CheckCircle,
            label: 'GitHub Connected',
            sub: `${mockIntegrations.github.repoCount} repositories`,
            iconColor: 'text-green-500',
            bg: 'bg-green-500/10',
          },
          {
            icon: mockIntegrations.slack.connected ? CheckCircle : Slack,
            label: mockIntegrations.slack.connected ? 'Slack Connected' : 'Slack Not Connected',
            sub: mockIntegrations.slack.connected ? mockIntegrations.slack.channelName : 'Click to connect',
            iconColor: mockIntegrations.slack.connected ? 'text-green-500' : 'text-[var(--text-muted)]',
            bg: mockIntegrations.slack.connected ? 'bg-green-500/10' : 'bg-[var(--bg-tertiary)]',
            link: !mockIntegrations.slack.connected ? '/integrations' : undefined,
          },
        ].map(({ icon: Icon, label, sub, iconColor, bg, link }) => (
          <div key={label} className={cn('card flex items-center gap-4 p-4', link && 'cursor-pointer hover:border-brand-600/40 transition-colors')}>
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0', bg)}>
              <Icon className={cn('h-5 w-5', iconColor)} />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
              <p className="text-xs text-[var(--text-muted)]">{sub}</p>
            </div>
            {link && (
              <Link to={link} className="ml-auto text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                Connect <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}
