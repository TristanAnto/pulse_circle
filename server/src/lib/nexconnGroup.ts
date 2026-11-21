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
  pageToken?: string
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
    const errorInfo: { status?: number; code?: unknown; message?: string } = {
      status: response.status,
    }

    // Safely attempt to parse provider error body without logging full content.
    try {
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const body = await response.json()
        const errorBody = body as {
          code?: unknown
          message?: unknown
          error?: unknown
          msg?: unknown
        }
        if (typeof errorBody.code !== 'undefined') {
          errorInfo.code = errorBody.code
        }
        const message =
          typeof errorBody.message === 'string'
            ? errorBody.message
            : typeof errorBody.error === 'string'
              ? errorBody.error
              : typeof errorBody.msg === 'string'
                ? errorBody.msg
                : undefined
        if (message) {
          errorInfo.message = message.slice(0, 200)
        }
      }
    } catch {
      // Non-JSON or unparseable body — proceed with status only.
    }

    console.error(
      `Nexconn request failed: status=${response.status}${
        typeof errorInfo.code !== 'undefined' ? ` providerCode=${String(errorInfo.code).slice(0, 50)}` : ''
      }${errorInfo.message ? ` providerMessage=${errorInfo.message}` : ''}`
    )

    throw Object.assign(new Error('nexconn_http_error'), {
      code: response.status,
      providerCode: errorInfo.code,
      providerMessage: errorInfo.message,
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
 * Verified endpoint: POST /v4/group-channel/member/list with { channelId, pageToken?, pageSize? }.
 * Used to confirm a group actually exists before trusting a prior create.
 *
 * Supports pagination: pageToken (opaque token from previous response) and
 * pageSize (max 100). Returns result.pageToken when more pages remain.
 */
export async function listNexconnGroupMembers(params: {
  channelId: string
  pageToken?: string
  pageSize?: number
}): Promise<NexconnGroupMemberListResult> {
  const response = await signedPost('/v4/group-channel/member/list', {
    channelId: params.channelId,
    ...(params.pageToken ? { pageToken: params.pageToken } : {}),
    ...(params.pageSize ? { pageSize: params.pageSize } : {}),
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const result = body as {
    code?: number
    result?: {
      members?: Array<{ userId?: string }>
      pageToken?: string
      totalCount?: number
    }
  }

  if (result.code === 0 && Array.isArray(result.result?.members)) {
    const memberIds = result.result.members
      .map((m) => (typeof m.userId === 'string' ? m.userId : ''))
      .filter((id) => id.length > 0)
    return { ok: true, memberIds, pageToken: result.result.pageToken ?? undefined }
  }
  return { ok: false, code: result.code ?? 0, body, timedOut: false }
}

/**
 * Query all member user IDs of a Nexconn group, paginating through every page.
 *
 * Continues fetching until result.pageToken is absent (final page).
 * Used to compute the complete set of actual Nexconn members for delta
 * comparison against Pulse Circle membership.
 */
export async function listAllNexconnGroupMembers(params: {
  channelId: string
}): Promise<NexconnGroupMemberListResult> {
  const allMemberIds: string[] = []
  let pageToken: string | undefined

  do {
    const result = await listNexconnGroupMembers({
      channelId: params.channelId,
      pageToken,
      pageSize: 100,
    })

    if (!result.ok) {
      return result
    }

    allMemberIds.push(...result.memberIds)
    pageToken = result.pageToken
  } while (pageToken)

  return { ok: true, memberIds: allMemberIds }
}

/**
 * Add members to an existing Nexconn group channel.
 *
 * Verified endpoint: POST /v4/group-channel/join with { channelId, userIds }.
 * Adds users directly without requiring approval. Maximum 100 user IDs per
 * request. Returns { ok: true } on success; otherwise returns the provider
 * error code (e.g. 25412 already a member, 25411 capacity exceeded).
 */
export async function addNexconnGroupMembers(params: {
  channelId: string
  userIds: string[]
}): Promise<NexconnGroupCreateResult> {
  const response = await signedPost('/v4/group-channel/join', {
    channelId: params.channelId,
    userIds: params.userIds.slice(0, 100),
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
 * Remove members from a Nexconn group channel (leave / kick-out).
 *
 * Verified endpoint: POST /v4/group-channel/leave with { channelId, userIds }.
 * Maximum 100 user IDs per request. Returns { ok: true } on success; otherwise
 * returns the provider error code.
 */
export async function removeNexconnGroupMember(params: {
  channelId: string
  userIds: string[]
}): Promise<NexconnGroupCreateResult> {
  const response = await signedPost('/v4/group-channel/leave', {
    channelId: params.channelId,
    userIds: params.userIds.slice(0, 100),
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
 * Send a text message to a Nexconn group channel.
 *
 * Verified endpoint: POST /v4/group-channel/message/send.
 *
 * NOTE: The exact Nexconn Server request/response body shape for this
 * endpoint is not documented in this repository. The fields below follow the
 * conventions used by the other verified Nexconn Server endpoints in this
 * file (`channelId`, `userIds`, `code === 0` for success). If the server
 * expects different field names (e.g. `fromUserId` vs `senderUserId`),
 * adjust the request body here.
 *
 * Returns { ok: true } on success; otherwise returns the provider error code.
 */
export async function sendNexconnGroupMessage(params: {
  channelId: string
  senderUserId: string
  text: string
}): Promise<NexconnGroupCreateResult> {
  const response = await signedPost('/v4/group-channel/message/send', {
    channelId: params.channelId,
    senderUserId: params.senderUserId,
    messageType: 'RC:TxtMsg',
    content: { text: params.text },
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