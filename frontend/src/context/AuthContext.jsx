import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

// Mock user — will be replaced by Supabase in Phase 2
const MOCK_USER = {
  id: 'usr_mock_001',
  name: 'Alex Chen',
  email: 'alex@acme.dev',
  avatar: null,
  plan: 'pro',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('pipelineiq-user')
    return stored ? JSON.parse(stored) : null
  })

  const login = (credentials) => {
    // Mock login — accept any credentials
    setUser(MOCK_USER)
    localStorage.setItem('pipelineiq-user', JSON.stringify(MOCK_USER))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('pipelineiq-user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
