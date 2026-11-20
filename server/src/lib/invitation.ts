import { createHash, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Generate a cryptographically secure invitation token.
 *
 * Returns a 64-character hexadecimal string (32 random bytes). The raw token
 * must only be delivered to the invitee through an out-of-band channel
 * (e.g., email). It must never be logged or stored.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Hash an invitation token using SHA-256.
 *
 * Returns a 64-character hexadecimal digest. Only the hash is ever stored;
 * the raw token is never persisted.
 */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Valid hexadecimal string of exactly 64 characters (32 bytes).
 */
const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/

/**
 * Verify an invitation token against its stored SHA-256 hash.
 *
 * Returns true only when both inputs are valid 64-character hexadecimal
 * strings and the hash of `token` matches `storedHash` using a constant-time
 * comparison. Returns false for malformed input or mismatch instead of
 * throwing.
 */
export function verifyInvitationToken(token: string, storedHash: string): boolean {
  if (!HEX_64_REGEX.test(token)) {
    return false
  }
  if (!HEX_64_REGEX.test(storedHash)) {
    return false
  }

  const computedHash = createHash('sha256').update(token).digest('hex')
  const computedBuffer = Buffer.from(computedHash, 'hex')
  const storedBuffer = Buffer.from(storedHash, 'hex')

  return timingSafeEqual(computedBuffer, storedBuffer)
}
