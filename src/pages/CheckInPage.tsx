import {
  Clock,
  ClipboardCheck,
  Sparkles,
} from 'lucide-react'

import { api } from '@/lib/api'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatClock, formatShortDate } from '@/lib/format'
import { useAuth } from '@/context/auth'

import React from 'react'

type RealCircle = {
  id: string
  name: string
  description: string | null
}

type CheckInResult = {
  success: boolean
  checkedInAt?: string
  alreadyCheckedIn?: boolean
  error?: string
}

export function CheckInPage() {
  const { user } = useAuth()
  const [circles, setCircles] = React.useState<RealCircle[] | null>(null)
  const [circlesError, setCirclesError] = React.useState<string | null>(null)
  const [checkInResults, setCheckInResults] = React.useState<
    Record<string, CheckInResult>
  >({})
  const [isCheckingIn, setIsCheckingIn] = React.useState(false)

  // Load the user's circles so we know where to submit check-ins.
  React.useEffect(() => {
    if (!user) {
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const data = (await api.get('/api/circles')) as {
          circles: RealCircle[]
        }
        if (!cancelled) {
          setCircles(data.circles)
          setCirclesError(null)
        }
      } catch {
        if (!cancelled) {
          setCircles(null)
          setCirclesError('Unable to load your circles.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const handleCheckIn = async () => {
    if (!circles || circles.length === 0) return

    setIsCheckingIn(true)
    const results: Record<string, CheckInResult> = {}

    // Submit to each circle sequentially so a single failure doesn't block
    // the others. Every circle gets its own request.
    for (const circle of circles) {
      try {
        const data = (await api.post(
          `/api/circles/${circle.id}/check-in`,
          {},
        )) as {
          success: boolean
          alreadyCheckedIn: boolean
          checkIn: { checkedInAt: string }
        }
        results[circle.id] = {
          success: true,
          alreadyCheckedIn: data.alreadyCheckedIn,
          checkedInAt: data.checkIn.checkedInAt,
        }
      } catch (err) {
        results[circle.id] = {
          success: false,
          error:
            err instanceof Error ? err.message : 'Check-in failed.',
        }
      }
    }

    setCheckInResults(results)
    setIsCheckingIn(false)
  }

  const hasResults = Object.keys(checkInResults).length > 0
  const allSucceeded =
    hasResults &&
    Object.values(checkInResults).every((r) => r.success)
  const anySucceeded = Object.values(checkInResults).some((r) => r.success)
  const latestCheckedInAt = Object.values(checkInResults)
    .filter((r) => r.checkedInAt)
    .map((r) => r.checkedInAt!)
    .sort()
    .pop()

  return (
    <section aria-labelledby="checkin-heading">
      <h2 id="checkin-heading" className="text-2xl font-semibold tracking-tight mb-6">
        Daily check-in
      </h2>

      <Card className="flex flex-col gap-5 w-full lg:max-w-5xl mx-auto">
        <CardHeader
          description="Press the button below when you are up and about. Your trusted circle will see that you checked in today — no message needs to be typed."
          icon={<ClipboardCheck className="size-5" />}
          action={
            <StatusBadge
              tone={
                hasResults
                  ? allSucceeded
                    ? 'success'
                    : anySucceeded
                      ? 'attention'
                      : 'danger'
                  : 'attention'
              }
            >
              {hasResults
                ? allSucceeded
                  ? 'Checked in'
                  : anySucceeded
                    ? 'Partially checked in'
                    : 'Check-in failed'
                : circles
                  ? 'Waiting for you'
                  : 'Loading…'}
            </StatusBadge>
          }
        />

        {!circles && !circlesError && !hasResults && (
          <div className="px-5 py-3 text-center text-lg text-ink-muted">
            Loading your circles…
          </div>
        )}

        {circlesError && (
          <div className="px-5 py-3 text-center text-lg text-danger">
            {circlesError}
          </div>
        )}

        {circles && circles.length > 0 && !hasResults && (
          <div>
            <p className="px-5 text-lg text-ink-muted">
              You belong to <strong>{circles.length} circle</strong>{
                circles.length !== 1 ? 's' : ''
              }. Check in below to let everyone know you are alright.
            </p>

            <div className="px-5 py-3">
              <button
                onClick={handleCheckIn}
                disabled={isCheckingIn}
                className={`w-full min-h-14 rounded-xl border-2 ${
                  isCheckingIn
                    ? 'border-pulse-400 bg-pulse-400 text-white opacity-70 cursor-not-allowed'
                    : 'border-pulse-700 bg-pulse-700 text-white hover:bg-pulse-800 active:bg-pulse-900'
                } text-lg font-semibold shadow-card transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pulse-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed`}
              >
                {isCheckingIn ? (
                  <>
                    <span className="mr-2">Checking in…</span>
                    <Sparkles
                      aria-hidden="true"
                      className="size-5 animate-spin"
                    />
                  </>
                ) : (
                  <>
                    <Sparkles aria-hidden="true" className="size-5" />
                    <span>Check in now</span>
                  </>
                )}
              </button>
            </div>

            <div className="border-t border-line pt-4 px-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Clock aria-hidden="true" className="size-4" />
                Circles to check in
              </div>
              <ul className="px-5 space-y-2">
                {circles.map((circle) => (
                  <li
                    key={circle.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-line"
                  >
                    <span className="text-sm text-ink">{circle.name}</span>
                    <span className="text-[10px] font-semibold text-ink-muted">
                      Not checked in today
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {hasResults && (
          <div>
            <div className="px-5 py-3">
              <p className="text-lg font-semibold text-ink">
                Check-in results
              </p>
              <p className="text-sm text-ink-muted">
                {allSucceeded
                  ? 'Checked in to all your circles.'
                  : anySucceeded
                    ? 'Some check-ins succeeded. Others failed — try again.'
                    : 'All check-ins failed. Please try again.'}
              </p>
            </div>

            <div className="border-t border-line pt-4 px-5 space-y-2">
              <ul className="px-5 space-y-2">
                {circles?.map((circle) => {
                  const result = checkInResults[circle.id]
                  return (
                    <li
                      key={circle.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-line"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm text-ink truncate">
                          {circle.name}
                        </span>
                        {result?.alreadyCheckedIn && (
                          <span className="text-[10px] font-semibold text-ink-muted">
                            Already checked in
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {result?.success ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="size-2 rounded-full bg-pulse-600"
                            />
                            <span className="text-[10px] font-semibold text-pulse-800">
                              Checked in
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              aria-hidden="true"
                              className="size-2 rounded-full bg-danger-500"
                            />
                            <span className="text-[10px] font-semibold text-danger">
                              Failed
                            </span>
                          </>
                        )}
                        {result?.checkedInAt && (
                          <span className="text-[10px] text-ink-muted">
                            {formatShortDate(result.checkedInAt)},{' '}
                            {formatClock(result.checkedInAt)}
                          </span>
                        )}
                        {result?.error && (
                          <span className="text-[10px] text-danger">
                            {result.error}
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            {latestCheckedInAt && (
              <div className="border-t border-line pt-4 px-5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Clock aria-hidden="true" className="size-4" />
                  Last successful check-in
                </div>
                <p className="text-sm text-ink-muted">
                  {formatShortDate(latestCheckedInAt)},{' '}
                  {formatClock(latestCheckedInAt)}
                </p>
              </div>
            )}

            <div className="px-5 py-3">
              <button
                onClick={handleCheckIn}
                disabled={isCheckingIn}
                className={`w-full min-h-14 rounded-xl border-2 ${
                  isCheckingIn
                    ? 'border-pulse-400 bg-pulse-400 text-white opacity-70 cursor-not-allowed'
                    : 'border-pulse-700 bg-pulse-700 text-white hover:bg-pulse-800 active:bg-pulse-900'
                } text-lg font-semibold shadow-card transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pulse-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed`}
              >
                {isCheckingIn ? (
                  <>
                    <span className="mr-2">Checking in…</span>
                    <Sparkles
                      aria-hidden="true"
                      className="size-5 animate-spin"
                    />
                  </>
                ) : (
                  <>
                    <Sparkles aria-hidden="true" className="size-5" />
                    <span>Check in again</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {circles && circles.length === 0 && !hasResults && (
          <div className="px-5 py-3 text-center text-lg text-ink-muted">
            You don't belong to any circles yet. Create or join a circle to check in.
          </div>
        )}
      </Card>

      {!circles && !circlesError && !hasResults && (
        <div className="mt-4 border-t border-line pt-3 text-xs text-ink-muted text-center">
          Loading…
        </div>
      )}
    </section>
  )
}
