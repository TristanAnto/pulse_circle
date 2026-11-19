import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { AuthContext } from '@/context/auth'
import type {
  AuthenticatedUser,
  ApiError,
  LoginRequest,
  RegisterRequest,
} from '@/types/auth'

export function AuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const data = (await api.get('/api/auth/me')) as {
          user: AuthenticatedUser
        }
        if (!cancelled) {
          setUser(data.user)
          setError(null)
        }
      } catch (err) {
        if (cancelled) {
          return
        }
        // 401 means unauthenticated — not an error worth surfacing.
        // Network/server errors are recorded but do not crash the app.
        const apiError = err as ApiError
        if (apiError.status !== 401) {
          setError(
            apiError.message ?? 'Unable to load your session. Please try again.'
          )
        }
        setUser(null)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const login = async (credentials: LoginRequest): Promise<void> => {
    const data = (await api.post('/api/auth/login', credentials)) as {
      user: AuthenticatedUser
    }
    setUser(data.user)
    setError(null)
  }

  const register = async (credentials: RegisterRequest): Promise<void> => {
    const data = (await api.post(
      '/api/auth/register',
      credentials
    )) as { user: AuthenticatedUser }
    setUser(data.user)
    setError(null)
  }

  const logout = async (): Promise<void> => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // Ignore logout failures — clear local state regardless.
    }
    setUser(null)
    setError(null)
  }

  const value = {
    user,
    loading,
    error,
    isAuthenticated: user !== null,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
