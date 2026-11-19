export type MemberRole = 'elderly' | 'neighbour' | 'family'

export type AvatarTone = 'pulse' | 'mint' | 'amber' | 'sky' | 'violet'

export type MemberPresence = 'available' | 'resting'

export type CircleMember = {
  id: string
  name: string
  role: MemberRole
  relationship: string
  presence: MemberPresence
  avatarTone: AvatarTone
}

export type CheckInState = 'completed' | 'due' | 'overdue'

export type CheckInStatus = {
  state: CheckInState
  completedAt: string | null
  nextScheduledAt: string
}

export type ActivityKind = 'check-in' | 'message' | 'alert' | 'acknowledgement'

export type ActivityItem = {
  id: string
  kind: ActivityKind
  actor: string
  summary: string
  occurredAt: string
}

export type EscalationStepState = 'complete' | 'active' | 'pending'

export type EscalationStep = {
  id: string
  title: string
  detail: string
  window: string
  state: EscalationStepState
}

export type ChatMessage = {
  id: string
  authorId: string
  authorName: string
  body: string
  sentAt: string
  direction: 'incoming' | 'outgoing'
}

export type Conversation = {
  id: string
  title: string
  subtitle: string
  memberIds: string[]
  messages: ChatMessage[]
}
