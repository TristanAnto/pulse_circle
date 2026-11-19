import type { ButtonHTMLAttributes } from 'react'

import { Link, type LinkProps } from 'react-router-dom'

import { cn } from '@/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

const baseStyles =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-pulse-700 text-white shadow-card hover:bg-pulse-800 active:bg-pulse-900',
  secondary:
    'border-2 border-line bg-surface text-ink hover:border-pulse-300 hover:bg-pulse-50',
  ghost: 'text-pulse-800 hover:bg-pulse-50',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-4 text-sm',
  md: 'min-h-12 px-5 text-base',
  lg: 'min-h-14 px-7 text-lg',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      {...rest}
    />
  )
}

type ButtonLinkProps = LinkProps & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      {...rest}
    />
  )
}
