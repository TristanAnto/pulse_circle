import { WelcomeSection } from '@/components/dashboard/WelcomeSection'
import { CircleMembers } from '@/components/dashboard/CircleMembers'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { EscalationStatus } from '@/components/dashboard/EscalationStatus'
import { checkInStatus, circleMembers, activityFeed, escalationSteps } from '@/data/mockData'
import { formatLongDate } from '@/lib/format'
import { useAuth } from '@/context/auth'

export function DashboardPage() {
  const { user } = useAuth()
  const firstName = user?.fullName ? user.fullName.split(' ')[0] : 'there'
  return (
    <section aria-labelledby="dashboard-heading">
      <h2 id="dashboard-heading" className="text-2xl font-semibold tracking-tight mb-6">
        Dashboard
      </h2>

      <div className="flex flex-col gap-5 sm:flex-row sm:gap-5 lg:gap-5">
        <div className="flex-1 flex flex-col gap-5 min-w-0">
          <WelcomeSection
            firstName={firstName}
            today={formatLongDate(new Date().toISOString())}
            state={checkInStatus.state}
            circleMembers={circleMembers}
            activityFeed={activityFeed}
          />
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2">
            <CircleMembers members={circleMembers} />
            <ActivityFeed items={activityFeed} />
          </div>
        </div>

        <div className="flex-shrink-0 sm:w-[280px]">
          <EscalationStatus steps={escalationSteps} activeAlert={false} />
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3 text-xs text-ink-muted text-center">
        Demonstration data only — using sample personas.
      </div>
    </section>
  )
}
