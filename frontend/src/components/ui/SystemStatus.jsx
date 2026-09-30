import { useEffect } from 'react'
import { Activity, Code2, Brain, Database, Layers, MessageSquare, RefreshCw, Server } from 'lucide-react'
import { PipelineFlow } from './PipelineFlow'
import { useApi } from '@/hooks/useApi'
import { getHealth } from '@/services/healthService'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/utils/format'

const configured = (value) => (value === 'configured' ? 'ok' : 'warn')

// Maps GET /api/health into pipeline stages, in the order data flows through them.
function healthToNodes(health, error) {
  const s = health?.services ?? {}
  const apiDown = Boolean(error)
  const unknown = (status) => (apiDown ? 'down' : status)
  return [
    { key: 'api', label: 'API', sublabel: 'Express', icon: Server, status: apiDown ? 'down' : 'ok', statusText: apiDown ? 'Offline' : 'Online' },
    { key: 'db', label: 'Database', sublabel: 'Supabase', icon: Database, status: unknown(configured(s.supabase)) },
    {
      key: 'queue', label: 'Queue', sublabel: 'Redis', icon: Layers,
      status: unknown(s.redis === 'up' ? 'ok' : 'warn'),
      statusText: apiDown ? undefined : s.redis === 'up' ? 'Connected' : 'Inline fallback',
    },
    { key: 'ai', label: 'AI diagnosis', sublabel: 'Gemini', icon: Brain, status: unknown(configured(s.gemini)) },
    { key: 'slack', label: 'Alerts', sublabel: 'Slack', icon: MessageSquare, status: unknown(configured(s.slack)) },
    { key: 'github', label: 'Issues', sublabel: 'GitHub', icon: Code2, status: unknown(configured(s.github)) },
  ]
}

export function SystemStatus({ className }) {
  const { data, error, loading, reload } = useApi(getHealth)

  // Re-check every 30 seconds.
  useEffect(() => {
    const timer = setInterval(reload, 30000)
    return () => clearInterval(timer)
  }, [reload])

  const nodes = healthToNodes(data, error)
  const down = nodes.filter((n) => n.status === 'down').length
  const warn = nodes.filter((n) => n.status === 'warn').length
  const summary = error
    ? { text: 'Cannot reach the PipelineIQ API', tone: 'text-red-400', dot: 'bg-red-500' }
    : warn
      ? { text: `Core system online · ${warn} integration${warn > 1 ? 's' : ''} need setup`, tone: 'text-amber-400', dot: 'bg-amber-400' }
      : { text: 'All systems operational', tone: 'text-emerald-400', dot: 'bg-emerald-400' }

  return (
    <div className={cn('card p-5 overflow-hidden relative', className)}>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand-400" />
          <h3 className="section-title">System status</h3>
          {!loading && (
            <span className={cn('flex items-center gap-1.5 text-xs font-medium', summary.tone)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', summary.dot)} />
              {summary.text}
            </span>
          )}
        </div>
        <button onClick={reload} className="btn-ghost text-xs py-1 px-2" aria-label="Re-check status">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          {data?.timestamp ? `Checked ${timeAgo(data.timestamp)}` : 'Check'}
        </button>
      </div>
      <PipelineFlow nodes={nodes} />
      {down === 0 && warn > 0 && (
        <p className="text-xs text-[var(--text-muted)] mt-5 text-center">
          Amber stages still work in a reduced mode: add their credentials to <code>backend/.env</code> to enable them.
        </p>
      )}
    </div>
  )
}
