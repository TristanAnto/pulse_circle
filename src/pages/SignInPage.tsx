import { ChevronRight, Eye, EyeOff, Info } from 'lucide-react'
import { Link } from 'react-router-dom'

import { BrandMark } from '@/components/ui/BrandMark'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { paths } from '@/routes/paths'

import React from 'react'

export function SignInPage() {
  const [showPassword, setShowPassword] = React.useState(false)
  const [notice, setNotice] = React.useState<{ text: string } | null>(null)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice({
      text: 'Demonstration only: authentication is not connected. Entering email and password will not sign you in anywhere.',
    })
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
              Welcome back
            </h2>
            <p className="mt-3 text-center text-lg text-ink-muted sm:text-xl">
              Sign in to your Pulse Circle account.
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

              <p className="text-right">
                <Link
                  to={paths.landing}
                  className="text-sm font-semibold text-pulse-800 hover:underline"
                >
                  Forgot password?
                </Link>
              </p>

              <Button type="submit" size="lg" className="w-full">
                Sign in
                <ChevronRight aria-hidden="true" className="size-5" />
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-ink-muted">
              Don’t have an account yet?{' '}
              <Link
                to={paths.landing}
                className="font-semibold text-pulse-800 underline underline-offset-2 hover:text-pulse-900"
              >
                Start here
              </Link>
            </p>
          </div>

          {notice ? (
            <div className="border-t border-line bg-surface-muted px-6 py-4 sm:px-8">
              <p className="flex items-center gap-2 text-sm text-pulse-800">
                <Info aria-hidden="true" className="size-5" />
                <span>{notice.text}</span>
              </p>
            </div>
          ) : null}

          <div className="border-t border-line bg-surface-muted px-6 py-4 text-center sm:px-8">
            <p className="text-sm text-ink-muted">
              Demonstration only — no real account is created and nothing is sent to a server.
            </p>
          </div>
        </Card>
      </main>
    </div>
  )
}
