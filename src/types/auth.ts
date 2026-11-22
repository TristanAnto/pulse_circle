export type AccountRole = 'ELDER' | 'FAMILY_MEMBER' | 'NEIGHBOUR' | 'GUARDIAN' | 'OTHER'

export type AuthenticatedUser = {
  id: string
  email: string
  fullName: string
  accountRole: AccountRole | null
}

export type LoginRequest = {
  email: string
  password: string
}

export type RegisterRequest = {
  fullName: string
  email: string
  password: string
  accountRole?: AccountRole
}

export type AuthResponse = {
  user: AuthenticatedUser
}

export type ApiError = Error & {
  status?: number
  body?: unknown
}
