import { randomBytes } from 'crypto'

import argon2 from 'argon2'
import jwt, { type SignOptions } from 'jsonwebtoken'

import { env } from '../config/env'

export interface TokenPayload {
  userId: string
  email: string
}

export interface SafeUser {
  id: string
  email: string
  fullName: string
}

/**
 * Hash a password with Argon2id. Never store plaintext passwords.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password)
}

/**
 * Verify a plaintext password against an Argon2id hash.
 * Returns false for malformed hashes instead of throwing.
 */
export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

/**
 * Validate a plaintext password before hashing.
 */
export function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long')
  }
  if (password.length > 128) {
    throw new Error('Password must not exceed 128 characters')
  }
}

/**
 * Strip sensitive fields from a user record for API responses.
 */
export function safeUser(user: {
  id: string
  email: string
  fullName: string
}): SafeUser {
  return { id: user.id, email: user.email, fullName: user.fullName }
}

/**
 * Sign a JWT access token. Never exposes the secret to callers.
 */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
    issuer: 'pulse-circle',
    audience: 'pulse-circle',
  })
}

/**
 * Verify a JWT access token and return its payload.
 * Throws on invalid or expired tokens.
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret, {
    issuer: 'pulse-circle',
    audience: 'pulse-circle',
  }) as TokenPayload
}

/**
 * Generate a double-submit CSRF token.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Cookie options shared between setting and clearing session cookies.
 */
export function cookieOptions(): Record<string, unknown> {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
  }
}
