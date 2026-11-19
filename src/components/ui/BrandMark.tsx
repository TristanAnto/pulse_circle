import { HeartPulse } from 'lucide-react'

import { cn } from '@/lib/cn'

type BrandMarkProps = {
  compact?: boolean
  className?: string
}

export function BrandMark({ compact = false, className }: BrandMarkProps) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-pulse-700 text-white shadow-card">
        <HeartPulse aria-hidden="true" className="size-6" />
      </span>
      {compact ? (
        <span className="sr-only">Pulse Circle</span>
      ) : (
        <span className="text-xl font-semibold tracking-tight text-ink">
          Pulse Circle
        </span>
      )}
    </span>
  )
}
