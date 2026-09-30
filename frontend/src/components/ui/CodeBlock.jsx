import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CodeBlock({ code, language = 'javascript' }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="relative rounded-lg bg-surface-900 dark:bg-surface-950 border border-[var(--border)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
        <span className="text-xs text-[var(--text-muted)] font-mono">{language}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-xs text-slate-300 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap break-words">{code}</pre>
    </div>
  )
}
