import { Component, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LifeBuoy, LogIn, SendHorizontal, UserPlus, X } from 'lucide-react'
import { Spinner } from '@/components/ui/LoadingState'
import { useAuth } from '@/hooks/useAuth'
import { askHelpline } from '@/services/helplineService'
import { cn } from '@/lib/utils'

const SUGGESTED_QUESTIONS = [
  'What is PipelineIQ?',
  'How do I add a repository?',
  'Why is my pipeline failing?',
  'Why am I not receiving Slack alerts?',
  'What does Fix PR ready mean?',
]

const LOGIN_REQUIRED_MESSAGE = 'Please log in or create an account to get an answer from the PipelineIQ Helpline.'

// Sign-in and sign-up are two modes of the existing /login page; the link state picks the form.
function LoginActions({ onNavigate }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      <Link to="/login" state={{ mode: 'signin' }} onClick={onNavigate} className="btn-primary px-3 py-1.5 text-xs">
        <LogIn className="h-3.5 w-3.5" />Log In
      </Link>
      <Link to="/login" state={{ mode: 'signup' }} onClick={onNavigate} className="btn-secondary px-3 py-1.5 text-xs">
        <UserPlus className="h-3.5 w-3.5" />Sign Up
      </Link>
    </div>
  )
}

function Message({ message, onNavigate }) {
  const fromUser = message.role === 'user'
  return (
    <div className={cn('flex', fromUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
          fromUser && 'bg-brand-600 text-white',
          !fromUser && !message.error && 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]',
          message.error && 'border border-red-500/20 bg-red-500/5 text-[var(--text-primary)]',
        )}
      >
        {message.text}
        {message.loginRequired && <LoginActions onNavigate={onNavigate} />}
        {message.sources?.length > 0 && (
          <p className="mt-2 border-t border-[var(--border)] pt-1.5 text-[11px] text-[var(--text-muted)]">
            Based on: {message.sources.map((source) => source.question).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}

function HelplinePanel({ messages, setMessages, draft, setDraft, onClose }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, sending])

  // The question stays in the input, so after logging in it can be sent again with one click.
  const askToLogIn = (question) => {
    setMessages((current) => [...current, { role: 'bot', text: LOGIN_REQUIRED_MESSAGE, loginRequired: true }])
    setDraft(question)
  }

  const send = async (text) => {
    const question = text.trim()
    if (!question || sending || authLoading) return
    setDraft('')
    setMessages((current) => [...current, { role: 'user', text: question }])

    // UX only: signed-out users never reach the API. The API enforces sign-in itself (requireAuth).
    if (!isAuthenticated) return askToLogIn(question)

    setSending(true)
    try {
      const reply = await askHelpline(question)
      setMessages((current) => [...current, { role: 'bot', text: reply.answer, sources: reply.sources }])
    } catch (error) {
      // An expired session gets the same login prompt rather than a raw "401".
      if (error.status === 401) askToLogIn(question)
      else setMessages((current) => [...current, { role: 'bot', text: error.message, error: true }])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div
      role="dialog"
      aria-label="PipelineIQ Helpline"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="card fixed bottom-20 right-4 z-50 flex h-[min(34rem,calc(100vh-7rem))] w-[calc(100vw-2rem)] flex-col bg-[var(--bg-primary)] p-0 animate-fade-in sm:right-6 sm:w-96"
    >
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          <LifeBuoy className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">PipelineIQ Helpline</p>
          <p className="text-xs text-[var(--text-muted)]">Questions about using PipelineIQ</p>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close help">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              I can help you understand PipelineIQ, troubleshoot features, and answer questions about the platform.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button key={question} onClick={() => send(question)} className="btn-secondary px-2.5 py-1 text-xs">
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, i) => (
          <Message key={i} message={message} onNavigate={onClose} />
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Spinner className="h-3.5 w-3.5 text-brand-500" />
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
        className="flex items-center gap-2 border-t border-[var(--border)] p-3"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="How can we help you with PipelineIQ?"
          maxLength={1000}
          className="input h-9 text-sm"
          aria-label="Your question"
        />
        <button type="submit" disabled={sending || authLoading || !draft.trim()} className="btn-primary h-9 px-3" aria-label="Send question">
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

// The helpline is an add-on: if it ever fails to render, it disappears instead of taking the page down.
class HelplineBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function HelplineWidget() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  // Kept here rather than in the panel, so closing it (e.g. to go and log in) keeps the conversation.
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')

  // Answers can mention the signed-in user's own errors and alerts, so the conversation is cleared
  // on logout or when another account signs in. Signing in from logged out keeps the pending question.
  const previousUserId = useRef(user?.id ?? null)
  useEffect(() => {
    const userId = user?.id ?? null
    if (previousUserId.current && previousUserId.current !== userId) {
      setMessages([])
      setDraft('')
    }
    previousUserId.current = userId
  }, [user?.id])

  return (
    <HelplineBoundary>
      {open && (
        <HelplinePanel messages={messages} setMessages={setMessages} draft={draft} setDraft={setDraft} onClose={() => setOpen(false)} />
      )}
      <button
        onClick={() => setOpen((value) => !value)}
        className="btn-primary fixed bottom-4 right-4 z-50 h-12 w-12 justify-center rounded-full p-0 sm:right-6"
        aria-label={open ? 'Close PipelineIQ Helpline' : 'Open PipelineIQ Helpline'}
        aria-expanded={open}
        title="PipelineIQ Helpline"
      >
        {open ? <X className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />}
      </button>
    </HelplineBoundary>
  )
}
