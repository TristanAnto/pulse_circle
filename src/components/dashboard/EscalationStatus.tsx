import { Info, ShieldCheck, Siren } from 'lucide-react'

import { Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/cn'
import type { EscalationStep, EscalationStepState } from '@/types'

const stateLabels: Record<EscalationStepState, string> = {
  complete: 'Done',
  active: 'Current step',
  pending: 'Pending',
}

const stateTones: Record<EscalationStepState, 'success' | 'attention' | 'neutral'> = {
  complete: 'success',
  active: 'attention',
  pending: 'neutral',
}

const stateRing: Record<EscalationStepState, string> = {
  complete: 'bg-pulse-700 text-white',
  active: 'bg-attention-500 text-white ring-4 ring-attention-100',
  pending: 'bg-surface-muted text-ink-muted ring-1 ring-line',
}

type EscalationStatusProps = {
  steps: EscalationStep[]
  activeAlert: boolean
}

export function EscalationStatus({ steps, activeAlert }: EscalationStatusProps) {
  return (
    <Card>
      <CardHeader
        title="Escalation status"
        description="What happens if a check-in is missed."
        icon={<Siren className="size-5" />}
        action={
          <StatusBadge tone={activeAlert ? 'danger' : 'success'}>
            {activeAlert ? 'Alert active' : 'No alert active'}
          </StatusBadge>
        }
      />

      <ol className="px-5 py-5 sm:px-6">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                  stateRing[step.state],
                )}
              >
                {index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="my-1 w-px flex-1 bg-line"
                />
              ) : null}
            </div>

            <div className="pb-6 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{step.title}</h3>
                <StatusBadge tone={stateTones[step.state]}>
                  {stateLabels[step.state]}
                </StatusBadge>
              </div>
              <p className="mt-1 text-ink-muted">{step.detail}</p>
              <p className="mt-1 text-sm font-semibold text-ink-muted">
                {step.window}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex gap-3 border-t border-line bg-attention-50 px-5 py-4 sm:px-6">
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-attention-600" />
        <p className="text-sm text-attention-700">
          <span className="font-semibold">
            Acknowledging an alert does not confirm someone is safe.
          </span>{' '}
          Your circle should always try to reach the person directly first, then
          escalate.
        </p>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-sm text-ink-muted sm:px-6">
        <ShieldCheck aria-hidden="true" className="size-4" />
        Escalation timings are demonstration values.
      </div>
    </Card>
  )
}
