import { ArrowLeft, MessageSquareText, Users } from 'lucide-react'

import { Message, MessageDirection, MessageHandler, MessageType } from '@nexconn/chat'

import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { formatClock } from '@/lib/format'
import {
  addMessageHandler,
  removeMessageHandler,
  subscribeNexconnConnection,
} from '@/lib/nexconn'
import { api } from '@/lib/api'
import { useAuth } from '@/context/auth'
import { conversations } from '@/data/mockData'
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
 * - messages without a non-empty text body are ignored,
 * - messages whose channel is not one of the known conversations are
 *   ignored (real Nexconn channel IDs are server-generated and do not
 *   match the demo conversation IDs, so unknown channels are dropped
 *   rather than invented).
 */
function mapIncomingMessage(message: Message): ChatMessage | null {
  // Only surface messages received from another user. Messages the current
  // user sent are echoed back by the SDK but are rendered locally via
  // handleSend, so they must not be re-inserted here.
  if (message.direction !== MessageDirection.RECEIVE) return null
  if (message.messageType !== MessageType.TEXT) return null
  const text = message.content?.text
  if (typeof text !== 'string' || text.length === 0) return null
  const channelId = message.channelIdentifier?.channelId
  if (!channelId) return null
  if (!conversations.some((conversation) => conversation.id === channelId)) {
    return null
  }
  return {
    id: message.messageId,
    authorId: message.senderUserId,
    authorName: message.content?.senderUserInfo?.name ?? message.senderUserId,
    body: text,
    sentAt: new Date(message.sentTime).toISOString(),
    direction: 'incoming',
  }
}

export function MessagesPage() {
  const { user: currentUser } = useAuth()
  const [view, setView] = React.useState<'list' | 'conversation'>('list')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const [messagesByConversation, setMessagesByConversation] = React.useState<
    Record<string, ChatMessage[]>
  >(
    Object.fromEntries(
      conversations.map((conversation) => [conversation.id, conversation.messages])
    )
  )
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

  // AuthContext owns connect/disconnect; this page only subscribes to
  // connection state and registers its message handler. Outgoing messages
  // still go through the local mock path (handleSend) — real send is not
  // implemented yet.
  const appendIncoming = (message: Message): void => {
    const chatMessage = mapIncomingMessage(message)
    if (!chatMessage) return
    const channelId = message.channelIdentifier?.channelId
    if (!channelId) return
    setMessagesByConversation((current) => {
      const existing = current[channelId] ?? []
      if (existing.some((entry) => entry.id === chatMessage.id)) {
        return current
      }
      return {
        ...current,
        [channelId]: [...existing, chatMessage],
      }
    })
  }

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
  }, [])

  const conversation =
    selectedId && conversations.find((c) => c.id === selectedId)
  const selectedCircle = selectedId
    ? (circles ?? []).find((c) => c.id === selectedId) ?? null
    : null
  const selectedConversation =
    conversation ?? (selectedCircle ? { title: selectedCircle.name, subtitle: circleSubtitle(selectedCircle) } : null)
  const messages = selectedId ? messagesByConversation[selectedId] ?? [] : []

  // Derived recipient state for the currently selected real circle. These
  // are computed in render (never inside an effect) so the effect never has
  // to call setState synchronously.
  const selectedIsRealCircle =
    !!selectedId && UUID_REGEX.test(selectedId)
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

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault()
    // Real circles are read-only in this phase: outgoing Nexconn sending
    // is not implemented yet. Demonstration conversations keep their local
    // mock behaviour.
    if (selectedIsRealCircle) return
    const body = draft.trim()
    if (!body || !selectedId) return

    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      authorId: 'lakshmi',
      authorName: 'Lakshmi Raman',
      body,
      sentAt: new Date().toISOString(),
      direction: 'outgoing',
    }

    setMessagesByConversation((current) => ({
      ...current,
      [selectedId]: [...(current[selectedId] ?? []), newMessage],
    }))
    setDraft('')
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
                selectedId && conversation
                  ? conversation.subtitle
                  : 'Pick a conversation to read messages.'
              }
              icon={<Users className="size-5" />}
            />
            <ul className="divide-y divide-line">
              {conversations.map((c) => {
                const last = c.messages[c.messages.length - 1]
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => selectConversation(c.id)}
                      className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pulse-700"
                    >
                      <div className="relative">
                        <Avatar name={c.title} tone={c.id === 'priya' ? 'amber' : 'pulse'} />
                        {c.id === 'circle-group' && (
                          <span className="absolute -right-1 -bottom-1 flex size-3 shrink-0 items-center justify-center rounded-full border-2 border-surface bg-pulse-700 text-white">
                            <span className="text-[10px]">3</span>
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{c.title}</p>
                        <p className="truncate text-sm text-ink-muted">
                          {c.subtitle}
                        </p>
                      </div>
                      <span className="ml-auto text-[11px] font-semibold text-ink-muted">
                        {last ? formatClock(last.sentAt) : '—'}
                      </span>
                    </button>
                  </li>
                )
              })}

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
              <li className="px-5 py-4 sm:px-6 text-center">
                <p className="text-sm text-ink-muted">
                  Demonstration conversations only — messages are not delivered to real users.
                </p>
              </li>
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

            <form
              onSubmit={handleSend}
              className="border-t border-line p-4 sm:px-6"
            >
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={selectedIsRealCircle ? 'Real messaging is not implemented yet' : 'Type a message…'}
                  disabled={selectedIsRealCircle}
                  className="flex-1 min-h-12 rounded-xl border border-line bg-surface px-4 py-3 text-base focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={selectedIsRealCircle || !draft.trim()}
                  className="hidden sm:inline-flex"
                >
                  Send
                  <MessageSquareText aria-hidden="true" className="ml-2 size-4" />
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-ink-muted">
                {selectedIsRealCircle
                  ? 'Real outgoing messaging is not implemented yet — incoming messages will still arrive here once the chat service is connected.'
                  : 'Prototype only — messages are stored locally in this demo.'}
              </p>
            </form>
          </Card>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-3 text-xs text-ink-muted text-center">
        Ready for future connection — no real messaging backend is integrated yet.
      </div>
    </section>
  )
}
