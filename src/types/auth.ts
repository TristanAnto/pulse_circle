export type AuthenticatedUser = {
  id: string
  email: string
  fullName: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type RegisterRequest = {
  fullName: string
  email: string
  password: string
}

export type AuthResponse = {
  user: AuthenticatedUser
}

export type ApiError = Error & {
  status?: number
  body?: unknown
}
