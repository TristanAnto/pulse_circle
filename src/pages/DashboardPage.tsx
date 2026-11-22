import { WelcomeSection } from '@/components/dashboard/WelcomeSection'
import { CircleMembers } from '@/components/dashboard/CircleMembers'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { EscalationStatus } from '@/components/dashboard/EscalationStatus'
import { activityFeed, escalationSteps } from '@/data/mockData'
import { formatLongDate } from '@/lib/format'
import { api } from '@/lib/api'
import { useAuth } from '@/context/auth'
import type { CircleMember, CheckInState, MemberRole } from '@/types'

import React from 'react'

type RealCircle = {
  id: string
  name: string
  description: string | null
  role: string
  unreadCount: number
}

type BackendMember = {
  userId: string
  fullName: string
  role: string
  joinedAt: string
  checkedInToday: boolean
  checkedInAt: string | null
}

export function DashboardPage() {
  const { user } = useAuth()
  const [allMembers, setAllMembers] = React.useState<CircleMember[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!user) {
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const circleData = (await api.get('/api/circles')) as {
          circles: RealCircle[]
        }
        if (!cancelled) {
          const memberPromises = circleData.circles.map(async (c) => {
            const memberData = (await api.get(
              `/api/circles/${c.id}/members`,
            )) as { members: BackendMember[] }
            return memberData.members.map((m): CircleMember => ({
              id: m.userId,
              name: m.fullName,
              role: mapBackendRole(m.role),
              relationship: '',
              presence: 'available',
              avatarTone: 'pulse',
              checkedInToday: m.checkedInToday,
              checkedInAt: m.checkedInAt,
            }))
          })

          const memberLists = await Promise.all(memberPromises)
          setAllMembers(memberLists.flat())
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  const currentUserMember = allMembers.find((m) => m.id === user?.id)
  const checkInState: CheckInState = currentUserMember?.checkedInToday
    ? 'completed'
    : 'due'
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
            state={checkInState}
            circleMembers={allMembers}
            activityFeed={activityFeed}
          />
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2">
            <CircleMembers members={allMembers} />
            <ActivityFeed items={activityFeed} />
          </div>
        </div>

        <div className="flex-shrink-0 sm:w-[280px]">
          <EscalationStatus steps={escalationSteps} activeAlert={false} />
        </div>
      </div>

      {loading ? (
        <div className="mt-4 text-center text-xs text-ink-muted">
          Loading your circles…
        </div>
      ) : (
        <div className="mt-4 border-t border-line pt-3 text-xs text-ink-muted text-center">
          Real data from your circles.
        </div>
      )}
    </section>
  )
}

function mapBackendRole(role: string): MemberRole {
  switch (role) {
    case 'ELDER':
    case 'ADMIN':
      return 'elderly'
    case 'NEIGHBOR':
      return 'neighbour'
    case 'FAMILY':
    case 'EMERGENCY_CONTACT':
      return 'family'
    default:
      return 'neighbour'
  }
}
