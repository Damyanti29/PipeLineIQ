import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, User, KeyRound, LogOut, CheckCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ErrorState } from '@/components/ui/ErrorState'
import { Spinner } from '@/components/ui/LoadingState'

export function SettingsPage() {
  const { user, updateProfile, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Settings</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">Manage your account and preferences.</p>
      </div>

      <ProfileSection user={user} onSave={updateProfile} />
      <PasswordSection onSave={updatePassword} />

      <div className="card p-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          Appearance <ThemeToggle />
        </div>
        <button
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
          className="btn-secondary text-sm py-1.5"
        >
          <LogOut className="h-4 w-4" />Sign out
        </button>
      </div>
    </div>
  )
}

function useSaveState() {
  const [state, setState] = useState({ saving: false, saved: false, error: null })
  const save = async (action) => {
    setState({ saving: true, saved: false, error: null })
    try {
      await action()
      setState({ saving: false, saved: true, error: null })
      setTimeout(() => setState((s) => ({ ...s, saved: false })), 2500)
    } catch (error) {
      setState({ saving: false, saved: false, error })
    }
  }
  return [state, save]
}

function ProfileSection({ user, onSave }) {
  const [name, setName] = useState(user?.name ?? '')
  const [{ saving, saved, error }, save] = useSaveState()

  return (
    <form
      className="card p-6 space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save(() => onSave({ fullName: name.trim() }))
      }}
    >
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-brand-400" />
        <h3 className="section-title">Profile</h3>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white text-xl font-bold">
          {(name || user?.email || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user?.email}</p>
          <p className="text-xs text-[var(--text-muted)]">Signed in with Supabase Auth</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="label" htmlFor="settings-name">Display name</label>
        <input id="settings-name" type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </div>
      {error && <ErrorState error={error} title="Could not save profile" />}
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary text-sm py-1.5">
          {saving ? <Spinner /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}

function PasswordSection({ onSave }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [{ saving, saved, error }, save] = useSaveState()
  const mismatch = confirm && password !== confirm

  return (
    <form
      className="card p-6 space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (mismatch) return
        save(async () => {
          await onSave(password)
          setPassword('')
          setConfirm('')
        })
      }}
    >
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-brand-400" />
        <h3 className="section-title">Change password</h3>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="label" htmlFor="new-password">New password</label>
          <input id="new-password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
        </div>
        <div className="space-y-1.5">
          <label className="label" htmlFor="confirm-password">Confirm password</label>
          <input id="confirm-password" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} autoComplete="new-password" required />
        </div>
      </div>
      {mismatch && <p className="text-xs text-red-400">Passwords do not match.</p>}
      {error && <ErrorState error={error} title="Could not change password" />}
      <div className="flex justify-end">
        <button type="submit" disabled={saving || mismatch} className="btn-primary text-sm py-1.5">
          {saving ? <Spinner /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Password updated' : 'Update password'}
        </button>
      </div>
    </form>
  )
}
