import { useState } from 'react'
import { Save, Trash2, User, Bell, Shield, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'monitoring', label: 'Monitoring', icon: Shield },
]

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-brand-600' : 'bg-[var(--bg-tertiary)] border border-[var(--border)]'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

export function SettingsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('profile')
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saved, setSaved] = useState(false)
  const [notifs, setNotifs] = useState({
    slackCritical: true,
    slackHigh: true,
    emailDigest: false,
    newIncident: true,
  })
  const [monitoring, setMonitoring] = useState({
    autoFingerprint: true,
    aiAnalysis: true,
    captureSource: true,
    minSeverity: 'medium',
  })

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Settings</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">Manage your account and preferences.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-brand-600 text-brand-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === 'profile' && (
        <div className="card p-6 space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white text-2xl font-bold">
              {name.charAt(0)}
            </div>
            <div>
              <button className="btn-secondary text-xs py-1.5">Change avatar</button>
              <p className="text-xs text-[var(--text-muted)] mt-1">JPG or PNG. Max 1MB.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="label" htmlFor="settings-name">Full name</label>
            <input
              id="settings-name"
              type="text"
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="label" htmlFor="settings-email">Email</label>
            <input
              id="settings-email"
              type="email"
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              Appearance: <ThemeToggle />
            </div>
            <button onClick={handleSave} className="btn-primary text-sm py-1.5">
              <Save className="h-4 w-4" />
              {saved ? 'Saved!' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Notifications tab */}
      {tab === 'notifications' && (
        <div className="card p-6">
          <p className="label mb-4">Slack alerts</p>
          <Toggle
            checked={notifs.slackCritical}
            onChange={() => setNotifs(p => ({ ...p, slackCritical: !p.slackCritical }))}
            label="Critical errors"
            description="Send Slack alert for every critical error"
          />
          <Toggle
            checked={notifs.slackHigh}
            onChange={() => setNotifs(p => ({ ...p, slackHigh: !p.slackHigh }))}
            label="High severity errors"
            description="Send Slack alert for high severity errors"
          />
          <Toggle
            checked={notifs.newIncident}
            onChange={() => setNotifs(p => ({ ...p, newIncident: !p.newIncident }))}
            label="New incidents"
            description="Notify when a new incident is created"
          />
          <p className="label mt-6 mb-4">Email</p>
          <Toggle
            checked={notifs.emailDigest}
            onChange={() => setNotifs(p => ({ ...p, emailDigest: !p.emailDigest }))}
            label="Daily digest"
            description="Receive a daily email summary of all incidents"
          />
          <div className="mt-5 pt-5 border-t border-[var(--border)]">
            <button onClick={handleSave} className="btn-primary text-sm py-1.5">
              <Save className="h-4 w-4" />
              {saved ? 'Saved!' : 'Save preferences'}
            </button>
          </div>
        </div>
      )}

      {/* Monitoring tab */}
      {tab === 'monitoring' && (
        <div className="card p-6 space-y-5">
          <div>
            <p className="label mb-4">Error capture</p>
            <Toggle
              checked={monitoring.autoFingerprint}
              onChange={() => setMonitoring(p => ({ ...p, autoFingerprint: !p.autoFingerprint }))}
              label="Auto-fingerprinting"
              description="Group duplicate errors by type, file, and line number"
            />
            <Toggle
              checked={monitoring.aiAnalysis}
              onChange={() => setMonitoring(p => ({ ...p, aiAnalysis: !p.aiAnalysis }))}
              label="AI error analysis"
              description="Automatically analyze errors with Gemini AI"
            />
            <Toggle
              checked={monitoring.captureSource}
              onChange={() => setMonitoring(p => ({ ...p, captureSource: !p.captureSource }))}
              label="Capture source maps"
              description="Resolve minified stack traces using source maps"
            />
          </div>
          <div className="space-y-1.5">
            <label className="label" htmlFor="min-severity">Minimum alert severity</label>
            <select
              id="min-severity"
              className="input w-auto"
              value={monitoring.minSeverity}
              onChange={e => setMonitoring(p => ({ ...p, minSeverity: e.target.value }))}
            >
              <option value="low">Low and above</option>
              <option value="medium">Medium and above</option>
              <option value="high">High and above</option>
              <option value="critical">Critical only</option>
            </select>
          </div>
          <div className="pt-4 border-t border-[var(--border)]">
            <button onClick={handleSave} className="btn-primary text-sm py-1.5">
              <Save className="h-4 w-4" />
              {saved ? 'Saved!' : 'Save preferences'}
            </button>
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="card border-red-500/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-semibold text-red-500">Danger Zone</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Delete account</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Permanently delete your account and all data.</p>
          </div>
          <button className="btn-destructive text-xs py-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            Delete account
          </button>
        </div>
      </div>
    </div>
  )
}
