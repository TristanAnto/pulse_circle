import { ArrowLeft, MessageSquareText, Users } from 'lucide-react'

import {
  GroupChannel,
  GroupChannelIdentifier,
  Message,
  MessageDirection,
  MessageHandler,
  MessageType,
  SendTextMessageParams,
} from '@nexconn/chat'

import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { formatClock } from '@/lib/format'
import {
  addMessageHandler,
  isNexconnConnected,
  removeMessageHandler,
  subscribeNexconnConnection,
} from '@/lib/nexconn'
import { api } from '@/lib/api'
import { useAuth } from '@/context/auth'
import type { ChatMessage } from '@/types'

import React from 'react'

/**
 * A verified Nexconn recipient for direct messaging, as returned by the
 * backend's circle recipient-resolution endpoint. Nexconn user IDs are
 * never hardcoded on the frontend; they always come from this response.
 */
type NexconnRecipient = {
  userId: string
  nexconnUserId: string
  fullName: string
  role: string
}

/**
 * A Circle member returned by GET /api/circles/:circleId/members.
 * Database-backed user identity: userId is immutable, fullName is the
 * registered user's display name. Two accounts can share a name but never
 * share a userId.
 */
type CircleMembership = {
  userId: string
  fullName: string
  role: string
  joinedAt: string
}

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * A real Pulse Circle returned by GET /api/circles. Only the fields the
 * backend actually returns are modelled here — no member lists, last
 * messages, or unread counts are assumed.
 */
type RealCircle = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  role: string
}

const CIRCLE_ROLE_LABELS: Record<string, string> = {
  ELDER: 'Elder',
  NEIGHBOR: 'Neighbour',
  FAMILY: 'Family',
  EMERGENCY_CONTACT: 'Emergency contact',
  ADMIN: 'Admin',
}

function circleRoleLabel(role: string): string {
  return CIRCLE_ROLE_LABELS[role] ?? role
}

/** Renders a real circle as a conversation-list entry and detail header. */
function circleSubtitle(circle: RealCircle): string {
  return circle.description ?? 'No description'
}

/**
 * Converts a Nexconn SDK message into the app's ChatMessage shape.
 *
 * Returns null when the message cannot be safely mapped:
 * - messages sent by the current user are ignored (rendered locally via
 *   handleSend instead),
 * - non-text message types are ignored,
 * - messages without a non-empty text body are ignored.
 *
 * Channel routing is handled by appendIncoming, not here.
 */
function mapIncomingMessage(message: Message): ChatMessage | null {
  if (message.direction !== MessageDirection.RECEIVE) return null
  if (message.messageType !== MessageType.TEXT) return null
  const text = message.content?.text
  if (typeof text !== 'string' || text.length === 0) return null
  return {
    id: message.messageId,
    authorId: message.senderUserId,
    authorName: message.content?.senderUserInfo?.name ?? message.senderUserId,
    body: text,
    sentAt: new Date(message.sentTime).toISOString(),
    direction: 'incoming',
  }
}

/**
 * Converts a historical Nexconn SDK message into the app's ChatMessage shape.
 *
 * Handles both SEND and RECEIVE directions:
 * - SEND messages are attributed to the current user (direction: 'outgoing').
 * - RECEIVE messages are attributed to the sender (direction: 'incoming').
 *
 * Returns null for non-text messages or messages without valid text content.
 */
function mapHistoryMessage(
  message: Message,
  currentUserId: string,
  currentUserName: string
): ChatMessage | null {
  if (message.messageType !== MessageType.TEXT) return null
  const text = message.content?.text
  if (typeof text !== 'string' || text.length === 0) return null
  const isOutgoing = message.direction === MessageDirection.SEND
  return {
    id: message.messageId,
    authorId: isOutgoing ? currentUserId : message.senderUserId,
    authorName: isOutgoing
      ? currentUserName
      : message.content?.senderUserInfo?.name ?? message.senderUserId,
    body: text,
    sentAt: new Date(message.sentTime).toISOString(),
    direction: isOutgoing ? 'outgoing' : 'incoming',
  }
}

export function MessagesPage() {
  const { user: currentUser } = useAuth()
  const [view, setView] = React.useState<'list' | 'conversation'>('list')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const [messagesByConversation, setMessagesByConversation] = React.useState<
    Record<string, ChatMessage[]>
  >({})
  // Derived: whether the currently selected conversation is a real Circle.
  // Computed from selectedId (a database UUID), not from the Nexconn groupId.
  const selectedIsRealCircle = !!selectedId && UUID_REGEX.test(selectedId)
  // Verified Nexconn recipients for the currently selected real circle.
  // Nexconn user IDs come only from the backend response — they are never
  // hardcoded or derived client-side. State is keyed by circle id and
  // derived in render so the effect never calls setState synchronously.
  const [recipientMap, setRecipientMap] = React.useState<
    Record<string, NexconnRecipient[]>
  >({})
  const [recipientErrorMap, setRecipientErrorMap] = React.useState<
    Record<string, string>
  >({})
  // Real circles for the authenticated user. Kept separate from the mock
  // demonstration conversations so the two sources never mix.
  const [circles, setCircles] = React.useState<RealCircle[] | null>(null)
  const [circlesError, setCirclesError] = React.useState<string | null>(null)
  const [circlesRetry, setCirclesRetry] = React.useState(0)
  const [sending, setSending] = React.useState(false)
  const [sendError, setSendError] = React.useState<string | null>(null)
  // Nexconn membership recovery state for the selected circle. Allows the
  // authenticated caller to sync their own Nexconn identity into an existing
  // CREATED channel (e.g. after joining via invitation before sync was added).
  const [syncMemberError, setSyncMemberError] = React.useState<string | null>(null)
  const [syncMemberSuccess, setSyncMemberSuccess] = React.useState<'added' | 'already-member' | null>(
    null,
  )
  const [isSyncingMember, setIsSyncingMember] = React.useState(false)
  // Reactive Nexconn connection state. Updated via subscribeNexconnConnection
  // so the history-loading effect can retry when connection completes
  // asynchronously after page mount.
  const [nexconnConnected, setNexconnConnected] = React.useState(false)
  // History loading state per circle. Tracks whether history has been loaded
  // for a given circle to prevent redundant fetches when switching between
  // conversations. Real-time messages arrive separately via onMessageReceived.
  const [historyLoadingMap, setHistoryLoadingMap] = React.useState<Record<string, boolean>>(
    {}
  )
  const [historyErrorMap, setHistoryErrorMap] = React.useState<Record<string, string>>({})
  const [historyLoadedMap, setHistoryLoadedMap] = React.useState<Record<string, boolean>>({})
  // Backend-authorized mapping from Nexconn groupId to Pulse Circle circleId.
  // Populated from GET /api/circles/:circleId/nexconn-channel for each of the
  // authenticated user's circles. Used to route incoming Nexconn messages to
  // the correct real-circle conversation.
  const [channelIdToCircleId, setChannelIdToCircleId] = React.useState<Record<string, string>>(
    {}
  )
  // Real circle members fetched from GET /api/circles/:circleId/members,
  // keyed by circleId. Database-backed user names — never hardcoded personas.
  const [circleMembersMap, setCircleMembersMap] = React.useState<Record<string, CircleMembership[]>>(
    {}
  )
  // Invite-member form state (ELDER/ADMIN only). The invitation is created
  // server-side via POST /api/circles/:circleId/invitations and delivered by
  // email; the recipient accepts via /accept-invite?token=....
  const [inviteEmail, setInviteEmail] = React.useState('')
  const [inviteError, setInviteError] = React.useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = React.useState(false)
  const [isInviting, setIsInviting] = React.useState(false)
  // Pending invitations received by the authenticated user. Fetched from
  // GET /api/invitations, matched by the user's email against inviteeEmail.
  const [pendingInvitations, setPendingInvitations] = React.useState<
    Array<{
      id: string
      circleId: string
      circle: { id: string; name: string; description: string | null }
      inviterId: string | null
      inviter: { id: string; fullName: string } | null
      role: string
      expiresAt: string
      createdAt: string
    }>
  >([])
  const [invitationsError, setInvitationsError] = React.useState<string | null>(
    null,
  )
  const [isHandlingInvitation, setIsHandlingInvitation] = React.useState(false)

  const isMobile = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
    []
  )

  // Fetch the authenticated user's real circles. Only fires once a user is
  // resolved; a failed fetch must not break the demonstration conversations.
  React.useEffect(() => {
    if (!currentUser) {
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const data = (await api.get('/api/circles')) as {
          circles: RealCircle[]
        }
        if (!cancelled) {
          setCircles(data.circles)
          setCirclesError(null)
        }
      } catch {
        if (!cancelled) {
          setCircles(null)
          setCirclesError('Unable to load your circles.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser, circlesRetry])

  // Fetch pending invitations received by the authenticated user.
  // Matched by the user's email against inviteeEmail. Only PENDING,
  // non-expired invitations are returned.
  React.useEffect(() => {
    if (!currentUser) {
      return
    }
    let cancelled = false

    ;(async () => {
      try {
        const data = (await api.get('/api/invitations')) as {
          invitations: Array<{
            id: string
            circleId: string
            circle: { id: string; name: string; description: string | null }
            inviterId: string | null
            inviter: { id: string; fullName: string } | null
            role: string
            expiresAt: string
            createdAt: string
          }>
        }
        if (!cancelled) {
          setPendingInvitations(data.invitations)
          setInvitationsError(null)
        }
      } catch {
        if (!cancelled) {
          setPendingInvitations([])
          setInvitationsError('Unable to load your invitations.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentUser])

  // Populate the Nexconn groupId → circleId mapping for all of the
  // authenticated user's circles, using backend-authorized channel data.
  // Also initialize empty message buckets for real circles so incoming
  // messages have a target conversation key.
  //
  // Each circle's channel mapping is fetched via
  // GET /api/circles/:circleId/nexconn-channel, which requires membership
  // and returns only the group ID and creation status. Circles without a
  // channel mapping (404) are skipped.
  React.useEffect(() => {
    if (!circles) {
      return
    }
    let cancelled = false

    ;(async () => {
      // Initialize empty message buckets for real circles.
      setMessagesByConversation((current) => {
        const next = { ...current }
        for (const circle of circles) {
          if (!next[circle.id]) {
            next[circle.id] = []
          }
        }
        return next
      })

      // Fetch channel mappings and build the groupId → circleId map.
      for (const circle of circles) {
        if (cancelled) {
          break
        }
        try {
          const data = (await api.get(
            `/api/circles/${circle.id}/nexconn-channel`
          )) as { circleId: string; groupId: string; status: string }
          if (!cancelled && data.groupId) {
            setChannelIdToCircleId((prev) => ({
              ...prev,
              [data.groupId]: data.circleId,
            }))
          }
        } catch {
          // Channel not created yet, not accessible, or network error.
          // Skip this circle — messages to it cannot be routed.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [circles])

  // Resolve verified Nexconn recipients for a real Pulse Circle.
  //
  // The selected conversation is treated as a real circle only when its id
  // is a UUID. Mock conversation ids ('circle-group', 'priya', ...) are not
  // UUIDs, so they fall through to the existing mock-data experience without
  // any backend call. This keeps the prototype fully functional while the
  // real-messaging path is opt-in.
  React.useEffect(() => {
    let cancelled = false

    const circleId = selectedId
    if (!circleId || !UUID_REGEX.test(circleId) || !currentUser) {
      return () => {
        cancelled = true
      }
    }

    ;(async () => {
      try {
        const data = (await api.get(
          `/api/circles/${circleId}/nexconn-recipients`
        )) as { recipients: NexconnRecipient[] }
        if (!cancelled) {
          setRecipientMap((current) => ({ ...current, [circleId]: data.recipients }))
          setRecipientErrorMap((current) => {
            const next = { ...current }
            delete next[circleId]
            return next
          })
        }
      } catch {
        if (!cancelled) {
          setRecipientErrorMap((current) => ({
            ...current,
            [circleId]: 'Unable to load message recipients for this circle.',
          }))
          setRecipientMap((current) => {
            const next = { ...current }
            delete next[circleId]
            return next
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedId, currentUser])

  // Fetch database-backed circle members for the selected real circle.
  // Uses GET /api/circles/:circleId/members which returns userId + fullName
  // from the Users table — never hardcoded personas.
  React.useEffect(() => {
    const circleId = selectedId
    if (!circleId || !UUID_REGEX.test(circleId) || !currentUser) {
      return
    }
    let cancelled = false

    ;(async () => {
      try {
        const data = (await api.get(
          `/api/circles/${circleId}/members`
        )) as { members: CircleMembership[] }
        if (!cancelled) {
          setCircleMembersMap((current) => ({
            ...current,
            [circleId]: data.members,
          }))
        }
      } catch {
        // Ignore member-list failures — messaging still works without them.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedId, currentUser])

  // Subscribe to Nexconn connection state changes so history can be retried
  // when connection completes asynchronously after page mount. The listener
  // fires immediately with the current state. Cleaned up on unmount.
  React.useEffect(() => {
    const unsubscribe = subscribeNexconnConnection((connected) => {
      setNexconnConnected(connected)
    })
    return unsubscribe
  }, [])

  // Fetch historical messages for the selected real circle when Nexconn is
  // connected. Loads once per circle selection (tracked by historyLoadedMap);
  // real-time messages arrive separately via the onMessageReceived handler.
  React.useEffect(() => {
    const isConnected = isNexconnConnected()
    if (!selectedId || !selectedIsRealCircle || !currentUser || !isConnected) {
      return
    }
    if (historyLoadedMap[selectedId]) {
      return
    }
    let cancelled = false

    ;(async () => {
      setHistoryLoadingMap((current) => ({ ...current, [selectedId]: true }))
      setHistoryErrorMap((current) => {
        const next = { ...current }
        delete next[selectedId]
        return next
      })

      try {
        const channel = (await api.get(
          `/api/circles/${selectedId}/nexconn-channel`
        )) as { circleId: string; groupId: string; status: string }

        if (cancelled) return

        if (!channel || channel.status !== 'CREATED' || !channel.groupId) {
          setHistoryLoadedMap((current) => ({ ...current, [selectedId]: true }))
          setHistoryLoadingMap((current) => {
            const next = { ...current }
            delete next[selectedId]
            return next
          })
          return
        }

        const query = GroupChannel.createMessagesQuery({
          channelIdentifier: new GroupChannelIdentifier(channel.groupId),
          pageSize: 50,
          isAscending: true,
        })

        const allMessages: Message[] = []
        while (query.hasNext && !cancelled) {
          const result = await query.loadNextPage()
          if (!result.isOk) break
          allMessages.push(...(result.data?.data ?? []))
        }

        if (cancelled) return

        // Map and merge historical messages, deduplicating by Nexconn messageId.
        const mapped = allMessages
          .map((m) => mapHistoryMessage(m, currentUser.id, currentUser.fullName))
          .filter((m): m is ChatMessage => m !== null)

        setMessagesByConversation((current) => {
          const existing = current[selectedId] ?? []
          const existingIds = new Set(existing.map((m) => m.id))
          const newMessages = mapped.filter((m) => !existingIds.has(m.id))
          if (newMessages.length === 0) return current
          return {
            ...current,
            [selectedId]: [...existing, ...newMessages],
          }
        })
      } catch {
        setHistoryErrorMap((current) => ({
          ...current,
          [selectedId]: 'Unable to load message history.',
        }))
      } finally {
        if (!cancelled) {
          setHistoryLoadedMap((current) => ({ ...current, [selectedId]: true }))
          setHistoryLoadingMap((current) => {
            const next = { ...current }
            delete next[selectedId]
            return next
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  // nexconnConnected is a dependency so the effect re-runs when the
  // connection transitions to true after page mount, enabling automatic
  // history loading after browser reload.
  }, [selectedId, selectedIsRealCircle, currentUser, nexconnConnected, historyLoadedMap])
  // AuthContext owns connect/disconnect; this page only subscribes to
  // connection state and registers its message handler.
  const appendIncoming = React.useCallback(
    (message: Message): void => {
      const chatMessage = mapIncomingMessage(message)
      if (!chatMessage) return
      const channelId = message.channelIdentifier?.channelId
      if (!channelId) return

      // Route incoming messages to real circle conversations only.
      // Real channel IDs are backend-authorized Nexconn groupIds mapped to
      // circleIds via channelIdToCircleId. Unknown channels are dropped.
      let targetId: string | null = null
      if (channelIdToCircleId[channelId]) {
        targetId = channelIdToCircleId[channelId]
      } else {
        return
      }

      setMessagesByConversation((current) => {
        const existing = current[targetId] ?? []
        if (existing.some((entry) => entry.id === chatMessage.id)) {
          return current
        }
        return {
          ...current,
          [targetId]: [...existing, chatMessage],
        }
      })
    },
    [channelIdToCircleId]
  )

  // Nexconn message-handler lifecycle. The subscription callback fires
  // immediately with the current state, so a page that mounts before the
  // connection settles still registers when connection succeeds. The SDK
  // delivers messages in batches via onMessageReceived({ messages }).
  React.useEffect(() => {
    let active = true

    const handler = new MessageHandler({
      onMessageReceived: ({ messages }) => {
        if (!active) return
        for (let i = 0; i < messages.length; i++) {
          appendIncoming(messages[i])
        }
      },
    })

    const unsubscribe = subscribeNexconnConnection((connectedState) => {
      if (!active) return
      if (connectedState) {
        addMessageHandler(handler)
      } else {
        removeMessageHandler()
      }
    })

    return () => {
      active = false
      removeMessageHandler()
      unsubscribe()
    }
  }, [appendIncoming])

  // No mock conversations remain — selectedId is null or a real circle UUID.
  const selectedCircle = selectedId
    ? (circles ?? []).find((c) => c.id === selectedId) ?? null
    : null
  const selectedConversation =
    selectedCircle ? { title: selectedCircle.name, subtitle: circleSubtitle(selectedCircle) } : null
  const messages = selectedId ? messagesByConversation[selectedId] ?? [] : []

  // Derived recipient state for the currently selected real circle. These
  // are computed in render (never inside an effect) so the effect never has
  // to call setState synchronously.
  const recipients = selectedId ? recipientMap[selectedId] : undefined
  const recipientsError = selectedId ? recipientErrorMap[selectedId] : undefined
  const recipientsLoading = selectedIsRealCircle && !recipients && !recipientsError

  const selectConversation = (id: string) => {
    setSelectedId(id)
    setView('conversation')
  }

  const goBack = () => {
    if (isMobile) {
      setSelectedId(null)
      setView('list')
    }
  }

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !selectedId) return

    setSendError(null)

    if (!selectedIsRealCircle) {
      setSendError('Unable to send: circle not recognized. Please select a real circle.')
      return
    }

    if (!currentUser) {
      setSendError('Unable to send: not authenticated.')
      return
    }

    if (!isNexconnConnected()) {
      setSendError('Unable to send: chat service is not connected.')
      return
    }

    setSending(true)

    // Optimistic message displayed immediately while the SDK send is in flight.
    const optimisticId = `msg-optimistic-${Date.now()}`
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      authorId: currentUser.id,
      authorName: currentUser.fullName,
      body,
      sentAt: new Date().toISOString(),
      direction: 'outgoing',
    }

    setMessagesByConversation((current) => ({
      ...current,
      [selectedId]: [...(current[selectedId] ?? []), optimisticMessage],
    }))

    try {
      const channel = (await api.get(
        `/api/circles/${selectedId}/nexconn-channel`
      )) as { circleId: string; groupId: string; status: string }

      if (!channel || channel.status !== 'CREATED' || !channel.groupId) {
        setMessagesByConversation((current) => ({
          ...current,
          [selectedId]: (current[selectedId] ?? []).filter(
            (m) => m.id !== optimisticId
          ),
        }))
        setSendError('Circle channel is not ready for messaging.')
        return
      }

      const group = new GroupChannel(channel.groupId)
      const result = await group.sendMessage(new SendTextMessageParams({ text: body }))
      if (!result.isOk) {
        // Nexconn rejected the send. Remove the optimistic message and retain
        // the draft so the user can retry without retyping.
        setMessagesByConversation((current) => ({
          ...current,
          [selectedId]: (current[selectedId] ?? []).filter(
            (m) => m.id !== optimisticId
          ),
        }))
        setSendError(
          `Failed to send message (code ${result.code}). Please try again.`,
        )
      } else {
        // SDK-confirmed success: clear draft, optimistic message remains.
        setDraft('')
      }
    } catch {
      // SDK threw (network/unexpected). Remove optimistic message, retain draft.
      setMessagesByConversation((current) => ({
        ...current,
        [selectedId]: (current[selectedId] ?? []).filter(
          (m) => m.id !== optimisticId
        ),
      }))
      setSendError('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleSyncMember = async (): Promise<void> => {
    if (!selectedId) return
    setSyncMemberError(null)
    setSyncMemberSuccess(null)
    setIsSyncingMember(true)
    try {
      const data = (await api.post(
        `/api/circles/${selectedId}/nexconn-channel/sync-member`,
      )) as { circleId: string; groupId: string; nexconnSync: string }
      setSyncMemberSuccess(data.nexconnSync as 'added' | 'already-member')
    } catch {
      setSyncMemberError('Failed to sync chat membership. Please try again.')
    } finally {
      setIsSyncingMember(false)
    }
  }

  const handleInviteSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !selectedId || !selectedCircle) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('Please enter a valid email address.')
      return
    }
    const userRole = selectedCircle.role
    if (userRole !== 'ELDER' && userRole !== 'ADMIN') {
      setInviteError('Only Elders and Admins can invite members.')
      return
    }
    setIsInviting(true)
    setInviteError(null)
    setInviteSuccess(false)
    try {
      await api.post(`/api/circles/${selectedId}/invitations`, {
        email,
        role: 'NEIGHBOR',
      })
      setInviteSuccess(true)
      setInviteEmail('')
    } catch (err) {
      setInviteError(
        (err as Error).message ?? 'Failed to send invitation. Please try again.',
      )
    } finally {
      setIsInviting(false)
    }
  }

  const handleAcceptInvitation = async (invitationId: string): Promise<void> => {
    setIsHandlingInvitation(true)
    try {
      await api.post(`/api/invitations/${invitationId}/accept`)
      setPendingInvitations((current) =>
        current.filter((inv) => inv.id !== invitationId),
      )
      setInvitationsError(null)
      // Refresh circles so the newly joined circle appears.
      setCirclesRetry((n) => n + 1)
    } catch (err) {
      setInvitationsError(
        (err as Error).message ?? 'Failed to accept invitation. Please try again.',
      )
    } finally {
      setIsHandlingInvitation(false)
    }
  }

  const handleDeclineInvitation = async (invitationId: string): Promise<void> => {
    setIsHandlingInvitation(true)
    try {
      await api.post(`/api/invitations/${invitationId}/decline`)
      setPendingInvitations((current) =>
        current.filter((inv) => inv.id !== invitationId),
      )
      setInvitationsError(null)
    } catch (err) {
      setInvitationsError(
        (err as Error).message ?? 'Failed to decline invitation. Please try again.',
      )
    } finally {
      setIsHandlingInvitation(false)
    }
  }

  return (
    <section aria-labelledby="messages-heading">
      <h2 id="messages-heading" className="sr-only">Messages</h2>

      <div className="grid gap-5 lg:grid-cols-2">
        {!isMobile || view === 'list' ? (
          <Card>
            <CardHeader
              title="Your circle"
              description={
                selectedId && selectedCircle
                  ? selectedCircle.description ?? ''
                  : 'Pick a conversation to read messages.'
              }
              icon={<Users className="size-5" />}
            />
            <ul className="divide-y divide-line">
              {/* Real circles from the authenticated user's membership. */}
              {circlesError && (
                <li className="px-5 py-3 text-center">
                  <p className="text-sm text-amber-700">{circlesError}</p>
                  <button
                    type="button"
                    onClick={() => setCirclesRetry((n) => n + 1)}
                    className="mt-1 text-xs font-semibold text-pulse-700 hover:underline"
                  >
                    Retry
                  </button>
                </li>
              )}
              {circlesError === null && circles === null && (
                <li className="px-5 py-3 text-center">
                  <p className="text-sm text-ink-muted">Loading your circles…</p>
                </li>
              )}
              {circles !== null &&
                circles.map((circle) => (
                  <li key={circle.id}>
                    <button
                      onClick={() => selectConversation(circle.id)}
                      className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pulse-700"
                    >
                      <div className="relative">
                        <Avatar name={circle.name} tone="pulse" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{circle.name}</p>
                        <p className="truncate text-sm text-ink-muted">
                          {circle.description ?? 'No description'}
                          {' · '}
                          <span className="text-[11px] uppercase tracking-wide">
                            {circleRoleLabel(circle.role)}
                          </span>
                        </p>
                      </div>
                      <span className="ml-auto text-[11px] font-semibold text-ink-muted">
                        Real
                      </span>
                    </button>
                  </li>
                ))}
              {circles !== null && circles.length === 0 && circlesError === null && (
                <li className="px-5 py-4 sm:px-6 text-center">
                  <p className="text-sm text-ink-muted">
                    You are not a member of any circles yet.
                  </p>
                </li>
              )}
              {/* Pending invitations received by the authenticated user. */}
              {invitationsError && (
                <li className="px-5 py-3 text-center">
                  <p className="text-sm text-amber-700">{invitationsError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCirclesRetry((n) => n + 1)
                    }}
                    className="mt-1 text-xs font-semibold text-pulse-700 hover:underline"
                  >
                    Retry
                  </button>
                </li>
              )}
              {pendingInvitations.length > 0 && (
                <li className="px-5 py-4 sm:px-6">
                  <p className="text-xs font-semibold text-ink-muted mb-3">
                    Pending invitations
                  </p>
                  <ul className="space-y-2">
                    {pendingInvitations.map((invitation) => (
                      <li
                        key={invitation.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">
                            {invitation.circle.name}
                          </p>
                          <p className="text-xs text-ink-muted truncate">
                            Invited by{' '}
                            {invitation.inviter?.fullName ?? invitation.inviterId ??
                              'Unknown'}
                          </p>
                          <p className="text-[10px] text-ink-muted">
                            Expires {new Date(
                              invitation.expiresAt,
                            ).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              handleAcceptInvitation(invitation.id)
                            }
                            disabled={isHandlingInvitation}
                            className="min-h-8 px-3 text-xs"
                          >
                            Accept
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleDeclineInvitation(invitation.id)
                            }
                            disabled={isHandlingInvitation}
                            className="min-h-8 px-3 text-xs"
                          >
                            Decline
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          </Card>
        ) : null}

        {selectedId && selectedConversation && (
          <Card className="flex flex-col min-w-0">
            <div className="border-b border-line px-5 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <button
                  onClick={goBack}
                  className="lg:hidden inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-pulse-800 hover:bg-pulse-50"
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  Back
                </button>
                <h2 className="text-lg font-semibold">{selectedConversation.title}</h2>
                <p className="text-sm text-ink-muted">{selectedConversation.subtitle}</p>
              </div>
            </div>

            {selectedIsRealCircle ? (
              <div
                className={
                  recipientsError
                    ? 'bg-amber-50 text-amber-800 text-xs px-5 py-2'
                    : recipientsLoading
                      ? 'bg-surface-muted text-ink-muted text-xs px-5 py-2'
                      : recipients
                        ? 'bg-mint-50 text-mint-800 text-xs px-5 py-2'
                        : 'bg-surface-muted text-ink-muted text-xs px-5 py-2'
                }
              >
                {recipientsError
                  ? recipientsError
                  : recipientsLoading
                    ? 'Loading verified recipients…'
                    : recipients
                      ? `${recipients.length} verified recipient${
                          recipients.length === 1 ? '' : 's'
                        } for real messaging.`
                      : 'No verified recipients available for this circle yet.'}
              </div>
            ) : null}

            {selectedIsRealCircle && selectedId ? (
              <div
                className={
                  historyErrorMap[selectedId]
                    ? 'bg-amber-50 text-amber-800 text-xs px-5 py-2'
                    : historyLoadingMap[selectedId]
                      ? 'bg-surface-muted text-ink-muted text-xs px-5 py-2'
                      : 'bg-surface-muted text-ink-muted text-xs px-5 py-2'
                }
              >
                {historyErrorMap[selectedId]
                  ? historyErrorMap[selectedId]
                  : historyLoadingMap[selectedId]
                    ? 'Loading message history…'
                    : historyLoadedMap[selectedId]
                      ? 'Message history loaded.'
                      : ''}
              </div>
            ) : null}

            {selectedIsRealCircle && selectedId ? (
              <div className="bg-surface-muted text-xs px-5 py-3 border-b border-line">
                <p className="font-semibold mb-1">Members</p>
                <ul className="space-y-1">
                  {(circleMembersMap[selectedId] ?? []).map((member) => (
                    <li key={member.userId} className="flex items-center justify-between">
                      <span className="text-ink">{member.fullName}</span>
                      <span className="text-ink-muted">{member.role}</span>
                    </li>
                  ))}
                  {(circleMembersMap[selectedId] ?? []).length === 0 && (
                    <li className="text-ink-muted">Loading members…</li>
                  )}
                </ul>
              </div>
            ) : null}

            {selectedIsRealCircle && selectedId ? (
              <div className="bg-surface-muted text-xs px-5 py-3 border-b border-line">
                <p className="font-semibold mb-1">Chat membership recovery</p>
                <p className="text-[11px] text-ink-muted mb-3">
                  Sync your own Nexconn identity into this circle's chat
                  channel so you can receive messages.
                </p>
                <Button
                  onClick={handleSyncMember}
                  size="sm"
                  disabled={isSyncingMember}
                  className="w-full"
                >
                  {isSyncingMember
                    ? 'Syncing…'
                    : syncMemberSuccess === 'added'
                      ? 'Synced'
                      : syncMemberSuccess === 'already-member'
                        ? 'Already synced'
                        : 'Recover chat membership'}
                </Button>
                {syncMemberError && (
                  <p className="mt-2 text-[11px] text-danger">{syncMemberError}</p>
                )}
              </div>
            ) : null}

            {selectedIsRealCircle && selectedId && selectedCircle &&
              (selectedCircle.role === 'ELDER' || selectedCircle.role === 'ADMIN') ? (
              <div className="bg-surface-muted text-xs px-5 py-3 border-b border-line">
                <p className="font-semibold mb-1">Invite member</p>
                <form onSubmit={handleInviteSubmit} className="space-y-2">
                  <input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="Email address"
                    type="email"
                    autoComplete="email"
                    disabled={isInviting}
                    className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isInviting || !inviteEmail.trim()}
                    className="w-full"
                  >
                    {isInviting ? 'Inviting…' : 'Invite'}
                  </Button>
                  {inviteError && (
                    <p className="text-[11px] text-danger">{inviteError}</p>
                  )}
                  {inviteSuccess && (
                    <p className="text-[11px] text-success">
                      Invitation sent. The recipient can accept via their email link.
                    </p>
                  )}
                </form>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-6 lg:p-8">
              {messages.length === 0 ? (
                <p className="text-center text-lg text-ink-muted">
                  {selectedIsRealCircle
                    ? 'No messages yet. Incoming messages will appear here once the chat service is connected.'
                    : 'No messages yet. Send the first one.'}
                </p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'max-w-[80%] rounded-xl px-4 py-2 text-sm',
                      message.direction === 'outgoing'
                        ? 'ml-auto text-white bg-pulse-600'
                        : 'text-ink bg-surface-muted',
                      message.direction === 'outgoing'
                        ? 'rounded-tr-none'
                        : 'rounded-tl-none'
                    )}
                  >
                    <p>{message.body}</p>
                    <p className="mt-1 text-[11px] opacity-70">
                      {formatClock(message.sentAt)}
                    </p>
                  </div>
                ))
              )}
            </div>

            {sendError && (
              <div className="mb-2 p-3 rounded-lg border border-line bg-danger-soft text-danger text-xs">
                {sendError}
              </div>
            )}

            <form
              onSubmit={handleSend}
              className="border-t border-line p-4 sm:px-6"
            >
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type a message…"
                  disabled={sending}
                  className="flex-1 min-h-12 rounded-xl border border-line bg-surface px-4 py-3 text-base focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={sending || !draft.trim()}
                  className="hidden sm:inline-flex"
                >
                  Send
                  <MessageSquareText aria-hidden="true" className="ml-2 size-4" />
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-ink-muted">
                Sent via Nexconn. Incoming messages will appear here as they arrive.
              </p>
            </form>
          </Card>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3 text-xs text-ink-muted text-center">
        Real messaging — messages are sent through Nexconn group channels.
      </div>
    </section>
  )
}
