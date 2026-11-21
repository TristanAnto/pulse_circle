import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { BrandMark } from '@/components/ui/BrandMark'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/lib/api'
import { useAuth } from '@/context/auth'
import { paths } from '@/routes/paths'

type AcceptInviteState =
  | 'idle'
  | 'accepting'
  | 'declining'
  | 'accepted'
  | 'declined'
  | 'error'

export function AcceptInvitePage() {
  const [state, setState] = useState<AcceptInviteState>('idle')
  const [error, setError] = useState<string | null>(null)
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const searchParams = new URLSearchParams(location.search)
  const token = searchParams.get('token')

  const handleAccept = async (): Promise<void> => {
    if (!token) {
      setError('Invitation token is missing.')
      setState('error')
      return
    }
    setState('accepting')
    setError(null)
    try {
      await api.post('/api/invitations/accept', { token })
      setState('accepted')
    } catch (err) {
      setState('error')
      setError(
        (err as Error).message ?? 'Failed to accept invitation. Please try again.',
      )
    }
  }

  const handleDecline = async (): Promise<void> => {
    if (!token) {
      setError('Invitation token is missing.')
      setState('error')
      return
    }
    setState('declining')
    setError(null)
    try {
      await api.post('/api/invitations/decline', { token })
      setState('declined')
    } catch (err) {
      setState('error')
      setError(
        (err as Error).message ?? 'Failed to decline invitation. Please try again.',
      )
    }
  }

  const handleSignIn = (): void => {
    navigate(paths.signIn)
  }

  if (loading) {
    return (
      <div className="min-h-svh bg-canvas flex items-center justify-center">
        <p className="text-ink-muted">Loading…</p>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="min-h-svh bg-canvas">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
            <BrandMark />
          </div>
        </header>
        <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
          <Card className="mx-auto max-w-sm sm:max-w-none">
            <div className="px-6 py-6 sm:px-8">
              <h2 className="text-lg font-semibold">Invitation not found</h2>
              <p className="mt-3 text-sm text-ink-muted">
                No invitation token was provided. Please check your invitation link.
              </p>
            </div>
          </Card>
        </main>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-svh bg-canvas">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
            <BrandMark />
          </div>
        </header>
        <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
          <Card className="mx-auto max-w-sm sm:max-w-none">
            <div className="px-6 py-6 sm:px-8">
              <h2 className="text-lg font-semibold">Sign in to accept invitation</h2>
              <p className="mt-3 text-sm text-ink-muted">
                You must be signed in to accept or decline this invitation.
              </p>
              <Button
                onClick={handleSignIn}
                size="md"
                className="mt-6 w-full"
              >
                Sign in
              </Button>
            </div>
          </Card>
        </main>
      </div>
    )
  }

  if (state === 'accepted') {
    return (
      <div className="min-h-svh bg-canvas">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
            <BrandMark />
          </div>
        </header>
        <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
          <Card className="mx-auto max-w-sm sm:max-w-none">
            <div className="px-6 py-6 sm:px-8">
              <StatusBadge tone="success" className="mb-4">
                Invitation accepted
              </StatusBadge>
              <h2 className="text-lg font-semibold">You’ve joined the circle.</h2>
              <p className="mt-3 text-sm text-ink-muted">
                You can now view and message in the circle from Messages.
              </p>
              <Button
                onClick={() => navigate(paths.messages)}
                size="md"
                className="mt-6 w-full"
              >
                Go to Messages
              </Button>
            </div>
          </Card>
        </main>
      </div>
    )
  }

  if (state === 'declined') {
    return (
      <div className="min-h-svh bg-canvas">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
            <BrandMark />
          </div>
        </header>
        <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
          <Card className="mx-auto max-w-sm sm:max-w-none">
            <div className="px-6 py-6 sm:px-8">
              <StatusBadge tone="danger" className="mb-4">
                Invitation declined
              </StatusBadge>
              <h2 className="text-lg font-semibold">Invitation declined.</h2>
              <p className="mt-3 text-sm text-ink-muted">
                You will not be added to the circle.
              </p>
            </div>
          </Card>
        </main>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-svh bg-canvas">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
            <BrandMark />
          </div>
        </header>
        <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
          <Card className="mx-auto max-w-sm sm:max-w-none">
            <div className="px-6 py-6 sm:px-8">
              <StatusBadge tone="danger" className="mb-4">
                {error}
              </StatusBadge>
              <Button
                onClick={() => setState('idle')}
                size="md"
                className="mt-6 w-full"
              >
                Try again
              </Button>
            </div>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
          <BrandMark />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
        <Card className="mx-auto max-w-sm sm:max-w-none">
          <div className="px-6 py-6 sm:px-8">
            <h2 className="text-lg font-semibold">Accept invitation</h2>
            <p className="mt-3 text-sm text-ink-muted">
              Accepting this invitation will add you to the circle. You’ll be able
              to view and message in the circle from Messages.
            </p>
            {error && (
              <div className="mt-4">
                <StatusBadge tone="danger">{error}</StatusBadge>
              </div>
            )}
            <div className="mt-8 space-y-3">
              <Button
                onClick={handleAccept}
                size="md"
                className="w-full"
                disabled={state === 'accepting' || state === 'declining'}
              >
                {state === 'accepting' ? 'Accepting…' : 'Accept'}
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={handleDecline}
                className="w-full"
                disabled={state === 'accepting' || state === 'declining'}
              >
                {state === 'declining' ? 'Declining…' : 'Decline'}
              </Button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  )
}
