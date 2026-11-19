import { CalendarDays } from 'lucide-react'

import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/cn'
import type { CheckInState } from '@/types'

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
}

export function WelcomeSection({ firstName, today, state, className }: WelcomeSectionProps) {
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
    </section>
  )
}
