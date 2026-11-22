import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, MessageSquareText, Plus, Users } from 'lucide-react'

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
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { formatClock } from '@/lib/format'
import {
  addMessageHandler,
  isNexconnConnected,
  removeMessageHandler,
  subscribeNexconnConnection,
  toNexconnUserId,
} from '@/lib/nexconn'
import { api, type ApiError } from '@/lib/api'
import { useAuth } from '@/context/auth'
import type { ChatMessage } from '@/types'

import React from 'react'

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

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
  unreadCount: number
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

/**
 * Resolve a Nexconn sender user ID to the Pulse Circle member's full name.
 *
 * The Nexconn SDK delivers messages with `senderUserId` in Nexconn format
 * (UUID hyphens stripped, 32-char hex). Pulse Circle member records store
 * `userId` as a UUID with hyphens. Convert each member's userId to Nexconn
 * format and compare to find the matching member.
 *
 * Returns null when no member matches (e.g. members not yet loaded, or an
 * unknown sender). Callers must fall back gracefully — never display a raw
 * ID as a sender name.
 */
function resolveSenderName(
  senderUserId: string,
  members: CircleMembership[]
): string | null {
  const member = members.find(
    (m) => toNexconnUserId(m.userId) === senderUserId
  )
  return member?.fullName ?? null
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
  // Circle rename state (only ELDER/ADMIN members may rename).
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [renameName, setRenameName] = React.useState('')
  const [renameDescription, setRenameDescription] = React.useState('')
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameError, setRenameError] = React.useState<string | null>(null)
  // Circle create state.
  const [createCircleOpen, setCreateCircleOpen] = React.useState(false)
  const [createCircleName, setCreateCircleName] = React.useState('')
  const [createCircleDescription, setCreateCircleDescription] = React.useState('')
  const [isCreatingCircle, setIsCreatingCircle] = React.useState(false)
  const [createCircleError, setCreateCircleError] = React.useState<string | null>(null)
  // Reactive Nexconn connection state. Updated via subscribeNexconnConnection
  // so the history-loading effect can retry when connection completes
  // asynchronously after page mount.
  const [nexconnConnected, setNexconnConnected] = React.useState(false)
  // History loading state per circle. Tracks whether history has been loaded
  // for a given circle to prevent redundant fetches when switching between
  // conversations. Real-time messages arrive separately via onMessageReceived.
  const [historyErrorMap, setHistoryErrorMap] = React.useState<Record<string, string>>({})
  const [historyLoadedMap, setHistoryLoadedMap] = React.useState<Record<string, boolean>>({})
  // Ref to the last rendered message element for auto-scroll-to-bottom.
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  // Ref mirroring messagesByConversation so appendIncoming can check for
  // duplicates without taking messagesByConversation as a dependency (which
  // would cause the Nexconn handler effect to re-subscribe on every message).
  // Kept in sync via effect below.
  const messagesByConversationRef = React.useRef(messagesByConversation)

  // Keep the ref in sync with state (assigned in an effect, not during
  // render, to avoid the "Cannot access refs during render" lint error).
  React.useEffect(() => {
    messagesByConversationRef.current = messagesByConversation
  }, [messagesByConversation])
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
  const [isHandlingInvitation, setIsHandlingInvitation] = React.useState(false)

  const isMobile = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
    []
  )

  const [membersExpanded, setMembersExpanded] = React.useState(false)
  const [connectionExpanded, setConnectionExpanded] = React.useState(false)
  // Per-circle unread message counts. Keyed by circleId. Initialized from
  // GET /api/circles and updated in real time as messages arrive / are read.
  const [unreadCountMap, setUnreadCountMap] = React.useState<Record<string, number>>(
    {}
  )
  // Per-circle timestamp of when the conversation was last marked as read.
  // Used to determine which messages are "new" (arrived after last read) and
  // to position the "New messages" divider.
  const [lastReadAtMap, setLastReadAtMap] = React.useState<Record<string, string>>(
    {}
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
          const nextUnread: Record<string, number> = {}
          for (const c of data.circles) {
            nextUnread[c.id] = c.unreadCount ?? 0
          }
          setUnreadCountMap(nextUnread)
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
        }
      } catch {
        if (!cancelled) {
          setPendingInvitations([])
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
          const merged = [...existing, ...newMessages]
          merged.sort((a, b) => a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0)
          return {
            ...current,
            [selectedId]: merged,
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

  // Auto-scroll to the bottom whenever the conversation or message list
  // changes. Covers: initial history load, incoming real-time messages,
  // and outgoing sends. The dependency is a count (stable by value), not
  // an array reference, so it only fires when the list actually changes.
  const currentMessageCount = selectedId ? messagesByConversation[selectedId]?.length ?? 0 : 0
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [selectedId, currentMessageCount])
  // AuthContext owns connect/disconnect; this page only subscribes to
  // connection state and registers its message handler.
  // Mark the conversation as read: resets the unread count and records the
  // read timestamp. Called when the user opens a conversation.
  const markAsRead = async (circleId: string): Promise<void> => {
    try {
      await api.post(`/api/circles/${circleId}/read`)
      setUnreadCountMap((prev) => ({ ...prev, [circleId]: 0 }))
      setLastReadAtMap((prev) => ({
        ...prev,
        [circleId]: new Date().toISOString(),
      }))
    } catch {
      // Ignore read failures — local state remains as-is.
    }
  }

  // Increment the unread count for a circle. Called when a new incoming
  // message arrives via Nexconn. Never counts the current user's own messages
  // (mapIncomingMessage only returns RECEIVE-direction messages).
  const incrementUnread = React.useCallback(
    async (circleId: string): Promise<void> => {
      try {
        await api.post(`/api/circles/${circleId}/messages/unread`)
        setUnreadCountMap((prev) => ({
          ...prev,
          [circleId]: (prev[circleId] ?? 0) + 1,
        }))
      } catch {
        // Ignore increment failures — local state remains as-is.
      }
    },
    []
  )

  const appendIncoming = React.useCallback(
    (message: Message): void => {
      const chatMessage = mapIncomingMessage(message)
      if (!chatMessage) return
      const channelId = message.channelIdentifier?.channelId
      if (!channelId) return

      // Route incoming messages to real circle conversations only.
      let targetId: string | null = null
      if (channelIdToCircleId[channelId]) {
        targetId = channelIdToCircleId[channelId]
      } else {
        return
      }

      // Prevent duplicate unread counts from repeated events or history
      // reloads. Check using the ref (synchronous, no stale closure).
      const currentMessages = messagesByConversationRef.current[targetId] ?? []
      if (currentMessages.some((entry) => entry.id === chatMessage.id)) {
        return
      }

      setMessagesByConversation((current) => {
        const existing = current[targetId] ?? []
        const merged = [...existing, chatMessage]
        merged.sort((a, b) => a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0)
        return {
          ...current,
          [targetId]: merged,
        }
      })

      // Increment unread count for new incoming messages from other users.
      void incrementUnread(targetId)
    },
    [channelIdToCircleId, incrementUnread]
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
  // Database-backed members for the selected circle, used to resolve Nexconn
  // sender IDs to real full names. May be empty while loading.
  const members = selectedId ? circleMembersMap[selectedId] ?? [] : []

  // Derived recipient state for the currently selected real circle. These
  // are computed in render (never inside an effect) so the effect never has
  // to call setState synchronously.
  const selectConversation = async (id: string): Promise<void> => {
    setSelectedId(id)
    setView('conversation')
    // Mark the conversation as read when the user opens it. This clears the
    // unread badge and records the read timestamp so newly arriving messages
    // after this point are correctly flagged as "new."
    await markAsRead(id)
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

    setMessagesByConversation((current) => {
      const merged = [...(current[selectedId] ?? []), optimisticMessage]
      merged.sort((a, b) => a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0)
      return {
        ...current,
        [selectedId]: merged,
      }
    })

    try {
      let channel: { circleId: string; groupId: string; status: string } | null = null

      const tryCreateChannel = async (): Promise<{ circleId: string; groupId: string; status: string } | null> => {
        try {
          await api.post(`/api/circles/${selectedId}/nexconn-channel`)
        } catch (postErr) {
          const postErrObj = postErr as ApiError
          if (postErrObj.status === 409) {
            setMessagesByConversation((current) => ({
              ...current,
              [selectedId]: (current[selectedId] ?? []).filter(
                (m) => m.id !== optimisticId
              ),
            }))
            setSendError(
              'A channel creation is already in progress for this circle. Please try again shortly.'
            )
            return null
          }
          setMessagesByConversation((current) => ({
            ...current,
            [selectedId]: (current[selectedId] ?? []).filter(
              (m) => m.id !== optimisticId
            ),
          }))
          setSendError('Failed to create chat channel. Please try again.')
          return null
        }

        return (await api.get(
          `/api/circles/${selectedId}/nexconn-channel`
        )) as { circleId: string; groupId: string; status: string }
      }

      const isSendReadyStatus = (status: string): boolean => {
        return status === 'CREATED' || status === 'SYNCED' || status === 'PARTIAL'
      }

      try {
        channel = (await api.get(
          `/api/circles/${selectedId}/nexconn-channel`
        )) as { circleId: string; groupId: string; status: string }
      } catch (err) {
        const getErr = err as ApiError
        if (getErr.status === 404) {
          channel = await tryCreateChannel()
        } else {
          setMessagesByConversation((current) => ({
            ...current,
            [selectedId]: (current[selectedId] ?? []).filter(
              (m) => m.id !== optimisticId
            ),
          }))
          setSendError(
            getErr.message ?? 'Failed to load chat channel. Please try again.'
          )
          return
        }
      }

      if (!channel) {
        return
      }

      // Recover PENDING or FAILED channel by calling POST to resume creation.
      if (channel.status === 'PENDING' || channel.status === 'FAILED') {
        channel = await tryCreateChannel()
      }

      if (!channel || !isSendReadyStatus(channel.status) || !channel.groupId) {
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

  const handleRenameSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!selectedId || !selectedCircle) return

    setRenameError(null)
    setIsRenaming(true)

    const name = renameName.trim()
    const description = renameDescription.trim() || null

    if (!name) {
      setRenameError('Circle name is required.')
      setIsRenaming(false)
      return
    }

    try {
      const data = (await api.patch(
        `/api/circles/${selectedId}`,
        { name, description },
      )) as { id: string; name: string; description: string | null }

      // Update local circle state so the display reflects the new name
      // immediately and remains correct after refresh or re-selection.
      setCircles((current) => {
        if (!current) return current
        return current.map((circle) =>
          circle.id === selectedId
            ? { ...circle, name: data.name, description: data.description }
            : circle,
        )
      })

      setRenameOpen(false)
      setRenameName('')
      setRenameDescription('')
    } catch (err) {
      setRenameError(
        (err as Error).message ?? 'Failed to rename circle. Please try again.',
      )
    } finally {
      setIsRenaming(false)
    }
  }

  const handleCreateCircle = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setCreateCircleError(null)
    setIsCreatingCircle(true)

    const name = createCircleName.trim()
    const description = createCircleDescription.trim() || undefined

    if (!name) {
      setCreateCircleError('Circle name is required.')
      setIsCreatingCircle(false)
      return
    }

    try {
      const data = (await api.post('/api/circles/', {
        name,
        description,
      })) as {
        circle: {
          id: string
          name: string
          description: string | null
          createdAt: string
          updatedAt: string
        }
        membership: { circleId: string; userId: string; role: string }
      }

      const newCircle: RealCircle = {
        id: data.circle.id,
        name: data.circle.name,
        description: data.circle.description,
        createdAt: data.circle.createdAt,
        updatedAt: data.circle.updatedAt,
        role: data.membership.role,
        unreadCount: 0,
      }

      setCircles((current) => {
        if (!current) return [newCircle]
        return [...current, newCircle]
      })

      setSelectedId(data.circle.id)
      setView('conversation')

      setCreateCircleOpen(false)
      setCreateCircleName('')
      setCreateCircleDescription('')
    } catch (err) {
      setCreateCircleError(
        (err as Error).message ?? 'Failed to create circle. Please try again.',
      )
    } finally {
      setIsCreatingCircle(false)
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
      // Refresh circles so the newly joined circle appears.
      setCirclesRetry((n) => n + 1)
    } catch {
      // Intentionally empty — invitation errors are not surfaced in this view.
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
    } catch {
      // Intentionally empty — invitation errors are not surfaced in this view.
    } finally {
      setIsHandlingInvitation(false)
    }
  }
  return (
    <section
      aria-labelledby="messages-heading"
      className={cn(
        isMobile && view === 'conversation'
          ? 'flex flex-col min-h-svh gap-0'
          : 'space-y-5'
      )}
    >
      {!isMobile || view === 'list' ? (
        <h2 id="messages-heading" className="text-2xl font-semibold tracking-tight">
          Messages
        </h2>
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-5 lg:flex-row lg:gap-5',
          isMobile && view === 'conversation'
            ? 'flex-1 min-h-0'
            : 'min-h-[600px]'
        )}
      >
        {/* Left: Circle sidebar */}
        {!isMobile || view === 'list' ? (
          <div className="flex flex-col gap-4 min-w-[280px] lg:w-[360px]">
            <Card className="flex flex-col h-full">
              <div className="border-b border-line px-5 py-4 sm:px-6 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="size-5 text-pulse-700" aria-hidden="true" />
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">
                      Your circles
                    </h3>
                    <p className="text-xs text-ink-muted">
                      {circles?.length ?? 0} circle{
                        circles?.length === 1 ? '' : 's'
                      }
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCreateCircleName('')
                    setCreateCircleDescription('')
                    setCreateCircleError(null)
                    setCreateCircleOpen(true)
                  }}
                  className="flex items-center gap-2 min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-white bg-pulse-700 shadow-sm hover:bg-pulse-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pulse-700 focus-visible:ring-offset-2"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Create circle
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-line px-4 py-3 sm:px-5">
                {circlesError && (
                  <div className="px-4 py-4 text-center">
                    <p className="text-sm text-amber-700">{circlesError}</p>
                    <button
                      type="button"
                      onClick={() => setCirclesRetry((n) => n + 1)}
                      className="mt-1 text-xs font-semibold text-pulse-700 hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {circlesError === null && circles === null && (
                  <div className="px-4 py-4 text-center">
                    <p className="text-sm text-ink-muted">Loading your circles…</p>
                  </div>
                )}
                {circles !== null &&
                  circles.map((circle) => {
                    const isSelected = selectedId === circle.id
                    return (
                      <button
                        key={circle.id}
                        onClick={() => selectConversation(circle.id)}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2',
                          isSelected
                            ? 'bg-pulse-50 text-pulse-800 border border-pulse-100'
                            : 'bg-surface text-ink hover:bg-surface-muted',
                          'focus-visible:ring-pulse-700',
                        )}
                      >
                        <div className="relative shrink-0">
                          <Avatar name={circle.name} tone="pulse" />
                          {isSelected && (
                            <div className="absolute -right-1 -bottom-1 flex size-2.5 items-center justify-center rounded-full bg-pulse-700 text-white ring-2 ring-surface">
                              <span className="text-[10px] font-bold">•</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate text-sm">
                            {circle.name}
                          </p>
                          <p className="truncate text-[11px] text-ink-muted">
                            {circle.description ?? 'No description'}
                            {' · '}
                            <span className="uppercase tracking-wide">
                              {circleRoleLabel(circle.role)}
                            </span>
                          </p>
                        </div>
                        {unreadCountMap[circle.id] > 0 ? (
                          <span
                            className="text-[10px] font-semibold text-white bg-pulse-700 rounded-full px-2 py-0.5 shrink-0"
                          >
                            {unreadCountMap[circle.id] >= 4 ? '4+ new' : `${unreadCountMap[circle.id]} new`}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                {circles !== null && circles.length === 0 && circlesError === null && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-ink-muted">
                      You are not a member of any circles yet.
                    </p>
                  </div>
                )}
              </div>

              {pendingInvitations.length > 0 && (
                <div className="border-t border-line px-5 py-4 sm:px-6">
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
                </div>
              )}
            </Card>
          </div>
        ) : null}

        {/* Right: Conversation area */}
        {selectedId && selectedConversation && (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Conversation header */}
            <Card className="flex flex-col h-full">
              {isMobile ? (
                <div className="border-b border-line bg-surface px-4 py-3 flex items-center justify-between shrink-0">
                  <button
                    onClick={goBack}
                    className="shrink-0 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-pulse-800 hover:bg-pulse-50"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Back
                  </button>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <Avatar name={selectedCircle!.name} tone="pulse" size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate text-sm">
                        {selectedConversation.title}
                      </h3>
                      <p className="text-[10px] text-ink-muted truncate">
                        {circleMembersMap[selectedId]?.length ?? 0} members
                      </p>
                    </div>
                  </div>
                  {selectedIsRealCircle && selectedCircle &&
                    (selectedCircle.role === 'ELDER' ||
                      selectedCircle.role === 'ADMIN') && (
                      <button
                        onClick={() => {
                          setRenameName(selectedCircle.name)
                          setRenameDescription(selectedCircle.description ?? '')
                          setRenameError(null)
                          setRenameOpen(true)
                        }}
                        className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-pulse-800 hover:bg-pulse-50"
                      >
                        Edit
                      </button>
                    )}
                </div>
              ) : (
                <div className="border-b border-line px-5 py-4 sm:px-6 flex flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={goBack}
                      className="lg:hidden shrink-0 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-pulse-800 hover:bg-pulse-50"
                    >
                      <ArrowLeft aria-hidden="true" className="size-4" />
                      Back
                    </button>
                    <div className="relative shrink-0">
                      <Avatar name={selectedCircle!.name} tone="pulse" size="md" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold tracking-tight truncate">
                        {selectedConversation.title}
                      </h2>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-semibold text-ink-muted">
                          {circleMembersMap[selectedId]?.length ?? 0} members
                        </span>
                        {selectedIsRealCircle && selectedCircle &&
                          (selectedCircle.role === 'ELDER' ||
                            selectedCircle.role === 'ADMIN') && (
                              <button
                                onClick={() => {
                                  setRenameName(selectedCircle.name)
                                  setRenameDescription(selectedCircle.description ?? '')
                                  setRenameError(null)
                                  setRenameOpen(true)
                                }}
                                className="flex items-center gap-1 min-h-8 rounded-lg px-2 py-1 text-[11px] font-semibold text-pulse-800 hover:bg-pulse-50"
                              >
                                Edit
                              </button>
                            )}
                      </div>
                      <p className="text-[11px] text-ink-muted truncate">
                        {selectedConversation.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Circle management panel (collapsible on mobile) */}
              {selectedIsRealCircle ? (
                <>
                  {isMobile ? (
                    <>
                      {/* Members - collapsible */}
                      <div className="border-b border-line bg-surface px-4 py-2 shrink-0">
                        <button
                          onClick={() => setMembersExpanded((prev) => !prev)}
                          className="w-full flex items-center justify-between text-[11px] font-semibold text-ink-muted"
                        >
                          <span>
                            Members{' '}
                            <span className="font-normal text-ink">
                              ({circleMembersMap[selectedId]?.length ?? 0})
                            </span>
                          </span>
                          {membersExpanded ? (
                            <ChevronUp className="size-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-4" aria-hidden="true" />
                          )}
                        </button>
                        {membersExpanded && (
                          <ul className="mt-2 space-y-1">
                            {(circleMembersMap[selectedId] ?? []).map((member) => (
                              <li
                                key={member.userId}
                                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-pulse-50/50"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate text-sm text-ink">
                                    {member.fullName}
                                  </span>
                                </div>
                                <span className="text-[10px] font-semibold text-ink-muted">
                                  {member.role === 'ELDER'
                                    ? 'Elder'
                                    : member.role === 'NEIGHBOR'
                                      ? 'Neighbour'
                                      : member.role === 'FAMILY'
                                        ? 'Family'
                                        : member.role}
                                </span>
                              </li>
                            ))}
                            {(circleMembersMap[selectedId] ?? []).length === 0 && (
                              <li className="px-2 py-1.5 text-[10px] text-ink-muted">
                                No members loaded
                              </li>
                            )}
                          </ul>
                        )}
                      </div>

                      {/* Chat connection - collapsible */}
                      <div className="border-b border-line bg-surface px-4 py-2 shrink-0">
                        <button
                          onClick={() => setConnectionExpanded((prev) => !prev)}
                          className="w-full flex items-center justify-between text-[11px] font-semibold text-ink-muted"
                        >
                          <span>Chat connection</span>
                          {connectionExpanded ? (
                            <ChevronUp className="size-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-4" aria-hidden="true" />
                          )}
                        </button>
                        {connectionExpanded && (
                          <div className="mt-2">
                            <Button
                              onClick={handleSyncMember}
                              size="sm"
                              disabled={isSyncingMember}
                              className="w-full min-h-9 text-[10px] px-3"
                            >
                              {isSyncingMember
                                ? 'Syncing…'
                                : syncMemberSuccess === 'added'
                                  ? 'Synced'
                                  : syncMemberSuccess === 'already-member'
                                    ? 'Already synced'
                                    : 'Recover membership'}
                            </Button>
                            {syncMemberError && (
                              <p className="mt-1 text-[10px] text-danger">
                                {syncMemberError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="border-b border-line bg-surface/50 px-5 py-3 sm:px-6">
                      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-xl border border-line bg-surface px-3 py-3">
                          <p className="text-[11px] font-semibold text-ink-muted mb-2">
                            Members
                          </p>
                          <ul className="space-y-1">
                            {(circleMembersMap[selectedId] ?? []).map((member) => (
                              <li
                                key={member.userId}
                                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-pulse-50/50"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate text-sm text-ink">
                                    {member.fullName}
                                  </span>
                                </div>
                                <span className="text-[10px] font-semibold text-ink-muted">
                                  {member.role === 'ELDER'
                                    ? 'Elder'
                                    : member.role === 'NEIGHBOR'
                                      ? 'Neighbour'
                                      : member.role === 'FAMILY'
                                        ? 'Family'
                                        : member.role}
                                </span>
                              </li>
                            ))}
                            {(circleMembersMap[selectedId] ?? []).length === 0 && (
                              <li className="px-2 py-1.5 text-[11px] text-ink-muted">
                                Loading members…
                              </li>
                            )}
                          </ul>
                        </div>

                        {selectedCircle &&
                        (selectedCircle.role === 'ELDER' ||
                          selectedCircle.role === 'ADMIN') ? (
                          <div className="rounded-xl border border-line bg-surface px-3 py-3">
                            <p className="text-[11px] font-semibold text-ink-muted mb-2">
                              Invite member
                            </p>
                            <form
                              onSubmit={handleInviteSubmit}
                              className="flex flex-col gap-2"
                            >
                              <input
                                value={inviteEmail}
                                onChange={(event) => setInviteEmail(event.target.value)}
                                placeholder="Email address"
                                type="email"
                                autoComplete="email"
                                disabled={isInviting}
                                className="min-h-10 rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <Button
                                type="submit"
                                size="sm"
                                disabled={isInviting || !inviteEmail.trim()}
                                className="w-full min-h-10"
                              >
                                {isInviting ? 'Inviting…' : 'Invite'}
                              </Button>
                              {inviteError && (
                                <p className="mt-1 text-[11px] text-danger">
                                  {inviteError}
                                </p>
                              )}
                              {inviteSuccess && (
                                <p className="mt-1 text-[11px] text-success">
                                  Invitation sent. The recipient can accept via their email link.
                                </p>
                              )}
                            </form>
                          </div>
                        ) : null}

                        <div className="rounded-xl border border-line bg-surface px-3 py-3">
                          <p className="text-[11px] font-semibold text-ink-muted mb-2">
                            Chat connection
                          </p>
                          <Button
                            onClick={handleSyncMember}
                            size="sm"
                            disabled={isSyncingMember}
                            className="w-full min-h-10 text-[11px]"
                          >
                            {isSyncingMember
                              ? 'Syncing…'
                              : syncMemberSuccess === 'added'
                                ? 'Synced'
                                : syncMemberSuccess === 'already-member'
                                  ? 'Already synced'
                                  : 'Recover membership'}
                          </Button>
                          {syncMemberError && (
                            <p className="mt-1 text-[11px] text-danger">
                              {syncMemberError}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : null}

              {/* Message history area */}
              <div
                className={cn(
                  'flex-1 overflow-y-auto space-y-3',
                  isMobile ? 'p-3' : 'p-4 sm:p-6 lg:p-8'
                )}
              >
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageSquareText
                      className={cn(
                        'size-12 text-line mb-3',
                        isMobile ? 'size-12 mb-3' : 'size-16 mb-4'
                      )}
                      aria-hidden="true"
                    />
                    <h3 className="text-base font-semibold text-ink">
                      No messages yet
                    </h3>
                    <p className="mt-1 text-sm text-ink-muted max-w-xs mx-auto">
                      {selectedIsRealCircle
                        ? 'Incoming messages will appear here once the chat service is connected.'
                        : 'Send the first message to start the conversation.'}
                    </p>
                    {historyErrorMap[selectedId] && (
                      <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-left">
                        <p className="text-[11px] font-semibold text-amber-800">
                          Unable to load message history.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                      {messages.map((message, index) => {
                        const prevMessage = messages[index - 1]
                        const showSenderName =
                          !prevMessage || prevMessage.authorId !== message.authorId

                        // A message is "new" (unread) when it is incoming and
                        // arrived after the conversation was last marked as read.
                        const lastReadAt = lastReadAtMap[selectedId ?? '']
                        const isUnread =
                          message.direction === 'incoming' &&
                          !!lastReadAt &&
                          message.sentAt > lastReadAt
                        const prevIsUnread = prevMessage
                          ? prevMessage.direction === 'incoming' &&
                            !!lastReadAt &&
                            prevMessage.sentAt > lastReadAt
                          : false
                        const showDivider = isUnread && !prevIsUnread

                        // Resolve the sender's real full name from member data.
                        // Never display raw Nexconn IDs or fallback identifiers.
                        let senderDisplayName: string
                        let senderAvatarName: string
                        if (message.direction === 'outgoing') {
                          senderDisplayName = 'You'
                          senderAvatarName = currentUser?.fullName ?? 'You'
                        } else {
                          const resolved = resolveSenderName(
                            message.authorId,
                            members
                          )
                          senderDisplayName = resolved ?? 'Unknown member'
                          senderAvatarName = resolved ?? 'Unknown member'
                        }

                        return (
                          <React.Fragment key={message.id}>
                            {showDivider && (
                              <div
                                className="w-full flex justify-center my-3"
                              >
                                <span
                                  className="text-[10px] font-semibold text-ink-muted bg-surface/50 px-2 py-0.5 rounded-full border border-line"
                                >
                                  New messages
                                </span>
                              </div>
                            )}
                            <div
                              ref={
                                index === messages.length - 1
                                  ? messagesEndRef
                                  : undefined
                              }
                              className={cn(
                                'flex gap-2 max-w-[90%]',
                                message.direction === 'outgoing'
                                  ? 'justify-end'
                                  : 'justify-start',
                              )}
                            >
                            {message.direction === 'incoming' && (
                              <>
                                <Avatar
                                  name={senderAvatarName}
                                  size="sm"
                                />
                                <div className="flex flex-col">
                                  {showSenderName && (
                                    <p className="text-[10px] font-semibold text-ink-muted mb-0.5">
                                      {senderDisplayName}
                                    </p>
                                  )}
                                  <div
                                    className="rounded-xl px-3 py-2 text-sm leading-relaxed bg-surface-muted text-ink rounded-tl-none"
                                  >
                                    <p>{message.body}</p>
                                    <p className="mt-1 text-[10px] opacity-60">
                                      {formatClock(message.sentAt)}
                                    </p>
                                  </div>
                                </div>
                              </>
                            )}
                            {message.direction === 'outgoing' && (
                              <>
                                <div className="flex flex-col items-end">
                                  {showSenderName && (
                                    <p className="text-[10px] font-semibold text-ink-muted mb-0.5 text-right">
                                      {senderDisplayName}
                                    </p>
                                  )}
                                  <div
                                    className="rounded-xl px-3 py-2 text-sm leading-relaxed text-white bg-pulse-600 rounded-tr-none shadow-sm"
                                  >
                                    <p>{message.body}</p>
                                    <p className="mt-1 text-[10px] opacity-80">
                                      {formatClock(message.sentAt)}
                                    </p>
                                  </div>
                                </div>
                                <Avatar
                                  name={senderAvatarName}
                                  size="sm"
                                />
                              </>
                            )}
                          </div>
                          </React.Fragment>
                        )
                      })}
                  </>
                )}
              </div>

              {sendError && (
                <div className={cn(
                  'mb-2 rounded-lg border border-line bg-danger-soft text-danger px-5',
                  isMobile ? 'py-2 text-[10px] mx-3' : 'p-3 text-[11px]'
                )}>
                  {sendError}
                </div>
              )}

              {/* Message composer */}
              <form
                onSubmit={handleSend}
                className={cn(
                  'border-t border-line bg-surface shrink-0',
                  isMobile
                    ? 'px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]'
                    : 'p-4 sm:px-6'
                )}
              >
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Type a message…"
                    disabled={sending}
                    className={cn(
                      'flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700 disabled:opacity-50 disabled:cursor-not-allowed',
                      isMobile ? 'min-h-10' : 'min-h-12',
                    )}
                  />
                  <Button
                    type="submit"
                    size={isMobile ? 'sm' : 'lg'}
                    disabled={sending || !draft.trim()}
                    className={cn(
                      'rounded-lg text-white bg-pulse-700 hover:bg-pulse-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                      isMobile ? 'min-h-10 px-3 text-sm font-bold' : 'min-h-12 rounded-xl px-6 text-base font-bold',
                    )}
                  >
                    Send
                  </Button>
                </div>
                {!isMobile && (
                  <p className="mt-2 text-[11px] text-ink-muted">
                    Sent via Nexconn. Incoming messages will appear here as they arrive.
                  </p>
                )}
              </form>
            </Card>
          </div>
        )}
      </div>

      {/* Create Circle Modal */}
      {createCircleOpen && (
        <>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-circle-heading"
          >
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setCreateCircleOpen(false)
                setCreateCircleName('')
                setCreateCircleDescription('')
                setCreateCircleError(null)
              }}
              aria-hidden="true"
            />
            <div
              className={cn(
                'relative z-10 w-full max-w-md mx-4 sm:mx-0 lg:max-w-lg',
                'bg-surface rounded-2xl border border-line shadow-raised',
              )}
            >
              <div className="px-6 py-5 sm:px-8">
                <h2
                  id="create-circle-heading"
                  className="text-xl font-semibold tracking-tight text-ink"
                >
                  Create a Circle
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                  Create a new circle to stay connected with trusted neighbours
                  and family.
                </p>

                <form
                  onSubmit={handleCreateCircle}
                  className="mt-6 space-y-4"
                  noValidate
                >
                  <div className="space-y-2">
                    <label htmlFor="create-circle-name" className="block text-sm font-semibold text-ink">
                      Circle name
                    </label>
                    <input
                      id="create-circle-name"
                      value={createCircleName}
                      onChange={(event) =>
                        setCreateCircleName(event.target.value)
                      }
                      disabled={isCreatingCircle}
                      placeholder="e.g. Family Circle"
                      className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="create-circle-description"
                      className="block text-sm font-semibold text-ink"
                    >
                      Description
                    </label>
                    <textarea
                      id="create-circle-description"
                      value={createCircleDescription}
                      onChange={(event) =>
                        setCreateCircleDescription(event.target.value)
                      }
                      disabled={isCreatingCircle}
                      placeholder="Optional description of this circle"
                      rows={3}
                      className="min-h-[96px] w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                    />
                  </div>

                  {createCircleError && (
                    <p className="text-sm text-danger">{createCircleError}</p>
                  )}

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateCircleOpen(false)
                        setCreateCircleName('')
                        setCreateCircleDescription('')
                        setCreateCircleError(null)
                      }}
                      disabled={isCreatingCircle}
                      className={cn(
                        'min-h-12 rounded-xl px-5 py-2.5 text-base font-semibold text-ink-muted hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed',
                        isCreatingCircle
                          ? 'opacity-60 cursor-not-allowed'
                          : '',
                      )}
                    >
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      size="lg"
                      disabled={isCreatingCircle || !createCircleName.trim()}
                      className="min-h-12 rounded-xl px-6 text-base font-bold text-white bg-pulse-700 hover:bg-pulse-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingCircle ? (
                        <>
                          Creating…
                          <span className="ml-2 size-5">
                            <ChevronRight aria-hidden="true" />
                          </span>
                        </>
                      ) : (
                        <>
                          <Plus aria-hidden="true" className="mr-2 size-5" />
                          Create Circle
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Rename Circle Modal */}
      {renameOpen && (
        <form onSubmit={handleRenameSubmit} className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setRenameOpen(false)
              setRenameName('')
              setRenameDescription('')
              setRenameError(null)
            }}
            aria-hidden="true"
          />
          <div
            className={cn(
              'relative z-10 w-full max-w-md mx-4 sm:mx-0',
              'bg-surface rounded-2xl border border-line shadow-raised',
            )}
          >
            <div className="px-6 py-5 sm:px-8">
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Rename circle
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Update the name and description of this circle.
              </p>

              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-ink">
                    Circle name
                  </label>
                  <input
                    value={renameName}
                    onChange={(event) => setRenameName(event.target.value)}
                    disabled={isRenaming}
                    className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-ink">
                    Description
                  </label>
                  <input
                    value={renameDescription}
                    onChange={(event) => setRenameDescription(event.target.value)}
                    disabled={isRenaming}
                    placeholder="Optional"
                    className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                {renameError && (
                  <p className="text-sm text-danger">{renameError}</p>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRenameOpen(false)
                      setRenameName('')
                      setRenameDescription('')
                      setRenameError(null)
                    }}
                    disabled={isRenaming}
                    className={cn(
                      'min-h-12 rounded-xl px-5 py-2.5 text-base font-semibold text-ink-muted hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed',
                      isRenaming ? 'opacity-60 cursor-not-allowed' : '',
                    )}
                  >
                    Cancel
                  </button>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isRenaming || !renameName.trim()}
                    className="min-h-12 rounded-xl px-6 text-base font-bold text-white bg-pulse-700 hover:bg-pulse-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRenaming ? 'Renaming…' : 'Rename'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </section>
  )
}
