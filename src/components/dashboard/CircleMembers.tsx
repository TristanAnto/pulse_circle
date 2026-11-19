import { MessageSquareText, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { paths } from '@/routes/paths'
import type { CircleMember } from '@/types'

const roleLabels: Record<CircleMember['role'], string> = {
  elderly: 'Circle member',
  neighbour: 'Neighbour',
  family: 'Family',
}

type CircleMembersProps = {
  members: CircleMember[]
}

export function CircleMembers({ members }: CircleMembersProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Your trusted circle"
        description="The people who look out for you."
        icon={<Users className="size-5" />}
        action={
          <Link
            to={paths.messages}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-pulse-800 hover:bg-pulse-50"
          >
            <MessageSquareText aria-hidden="true" className="size-4" />
            Open chat
          </Link>
        }
      />

      <ul className="divide-y divide-line">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
            <Avatar name={member.name} tone={member.avatarTone} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{member.name}</p>
              <p className="truncate text-sm text-ink-muted">
                {member.relationship}
              </p>
            </div>
            <div className="text-right">
              <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {roleLabels[member.role]}
              </span>
              <span
                className={cn(
                  'mt-1 inline-flex items-center gap-1.5 text-sm font-semibold',
                  member.presence === 'available'
                    ? 'text-pulse-800'
                    : 'text-ink-muted',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 rounded-full',
                    member.presence === 'available'
                      ? 'bg-pulse-600'
                      : 'bg-line',
                  )}
                />
                {member.presence === 'available' ? 'Available' : 'Resting'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
