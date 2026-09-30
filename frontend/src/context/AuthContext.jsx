import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { AuthContext } from './contexts'

function toUser(authUser) {
  if (!authUser) return null
  const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User'
  return { id: authUser.id, email: authUser.email, name }
}

const assertConfigured = () => {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env')
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo(() => {
    const redirectTo = `${window.location.origin}/dashboard`
    return {
      user: toUser(session?.user),
      session,
      loading,
      isAuthenticated: Boolean(session),
      isConfigured: isSupabaseConfigured,

      async signIn(email, password) {
        assertConfigured()
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },

      // Returns { needsConfirmation } when the Supabase project requires email confirmation.
      async signUp(email, password, fullName) {
        assertConfigured()
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: redirectTo },
        })
        if (error) throw error
        return { needsConfirmation: !data.session }
      },

      async signInWithGitHub() {
        assertConfigured()
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } })
        if (error) throw error
      },

      async resetPassword(email) {
        assertConfigured()
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/settings` })
        if (error) throw error
      },

      async updateProfile({ fullName }) {
        assertConfigured()
        const { data, error } = await supabase.auth.updateUser({ data: { full_name: fullName } })
        if (error) throw error
        setSession((current) => (current ? { ...current, user: data.user } : current))
      },

      async updatePassword(password) {
        assertConfigured()
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
      },

      async signOut() {
        if (supabase) await supabase.auth.signOut()
        setSession(null)
      },
    }
  }, [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

