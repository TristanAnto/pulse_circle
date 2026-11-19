import { Link, NavLink } from 'react-router-dom'

import { Avatar } from '@/components/ui/Avatar'
import { BrandMark } from '@/components/ui/BrandMark'
import { demoUser } from '@/data/mockData'
import { cn } from '@/lib/cn'
import { paths } from '@/routes/paths'

import { navItems } from './navItems'

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-line bg-surface lg:flex">
      <div className="px-6 py-6">
        <Link
          to={paths.dashboard}
          className="rounded-xl focus-visible:outline-offset-4"
        >
          <BrandMark />
        </Link>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 items-center gap-3 rounded-xl px-4 text-base font-semibold transition-colors',
                    isActive
                      ? 'bg-pulse-700 text-white'
                      : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                  )
                }
              >
                <item.icon aria-hidden="true" className="size-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3 rounded-xl bg-surface-muted px-3 py-3">
          <Avatar name={demoUser.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{demoUser.name}</p>
            <p className="truncate text-sm text-ink-muted">{demoUser.role}</p>
          </div>
        </div>
        <p className="mt-3 px-1 text-sm text-ink-muted">
          Demonstration data. Nothing is sent to a server.
        </p>
      </div>
    </aside>
  )
}
