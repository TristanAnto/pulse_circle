import type {
  ActivityItem,
  CheckInStatus,
  CircleMember,
  Conversation,
  EscalationStep,
} from '@/types'

/**
 * All data in this file is demonstration data for the Phase 3 UI prototype.
 * Nothing here is loaded from a server, and no message or alert is delivered.
 */

const DEMO_NOW = new Date()

function minutesAgo(minutes: number): string {
  return new Date(DEMO_NOW.getTime() - minutes * 60_000).toISOString()
}

function hoursAgo(hours: number): string {
  return minutesAgo(hours * 60)
}

function daysAgo(days: number): string {
  return minutesAgo(days * 24 * 60)
}

function nextOccurrence(hour: number, minute: number): string {
  const next = new Date(DEMO_NOW)
  next.setHours(hour, minute, 0, 0)

  if (next.getTime() <= DEMO_NOW.getTime()) {
    next.setDate(next.getDate() + 1)
  }

  return next.toISOString()
}

export const demoUser = {
  id: 'demo-user',
  name: 'Demo User',
  firstName: 'Demo',
  role: 'Sample profile',
  addressArea: 'Sample area',
}

export const checkInStatus: CheckInStatus = {
  state: 'due',
  completedAt: daysAgo(1),
  nextScheduledAt: nextOccurrence(9, 0),
}

export const circleMembers: CircleMember[] = [
  {
    id: 'member-1',
    name: 'Sample Neighbour',
    role: 'neighbour',
    relationship: 'Neighbour · sample contact',
    presence: 'available',
    avatarTone: 'pulse',
    checkedInToday: false,
    checkedInAt: null,
  },
  {
    id: 'member-2',
    name: 'Sample Neighbour',
    role: 'neighbour',
    relationship: 'Neighbour · sample contact',
    presence: 'available',
    avatarTone: 'mint',
    checkedInToday: false,
    checkedInAt: null,
  },
  {
    id: 'member-3',
    name: 'Sample Family Member',
    role: 'family',
    relationship: 'Family · sample contact',
    presence: 'available',
    avatarTone: 'amber',
    checkedInToday: false,
    checkedInAt: null,
  },
]

export const activityFeed: ActivityItem[] = [
  {
    id: 'activity-1',
    kind: 'message',
    actor: 'Sample Family Member',
    summary: 'asked how your morning walk went.',
    occurredAt: minutesAgo(24),
  },
  {
    id: 'activity-2',
    kind: 'check-in',
    actor: 'Demo User',
    summary: 'checked in successfully yesterday morning.',
    occurredAt: daysAgo(1),
  },
  {
    id: 'activity-3',
    kind: 'acknowledgement',
    actor: 'Sample Neighbour',
    summary: 'acknowledged the reminder for yesterday.',
    occurredAt: daysAgo(1),
  },
  {
    id: 'activity-4',
    kind: 'message',
    actor: 'Sample Neighbour',
    summary: 'shared that she is free to visit this evening.',
    occurredAt: hoursAgo(30),
  },
]

export const escalationSteps: EscalationStep[] = [
  {
    id: 'step-1',
    title: 'Check-in window opens',
    detail: 'Your circle can see the reminder in the app.',
    window: 'Daily, from 9:00 AM',
    state: 'active',
  },
  {
    id: 'step-2',
    title: 'Gentle nudge to your circle',
    detail: 'Neighbours receive a reminder if no check-in is recorded.',
    window: 'After 2 hours',
    state: 'pending',
  },
  {
    id: 'step-3',
    title: 'Neighbour phone call',
      detail: 'Sample neighbours are asked to call or knock on your door.',
    window: 'After 4 hours',
    state: 'pending',
  },
  {
    id: 'step-4',
    title: 'Family escalation',
      detail: 'Sample family contact is contacted and the circle coordinates next steps.',
    window: 'After 6 hours',
    state: 'pending',
  },
]

export const conversations: Conversation[] = [
  {
    id: 'circle-group',
    title: 'Circle group',
    subtitle: 'Sample circle members',
    memberIds: ['member-3', 'member-1', 'member-2'],
    messages: [
      {
        id: 'msg-1',
        authorId: 'member-3',
        authorName: 'Sample Family Member',
        body: 'Good morning. Did you sleep well?',
        sentAt: minutesAgo(58),
        direction: 'incoming',
      },
      {
        id: 'msg-2',
        authorId: 'demo-user',
        authorName: 'Demo User',
        body: 'Yes, I slept well. I am having tea now.',
        sentAt: minutesAgo(52),
        direction: 'outgoing',
      },
      {
        id: 'msg-3',
        authorId: 'member-1',
        authorName: 'Sample Neighbour',
        body: 'I will be outside at 6 pm if you need anything from the market.',
        sentAt: minutesAgo(41),
        direction: 'incoming',
      },
      {
        id: 'msg-4',
        authorId: 'member-2',
        authorName: 'Sample Neighbour',
        body: 'I can bring some soup over this evening.',
        sentAt: minutesAgo(24),
        direction: 'incoming',
      },
    ],
  },
  {
    id: 'member-3',
    title: 'Sample Family Member',
    subtitle: 'Family · sample contact',
    memberIds: ['member-3'],
    messages: [
      {
        id: 'msg-5',
        authorId: 'member-3',
        authorName: 'Sample Family Member',
        body: 'Remember to press the check-in button after breakfast.',
        sentAt: hoursAgo(3),
        direction: 'incoming',
      },
      {
        id: 'msg-6',
        authorId: 'demo-user',
        authorName: 'Demo User',
        body: 'I will do it after my walk.',
        sentAt: hoursAgo(2),
        direction: 'outgoing',
      },
    ],
  },
  {
    id: 'member-1',
    title: 'Sample Neighbour',
    subtitle: 'Neighbour · sample contact',
    memberIds: ['member-1'],
    messages: [
      {
        id: 'msg-7',
        authorId: 'member-1',
        authorName: 'Sample Neighbour',
        body: 'The lift is fixed again. You can use it today.',
        sentAt: hoursAgo(20),
        direction: 'incoming',
      },
    ],
  },
  {
    id: 'member-2',
    title: 'Sample Neighbour',
    subtitle: 'Neighbour · sample contact',
    memberIds: ['member-2'],
    messages: [
      {
        id: 'msg-8',
        authorId: 'member-2',
        authorName: 'Sample Neighbour',
        body: 'Shall I come by at 7 pm?',
        sentAt: hoursAgo(30),
        direction: 'incoming',
      },
      {
        id: 'msg-9',
        authorId: 'demo-user',
        authorName: 'Demo User',
        body: 'Yes, that is a good time for me.',
        sentAt: hoursAgo(29),
        direction: 'outgoing',
      },
    ],
  },
]
