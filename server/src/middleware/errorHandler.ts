import { ErrorRequestHandler } from 'express'

/**
 * Centralized error handler.
 * Never returns stack traces or secret values to the client.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = err.statusCode ?? 500
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message ?? 'Internal Server Error'

  // Log details server-side only; never in the response.
  console.error(`[${new Date().toISOString()}] ${err.stack ?? err.message}`)

  res.status(statusCode).json({ error: message })
}
