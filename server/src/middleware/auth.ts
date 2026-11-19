import { NextFunction, Request, Response } from 'express'

import { verifyToken, type TokenPayload } from '../lib/auth'
import { env } from '../config/env'

/**
 * Express request with an authenticated user attached by the auth middleware.
 */
export interface AuthenticatedRequest extends Request {
  user?: TokenPayload
}

/**
 * Authenticate requests via the HTTP-only JWT cookie.
 *
 * The JWT secret never leaves the server. Client-supplied user IDs are never
 * trusted as proof of identity; only a valid signed cookie establishes a
 * session.
 */
export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const token = req.cookies?.[env.cookieName]
  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    req.user = verifyToken(token)
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  next()
}

/**
 * Double-submit CSRF protection for state-changing requests on an
 * authenticated session.
 *
 * Same-site cookies protect against cross-site request forgery for navigation
 * requests; this header check additionally protects API calls made with
 * credentials from same-site contexts. Safe methods and the session-establishing
 * endpoints (register/login) are exempt.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const stateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
    req.method,
  )
  if (!stateChanging) {
    next()
    return
  }

  const cookieToken = req.cookies?.[env.cookieCsrfName] ?? ''
  const headerValues = req.headers['x-csrf-token']
  const headerToken = Array.isArray(headerValues)
    ? headerValues[0]
    : headerValues

  if (
    !cookieToken ||
    !headerToken ||
    typeof headerToken !== 'string' ||
    headerToken !== cookieToken
  ) {
    res.status(403).json({ error: 'CSRF token required' })
    return
  }

  next()
}
