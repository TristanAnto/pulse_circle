import type { ReactNode } from 'react'

import {
  Activity,
  CircleCheck,
  HandHeart,
  MessageSquareText,
  TriangleAlert,
} from 'lucide-react'

import { Card, CardHeader } from '@/components/ui/Card'
import { formatClock, formatRelative, formatShortDate } from '@/lib/format'
import type { ActivityItem, ActivityKind } from '@/types'

const kindIcons: Record<ActivityKind, ReactNode> = {
  'check-in': <CircleCheck aria-hidden="true" className="size-4" />,
  message: <MessageSquareText aria-hidden="true" className="size-4" />,
  alert: <TriangleAlert aria-hidden="true" className="size-4" />,
  acknowledgement: <HandHeart aria-hidden="true" className="size-4" />,
}

const kindStyles: Record<ActivityKind, string> = {
  'check-in': 'bg-pulse-50 text-pulse-700',
  message: 'bg-sky-50 text-sky-700',
  alert: 'bg-attention-50 text-attention-600',
  acknowledgement: 'bg-violet-50 text-violet-700',
}

type ActivityFeedProps = {
  items: ActivityItem[]
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader
        title="Recent activity"
        description="What has happened in your circle."
        icon={<Activity className="size-5" />}
      />

      <ol className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex gap-3 px-5 py-4 sm:px-6">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${kindStyles[item.kind]}`}
            >
              {kindIcons[item.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p>
                <span className="font-semibold">{item.actor}</span>{' '}
                <span className="text-ink-muted">{item.summary}</span>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                <time dateTime={item.occurredAt}>
                  {formatRelative(item.occurredAt)} ·{' '}
                  {formatShortDate(item.occurredAt)},{' '}
                  {formatClock(item.occurredAt)}
                </time>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
