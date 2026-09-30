import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { IntegrationCard } from '@/components/ui/IntegrationCard'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { SystemStatus } from '@/components/ui/SystemStatus'
import { useApi } from '@/hooks/useApi'
import { formatDate } from '@/utils/format'
import { connectGithub, getGithubStatus } from '@/services/githubService'
import { connectSlack, disconnectSlack, getSlackStatus, sendSlackTest } from '@/services/slackService'

// Messages for the ?github= / ?slack= flags set by the backend OAuth callbacks.
const CALLBACK_MESSAGES = {
  connected: { ok: true, text: (name) => `${name} connected successfully.` },
  error: { ok: false, text: (name) => `${name} connection failed. Please try again.` },
  cancelled: { ok: false, text: (name) => `${name} connection was cancelled.` },
}

async function loadStatus() {
  const [github, slack] = await Promise.all([getGithubStatus(), getSlackStatus()])
  return { github, slack }
}

function noticeFromParams(params) {
  const flag = params.get('github') ? ['GitHub', params.get('github')] : params.get('slack') ? ['Slack', params.get('slack')] : null
  const message = flag && CALLBACK_MESSAGES[flag[1]]
  return message ? { ok: message.ok, text: message.text(flag[0]) } : null
}

export function IntegrationsPage() {
  const { data, loading, error, reload } = useApi(loadStatus)
  const [params, setParams] = useSearchParams()
  const [notice, setNotice] = useState(() => noticeFromParams(params))
  const [busy, setBusy] = useState(null)

  // Drop the one-time callback flag from the URL once it has been shown.
  const hasFlag = params.has('github') || params.has('slack')
  useEffect(() => {
    if (hasFlag) setParams({}, { replace: true })
  }, [hasFlag, setParams])

  const run = async (key, action, successText) => {
    setBusy(key)
    setNotice(null)
    try {
      await action()
      if (successText) setNotice({ ok: true, text: successText })
    } catch (err) {
      setNotice({ ok: false, text: err.message })
    } finally {
      setBusy(null)
    }
  }

  const handleSlackDisconnect = () => {
    if (!window.confirm('Disconnect Slack? Alerts will stop being posted.')) return
    run('slack', async () => {
      await disconnectSlack()
      reload()
    }, 'Slack disconnected.')
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Integrations</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">Connect GitHub to choose repositories, and Slack to receive alerts.</p>
      </div>

      {notice && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${notice.ok ? 'border-green-500/20 bg-green-500/5 text-green-500' : 'border-red-500/20 bg-red-500/5 text-red-400'}`}>
          {notice.ok ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {notice.text}
        </div>
      )}

      <SystemStatus />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          <IntegrationCard
            type="github"
            connected={data.github.connected}
            configured={data.github.configured}
            busy={busy === 'github'}
            details={data.github.installations.map((inst) => ({
              label: `${inst.account_type} · since ${formatDate(inst.created_at)}`,
              value: `@${inst.account_login}`,
            }))}
            onConnect={() => run('github', connectGithub)}
          />
          <IntegrationCard
            type="slack"
            connected={data.slack.connected}
            configured={data.slack.configured}
            busy={busy === 'slack'}
            details={[
              { label: 'Workspace', value: data.slack.workspace_name },
              { label: 'Channel', value: data.slack.channel_name ?? '—' },
              { label: 'Connected', value: formatDate(data.slack.connected_at) },
            ]}
            onConnect={() => run('slack', connectSlack)}
            onDisconnect={handleSlackDisconnect}
            onTest={() => run('slack', sendSlackTest, `Test alert sent to ${data.slack.channel_name ?? 'Slack'}.`)}
          />
        </div>
      )}
    </div>
  )
}
