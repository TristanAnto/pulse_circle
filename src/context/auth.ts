import { createContext, useContext } from 'react'

import type {
  AuthenticatedUser,
  LoginRequest,
  RegisterRequest,
} from '@/types/auth'

export interface AuthContextValue {
  user: AuthenticatedUser | null
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  login: (credentials: LoginRequest) => Promise<void>
  register: (credentials: RegisterRequest) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
