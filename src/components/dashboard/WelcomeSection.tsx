import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  MessageSquareText,
  Users,
} from 'lucide-react'

import { ButtonLink } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/cn'
import { paths } from '@/routes/paths'
import type { ActivityItem, CheckInState, CircleMember } from '@/types'

const stateCopy: Record<CheckInState, { tone: 'success' | 'attention' | 'danger'; label: string }> = {
  completed: { tone: 'success', label: 'Checked in today' },
  due: { tone: 'attention', label: 'Check-in due today' },
  overdue: { tone: 'danger', label: 'Check-in overdue' },
}

type WelcomeSectionProps = {
  firstName: string
  today: string
  state: CheckInState
  className?: string
  circleMembers?: CircleMember[]
  activityFeed?: ActivityItem[]
}

export function WelcomeSection({
  firstName,
  today,
  state,
  className,
  circleMembers,
  activityFeed,
}: WelcomeSectionProps) {
  const copy = stateCopy[state]
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
      <section aria-labelledby="welcome-heading" className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <h2
          id="welcome-heading"
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {greeting}, {firstName}
        </h2>
        <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
      </div>
      <p className="flex items-center gap-2 text-ink-muted">
        <CalendarDays aria-hidden="true" className="size-5 text-pulse-700" />
        <span>{today}</span>
      </p>
      <p className="max-w-2xl text-ink-muted">
        Your circle can see your daily check-in. You are in control of when you
        share it.
      </p>

      <section aria-labelledby="care-overview-heading" className="mt-4 pt-4 border-t border-line">
        <h3 id="care-overview-heading" className="text-sm font-semibold text-ink">
          Your Daily Care Overview
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-muted p-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-pulse-700" aria-hidden="true" />
              <span className="text-xs font-semibold text-ink-muted">Check-in</span>
            </div>
            <p className="mt-1 text-sm font-semibold">{copy.label}</p>
          </div>
          <div className="rounded-xl bg-surface-muted p-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-pulse-700" aria-hidden="true" />
              <span className="text-xs font-semibold text-ink-muted">Circle members</span>
            </div>
            <p className="mt-1 text-sm font-semibold">
              {circleMembers?.length ?? 0}
            </p>
          </div>
          <div className="rounded-xl bg-surface-muted p-3">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-pulse-700" aria-hidden="true" />
              <span className="text-xs font-semibold text-ink-muted">Recent activity</span>
            </div>
            <p className="mt-1 text-sm font-semibold">
              {activityFeed?.length ?? 0}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <ButtonLink
            to={paths.checkIn}
            size="sm"
            className="flex-1"
          >
            <ClipboardCheck className="size-4" aria-hidden="true" />
            Check in now
          </ButtonLink>
          <ButtonLink
            to={paths.messages}
            size="sm"
            variant="secondary"
            className="flex-1"
          >
            <MessageSquareText className="size-4" aria-hidden="true" />
            Open messages
          </ButtonLink>
        </div>

        <p className="mt-4 max-w-2xl text-sm text-ink-muted italic">
          A daily check-in takes less than a minute, and it brings peace of mind
          to everyone who cares about you.
        </p>
      </section>
    </section>
  )
}
