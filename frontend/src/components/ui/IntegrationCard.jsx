import { Code2, MessageSquare, Zap, CheckCircle, AlertCircle } from 'lucide-react'
import { Spinner } from './LoadingState'
import { cn } from '@/lib/utils'

const INTEGRATION_CONFIG = {
  github: {
    icon: Code2,
    name: 'GitHub',
    description: 'Install the PipelineIQ GitHub App to pick repositories, receive webhook events and create issues from incidents.',
    bg: 'bg-[#24292e]',
  },
  slack: {
    icon: MessageSquare,
    name: 'Slack',
    description: 'Post real-time alerts, with the AI diagnosis and action buttons, to a Slack channel you choose.',
    bg: 'bg-[#4a154b]',
  },
}

// details: [{ label, value }] shown when connected.
export function IntegrationCard({ type, connected, configured = true, details = [], busy = false, onConnect, onDisconnect, onTest }) {
  const cfg = INTEGRATION_CONFIG[type]
  const Icon = cfg.icon

  return (
    <div className="card overflow-hidden animate-fade-in flex flex-col">
      <div className={cn('flex items-center gap-3 p-5 -m-5 mb-5', cfg.bg)}>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-white">{cfg.name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            {connected ? (
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

      <p className="text-sm text-[var(--text-secondary)] mb-5">{cfg.description}</p>

      {connected && details.length > 0 && (
        <div className="space-y-2 mb-5 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
          {details.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--text-muted)]">{label}</span>
              <span className="text-xs font-medium text-[var(--text-primary)] truncate">{value}</span>
            </div>
          ))}
        </div>
      )}

      {!configured && (
        <p className="text-xs text-amber-500 mb-4">
          Not configured on the server yet. Add the {cfg.name} credentials to <code>backend/.env</code>.
        </p>
      )}

      <div className="flex items-center gap-2 mt-auto">
        {connected ? (
          <>
            {onTest && (
              <button onClick={onTest} disabled={busy} className="btn-secondary text-xs py-1.5">
                <Zap className="h-3.5 w-3.5" />Send test alert
              </button>
            )}
            {onConnect && type === 'github' && (
              <button onClick={onConnect} disabled={busy || !configured} className="btn-secondary text-xs py-1.5">
                Add account
              </button>
            )}
            {onDisconnect && (
              <button onClick={onDisconnect} disabled={busy} className="btn-destructive text-xs py-1.5 ml-auto">
                Disconnect
              </button>
            )}
          </>
        ) : (
          <button onClick={onConnect} disabled={busy || !configured} className="btn-primary w-full justify-center">
            {busy ? <Spinner /> : <Icon className="h-4 w-4" />}
            Connect {cfg.name}
          </button>
        )}
      </div>
    </div>
  )
}
