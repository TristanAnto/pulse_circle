import {
  ClipboardCheck,
  MessageSquareText,
} from 'lucide-react'

import { WelcomeSection } from '@/components/dashboard/WelcomeSection'
import { CheckInCard } from '@/components/dashboard/CheckInCard'
import { CircleMembers } from '@/components/dashboard/CircleMembers'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { EscalationStatus } from '@/components/dashboard/EscalationStatus'
import { ButtonLink } from '@/components/ui/Button'
import { checkInStatus, circleMembers, activityFeed, escalationSteps } from '@/data/mockData'
import { formatLongDate } from '@/lib/format'
import { paths } from '@/routes/paths'

export function DashboardPage() {
  return (
    <section aria-labelledby="dashboard-heading">
      <h2 id="dashboard-heading" className="sr-only">
        Dashboard
      </h2>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <WelcomeSection
          className="lg:col-span-2"
          firstName="Lakshmi"
          today={formatLongDate(new Date().toISOString())}
          state={checkInStatus.state}
        />
        <CheckInCard status={checkInStatus} />
        <EscalationStatus steps={escalationSteps} activeAlert={false} />
        <CircleMembers members={circleMembers} />
        <ActivityFeed items={activityFeed} />
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <ButtonLink to={paths.checkIn} size="lg" className="flex-1">
          <ClipboardCheck aria-hidden="true" className="size-5" />
          Check in now
        </ButtonLink>
        <ButtonLink
          to={paths.messages}
          size="lg"
          variant="secondary"
          className="flex-1"
        >
          <MessageSquareText aria-hidden="true" className="size-5" />
          Open messages
        </ButtonLink>
      </div>

      <div className="mt-4 border-t border-line pt-3 text-xs text-ink-muted text-center">
        Demonstration data only — using sample personas Lakshmi, Ravi, Meena and Priya.
      </div>
    </section>
  )
}
