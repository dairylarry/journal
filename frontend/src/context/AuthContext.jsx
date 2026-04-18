import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { login as cognitoLogin, logout as cognitoLogout, refreshSession, getCurrentUser } from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState('loading')
  const [user, setUser] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function restore() {
      const cached = getCurrentUser()
      if (cached && !cancelled) {
        setUser(cached)
        setAuthState('authenticated')
      }

      const refreshed = await refreshSession()
      if (cancelled) return

      if (refreshed) {
        setUser(refreshed)
        setAuthState('authenticated')
      } else if (!cached) {
        setAuthState('unauthenticated')
      }
    }

    restore()
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (username, password) => {
    const user = await cognitoLogin(username, password)
    setUser(user)
    setAuthState('authenticated')
    return user
  }, [])

  const logout = useCallback(async () => {
    await cognitoLogout()
    setUser(null)
    setAuthState('unauthenticated')
  }, [])

  return (
    <AuthContext.Provider value={{ authState, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
