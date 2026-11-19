import { ArrowLeft, MessageSquareText, Users } from 'lucide-react'

import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { formatClock } from '@/lib/format'
import { conversations } from '@/data/mockData'
import type { ChatMessage } from '@/types'

import React from 'react'

export function MessagesPage() {
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

  const isMobile = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
    []
  )

  const conversation =
    selectedId && conversations.find((c) => c.id === selectedId)
  const messages = selectedId ? messagesByConversation[selectedId] ?? [] : []

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
              <li className="px-5 py-4 sm:px-6 text-center">
                <p className="text-sm text-ink-muted">
                  Demonstration conversations only — messages are not delivered to real users.
                </p>
              </li>
            </ul>
          </Card>
        ) : null}

        {selectedId && conversation && (
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
                <h2 className="text-lg font-semibold">{conversation.title}</h2>
                <p className="text-sm text-ink-muted">{conversation.subtitle}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-6 lg:p-8">
              {messages.length === 0 ? (
                <p className="text-center text-lg text-ink-muted">
                  No messages yet. Send the first one.
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
                  placeholder="Type a message…"
                  className="flex-1 min-h-12 rounded-xl border border-line bg-surface px-4 py-3 text-base focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={!draft.trim()}
                  className="hidden sm:inline-flex"
                >
                  Send
                  <MessageSquareText aria-hidden="true" className="ml-2 size-4" />
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-ink-muted">
                Prototype only — messages are stored locally in this demo.
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
