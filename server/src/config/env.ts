import dotenv from 'dotenv'

// Load .env before anything else reads process.env.
dotenv.config()

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value.trim()
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
}

/**
 * Validate required environment variables at startup.
 * Throws before the HTTP server starts if DATABASE_URL is missing.
 */
export function validateEnv(): void {
  // Accessing `databaseUrl` runs the required() check above.
  void env.databaseUrl
}
