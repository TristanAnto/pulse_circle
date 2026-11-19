import { Link } from 'react-router-dom'

import { BrandMark } from '@/components/ui/BrandMark'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { paths } from '@/routes/paths'

export function NotFoundPage() {
  return (
    <section aria-labelledby="notfound-heading">
      <h1 id="notfound-heading" className="sr-only">
        Page not found
      </h1>

      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-6 px-4 py-20 sm:px-6">
        <Card className="p-12 text-center sm:p-16">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-pulse-50 text-pulse-800 mx-auto">
            <span aria-hidden="true" className="text-6xl">
              404
            </span>
          </div>
          <h2 className="mt-8 text-3xl font-semibold tracking-tight text-ink">
            Page not found
          </h2>
          <p className="mt-4 max-w-sm text-lg text-ink-muted">
            We couldn’t find that page. Return to the dashboard or start at the
            beginning.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <ButtonLink to={paths.dashboard} size="lg" className="flex-1 sm:flex-none">
              Go to dashboard
            </ButtonLink>
            <ButtonLink
              to={paths.landing}
              size="lg"
              variant="secondary"
              className="flex-1 sm:flex-none"
            >
              Start here
            </ButtonLink>
          </div>
          <p className="mt-6 text-sm text-ink-muted">
            Pulse Circle prototype · Demonstration data only
          </p>
        </Card>
      </div>

      <div className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to={paths.landing}>
            <BrandMark />
          </Link>
        </div>
      </div>
    </section>
  )
}
