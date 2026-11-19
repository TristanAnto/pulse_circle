import dotenv from 'dotenv'

// Load .env before anything else reads process.env.
dotenv.config()

type SameSite = 'lax' | 'strict' | 'none'

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value.trim()
}

const nodeEnv = process.env.NODE_ENV ?? 'development'
const isProduction = nodeEnv === 'production'

const rawSecret = process.env.JWT_SECRET ?? ''
if (!rawSecret || rawSecret.trim().length < 32) {
  throw new Error(
    'JWT_SECRET must be set and at least 32 characters long',
  )
}

const corsOrigin = required('CORS_ORIGIN')
if (isProduction && corsOrigin === '*') {
  throw new Error(
    'CORS_ORIGIN must not be a wildcard when credentials are enabled',
  )
}

const cookieSameSiteRaw = (process.env.COOKIE_SAME_SITE ?? 'lax').toLowerCase()
const cookieSameSite: SameSite =
  cookieSameSiteRaw === 'lax' || cookieSameSiteRaw === 'strict'
    ? cookieSameSiteRaw
    : cookieSameSiteRaw === 'none'
      ? 'none'
      : 'lax'

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: rawSecret.trim(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  cookieName: process.env.COOKIE_NAME ?? 'pulse_session',
  cookieCsrfName: process.env.COOKIE_CSRF_NAME ?? 'pulse_csrf',
  cookieSecure:
    (process.env.COOKIE_SECURE ?? isProduction ? 'true' : 'false') === 'true',
  cookieSameSite,
  corsOrigin,
}

/**
 * Validate required environment variables at startup.
 * Throws before the HTTP server starts if any required value is missing or
 * insecure. Secret values are never logged.
 */
export function validateEnv(): void {
  // Referencing the object fields runs the required() checks above.
  void env.databaseUrl
  void env.jwtSecret
  void env.corsOrigin
}
