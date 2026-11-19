import { ClipboardCheck, Clock, ShieldAlert } from 'lucide-react'

import { ButtonLink } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatClock, formatShortDate } from '@/lib/format'
import { paths } from '@/routes/paths'
import type { CheckInStatus } from '@/types'

type CheckInCardProps = {
  status: CheckInStatus
}

export function CheckInCard({ status }: CheckInCardProps) {
  const isComplete = status.state === 'completed'

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Today's check-in"
        description="One tap tells your circle you are alright."
        icon={<ClipboardCheck className="size-5" />}
        action={
          <StatusBadge tone={isComplete ? 'success' : 'attention'}>
            {isComplete ? 'Complete' : 'Waiting for you'}
          </StatusBadge>
        }
      />

      <div className="flex flex-1 flex-col gap-5 px-5 py-5 sm:px-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-surface-muted px-4 py-3">
            <dt className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
              <Clock aria-hidden="true" className="size-4" />
              Last successful check-in
            </dt>
            <dd className="mt-1 font-semibold">
              {status.completedAt
                ? `${formatShortDate(status.completedAt)}, ${formatClock(status.completedAt)}`
                : 'Not recorded yet'}
            </dd>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3">
            <dt className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
              <ShieldAlert aria-hidden="true" className="size-4" />
              Next scheduled check-in
            </dt>
            <dd className="mt-1 font-semibold">
              {formatShortDate(status.nextScheduledAt)},{' '}
              {formatClock(status.nextScheduledAt)}
            </dd>
          </div>
        </dl>

        <div className="mt-auto">
          <ButtonLink to={paths.checkIn} size="lg" className="w-full sm:w-auto">
            <ClipboardCheck aria-hidden="true" className="size-5" />
            {isComplete ? 'View check-in' : 'Check in now'}
          </ButtonLink>
        </div>
      </div>
    </Card>
  )
}
