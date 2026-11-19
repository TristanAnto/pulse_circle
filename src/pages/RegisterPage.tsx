import { ChevronRight, Eye, EyeOff } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { BrandMark } from '@/components/ui/BrandMark'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/context/auth'
import { paths } from '@/routes/paths'

import React from 'react'

export function RegisterPage() {
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const { register, user, loading } = useAuth()
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
    const fullName = (formData.get('full-name') ?? '').toString().trim()
    const email = (formData.get('email') ?? '').toString().trim().toLowerCase()
    const password = (formData.get('password') ?? '').toString()
    const confirmPassword = (formData.get('confirm-password') ?? '').toString()

    if (!fullName || !email || !password || !confirmPassword) {
      setError('All fields are required.')
      setIsSubmitting(false)
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      setIsSubmitting(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      setIsSubmitting(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setIsSubmitting(false)
      return
    }

    try {
      await register({ fullName, email, password })
      // Redirect to dashboard is handled by the useEffect above once `user` is set.
    } catch (err) {
      setError((err as Error).message ?? 'Registration failed. Please try again.')
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
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link to={paths.landing}>
            <BrandMark />
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
        <Card className="mx-auto max-w-sm sm:max-w-none">
          <div className="px-6 py-6 sm:px-8">
            <BrandMark />
            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-center sm:text-4xl">
              Create an account
            </h2>
            <p className="mt-3 text-center text-lg text-ink-muted sm:text-xl">
              Join Pulse Circle and connect with your trusted circle.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-10 space-y-6 sm:space-y-8"
              noValidate
            >
              <div className="space-y-2">
                <label htmlFor="full-name" className="block text-base font-semibold">
                  Full name
                </label>
                <input
                  id="full-name"
                  name="full-name"
                  type="text"
                  autoComplete="name"
                  required
                  className="min-h-14 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base font-medium focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700"
                />
              </div>

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
                    autoComplete="new-password"
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

              <div className="space-y-2">
                <label htmlFor="confirm-password" className="block text-base font-semibold">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    className="min-h-14 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base font-medium pr-12 focus:border-pulse-700 focus:ring-2 focus:ring-pulse-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((s) => !s)}
                    aria-pressed={showConfirmPassword}
                    aria-label={
                      showConfirmPassword
                        ? 'Hide confirm password'
                        : 'Show confirm password'
                    }
                    className="absolute inset-y-0 right-3 flex items-center"
                  >
                    {showConfirmPassword ? (
                      <EyeOff aria-hidden="true" className="size-5 text-ink-muted" />
                    ) : (
                      <Eye aria-hidden="true" className="size-5 text-ink-muted" />
                    )}
                  </button>
                </div>
              </div>

              {error ? (
                <div className="mb-2">
                  <StatusBadge tone="danger">{error}</StatusBadge>
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating account…' : 'Create account'}
                <ChevronRight aria-hidden="true" className="size-5" />
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-ink-muted">
              Already have an account?{' '}
              <Link
                to={paths.signIn}
                className="font-semibold text-pulse-800 underline underline-offset-2 hover:text-pulse-900"
              >
                Sign in
              </Link>
            </p>

            <div className="border-t border-line bg-surface-muted px-6 py-4 text-center sm:px-8">
              <p className="text-sm text-ink-muted">
                Public registration does not assign circle roles. Roles are managed separately.
              </p>
            </div>
          </div>
        </Card>
      </main>
    </div>
  )
}
