import { createHash, randomBytes } from 'crypto'

import { env } from '../config/env'

export type NexconnSignatureHeaders = {
  nonce: string
  timestamp: number
  signature: string
}

export type NexconnTokenResult = {
  accessToken: string
  nexconnUserId: string
}

/**
 * Generate signature headers for a Nexconn Server API request.
 *
 * Uses SHA1(AppSecret + Nonce + Timestamp) per Nexconn documentation.
 * The nonce is a random 18-character hex string. The timestamp is Unix
 * milliseconds. The signature is a lowercase hex digest.
 *
 * @throws if NEXCONN_APP_SECRET is not configured.
 */
export function generateNexconnSignature(): NexconnSignatureHeaders {
  const appSecret = env.nexconnAppSecret
  if (!appSecret) {
    throw new Error('NEXCONN_APP_SECRET is not configured')
  }

  const nonce = randomBytes(9).toString('hex') // 18 hex chars
  const timestamp = Date.now()
  const signature = createHash('sha1')
    .update(appSecret + nonce + timestamp.toString())
    .digest('hex')

  return { nonce, timestamp, signature }
}

/**
 * Map a Pulse Circle user ID (UUID) to a Nexconn-compatible user ID.
 *
 * Nexconn docs specify userId as "uppercase and lowercase letters and
 * numbers, max 64 bytes". UUIDs contain hyphens which may not be supported.
 * This function strips hyphens to produce a 32-character hex string.
 *
 * The original Pulse Circle UUID in the database is never modified.
 *
 * NOTE: Live verification against the Nexconn API has not been performed.
 */
export function toNexconnUserId(userId: string): string {
  return userId.replace(/-/g, '')
}

/**
 * Request an access token from the Nexconn Server API.
 *
 * Calls POST /v4/auth/access-token/issue with signed headers.
 * Returns the accessToken and nexconnUserId on success.
 * Throws on configuration errors, network failures, or Nexconn rejections.
 *
 * Never logs the App Secret, signature, or access token.
 */
export async function issueNexconnToken(
  userId: string,
  name: string
): Promise<NexconnTokenResult> {
  const appKey = env.nexconnAppKey
  const baseUrl = env.nexconnBaseUrl

  if (!appKey) {
    throw new Error('NEXCONN_APP_KEY is not configured')
  }

  const nexconnUserId = toNexconnUserId(userId)
  const { nonce, timestamp, signature } = generateNexconnSignature()

  let response: Response
  try {
    response = await fetch(`${baseUrl}/v4/auth/access-token/issue`, {
      method: 'POST',
      headers: {
        'App-Key': appKey,
        'Nonce': nonce,
        'Timestamp': timestamp.toString(),
        'Signature': signature,
        'X-Request-ID': randomBytes(8).toString('hex'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: nexconnUserId,
        name,
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('nexconn_network_error')
  }

  if (!response.ok) {
    throw new Error('nexconn_http_error')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('nexconn_invalid_response')
  }

  const result = body as {
    code?: number
    result?: { accessToken?: string; userId?: string }
  }

  const accessToken = result.result?.accessToken
  const returnedUserId = result.result?.userId

  if (
    result.code !== 0 ||
    typeof accessToken !== 'string' ||
    accessToken.trim().length === 0 ||
    typeof returnedUserId !== 'string' ||
    returnedUserId.trim().length === 0 ||
    returnedUserId !== nexconnUserId
  ) {
    throw new Error('nexconn_error')
  }

  return {
    accessToken,
    nexconnUserId: returnedUserId,
  }
}