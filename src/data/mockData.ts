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
  id: 'lakshmi',
  name: 'Lakshmi Raman',
  firstName: 'Lakshmi',
  role: 'Living independently',
  addressArea: 'Anna Nagar, Chennai',
}

export const checkInStatus: CheckInStatus = {
  state: 'due',
  completedAt: daysAgo(1),
  nextScheduledAt: nextOccurrence(9, 0),
}

export const circleMembers: CircleMember[] = [
  {
    id: 'ravi',
    name: 'Ravi Kumar',
    role: 'neighbour',
    relationship: 'Neighbour · 2 doors away',
    presence: 'available',
    avatarTone: 'pulse',
  },
  {
    id: 'meena',
    name: 'Meena Sundar',
    role: 'neighbour',
    relationship: 'Neighbour · same street',
    presence: 'available',
    avatarTone: 'mint',
  },
  {
    id: 'priya',
    name: 'Priya Raman',
    role: 'family',
    relationship: 'Daughter · family contact',
    presence: 'available',
    avatarTone: 'amber',
  },
]

export const activityFeed: ActivityItem[] = [
  {
    id: 'activity-1',
    kind: 'message',
    actor: 'Priya Raman',
    summary: 'asked how your morning walk went.',
    occurredAt: minutesAgo(24),
  },
  {
    id: 'activity-2',
    kind: 'check-in',
    actor: 'Lakshmi Raman',
    summary: 'checked in successfully yesterday morning.',
    occurredAt: daysAgo(1),
  },
  {
    id: 'activity-3',
    kind: 'acknowledgement',
    actor: 'Ravi Kumar',
    summary: 'acknowledged the reminder for yesterday.',
    occurredAt: daysAgo(1),
  },
  {
    id: 'activity-4',
    kind: 'message',
    actor: 'Meena Sundar',
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
    detail: 'Ravi and Meena are asked to call or knock on your door.',
    window: 'After 4 hours',
    state: 'pending',
  },
  {
    id: 'step-4',
    title: 'Family escalation',
    detail: 'Priya is contacted and the circle coordinates next steps.',
    window: 'After 6 hours',
    state: 'pending',
  },
]

export const conversations: Conversation[] = [
  {
    id: 'circle-group',
    title: 'Circle group',
    subtitle: 'Priya, Ravi and Meena',
    memberIds: ['priya', 'ravi', 'meena'],
    messages: [
      {
        id: 'msg-1',
        authorId: 'priya',
        authorName: 'Priya Raman',
        body: 'Good morning Amma. Did you sleep well?',
        sentAt: minutesAgo(58),
        direction: 'incoming',
      },
      {
        id: 'msg-2',
        authorId: 'lakshmi',
        authorName: 'Lakshmi Raman',
        body: 'Yes, I slept well. I am having tea now.',
        sentAt: minutesAgo(52),
        direction: 'outgoing',
      },
      {
        id: 'msg-3',
        authorId: 'ravi',
        authorName: 'Ravi Kumar',
        body: 'I will be outside at 6 pm if you need anything from the market.',
        sentAt: minutesAgo(41),
        direction: 'incoming',
      },
      {
        id: 'msg-4',
        authorId: 'meena',
        authorName: 'Meena Sundar',
        body: 'I can bring some soup over this evening.',
        sentAt: minutesAgo(24),
        direction: 'incoming',
      },
    ],
  },
  {
    id: 'priya',
    title: 'Priya Raman',
    subtitle: 'Daughter · family contact',
    memberIds: ['priya'],
    messages: [
      {
        id: 'msg-5',
        authorId: 'priya',
        authorName: 'Priya Raman',
        body: 'Amma, remember to press the check-in button after breakfast.',
        sentAt: hoursAgo(3),
        direction: 'incoming',
      },
      {
        id: 'msg-6',
        authorId: 'lakshmi',
        authorName: 'Lakshmi Raman',
        body: 'I will do it after my walk.',
        sentAt: hoursAgo(2),
        direction: 'outgoing',
      },
    ],
  },
  {
    id: 'ravi',
    title: 'Ravi Kumar',
    subtitle: 'Neighbour · 2 doors away',
    memberIds: ['ravi'],
    messages: [
      {
        id: 'msg-7',
        authorId: 'ravi',
        authorName: 'Ravi Kumar',
        body: 'Aunty, the lift is fixed again. You can use it today.',
        sentAt: hoursAgo(20),
        direction: 'incoming',
      },
    ],
  },
  {
    id: 'meena',
    title: 'Meena Sundar',
    subtitle: 'Neighbour · same street',
    memberIds: ['meena'],
    messages: [
      {
        id: 'msg-8',
        authorId: 'meena',
        authorName: 'Meena Sundar',
        body: 'Shall I come by at 7 pm?',
        sentAt: hoursAgo(30),
        direction: 'incoming',
      },
      {
        id: 'msg-9',
        authorId: 'lakshmi',
        authorName: 'Lakshmi Raman',
        body: 'Yes, that is a good time for me.',
        sentAt: hoursAgo(29),
        direction: 'outgoing',
      },
    ],
  },
]
