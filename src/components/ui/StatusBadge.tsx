import type { ReactNode } from 'react'

import { CircleAlert, CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/cn'

export type StatusTone = 'success' | 'attention' | 'danger' | 'neutral' | 'info'

const toneStyles: Record<StatusTone, string> = {
  success: 'border-pulse-200 bg-pulse-50 text-pulse-800',
  attention: 'border-attention-100 bg-attention-50 text-attention-700',
  danger: 'border-red-200 bg-danger-soft text-danger',
  neutral: 'border-line bg-surface-muted text-ink-muted',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
}

const toneIcons: Record<StatusTone, ReactNode> = {
  success: <CircleCheck aria-hidden="true" className="size-4" />,
  attention: <TriangleAlert aria-hidden="true" className="size-4" />,
  danger: <OctagonAlert aria-hidden="true" className="size-4" />,
  neutral: <Info aria-hidden="true" className="size-4" />,
  info: <CircleAlert aria-hidden="true" className="size-4" />,
}

type StatusBadgeProps = {
  tone?: StatusTone
  children: ReactNode
  className?: string
}

export function StatusBadge({
  tone = 'neutral',
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold',
        toneStyles[tone],
        className,
      )}
    >
      {toneIcons[tone]}
      {children}
    </span>
  )
}
