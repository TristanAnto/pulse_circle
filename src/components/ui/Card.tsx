import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

type CardProps = HTMLAttributes<HTMLDivElement>

export function Card({ className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface shadow-card',
        className,
      )}
      {...rest}
    />
  )
}

type CardHeaderProps = {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export function CardHeader({
  title,
  description,
  icon,
  action,
}: CardHeaderProps) {
  return (
    <div className="flex items-start justify-start flex-wrap gap-4 border-b border-line px-5 py-4 sm:px-6">
      <div className="flex items-start gap-3 min-w-0">
        {icon ? (
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-pulse-50 text-pulse-700"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
          {description ? (
            <p className="text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? (
        <div className="shrink-0 ml-auto">
          {action}
        </div>
      ) : null}
    </div>
  )
}
