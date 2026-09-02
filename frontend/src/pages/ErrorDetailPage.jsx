import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeft, FileCode, Repeat2, Clock, GitBranch,
  CheckCircle, RotateCcw, Code2, Brain, Lightbulb,
  Copy, Check, AlertTriangle, Info
} from 'lucide-react'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { mockErrors } from '@/data/mockData'
import { timeAgo, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

function CodeBlock({ code, language = 'javascript' }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative rounded-lg bg-surface-900 dark:bg-surface-950 border border-[var(--border)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
        <span className="text-xs text-[var(--text-muted)] font-mono">{language}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-xs text-slate-300 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  )
}

export function ErrorDetailPage() {
  const { id } = useParams()
  const error = mockErrors.find(e => e.id === id) ?? mockErrors[0]
  const [status, setStatus] = useState(error.status)
  const [githubCreated, setGithubCreated] = useState(false)

  const toggleStatus = () => {
    setStatus(s => s === 'open' ? 'resolved' : 'open')
  }

  const createIssue = () => {
    setGithubCreated(true)
    setTimeout(() => setGithubCreated(false), 3000)
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back */}
      <Link to="/errors" className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors w-fit">
        <ArrowLeft className="h-4 w-4" />
        Back to errors
      </Link>

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="font-mono text-lg font-bold text-[var(--text-primary)]">{error.errorType}</span>
              <SeverityBadge severity={error.severity} />
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-[var(--text-secondary)] font-mono leading-relaxed">{error.message}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button
              onClick={toggleStatus}
              className={status === 'open' ? 'btn-secondary text-sm py-1.5' : 'btn-destructive text-sm py-1.5'}
            >
              {status === 'open'
                ? <><CheckCircle className="h-4 w-4" />Resolve</>
                : <><RotateCcw className="h-4 w-4" />Reopen</>
              }
            </button>
            <button
              onClick={createIssue}
              className={githubCreated ? 'btn-secondary text-sm py-1.5 text-green-500' : 'btn-secondary text-sm py-1.5'}
            >
              <Code2 className="h-4 w-4" />
              {githubCreated ? 'Issue created!' : 'Create GitHub Issue'}
            </button>
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[var(--border)]">
          <MetaItem label="File" icon={FileCode} value={`${error.fileName}:${error.lineNumber}`} mono />
          <MetaItem label="Occurrences" icon={Repeat2} value={error.occurrences.toLocaleString()} />
          <MetaItem label="First seen" icon={Clock} value={formatDate(error.firstSeen)} />
          <MetaItem label="Last seen" icon={Clock} value={timeAgo(error.lastSeen)} />
          <MetaItem label="Repository" icon={GitBranch} value={error.repositoryName} />
          <MetaItem label="Environment" icon={AlertTriangle} value={error.environment} />
          <MetaItem label="Status" icon={Info} value={status} />
        </div>
      </div>

      {/* AI Diagnosis */}
      {error.aiDiagnosis ? (
        <div className="card p-6 border-brand-600/20 bg-gradient-to-br from-brand-950/20 to-transparent">
          <div className="flex items-center gap-2 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/15">
              <Brain className="h-4 w-4 text-brand-400" />
            </div>
            <h3 className="font-semibold text-[var(--text-primary)]">AI Diagnosis</h3>
            <span className="badge bg-brand-500/10 text-brand-400 border border-brand-500/20 text-[10px]">
              Powered by Gemini
            </span>
          </div>

          <div className="space-y-5">
            {/* Root cause */}
            <div>
              <p className="label mb-2">Root Cause</p>
              <div className="rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] p-4">
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">{error.aiDiagnosis.rootCause}</p>
              </div>
            </div>

            {/* Explanation */}
            <div>
              <p className="label mb-2">Explanation</p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{error.aiDiagnosis.explanation}</p>
            </div>

            {/* Suggested fix */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-amber-400" />
                <p className="label">Suggested Fix</p>
              </div>
              <CodeBlock code={error.aiDiagnosis.suggestedFix} language="javascript" />
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-5 border-dashed">
          <div className="flex items-center gap-3 text-[var(--text-muted)]">
            <Brain className="h-5 w-5" />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">AI diagnosis pending</p>
              <p className="text-xs text-[var(--text-muted)]">Analysis will appear here after the first occurrence is processed.</p>
            </div>
          </div>
        </div>
      )}

      {/* Stack trace */}
      <div className="card p-5">
        <h3 className="section-title mb-4">Stack Trace</h3>
        <CodeBlock code={error.stackTrace} language="stacktrace" />
      </div>
    </div>
  )
}

function MetaItem({ label, icon: Icon, value, mono = false }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={cn('text-sm text-[var(--text-primary)] font-medium', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  )
}
