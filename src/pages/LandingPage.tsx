import {
  ArrowRight,
  BellRing,
  Check,
  ClipboardCheck,
  HeartHandshake,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Avatar } from '@/components/ui/Avatar'
import { BrandMark } from '@/components/ui/BrandMark'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { circleMembers, demoUser } from '@/data/mockData'
import { paths } from '@/routes/paths'

const howItWorks = [
  {
    icon: ClipboardCheck,
    title: 'Daily check-in',
    description:
      'A simple way to record that you are doing alright each day.',
  },
  {
    icon: Users,
    title: 'Your circle sees it',
    description:
      'Trusted neighbours and family see the check-in in their own view, so nobody has to ask.',
  },
  {
    icon: BellRing,
    title: 'Calm escalation',
    description:
      'If a check-in is missed, the circle is guided through clear steps instead of guesswork.',
  },
]

const benefits = [
  {
    icon: ShieldCheck,
    title: 'Reassurance without surveillance',
    description:
      'The circle is informed, not intrusive. There is no location tracking and no camera access.',
  },
  {
    icon: HeartHandshake,
    title: 'Neighbours and family together',
    description:
      'Neighbours who are minutes away and family who are far away share one coordinated view.',
  },
  {
    icon: MessageSquareText,
    title: 'Conversation that stays familiar',
    description:
      'A single group chat keeps everyone on the same page, with large text and clear timestamps.',
  },
]

const privacyPoints = [
  'Check-in history is shared only with the circle you approve.',
  'Fewer permissions: no location tracking, no background sensors.',
  'You can review and change who is in your circle at any time.',
  'Accessible controls designed with older adults, not around them.',
]

export function LandingPage() {
  return (
    <div className="min-h-svh bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-pulse-700 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to={paths.landing} className="rounded-xl">
            <BrandMark />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link
              to={paths.signIn}
              className="inline-flex min-h-12 items-center rounded-xl px-4 font-semibold text-pulse-800 hover:bg-pulse-50"
            >
              Sign in
            </Link>
            <ButtonLink to={paths.signIn} variant="primary" className="hidden sm:inline-flex">
              Get started
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section aria-labelledby="hero-heading" className="border-b border-line">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-20">
            <div>
              <StatusBadge tone="info">
                Daily check-ins for independent living
              </StatusBadge>
              <h1
                id="hero-heading"
                className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl"
              >
                A quiet daily signal that says{' '}
                <span className="text-pulse-700">“I’m alright.”</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-ink-muted">
                Pulse Circle connects older adults living alone with trusted
                neighbours and family. One check-in a day keeps everyone close,
                and a clear escalation path replaces worry with a plan.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink to={paths.signIn} size="lg">
                  Get started
                  <ArrowRight aria-hidden="true" className="size-5" />
                </ButtonLink>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => {
                    document
                      .getElementById('how-it-works')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  Learn more
                </Button>
              </div>
              <p className="mt-4 text-sm text-ink-muted">
                No account required for this demonstration.
              </p>
            </div>

            <Card className="bg-surface p-5 shadow-raised sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={demoUser.name} tone="pulse" size="md" />
                  <div>
                    <p className="font-semibold">{demoUser.name}</p>
                    <p className="text-sm text-ink-muted">{demoUser.addressArea}</p>
                  </div>
                </div>
                <StatusBadge tone="success">Checked in today</StatusBadge>
              </div>

              <div className="mt-5 rounded-xl border border-pulse-200 bg-pulse-50 px-4 py-4">
                <p className="flex items-center gap-2 font-semibold text-pulse-800">
                  <ClipboardCheck aria-hidden="true" className="size-5" />
                  Checked in this morning
                </p>
                <p className="mt-1 text-sm text-pulse-800">
                  Visible to 3 trusted people in the circle.
                </p>
              </div>

              <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Trusted circle
              </p>
              <ul className="mt-3 space-y-3">
                {circleMembers.map((member) => (
                  <li key={member.id} className="flex items-center gap-3">
                    <Avatar name={member.name} tone={member.avatarTone} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{member.name}</p>
                      <p className="truncate text-sm text-ink-muted">
                        {member.relationship}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="mt-5 border-t border-line pt-3 text-sm text-ink-muted">
                Illustration using demonstration data.
              </p>
            </Card>
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="border-b border-line bg-surface"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <div className="max-w-2xl">
              <h2 id="how-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                How Pulse Circle works
              </h2>
              <p className="mt-3 text-lg text-ink-muted">
                Three simple ideas, designed so that nothing depends on memory or
                technical confidence.
              </p>
            </div>

            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {howItWorks.map((step, index) => (
                <li key={step.title}>
                  <Card className="h-full p-6">
                    <div className="flex items-center justify-between">
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-pulse-50 text-pulse-700">
                        <step.icon aria-hidden="true" className="size-6" />
                      </span>
                      <span className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                        Step {index + 1}
                      </span>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                    <p className="mt-2 text-ink-muted">{step.description}</p>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="benefits-heading" className="border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <div className="max-w-2xl">
              <h2
                id="benefits-heading"
                className="text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Built for real neighbourhoods
              </h2>
              <p className="mt-3 text-lg text-ink-muted">
                The people closest to you usually act first. Pulse Circle makes
                that easier, not harder.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {benefits.map((benefit) => (
                <Card key={benefit.title} className="p-6">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-attention-50 text-attention-600">
                    <benefit.icon aria-hidden="true" className="size-6" />
                  </span>
                  <h3 className="mt-4 text-xl font-semibold">{benefit.title}</h3>
                  <p className="mt-2 text-ink-muted">{benefit.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="privacy-heading"
          className="border-b border-line bg-surface"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-20">
            <div>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-pulse-50 text-pulse-700">
                <LockKeyhole aria-hidden="true" className="size-6" />
              </span>
              <h2
                id="privacy-heading"
                className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Trust is the feature
              </h2>
              <p className="mt-3 text-lg text-ink-muted">
                A safety tool only works if people feel comfortable using it.
                Pulse Circle shares the minimum needed with the fewest people
                possible.
              </p>
            </div>

            <ul className="space-y-3">
              {privacyPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 rounded-xl border border-line bg-canvas px-4 py-3"
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-pulse-700 text-white">
                    <Check aria-hidden="true" className="size-4" />
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="cta-heading">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <Card className="border-pulse-200 bg-pulse-50 p-8 text-center sm:p-12">
              <h2
                id="cta-heading"
                className="text-3xl font-semibold tracking-tight text-pulse-900 sm:text-4xl"
              >
                Start with one check-in a day
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-lg text-pulse-900">
                This prototype uses demonstration data. No personal information is
                required to look around.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <ButtonLink to={paths.signIn} size="lg">
                  Get started
                  <ArrowRight aria-hidden="true" className="size-5" />
                </ButtonLink>
                <ButtonLink to={paths.dashboard} size="lg" variant="secondary">
                  Explore the dashboard
                </ButtonLink>
              </div>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div>
            <BrandMark />
            <p className="mt-3 max-w-sm text-sm text-ink-muted">
              Daily connection and calm escalation for older adults, trusted
              neighbours and family.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to={paths.landing} className="text-sm font-semibold text-pulse-800 hover:underline">
              Overview
            </Link>
            <Link to={paths.signIn} className="text-sm font-semibold text-pulse-800 hover:underline">
              Sign in
            </Link>
            <Link to={paths.dashboard} className="text-sm font-semibold text-pulse-800 hover:underline">
              Dashboard
            </Link>
          </nav>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-ink-muted sm:px-6">
            Pulse Circle prototype · Demonstration data only
          </p>
        </div>
      </footer>
    </div>
  )
}
