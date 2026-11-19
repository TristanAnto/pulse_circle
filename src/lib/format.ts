const clock = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  minute: '2-digit',
})

const weekdayDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const shortDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})

export function formatClock(isoDate: string): string {
  return clock.format(new Date(isoDate))
}

export function formatLongDate(isoDate: string): string {
  return weekdayDate.format(new Date(isoDate))
}

export function formatShortDate(isoDate: string): string {
  return shortDate.format(new Date(isoDate))
}

export function formatRelative(isoDate: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(isoDate).getTime()
  const diffMinutes = Math.round(diffMs / 60_000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr ago`

  const diffDays = Math.round(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'

  return `${diffDays} days ago`
}

export function initialsFrom(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
