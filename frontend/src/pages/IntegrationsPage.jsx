import { useState } from 'react'
import { Plug, Clock } from 'lucide-react'
import { IntegrationCard } from '@/components/ui/IntegrationCard'
import { mockIntegrations } from '@/data/mockData'

const COMING_SOON = [
  { name: 'PagerDuty', description: 'On-call alerting and escalation policies.' },
  { name: 'Datadog', description: 'APM and infrastructure monitoring integration.' },
  { name: 'Linear', description: 'Auto-create Linear issues from incidents.' },
  { name: 'Jira', description: 'Sync incidents with your Jira project board.' },
]

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState(mockIntegrations)

  const handleConnect = (type) => {
    alert(`OAuth flow for ${type} would open here. (Phase 2)`)
  }

  const handleDisconnect = (type) => {
    if (confirm(`Disconnect ${type}?`)) {
      setIntegrations(prev => ({
        ...prev,
        [type]: { ...prev[type], connected: false },
      }))
    }
  }

  const handleTest = () => {
    alert('Test Slack alert sent! Check #alerts-production.')
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Integrations</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          Connect your tools to enable monitoring, alerts, and issue management.
        </p>
      </div>

      {/* Active integrations */}
      <div>
        <h3 className="section-title mb-4">Connected services</h3>
        <div className="grid sm:grid-cols-2 gap-5">
          <IntegrationCard
            type="github"
            integration={integrations.github}
            onConnect={() => handleConnect('github')}
            onDisconnect={() => handleDisconnect('github')}
          />
          <IntegrationCard
            type="slack"
            integration={integrations.slack}
            onConnect={() => handleConnect('slack')}
            onDisconnect={() => handleDisconnect('slack')}
            onTest={handleTest}
          />
        </div>
      </div>

      {/* Coming soon */}
      <div>
        <h3 className="section-title mb-4">Coming soon</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COMING_SOON.map(item => (
            <div key={item.name} className="card p-4 opacity-60 select-none">
              <div className="flex items-center gap-2 mb-2">
                <Plug className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{item.name}</span>
                <span className="badge badge-default text-[10px] ml-auto">
                  <Clock className="h-2.5 w-2.5" />Soon
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
