import { env } from '../config/env'
import { toNexconnUserId, generateNexconnSignature } from './nexconn'

export type NexconnGroupCreateResult = {
  ok: true
} | {
  ok: false
  code: number
  body: unknown
  timedOut: boolean
}

export type NexconnGroupMemberListResult = {
  ok: true
  memberIds: string[]
} | {
  ok: false
  code: number
  body: unknown
  timedOut: boolean
}

/**
 * Nexconn group channel ID constraints (verified from official docs):
 * - max 64 characters
 * - uppercase/lowercase letters and numbers only
 *
 * Pulse Circle UUIDs contain hyphens, so they are never usable directly as a
 * Nexconn channelId. This derives a deterministic, alphanumeric id from the
 * circle UUID. It is intentionally a one-way transform: the original UUID is
 * still stored in CircleNexconnChannel.circleId.
 */
export function toNexconnGroupId(circleId: string): string {
  return 'pc' + toNexconnUserId(circleId)
}

function assertCredentials(): { appKey: string; baseUrl: string } {
  const appKey = env.nexconnAppKey
  const baseUrl = env.nexconnBaseUrl
  if (!appKey) {
    throw new Error('NEXCONN_APP_KEY is not configured')
  }
  return { appKey, baseUrl }
}

async function signedPost(
  path: string,
  body: unknown,
  timeoutMs = 10_000
): Promise<Response> {
  const { appKey, baseUrl } = assertCredentials()
  const { nonce, timestamp, signature } = generateNexconnSignature()

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'App-Key': appKey,
        'Nonce': nonce,
        'Timestamp': timestamp.toString(),
        'Signature': signature,
        'X-Request-ID': crypto.randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    // Network failure or timeout. The caller must treat the outcome as
    // uncertain and never assume the group was created.
    throw Object.assign(new Error('nexconn_network_error'), {
      timedOut: true,
    })
  }

  if (!response.ok) {
    throw Object.assign(new Error('nexconn_http_error'), {
      code: response.status,
      timedOut: false,
    })
  }

  return response
}

/**
 * Create a Nexconn group channel server-side.
 *
 * Verified request shape (official docs): POST /v4/group-channel/create with
 * { channelId, name, owner, userIds?, groupProfile?, permissions? }.
 * The creator is set as owner and auto-joins. Response is { code: 0 }.
 *
 * This function does NOT interpret duplicate responses. The route layer is
 * responsible for deciding whether a failure means "retry" or "already exists".
 */
export async function createNexconnGroup(params: {
  channelId: string
  name: string
  owner: string
  userIds: string[]
}): Promise<NexconnGroupCreateResult> {
  // The official API caps invitations at 30 users per request. Invite only
  // the first 30 members; remaining members can join later via a separate
  // call or be left for an invite flow.
  const inviteeUserIds = params.userIds.slice(0, 30)

  const response = await signedPost('/v4/group-channel/create', {
    channelId: params.channelId,
    name: params.name,
    owner: params.owner,
    ...(inviteeUserIds.length > 0 ? { userIds: inviteeUserIds } : {}),
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const result = body as { code?: number }
  if (result.code === 0) {
    return { ok: true }
  }
  return { ok: false, code: result.code ?? 0, body, timedOut: false }
}

/**
 * Query the member user IDs of a Nexconn group.
 *
 * Verified endpoint: POST /v4/group-channel/member/list with { channelId }.
 * Used to confirm a group actually exists before trusting a prior create.
 */
export async function listNexconnGroupMembers(params: {
  channelId: string
}): Promise<NexconnGroupMemberListResult> {
  const response = await signedPost('/v4/group-channel/member/list', {
    channelId: params.channelId,
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const result = body as {
    code?: number
    result?: { members?: Array<{ userId?: string }> }
  }

  if (result.code === 0 && Array.isArray(result.result?.members)) {
    const memberIds = result.result.members
      .map((m) => (typeof m.userId === 'string' ? m.userId : ''))
      .filter((id) => id.length > 0)
    return { ok: true, memberIds }
  }
  return { ok: false, code: result.code ?? 0, body, timedOut: false }
}