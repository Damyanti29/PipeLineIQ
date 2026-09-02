import { Code2, MessageSquare, Zap, CheckCircle, AlertCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const INTEGRATION_CONFIG = {
  github: {
    icon: Code2,
    name: 'GitHub',
    description: 'Connect your GitHub repositories and receive webhook events for push, PRs, deployments, and issues.',
    color: 'text-white',
    bg: 'bg-[#24292e]',
    iconBg: 'bg-white/10',
  },
  slack: {
    icon: MessageSquare,
    name: 'Slack',
    description: 'Send real-time alerts to your Slack channel when critical errors are detected and diagnosed.',
    color: 'text-white',
    bg: 'bg-[#4a154b]',
    iconBg: 'bg-white/10',
  },
}

export function IntegrationCard({ type, integration, onConnect, onDisconnect, onTest }) {
  const cfg = INTEGRATION_CONFIG[type]
  const Icon = cfg.icon
  const isConnected = integration?.connected

  return (
    <div className={cn('card overflow-hidden animate-fade-in')}>
      {/* Header */}
      <div className={cn('flex items-center gap-3 p-5 -m-5 mb-5', cfg.bg)}>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', cfg.iconBg)}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-white">{cfg.name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isConnected ? (
              <>
                <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs text-green-400">Connected</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-white/50" />
                <span className="text-xs text-white/50">Not connected</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--text-secondary)] mb-5">{cfg.description}</p>

      {/* Details */}
      {isConnected && (
        <div className="space-y-2 mb-5 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
          {type === 'github' && (
            <>
              <Detail label="Account" value={`@${integration.username}`} />
              <Detail label="Repositories" value={`${integration.repoCount} monitored`} />
              <Detail label="Connected" value={formatDate(integration.installedAt)} />
            </>
          )}
          {type === 'slack' && (
            <>
              <Detail label="Workspace" value={integration.workspaceName} />
              <Detail label="Channel" value={integration.channelName} />
              <Detail label="Connected" value={formatDate(integration.connectedAt)} />
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            {type === 'slack' && (
              <button onClick={onTest} className="btn-secondary text-xs py-1.5">
                <Zap className="h-3.5 w-3.5" />Send Test Alert
              </button>
            )}
            <button onClick={onDisconnect} className="btn-destructive text-xs py-1.5 ml-auto">
              Disconnect
            </button>
          </>
        ) : (
          <button onClick={onConnect} className="btn-primary w-full justify-center">
            <Icon className="h-4 w-4" />
            Connect {cfg.name}
          </button>
        )}
      </div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="text-xs font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  )
}
