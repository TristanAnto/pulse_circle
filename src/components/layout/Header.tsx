import { Link, useLocation } from 'react-router-dom'

import { Avatar } from '@/components/ui/Avatar'
import { BrandMark } from '@/components/ui/BrandMark'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { demoUser } from '@/data/mockData'
import { paths } from '@/routes/paths'

import { pageTitles } from './navItems'

export function Header() {
  const { pathname } = useLocation()
  const title = pageTitles[pathname] ?? 'Pulse Circle'

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={paths.dashboard} className="lg:hidden">
            <BrandMark compact />
          </Link>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge tone="attention" className="hidden sm:inline-flex">
            Demo data
          </StatusBadge>
          <div className="flex items-center gap-2">
            <Avatar name={demoUser.name} size="sm" />
            <span className="hidden text-sm font-semibold sm:inline">
              {demoUser.firstName}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
