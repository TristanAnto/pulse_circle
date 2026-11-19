import {
  Clock,
  ClipboardCheck,
  Sparkles,
} from 'lucide-react'

import { Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatClock, formatShortDate } from '@/lib/format'
import { checkInStatus } from '@/data/mockData'

import React from 'react'

export function CheckInPage() {
  const [checkedInAt, setCheckedInAt] = React.useState<string | null>(null)

  const handleCheckIn = () => {
    setCheckedInAt(new Date().toISOString())
  }

  const handleReset = () => {
    setCheckedInAt(null)
  }

  const isComplete = checkedInAt !== null

  return (
    <section aria-labelledby="checkin-heading">
      <h2 id="checkin-heading" className="sr-only">Daily check-in</h2>

      <Card className="flex flex-col gap-5 max-w-2xl mx-auto">
        <CardHeader
          title="Daily check-in"
          description="One tap tells your circle you are alright."
          icon={<ClipboardCheck className="size-5" />}
          action={
            <StatusBadge tone={isComplete ? 'success' : 'attention'}>
              {isComplete ? 'Checked in' : 'Waiting for you'}
            </StatusBadge>
          }
        />

        {!isComplete && (
          <div>
            <p className="px-5 text-lg text-ink-muted">
              Press the button below when you are up and about. Your trusted
              circle will see that you checked in today — no message needs to
              be typed.
            </p>

            <div className="px-5 py-3">
              <ButtonCheckIn
                onCheckIn={handleCheckIn}
                label="Check in now"
                icon={<Sparkles aria-hidden="true" className="size-5" />}
              />
            </div>

            <div className="border-t border-line pt-4 px-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Clock aria-hidden="true" className="size-4" />
                Last successful check-in
              </div>
              <p className="text-sm text-ink-muted">
                {checkInStatus.completedAt
                  ? `${formatShortDate(checkInStatus.completedAt)}, ${formatClock(checkInStatus.completedAt)}`
                  : 'Not recorded yet'}
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Clock aria-hidden="true" className="size-4" />
                Next scheduled check-in
              </div>
              <p className="text-sm text-ink-muted">
                {formatShortDate(checkInStatus.nextScheduledAt)},{' '}
                {formatClock(checkInStatus.nextScheduledAt)}
              </p>
            </div>
          </div>
        )}

        {isComplete && (
          <div className="rounded-xl border border-pulse-200 bg-pulse-50 px-5 py-5 shadow-card">
            <div className="flex items-start gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-pulse-500 text-white shrink-0">
                <ClipboardCheck aria-hidden="true" className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Check-in recorded</h3>
                <p className="text-sm text-pulse-800">
                  Your circle can see you checked in at{' '}
                  {formatClock(checkedInAt)} on{' '}
                  {formatShortDate(checkedInAt)}.
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-pulse-700">
              This was recorded locally in this demonstration. No alert was
              raised and no notification was sent to anyone.
            </p>
            <button
              onClick={handleReset}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold text-pulse-800 hover:bg-pulse-50"
            >
              <ClipboardCheck aria-hidden="true" className="mr-2 size-4" />
              Record another check-in
            </button>
          </div>
        )}
      </Card>

      <div className="mt-4 border-t border-line pt-3 text-xs text-ink-muted text-center max-w-2xl mx-auto">
        Local demonstration state only — nothing is stored on a server.
      </div>
    </section>
  )
}

function ButtonCheckIn({
  onCheckIn,
  label,
  icon,
}: {
  onCheckIn: () => void
  label: string
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onCheckIn}
      className="w-full min-h-14 rounded-xl border-2 border-pulse-700 bg-pulse-700 text-white text-lg font-semibold shadow-card hover:bg-pulse-800 active:bg-pulse-900 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pulse-700 focus-visible:ring-offset-2"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
