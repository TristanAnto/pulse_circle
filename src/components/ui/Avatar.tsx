import { cn } from '@/lib/cn'
import { initialsFrom } from '@/lib/format'
import type { AvatarTone } from '@/types'

const toneStyles: Record<AvatarTone, string> = {
  pulse: 'bg-pulse-100 text-pulse-800 ring-pulse-200',
  mint: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-attention-100 text-attention-700 ring-attention-100',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
}

const sizeStyles = {
  sm: 'size-10 text-sm',
  md: 'size-12 text-base',
  lg: 'size-16 text-lg',
} as const

type AvatarProps = {
  name: string
  tone?: AvatarTone
  size?: keyof typeof sizeStyles
  className?: string
}

export function Avatar({ name, tone = 'pulse', size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1',
        toneStyles[tone],
        sizeStyles[size],
        className,
      )}
    >
      {initialsFrom(name)}
    </span>
  )
}
