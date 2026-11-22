import { ChevronRight, Eye, EyeOff, ShieldCheck, Users, HeartPulse } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { BrandMark } from '@/components/ui/BrandMark'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/cn'
import { useAuth } from '@/context/auth'
import { paths } from '@/routes/paths'

import React from 'react'

export function SignInPage() {
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo: string | null = (() => {
    const from = location.state?.from
    if (!from) {
      return null
    }
    const target =
      typeof from === 'string' ? from : from.pathname ?? '/'
    const search = typeof from !== 'string' ? from.search ?? '' : ''
    const hash = typeof from !== 'string' ? from.hash ?? '' : ''
    // Only allow internal, same-origin paths (no protocol/host).
    if (!target.startsWith('/') || target.includes('://')) {
      return null
    }
    return `${target}${search}${hash}`
  })()

  React.useEffect(() => {
    if (!loading && user) {
      navigate(redirectTo ?? paths.dashboard, { replace: true })
    }
  }, [loading, user, navigate, redirectTo])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const form = event.currentTarget
    const formData = new FormData(form)
    const email = (formData.get('email') ?? '').toString().trim().toLowerCase()
    const password = (formData.get('password') ?? '').toString()

    if (!email || !password) {
      setError('Please enter your email address and password.')
      setIsSubmitting(false)
      return
    }

    try {
      await login({ email, password })
      // Redirect to dashboard is handled by the useEffect above once `user` is set.
    } catch (err) {
      setError((err as Error).message ?? 'Login failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-pulse-700 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link to={paths.landing}>
            <BrandMark />
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-24">
        <div
          className={cn(
            'flex flex-col gap-10 sm:gap-12 items-center',
            'lg:flex-row lg:items-start lg:gap-12'
          )}
        >
          {/* Left: Branding section (desktop only two-column) */}
          <div className="flex flex-col gap-6 items-center text-center sm:text-center lg:text-left w-full lg:w-[44%]">
            <BrandMark className="mx-auto lg:mx-0" />
            <div className="space-y-3 max-w-xl sm:max-w-none lg:max-w-none">
              <p className="text-lg text-ink-muted sm:text-xl">
                Sign in to your Pulse Circle account.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-4 w-full sm:max-w-none lg:max-w-none">
              <div className="flex items-start gap-3">
                <HeartPulse className="size-5 text-pulse-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-ink">Daily check-ins</p>
                  <p className="text-sm text-ink-muted">
                    One tap tells your circle you are alright.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="size-5 text-pulse-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-ink">Calm escalation</p>
                  <p className="text-sm text-ink-muted">
                    Clear steps replace guesswork when a check-in is missed.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="size-5 text-pulse-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-ink">Trusted circle</p>
                  <p className="text-sm text-ink-muted">
                    Neighbours and family share one coordinated view.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Sign in form */}
          <div className="flex-1 w-full lg:w-[56%]">
            <Card className="mx-auto lg:mx-0 max-w-md lg:max-w-none">
              <div className="px-6 py-6 sm:px-8">
                <BrandMark compact className="mx-auto lg:mx-0 mb-4" />
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-center sm:text-4xl lg:text-left">
                  Sign in
                </h2>
                <p className="mt-3 text-center text-lg text-ink-muted sm:text-xl lg:text-left">
                  Enter your email and password below.
                </p>

                <form
                  onSubmit={handleSubmit}
                  className="mt-10 space-y-6 sm:space-y-8"
                  noValidate
                >
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-base font-semibold">
                      Email address
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="min-h-14 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base font-medium focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-base font-semibold">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        className="min-h-14 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base font-medium pr-12 focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-pressed={showPassword}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-3 flex items-center"
                      >
                        {showPassword ? (
                          <EyeOff aria-hidden="true" className="size-5 text-ink-muted" />
                        ) : (
                          <Eye aria-hidden="true" className="size-5 text-ink-muted" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      className="rounded border-line text-pulse-700 focus:ring-pulse-700"
                    />
                    <label htmlFor="remember-me" className="text-base">
                      Remember me on this device
                    </label>
                  </div>

                  {error ? (
                    <div className="mb-2">
                      <StatusBadge tone="danger">{error}</StatusBadge>
                    </div>
                  ) : null}

                  <p className="text-right">
                    <Link
                      to={paths.signIn}
                      className="text-sm font-semibold text-pulse-800 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </p>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Signing in…' : 'Sign in'}
                    <ChevronRight aria-hidden="true" className="size-5" />
                  </Button>
                </form>

                <p className="mt-8 text-center text-sm text-ink-muted">
                  Don’t have an account yet?{' '}
                  <Link
                    to={paths.register}
                    className="font-semibold text-pulse-800 underline underline-offset-2 hover:text-pulse-900"
                  >
                    Create an account
                  </Link>
                </p>

                <div className="border-t border-line bg-surface-muted px-6 py-4 text-center sm:px-8">
                  <p className="text-sm text-ink-muted">
                    Demonstration only — accounts are created against the backend API.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
